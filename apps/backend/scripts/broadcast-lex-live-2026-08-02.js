#!/usr/bin/env node
'use strict';

/**
 * Live-stream broadcast: Lex (@PNPLatinoBoy) is LIVE NOW.
 * Push + in-app DM + Telegram video (15s clip). Bilingual (ES/EN).
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-live-2026-08-02.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-live-2026-08-02.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-live-2026-08-02.js --skip-telegram
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }               = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
const sendSystemDM            = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram, Input }     = require('telegraf');
const fs                      = require('fs');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_DM       = process.argv.includes('--skip-dm');

const ENTITY_ID   = 'lex-live-2026-08-02';
const TG_DELAY_MS = 120;

const LEX_USER_ID = '7246621722';
const SENDER_ID   = '8552451957';
const URL_LEX     = 'https://pnptv.app/profile/PNPLatinoBoy';
const CLIP_URL    = 'https://pnptv.app/promo/lex-live-2026-08-02.mp4';
const CLIP_PATH   = '/tmp/lex15.mp4';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => !lang || (typeof lang === 'string' && lang.toLowerCase().startsWith('en'));

const PUSH = {
  en: {
    title: '🔴 Lex is LIVE right now',
    body:  '@PNPLatinoBoy is streaming on PNPtv — come hang out.',
  },
  es: {
    title: '🔴 Lex está EN VIVO ahora',
    body:  '@PNPLatinoBoy está transmitiendo en PNPtv — entra a acompañarlo.',
  },
};

const TG_CAPTION = {
  en: (name) =>
`🔴 <b>Hey ${name} — Lex is LIVE RIGHT NOW.</b>

<b>@PNPLatinoBoy</b> — PNPtv co-founder — is streaming live on the platform.

Come in, drop a tip, chat with him. It's happening now.

👉 <a href="${URL_LEX}">Watch live on pnptv.app</a>`,

  es: (name) =>
`🔴 <b>¡${name}! Lex está EN VIVO AHORA MISMO.</b>

<b>@PNPLatinoBoy</b> — co-fundador de PNPtv — está transmitiendo en vivo en la plataforma.

Entra, mándale un tip, chatea con él. Está pasando AHORA.

👉 <a href="${URL_LEX}">Míralo en vivo en pnptv.app</a>`,
};

const INAPP_DM = {
  en: (name) =>
`🔴 Hey ${name} — Lex is LIVE right now.

@PNPLatinoBoy (PNPtv co-founder) is streaming on the platform this second.

Come hang out, chat, tip him. It won't be long.

👉 ${URL_LEX}`,

  es: (name) =>
`🔴 ¡${name}! Lex está EN VIVO ahora mismo.

@PNPLatinoBoy (co-fundador de PNPtv) está transmitiendo en la plataforma en este momento.

Entra, chatea con él, mándale un tip. No va a durar mucho.

👉 ${URL_LEX}`,
};

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

(async () => {
  console.log(`[lex-live] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | skips:`,
    { telegram: SKIP_TELEGRAM, push: SKIP_PUSH, dm: SKIP_DM });

  await ensureLog();

  const audienceRes = await query(`
    SELECT id::text AS id, first_name, username, language, telegram
      FROM users
     WHERE id != $1
       AND (role IS NULL OR role NOT IN ('creator', 'model'))
       AND (last_login_at > NOW() - INTERVAL '90 days' OR created_at > NOW() - INTERVAL '30 days')
     ORDER BY id
  `, [LEX_USER_ID]);

  const audience = audienceRes.rows;
  console.log(`[lex-live] Audience: ${audience.length} users`);

  if (DRY_RUN) {
    console.log('\n[lex-live] Sample (first 3):');
    audience.slice(0, 3).forEach(u => {
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'es' ? 'crack' : 'there');
      console.log(`  · ${u.id} (${u.username || '—'}) [${lang}] tg=${u.telegram ? 'yes' : 'no'}`);
      console.log(`    PUSH: ${PUSH[lang].title} — ${PUSH[lang].body}`);
      console.log(`    DM  : ${INAPP_DM[lang](name).slice(0, 90)}…`);
    });
    console.log('\n[lex-live] DRY RUN — no messages sent.');
    process.exit(0);
  }

  const tg = SKIP_TELEGRAM || !process.env.BOT_TOKEN ? null : new Telegram(process.env.BOT_TOKEN);

  const counts = { push: 0, dm: 0, tg: 0, skipped: 0, errors: 0 };

  for (const u of audience) {
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = u.first_name || u.username || (lang === 'es' ? 'crack' : 'there');

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

    if (tg && u.telegram && !(await alreadyDelivered(u.id, 'telegram'))) {
      try {
        await tg.sendVideo(u.telegram, Input.fromLocalFile(CLIP_PATH), {
          caption: TG_CAPTION[lang](name),
          parse_mode: 'HTML',
          supports_streaming: true,
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

    const total = counts.push + counts.dm + counts.tg;
    if (total > 0 && total % 100 === 0) {
      console.log(`[lex-live] progress:`, counts);
    }
  }

  console.log('[lex-live] DONE:', counts);
  process.exit(0);
})().catch(e => { console.error('[lex-live] FATAL', e); process.exit(1); });
