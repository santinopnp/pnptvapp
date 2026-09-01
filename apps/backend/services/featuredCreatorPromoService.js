'use strict';

/**
 * Featured Creator of the Day — daily promo pipeline.
 *
 * Fires once per UTC day at 15:00 UTC (10am ET / 12pm Bogota):
 *   1. Resolves today's featured creator (admin pick, else Crystal Creator
 *      rotation). Skips silently if the pool is empty.
 *   2. Picks an attractive hero photo from the creator's album
 *      (social_posts image with the most likes, then cover, then avatar).
 *   3. Posts to X from the platform account (Santino's linked handle).
 *   4. Broadcasts a Telegram photo + deep-link button to every user with
 *      telegram_id + age_verified + terms_accepted.
 *
 * All three steps are best-effort — one failure never blocks another.
 * Redis dedup keys prevent double-fires if the queue re-runs the same day.
 */

const { getPool } = require('../config/postgres');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const XPostService = require('./xPostService');

const PLATFORM_X_ACCOUNT_USER_ID = '8599671840'; // Santino — de facto platform account

const TG_BATCH_SIZE = 25;         // messages per second cap (Telegram allows 30)
const TG_BATCH_DELAY_MS = 1100;   // 1.1s between batches — comfortable under limit

async function todayUtcDate() {
  const { rows } = await getPool().query(`SELECT (NOW() AT TIME ZONE 'UTC')::date AS today`);
  return String(rows[0].today);
}

/**
 * Resolve today's featured creator. CRYSTAL CREATORS ONLY — both admin
 * pick and fallback rotation are restricted to users with an active
 * crystal_creator_active_until.
 */
async function resolveTodaysFeatured(today) {
  const pool = getPool();

  const picked = await pool.query(
    `SELECT f.creator_id, f.pitch_en, f.pitch_es, f.media_url, f.cta_intro_call,
            u.username, u.first_name, u.cover_url
       FROM featured_creators f
       JOIN users u ON u.id = f.creator_id
      WHERE f.date = $1
        AND u.deleted_at IS NULL
        AND u.crystal_creator_active_until > NOW()
      LIMIT 1`,
    [today]
  );
  if (picked.rows[0]) return { ...picked.rows[0], _source: 'admin' };

  // Fallback: rotate through active Crystal Creators (deterministic per day).
  const fallback = await pool.query(
    `SELECT id AS creator_id, username, first_name, cover_url
       FROM users
      WHERE crystal_creator_active_until > NOW()
        AND deleted_at IS NULL
      ORDER BY id
      OFFSET (
        SELECT (EXTRACT(EPOCH FROM $1::date)::bigint / 86400)
               % GREATEST((
                 SELECT COUNT(*) FROM users
                  WHERE crystal_creator_active_until > NOW()
                    AND deleted_at IS NULL
               ), 1)
      )
      LIMIT 1`,
    [today]
  );
  if (!fallback.rows[0]) return null;
  return {
    ...fallback.rows[0],
    pitch_en: null,
    pitch_es: null,
    media_url: null,
    cta_intro_call: false,
    _source: 'rotation',
  };
}

/**
 * Pick up to `max` album photos for a creator. Prefers social_posts images
 * ordered by likes, then falls through to cover + profile so we always
 * return at least one url when any is set.
 */
async function pickAlbumPhotos(userId, max = 6) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COALESCE(media_url, (media_urls->>0)) AS url
       FROM social_posts
      WHERE user_id = $1
        AND is_deleted = FALSE
        AND COALESCE(is_exclusive, FALSE) = FALSE
        AND (media_type = 'image'
             OR (media_urls IS NOT NULL AND jsonb_array_length(media_urls) > 0))
      ORDER BY likes_count DESC NULLS LAST, created_at DESC
      LIMIT $2`,
    [String(userId), max * 3]  // over-fetch so dedup below still yields close to max
  );
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r.url || typeof r.url !== 'string') continue;
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r.url);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Turn a possibly-relative /uploads/... path into an absolute HTTPS URL so
 * X and Telegram can fetch it. Leaves already-absolute URLs untouched.
 */
function absolutize(url) {
  if (!url || typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `https://pnptv.app${url}`;
  return `https://pnptv.app/${url}`;
}

async function fallbackHeroForCreator(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT cover_url FROM users WHERE id = $1 LIMIT 1`,
    [String(userId)]
  );
  // NOTE: users.photo_file_id is a Telegram file_id proxied via
  // /api/profile-photo/:id — not a public HTTPS URL, so we don't hand it to
  // X (which needs to fetch the media itself). cover_url is public.
  return rows[0]?.cover_url || null;
}

/**
 * Build the platform-brand copy for X + Telegram. Both channels use the
 * same anchor sentence + deep link so cross-channel tracking is trivial.
 */
function buildCopy({ displayName, username, pitchEn }) {
  const link = `https://pnptv.app/c/${encodeURIComponent(username)}`;
  const pitch = pitchEn && pitchEn.trim()
    ? pitchEn.trim().replace(/\s+/g, ' ').slice(0, 180)
    : `Featured today on PNPtv — the ones setting the pace.`;
  return {
    // X copy: tight, one hashtag pair, link. Under 280 chars.
    xText: `Model of the day → ${displayName} (@${username}) 💎\n${pitch}\n\n${link}\n#PNPtv #ModelOfTheDay`,
    tgCaption:
      `<b>Model of the day 💎</b>\n<b>${escapeHtml(displayName)}</b> (@${escapeHtml(username)})\n\n${escapeHtml(pitch)}`,
    tgLink: link,
  };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

async function postToPlatformX({ text, imageUrl }) {
  const { rows } = await getPool().query(
    `SELECT account_id, handle, display_name, encrypted_access_token,
            encrypted_refresh_token, token_expires_at, is_active, oauth_version,
            encrypted_access_token_secret, consumer_key_ref, x_user_id
       FROM x_accounts
      WHERE created_by = $1 AND is_active = TRUE
      ORDER BY updated_at DESC
      LIMIT 1`,
    [PLATFORM_X_ACCOUNT_USER_ID]
  );
  const account = rows[0];
  if (!account) {
    logger.warn('[featured-promo] no platform X account linked — skipping X post');
    return { ok: false, reason: 'no_platform_account' };
  }
  try {
    await XPostService.postToX(account, text, imageUrl);
    logger.info('[featured-promo] X post sent', { handle: account.handle });
    return { ok: true };
  } catch (err) {
    logger.warn('[featured-promo] X post failed', { error: err.message });
    return { ok: false, reason: 'x_post_failed', error: err.message };
  }
}

async function broadcastTelegram({ caption, link, imageUrl }) {
  const bot = safeRequireBot();
  if (!bot?.telegram) {
    logger.warn('[featured-promo] bot not available — skipping Telegram broadcast');
    return { ok: false, sent: 0, failed: 0, reason: 'bot_unavailable' };
  }

  const { rows: audience } = await getPool().query(
    `SELECT telegram
       FROM users
      WHERE telegram IS NOT NULL
        AND age_verified = TRUE
        AND terms_accepted = TRUE
        AND deleted_at IS NULL`
  );

  const inline = { inline_keyboard: [[{ text: '💎 Open profile', url: link }]] };
  let sent = 0, failed = 0;

  for (let i = 0; i < audience.length; i++) {
    const u = audience[i];
    try {
      if (imageUrl) {
        await bot.telegram.sendPhoto(u.telegram, imageUrl, {
          caption,
          parse_mode: 'HTML',
          reply_markup: inline,
        });
      } else {
        await bot.telegram.sendMessage(u.telegram, caption, {
          parse_mode: 'HTML',
          reply_markup: inline,
          disable_web_page_preview: false,
        });
      }
      sent++;
    } catch (err) {
      failed++;
      // 403 = user blocked the bot; not worth logging each one.
      if (!String(err.message || '').includes('bot was blocked')) {
        logger.debug('[featured-promo] tg send failed', { to: u.telegram, error: err.message });
      }
    }
    if ((i + 1) % TG_BATCH_SIZE === 0) {
      await new Promise((r) => setTimeout(r, TG_BATCH_DELAY_MS));
    }
  }

  logger.info('[featured-promo] telegram broadcast complete', {
    total: audience.length, sent, failed,
  });
  return { ok: true, total: audience.length, sent, failed };
}

function safeRequireBot() {
  try { return require('../bot/core/bot'); } catch (_) { return null; }
}

/**
 * Runs the full daily promo. Idempotent by UTC date — a second call the
 * same day exits early. Returns a summary object useful for job telemetry.
 */
async function runDailyPromo({ force = false } = {}) {
  const today = await todayUtcDate();
  const dedupKey = `pnpapp:featured-promo:${today}`;
  if (!force) {
    const first = await cache.setNX(dedupKey, '1', 25 * 3600); // 25h TTL
    if (!first) {
      logger.info('[featured-promo] already fired today — skipping', { date: today });
      return { ok: true, skipped: 'already_fired', date: today };
    }
  }

  const featured = await resolveTodaysFeatured(today);
  if (!featured) {
    logger.info('[featured-promo] no eligible Crystal Creator today — nothing to promote', { date: today });
    return { ok: true, skipped: 'no_pool', date: today };
  }

  const displayName = featured.first_name || featured.username;
  const album = await pickAlbumPhotos(featured.creator_id, 6);
  const heroUrl = featured.media_url
    || album[0]
    || featured.cover_url
    || await fallbackHeroForCreator(featured.creator_id);

  const copy = buildCopy({
    displayName,
    username: featured.username,
    pitchEn: featured.pitch_en,
  });

  const absoluteHero = absolutize(heroUrl);

  const [xRes, tgRes] = await Promise.all([
    postToPlatformX({ text: copy.xText, imageUrl: absoluteHero }),
    broadcastTelegram({ caption: copy.tgCaption, link: copy.tgLink, imageUrl: absoluteHero }),
  ]);

  const summary = {
    ok: true,
    date: today,
    creator: featured.username,
    source: featured._source,
    albumSize: album.length,
    heroUrl,
    x: xRes,
    telegram: tgRes,
  };
  logger.info('[featured-promo] daily run complete', summary);
  return summary;
}

module.exports = {
  runDailyPromo,
  resolveTodaysFeatured,
  pickAlbumPhotos,
  fallbackHeroForCreator,
  buildCopy,
};
