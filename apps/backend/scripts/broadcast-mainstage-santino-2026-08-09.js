#!/usr/bin/env node
'use strict';

/**
 * Main Stage broadcast — 2026-08-09 (Santino live until 4 AM Colombia)
 * Push + Telegram DM to ALL active users. Bilingual (ES/EN by user.language).
 * Manual one-shot only — do NOT crontab.
 *
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-mainstage-santino-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-mainstage-santino-2026-08-09.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const https = require('https');
const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY = process.argv.includes('--dry-run');
const BOT_TOKEN = process.env.BOT_TOKEN;
const CTA_URL = 'https://pnptv.app/main-stage';

const COPY = {
  es: {
    push: {
      title: '🔥 AHORA EN VIVO — Main Stage prendida',
      body: 'Santino y los chicos reventándola 🥵 entra y reserva tu privado',
    },
    tg: `💊🔥 AHORA en Main Stage — Santino y los chicos prendidos hasta las 4 AM Colombia 🥵

Cárgate y reserva tu llamada privada.

👉 ${CTA_URL}

— PNPtv!`,
  },
  en: {
    push: {
      title: '🔥 LIVE NOW — Main Stage on fire',
      body: 'Santino & the boys going hard 🥵 come in & book your private',
    },
    tg: `💊🔥 LIVE NOW on Main Stage — Santino & the boys going until 4 AM Colombia (UTC-5) 🥵

Get loaded & book your private call.

👉 ${CTA_URL}

— PNPtv!`,
  },
};

const PUSH_COMMON = {
  url: '/main-stage',
  icon: '/icon-192.png',
  tag: 'mainstage-santino-2026-08-09',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgSend(chatId, text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [[{ text: '🎥 Ir a Main Stage', url: CTA_URL }]],
      },
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload); req.end();
  });
}

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcast_mainstage_santino_2026_08_09 (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}
async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM broadcast_mainstage_santino_2026_08_09 WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}
async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO broadcast_mainstage_santino_2026_08_09 (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

// ── PUSH ────────────────────────────────────────────────────────────────────

async function sendPushBatch(langKey) {
  const isEs = langKey === 'es';
  const opts = { ...PUSH_COMMON, ...COPY[langKey].push };

  const langFilter = isEs
    ? `LOWER(COALESCE(u.language,'en')) LIKE 'es%'`
    : `(u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')`;

  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND ${langFilter}
  `);

  const userIds = rows.map(r => r.id);
  console.log(`  [PUSH ${langKey.toUpperCase()}] ${userIds.length} users with push subs`);
  if (DRY) {
    console.log(`    payload:`, opts);
    return { attempted: userIds.length, sent: 0 };
  }
  if (userIds.length === 0) return { attempted: 0, sent: 0 };
  const sent = await PushNotificationService.sendToUsers(userIds, opts);
  console.log(`  [PUSH ${langKey.toUpperCase()}] delivered ${sent}/${userIds.length}`);
  return { attempted: userIds.length, sent };
}

// ── TELEGRAM DM ─────────────────────────────────────────────────────────────

async function sendTelegramDMs() {
  const { rows } = await query(`
    SELECT u.id::text AS id,
           u.telegram,
           LOWER(COALESCE(u.language,'en')) AS lang
      FROM users u
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND u.telegram IS NOT NULL AND u.telegram <> ''
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);
  console.log(`  [TG] ${rows.length} users with telegram id`);

  let sent = 0, fail = 0, skip = 0;
  for (const u of rows) {
    if (await alreadySent(u.id, 'tg')) { skip++; continue; }
    const isEs = u.lang.startsWith('es');
    const text = isEs ? COPY.es.tg : COPY.en.tg;

    if (DRY) {
      if (sent < 3) {
        console.log(`\n  ── DRY TG sample #${sent + 1} → user ${u.id} (${isEs ? 'ES' : 'EN'}) chat ${u.telegram} ──`);
        console.log(text);
      }
      sent++;
      continue;
    }

    const r = await tgSend(u.telegram, text);
    if (r.ok) { sent++; await log(u.id, 'tg', 'sent'); }
    else {
      fail++;
      await log(u.id, 'tg', 'failed', (r.description || r.error || 'unknown').slice(0, 500));
    }

    await sleep(40);
    if ((sent + fail) % 100 === 0) {
      await sleep(1000);
      console.log(`  [TG] progress: sent=${sent} failed=${fail} skip=${skip} / ${rows.length}`);
    }
  }

  console.log(`  [TG] final: sent=${sent} failed=${fail} skipped=${skip} total=${rows.length}`);
  return { sent, fail, skip, total: rows.length };
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Main Stage Santino broadcast 2026-08-09 ${DRY ? '(DRY-RUN)' : ''} ===`);
  await initializePostgres();
  await PushNotificationService.initialize();
  await ensureLogTable();

  console.log('\n── PUSH ──');
  const pushEs = await sendPushBatch('es');
  const pushEn = await sendPushBatch('en');

  console.log('\n── TELEGRAM DM ──');
  const tg = await sendTelegramDMs();

  console.log(`\n=== FINAL ===`);
  console.log(`  push:  ES ${pushEs.sent}/${pushEs.attempted}  EN ${pushEn.sent}/${pushEn.attempted}`);
  console.log(`  tg:    sent=${tg.sent}  failed=${tg.fail}  skipped=${tg.skip}  total=${tg.total}`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
