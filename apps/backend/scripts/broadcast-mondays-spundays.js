#!/usr/bin/env node
'use strict';

/**
 * broadcast-mondays-spundays.js
 *
 * ONE-TIME $20 → 2 months PRIME + PRIME Channel offer. Explicitly marketed
 * as never repeating — unlike Sunday Spun Days, this script is NOT meant to
 * be re-fired on a recurring cron with the same copy/plan. See
 * services/queueService.js for the one-shot (delay-based, not repeat-
 * pattern) BullMQ jobs that fire this once and expire it 24h later.
 *
 * Channels : Telegram DM (sendPhoto + CTA button) + in-app platform DM
 *            + Feed post (pinned/promoted) + Email.
 * Audience : non-banned, non-deleted, non-creator, NOT currently PRIME,
 *            active in last 60d.
 * Dedup    : one-time (not weekly) Redis set — mondays_spundays:v1.
 * Metrics  : one row in mondays_spundays_campaigns.
 * Slack    : #ops-admin-alerts on start + on finish.
 * Landing  : https://pnptv.app/redeem/mondays  (hidden — not linked elsewhere).
 *
 * CLI:
 *   --dry-run    audience count + sample copy, no sends, no dedup writes, no feed post
 *   --skip-tg    skip Telegram
 *   --skip-dm    skip in-app DM
 *   --skip-email skip email
 *   --skip-feed  skip Feed post
 */

const path  = require('path');
const https = require('https');
const fs    = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/ioredis'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const SocialPostService              = require(path.join(BACKEND, 'services/socialPostService'));
const EmailService                   = require(path.join(BACKEND, 'services/emailservice'));

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN    = process.argv.includes('--dry-run');
const SKIP_TG    = process.argv.includes('--skip-tg');
const SKIP_DM    = process.argv.includes('--skip-dm');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const SKIP_FEED  = process.argv.includes('--skip-feed');

const CAMPAIGN_SLUG = 'mondays_spundays_2026_10_05';
const DEDUP_KEY      = `pnpapp:broadcast:dedup:mondays_spundays:v1`;
const SYSTEM_SENDER  = '8552451957';
const SANTINO_ID     = '8599671840';

const HERO_URL   = 'https://pnptv.app/uploads/creator-media/8599671840-1783409405497.webp';
const REDEEM_URL = 'https://pnptv.app/redeem/mondays';
const PLAN_ID    = 'mondays_spundays_promo_20';

// Must match EXPIRES_AT in RedeemMondaysSpundays.tsx and the delayed BullMQ
// expire job in queueService.js.
const EXPIRES_AT_LABEL_EN = 'Tuesday 14:00 UTC (~09:00 Bogota)';
const EXPIRES_AT_LABEL_ES = 'martes 14:00 UTC (~09:00 Bogotá)';

const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 150;
const DM_DELAY_MS = 80;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'papi' : 'friend');
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

function dmText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return `🚨 Mondays Spundays${n} — oferta única, nunca vuelve

2 meses completos de PNPtv + PRIME Channel por solo $20.

¿Usas Revolut, Cash App, Venmo o N26? Copia la dirección crypto que te damos al pagar, complétalo desde tu app siguiendo sus instrucciones, y tu plan se activa automáticamente.

⏳ Se apaga ${EXPIRES_AT_LABEL_ES}. Cuando el conteo llega a cero, no vuelve — ni el próximo lunes, ni nunca.

Reclamá acá 👉 ${REDEEM_URL}`;
  }
  return `🚨 Mondays Spundays${n} — one-time offer, never returns

2 full months of PNPtv + PRIME Channel for just $20.

Using Revolut, Cash App, Venmo, or N26? Copy the crypto address we give you at checkout, complete it from your app following its instructions, and your plan activates automatically.

⏳ Closes ${EXPIRES_AT_LABEL_EN}. Once the countdown hits zero, it's gone — not next Monday, not ever.

Claim it here 👉 ${REDEEM_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🚨 <b>Mondays Spundays</b> — oferta única\n\n` +
      `Hola${n} — <b>2 meses de PNPtv + PRIME Channel por $20</b>.\n\n` +
      `💳 ¿Usas Revolut, Cash App, Venmo o N26? Copia la dirección crypto del checkout y sigue las instrucciones de tu app — tu plan se activa solo.\n\n` +
      `⏳ Se apaga ${EXPIRES_AT_LABEL_ES}. <b>Nunca vuelve.</b>`
    );
  }
  return (
    `🚨 <b>Mondays Spundays</b> — one-time offer\n\n` +
    `Hey${n} — <b>2 months of PNPtv + PRIME Channel for $20</b>.\n\n` +
    `💳 Using Revolut, Cash App, Venmo, or N26? Copy the checkout's crypto address and follow your app's instructions — your plan activates on its own.\n\n` +
    `⏳ Closes ${EXPIRES_AT_LABEL_EN}. <b>Never returns.</b>`
  );
}

const FEED_CONTENT = `🚨 Mondays Spundays — oferta única, nunca vuelve

2 meses completos de PNPtv + PRIME Channel por $20. Paga con tarjeta, cripto, o directo desde Revolut, Cash App, Venmo o N26.

⏳ Se apaga en 24 horas. Cuando el conteo llega a cero, se acaba para siempre.

—

🚨 Mondays Spundays — one-time offer, never returns

2 full months of PNPtv + PRIME Channel for $20. Pay with card, crypto, or straight from Revolut, Cash App, Venmo, or N26.

⏳ Gone in 24 hours. When the countdown hits zero, it's gone for good.

👉 pnptv.app/redeem/mondays`;

const EMAIL_SUBJECT_ES = 'Oferta única: PNPtv + PRIME Channel por $20 (nunca vuelve)';
const EMAIL_SUBJECT_EN = 'One-time offer: PNPtv + PRIME Channel for $20 (never repeats)';
const EMAIL_MESSAGE_ES = `Hoy es <b>Mondays Spundays</b>: 2 meses completos de PNPtv + acceso al <b>PRIME Channel</b>, todo por <b>$20 USD</b>.<br/><br/>
¿Usas Revolut, Cash App, Venmo o N26? Copia la dirección crypto del checkout, complétalo desde tu app siguiendo sus instrucciones, y tu plan se activa automáticamente.<br/><br/>
⏳ La oferta se apaga en 24 horas y <b>nunca vuelve</b> — ni el próximo lunes, ni después.`;
const EMAIL_MESSAGE_EN = `Today is <b>Mondays Spundays</b>: 2 full months of PNPtv + access to the <b>PRIME Channel</b>, all for <b>$20 USD</b>.<br/><br/>
Using Revolut, Cash App, Venmo, or N26? Copy the crypto address at checkout, complete it from your app following its instructions, and your plan activates automatically.<br/><br/>
⏳ The offer shuts off in 24 hours and <b>never returns</b> — not next Monday, not ever.`;

// ─── TELEGRAM HELPERS ─────────────────────────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, caption, btnLabel, btnUrl) {
  const kb = { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] };
  const photoRes = await _tgApi('sendPhoto', {
    chat_id: chatId,
    photo: HERO_URL,
    caption: caption.slice(0, 1024),
    parse_mode: 'HTML',
    reply_markup: kb,
  });
  if (photoRes.ok) return photoRes;
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: kb,
  });
}

// ─── SLACK OPS ────────────────────────────────────────────────────────────────

async function slackNotify(text) {
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN;
  const channel = process.env.SLACK_OPS_ADMIN_CHANNEL;
  if (!token || !channel) return;
  const body = JSON.stringify({ channel, text });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    }, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body); req.end();
  });
}

// ─── FEED POST ────────────────────────────────────────────────────────────────

async function postToFeed() {
  const post = await SocialPostService.createPost(
    SYSTEM_SENDER, FEED_CONTENT, null, null, null, null,
    false, false, true,
  );
  await query(`
    UPDATE social_posts
       SET pinned_at = NOW(), is_promoted = true, promoted_link = $2, promoted_link_label = $3
     WHERE id = $1
  `, [post.id, REDEEM_URL, '🚨 Reclamar oferta única →']);
  try {
    const socketSingleton = require(path.join(BACKEND, 'services/socketSingleton'));
    const io = socketSingleton.get();
    if (io) io.emit('social:new-post', { post });
  } catch (_) {}
  return post.id;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` MONDAYS SPUNDAYS — ${CAMPAIGN_SLUG} (one-time)`);
  console.log(`  DM: ${!SKIP_DM} · TG: ${!SKIP_TG} · Email: ${!SKIP_EMAIL} · Feed: ${!SKIP_FEED}   MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════\n');

  const IORedis = nm('ioredis');
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    // A failed connect here must be fatal, not swallowed — otherwise the
    // sismember/sadd dedup calls below run against a dead client and either
    // hang or silently skip every user. Let it throw so the BullMQ job
    // records a real failure instead of a false "completed" with 0 sends.
    await redis.connect();
    redis.on('error', () => {});
  }

  // Audience: non-PRIME, non-banned, non-deleted, non-creator, active in last
  // 60d. PRIME check goes through user_entitlements (not users.tier) to catch
  // drift, same as broadcast-sunday-spun-days.js.
  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.telegram, u.language, u.email
      FROM users u
     WHERE u.deleted_at IS NULL
       AND COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND COALESCE(u.creator_status, 'none') = 'none'
       AND u.id NOT IN ('${SYSTEM_SENDER}', 'fafa6786-de29-4216-b788-4f11d703df4f')
       AND COALESCE(u.last_active, u.created_at) > NOW() - INTERVAL '60 days'
       AND NOT EXISTS (
         SELECT 1 FROM user_entitlements ue
          WHERE ue.user_id = u.id
            AND ue.add_on_id IN ('prime')
            AND (ue.is_lifetime = true OR ue.expires_at > NOW())
       )
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);

  const hasSantino = targets.some(u => String(u.id) === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, telegram, language, email FROM users WHERE id::text=$1`,
      [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  const withTg = targets.filter(t => t.telegram);
  const withEmail = targets.filter(t => t.email);
  console.log(`  Targets total  : ${targets.length}`);
  console.log(`  With Telegram  : ${withTg.length}`);
  console.log(`  With Email     : ${withEmail.length}\n`);

  if (DRY_RUN) {
    console.log('  Sample DM (en):'); console.log(dmText('papi', 'en'));
    console.log('\n  Sample DM (es):'); console.log(dmText('papi', 'es'));
    console.log('\n  Sample TG caption (en):'); console.log(tgCaption('papi', 'en'));
    console.log('\n  Sample Feed post:'); console.log(FEED_CONTENT);
    console.log(`\n  DRY RUN — would process ${targets.length} users.\n`);
    process.exit(0);
  }

  const { rows: campaignRows } = await query(`
    INSERT INTO mondays_spundays_campaigns (campaign_slug, audience_size, redeem_url, expires_at, notes)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [
    CAMPAIGN_SLUG, targets.length, REDEEM_URL,
    new Date(Date.now() + 24 * 3600 * 1000),
    `Kicked off ${new Date().toISOString()}`,
  ]);
  const campaignId = campaignRows[0]?.id;

  await slackNotify(
    `🚨 *Mondays Spundays — one-time offer* firing to ${targets.length} users (TG: ${withTg.length}, Email: ${withEmail.length}). Plan: $20 → 2mo PRIME + PRIME Channel. Closes in 24h. Landing: ${REDEEM_URL}`
  );

  let feedPostId = null;
  if (!SKIP_FEED) {
    try {
      feedPostId = await postToFeed();
      console.log(`  Feed post created: ${feedPostId}`);
    } catch (err) {
      console.error('  Feed post failed:', err.message);
    }
  }

  const stats = { dm: 0, tg: 0, tgBlocked: 0, dmF: 0, tgF: 0, email: 0, emailF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const name = pickName(u);

    if (i > 0 && i % 500 === 0) {
      console.log(`  progress ${i}/${targets.length}  dm=${stats.dm} tg=${stats.tg} email=${stats.email} skip=${stats.skip}`);
    }

    const deduped = await redis.sismember(DEDUP_KEY, String(u.id));
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, String(u.id));

    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, dmText(name, lang), query, {
          mediaUrl: HERO_URL, mediaType: 'image',
        });
        stats.dm++;
      } catch { stats.dmF++; }
      await sleep(DM_DELAY_MS);
    }

    if (!SKIP_TG && u.telegram) {
      const btnLabel = isEs(u.language) ? 'Reclamar oferta única 🚨' : 'Claim one-time offer 🚨';
      const r = await tgSend(u.telegram, tgCaption(name, lang), btnLabel, REDEEM_URL);
      if (r.ok) {
        stats.tg++;
      } else if (r.error_code === 403 || (r.description || '').match(/blocked|deactivated/i)) {
        stats.tgBlocked++;
      } else {
        stats.tgF++;
      }
      await sleep(TG_DELAY_MS);
    }

    if (!SKIP_EMAIL && u.email) {
      try {
        await EmailService.sendBroadcastEmail({
          email: u.email,
          userName: name,
          messageEn: EMAIL_MESSAGE_EN,
          messageEs: EMAIL_MESSAGE_ES,
          userLanguage: lang,
          mediaUrl: HERO_URL,
          buttons: [{
            type: 'url',
            target: REDEEM_URL,
            text: isEs(u.language) ? 'Reclamar oferta única →' : 'Claim one-time offer →',
          }],
          subjectEn: EMAIL_SUBJECT_EN,
          subjectEs: EMAIL_SUBJECT_ES,
        });
        stats.email++;
      } catch { stats.emailF++; }
    }
  }

  // No weekly re-invite window — this campaign is one-time, so the dedup key
  // just needs to outlive the 24h offer window plus a safety margin.
  if (redis) await redis.expire(DEDUP_KEY, 3 * 86400);

  if (campaignId) {
    await query(`
      UPDATE mondays_spundays_campaigns
         SET tg_sent = $2, tg_failed = $3, tg_blocked = $4,
             dm_sent = $5, dm_failed = $6,
             email_sent = $7, email_failed = $8,
             notes = COALESCE(notes,'') || $9,
             metadata = metadata || $10::jsonb
       WHERE id = $1
    `, [
      campaignId,
      stats.tg, stats.tgF, stats.tgBlocked,
      stats.dm, stats.dmF,
      stats.email, stats.emailF,
      `\nFinished ${new Date().toISOString()}. TG=${stats.tg}/${stats.tgF}f/${stats.tgBlocked}b, DM=${stats.dm}/${stats.dmF}f, Email=${stats.email}/${stats.emailF}f, skip=${stats.skip}.`,
      JSON.stringify({ feedPostId, planId: PLAN_ID }),
    ]);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DONE — Mondays Spundays (one-time)`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` In-app DMs : ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram   : ${stats.tg} sent / ${stats.tgF} failed / ${stats.tgBlocked} blocked`);
  console.log(` Email      : ${stats.email} sent / ${stats.emailF} failed`);
  console.log(` Skipped    : ${stats.skip} (already sent)`);
  console.log('══════════════════════════════════════════════════════\n');

  await slackNotify(
    `✅ *Mondays Spundays* fired.\n` +
    `• Audience: ${targets.length}\n` +
    `• Telegram: ${stats.tg} sent, ${stats.tgF} failed, ${stats.tgBlocked} blocked\n` +
    `• In-app DM: ${stats.dm} sent, ${stats.dmF} failed\n` +
    `• Email: ${stats.email} sent, ${stats.emailF} failed\n` +
    `• Feed post: ${feedPostId || 'skipped'}\n` +
    `• Skipped (dedup): ${stats.skip}\n` +
    `Closes in 24h — this exact offer will not repeat.`
  );
}

// Only run if invoked directly (`node <this file>`) — and only then does a
// clean exit belong here. When workers/index.js `require()`s this module and
// calls `main()` from inside the long-running BullMQ worker process, calling
// process.exit() would kill that worker, not just this campaign run.
if (require.main === module) {
  main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}

module.exports = { main, CAMPAIGN_SLUG, PLAN_ID };
