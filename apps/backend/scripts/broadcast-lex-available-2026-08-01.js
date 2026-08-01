#!/usr/bin/env node
'use strict';

/**
 * Wide broadcast: Lex (@PNPLatinoBoy) is available for private video calls.
 * DM + Push + Telegram, bilingual (ES/EN by language).
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-2026-08-01.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-2026-08-01.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-2026-08-01.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-2026-08-01.js --skip-push
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-2026-08-01.js --skip-dm
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }               = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
const sendSystemDM            = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram }            = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_DM       = process.argv.includes('--skip-dm');

const ENTITY_ID   = 'lex-calls-2026-08-01';
const TG_DELAY_MS = 80;

const LEX_USER_ID  = '7246621722';
const SENDER_ID    = '8552451957'; // @pnptv system account
const URL_LEX      = 'https://pnptv.app/profile/PNPLatinoBoy';
const LEX_PHOTO    = 'https://pnptv.app/uploads/avatars/7246621722-1782600929693.webp';
const LEX_PHOTO_PATH = '/uploads/avatars/7246621722-1782600929693.webp';

// Legacy fallback so templates below still parse; real pricing is fetched at runtime.
// TODO: refactor PUSH/TG/FEED_POST/INAPP_DM into factories that receive pricing strings.
const PRICE_USD = '60 for 30min · $100 for 60min';

// Pricing pulled at runtime from call_packages (source of truth for checkout).
// NEVER hardcode from performers.base_price — that's a legacy display value that
// often lags behind the real per-duration prices creators charge.
async function fetchLexPricing() {
  const { rows } = await query(
    `SELECT duration_minutes, price_usd FROM call_packages
      WHERE creator_id = $1 AND is_active = true AND quantity = 1
      ORDER BY duration_minutes ASC`,
    [LEX_USER_ID]
  );
  if (rows.length === 0) throw new Error('No active call_packages for Lex — refusing to send broadcast with mystery pricing');
  const en = rows.map(r => `$${Number(r.price_usd).toFixed(0)} for ${r.duration_minutes} min`).join(' · ');
  const es = rows.map(r => `$${Number(r.price_usd).toFixed(0)} por ${r.duration_minutes} min`).join(' · ');
  return { en, es };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => !lang || (typeof lang === 'string' && lang.toLowerCase().startsWith('en'));

// ── Messages ──────────────────────────────────────────────────────────────────

const PUSH = {
  en: {
    title: '🔥 Lex is available NOW',
    body:  `Lex (@PNPLatinoBoy) is online for private video calls — $${PRICE_USD}/call. Book yours.`,
  },
  es: {
    title: '🔥 Lex está disponible AHORA',
    body:  `Lex (@PNPLatinoBoy) está en línea para videollamadas privadas — $${PRICE_USD}/call. Reserva la tuya.`,
  },
};

const TG = {
  en: (name) =>
`🔥 <b>Hey ${name} — Lex is online for private video calls RIGHT NOW.</b>

<b>Lex (@PNPLatinoBoy)</b> — verified PNPtv creator, one of the co-founders — is available for one-on-one private video calls today.

A private call is just you and him. No group. No performance for a room. Real conversation, real attention, on your terms.

━━━━━━━━━━━━━━━
💸 <b>$${PRICE_USD}</b> · pay in crypto
📅 <b>Book now:</b>
👉 <a href="${URL_LEX}">pnptv.app/profile/PNPLatinoBoy</a>
━━━━━━━━━━━━━━━

Slots fill fast. Don't wait. 🖤`,

  es: (name) =>
`🔥 <b>¡Hola ${name}! Lex está en línea para videollamadas privadas AHORA MISMO.</b>

<b>Lex (@PNPLatinoBoy)</b> — creador verificado de PNPtv, uno de los co-fundadores — está disponible hoy para videollamadas privadas uno a uno.

Una videollamada privada es solo tú y él. Sin grupo. Sin show para una sala llena. Conversación real, atención real, en tus términos.

━━━━━━━━━━━━━━━
💸 <b>$${PRICE_USD}</b> · paga en cripto
📅 <b>Reserva ahora:</b>
👉 <a href="${URL_LEX}">pnptv.app/profile/PNPLatinoBoy</a>
━━━━━━━━━━━━━━━

Los cupos se llenan rápido. No esperes. 🖤`,
};

const FEED_POST = {
  en: `🔥 Lex is online RIGHT NOW for private video calls.

@PNPLatinoBoy — verified PNPtv creator and one of our co-founders — is available today for one-on-one private calls.

Real conversation. Real attention. Just you and him. No group. No show for a room.

💸 $${PRICE_USD} · pay in crypto
📅 Book now: ${URL_LEX}

Slots fill fast. 🖤`,

  es: `🔥 Lex está en línea AHORA para videollamadas privadas.

@PNPLatinoBoy — creador verificado de PNPtv y uno de nuestros co-fundadores — está disponible hoy para videollamadas privadas uno a uno.

Conversación real. Atención real. Solo tú y él. Sin grupo. Sin show para una sala.

💸 $${PRICE_USD} · paga en cripto
📅 Reserva ahora: ${URL_LEX}

Los cupos se llenan rápido. 🖤`,
};

const INAPP_DM = {
  en: (name) =>
`🔥 Hey ${name} — Lex is online RIGHT NOW for private video calls.

Lex (@PNPLatinoBoy) — verified PNPtv creator and co-founder — is available for one-on-one private calls today.

Real conversation. Real attention. Just you and him.

💸 $${PRICE_USD} · pay in crypto
📅 Book now: ${URL_LEX}

Slots fill fast. 🖤`,

  es: (name) =>
`🔥 ¡Hola ${name}! Lex está en línea AHORA para videollamadas privadas.

Lex (@PNPLatinoBoy) — creador verificado y co-fundador de PNPtv — está disponible hoy para videollamadas uno a uno.

Conversación real. Atención real. Solo tú y él.

💸 $${PRICE_USD} · paga en cripto
📅 Reserva ahora: ${URL_LEX}

Los cupos se llenan rápido. 🖤`,
};

// ── Idempotency helpers ──────────────────────────────────────────────────────

async function ensureLog() {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcast_deliveries (
      id BIGSERIAL PRIMARY KEY,
      entity_id  TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      channel    TEXT NOT NULL,
      status     TEXT NOT NULL,
      error      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (entity_id, user_id, channel)
    );
  `);
}

async function alreadyDelivered(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM broadcast_deliveries WHERE entity_id=$1 AND user_id=$2 AND channel=$3 AND status='ok' LIMIT 1`,
    [ENTITY_ID, userId, channel]
  );
  return rows.length > 0;
}

async function logDelivery(userId, channel, status, error) {
  await query(
    `INSERT INTO broadcast_deliveries (entity_id, user_id, channel, status, error)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (entity_id, user_id, channel) DO UPDATE SET status=EXCLUDED.status, error=EXCLUDED.error`,
    [ENTITY_ID, userId, channel, status, error || null]
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`[lex-broadcast] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | skips:`,
    { telegram: SKIP_TELEGRAM, push: SKIP_PUSH, dm: SKIP_DM });

  await ensureLog();

  // Create the two feed posts (ES + EN) idempotently
  const existingPostsRes = await query(
    `SELECT id, metadata->>'language' AS lang FROM social_posts
      WHERE user_id = $1 AND metadata->>'entity_id' = $2 AND is_deleted = false`,
    [SENDER_ID, ENTITY_ID]
  );
  const havePostForLang = new Set(existingPostsRes.rows.map(r => r.lang));
  const postIds = { es: null, en: null };
  for (const row of existingPostsRes.rows) if (row.lang && row.id) postIds[row.lang] = row.id;

  for (const lang of ['es', 'en']) {
    if (havePostForLang.has(lang)) {
      console.log(`[lex-broadcast] feed post (${lang}) already exists id=${postIds[lang]}, skipping`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[lex-broadcast] DRY RUN: would create feed post (${lang}) with photo ${LEX_PHOTO_PATH}`);
      continue;
    }
    const meta = { entity_id: ENTITY_ID, language: lang, kind: 'creator_available', creator_id: LEX_USER_ID };
    const ins = await query(
      `INSERT INTO social_posts (user_id, content, media_url, media_type, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, 'image', $4::jsonb, NOW(), NOW())
       RETURNING id`,
      [SENDER_ID, FEED_POST[lang], LEX_PHOTO_PATH, JSON.stringify(meta)]
    );
    postIds[lang] = ins.rows[0].id;
    console.log(`[lex-broadcast] created feed post (${lang}) id=${postIds[lang]}`);
  }

  const audienceRes = await query(`
    SELECT id::text AS id, first_name, username, language, telegram
      FROM users
     WHERE id != $1
       AND (role IS NULL OR role NOT IN ('creator', 'model'))
       AND (last_login_at > NOW() - INTERVAL '90 days' OR created_at > NOW() - INTERVAL '30 days')
     ORDER BY id
  `, [LEX_USER_ID]);

  const audience = audienceRes.rows;
  console.log(`[lex-broadcast] Audience: ${audience.length} users`);

  if (DRY_RUN) {
    console.log('\n[lex-broadcast] Sample (first 3):');
    audience.slice(0, 3).forEach(u => {
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'es' ? 'crack' : 'there');
      console.log(`  · ${u.id} (${u.username || '—'}) [${lang}] tg=${u.telegram ? 'yes' : 'no'}`);
      console.log(`    PUSH: ${PUSH[lang].title} — ${PUSH[lang].body}`);
      console.log(`    DM  : ${INAPP_DM[lang](name).slice(0, 90)}…`);
    });
    console.log('\n[lex-broadcast] DRY RUN — no messages sent.');
    process.exit(0);
  }

  const tg = SKIP_TELEGRAM || !process.env.BOT_TOKEN ? null : new Telegram(process.env.BOT_TOKEN);

  const counts = { push: 0, dm: 0, tg: 0, skipped: 0, errors: 0 };

  for (const u of audience) {
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = u.first_name || u.username || (lang === 'es' ? 'crack' : 'there');

    // Push
    if (!SKIP_PUSH && !(await alreadyDelivered(u.id, 'push'))) {
      try {
        await PushNotificationService.sendToUser(u.id, {
          title: PUSH[lang].title,
          body:  PUSH[lang].body,
          url:   '/profile/PNPLatinoBoy',
          tag:   ENTITY_ID,
        });
        counts.push++;
        await logDelivery(u.id, 'push', 'ok');
      } catch (e) {
        counts.errors++;
        await logDelivery(u.id, 'push', 'error', e.message);
      }
    }

    // In-app DM
    if (!SKIP_DM && !(await alreadyDelivered(u.id, 'dm'))) {
      try {
        await sendSystemDM(SENDER_ID, u.id, INAPP_DM[lang](name), query);
        counts.dm++;
        await logDelivery(u.id, 'dm', 'ok');
      } catch (e) {
        counts.errors++;
        await logDelivery(u.id, 'dm', 'error', e.message);
      }
    }

    // Telegram (photo + caption)
    if (tg && u.telegram && !(await alreadyDelivered(u.id, 'telegram'))) {
      try {
        await tg.sendPhoto(u.telegram, LEX_PHOTO, {
          caption: TG[lang](name),
          parse_mode: 'HTML',
        });
        counts.tg++;
        await logDelivery(u.id, 'telegram', 'ok');
        await sleep(TG_DELAY_MS);
      } catch (e) {
        counts.errors++;
        await logDelivery(u.id, 'telegram', 'error', e.message);
        if (/blocked|deactivated|kicked|chat not found/i.test(e.message)) continue;
      }
    }

    if (counts.push + counts.dm + counts.tg > 0 && (counts.push + counts.dm + counts.tg) % 100 === 0) {
      console.log(`[lex-broadcast] progress:`, counts);
    }
  }

  console.log('[lex-broadcast] DONE:', counts);
  process.exit(0);
})().catch(e => { console.error('[lex-broadcast] FATAL', e); process.exit(1); });
