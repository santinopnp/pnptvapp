#!/usr/bin/env node
'use strict';

/**
 * broadcast-card-wave.js
 *
 * Generic card-payment wave — designed to run multiple times per day.
 * Sends the 4 hosted payment plan buttons to all non-PRIME users with Telegram.
 *
 * Requires env var: WAVE_ID  (e.g. "20260921-1100")
 * BATCH_ID = "card-wave-${WAVE_ID}" — unique per wave so each wave is a fresh send.
 *
 * Usage:
 *   docker run ... -e WAVE_ID=20260921-1100 node apps/backend/scripts/broadcast-card-wave.js
 *   Append --dry-run for preview.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY_RUN   = process.argv.includes('--dry-run');
const SKIP_PUSH = process.argv.includes('--skip-push');
const WAVE_ID   = process.env.WAVE_ID;

if (!WAVE_ID) { console.error('WAVE_ID env var required'); process.exit(1); }

const BATCH_ID   = `card-wave-${WAVE_ID}`;
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';

const PLANS = [
  { label: '🗓 Week Pass',    url: 'https://mpago.li/2wKDS3q' },
  { label: '📅 Monthly Pass', url: 'https://mpago.li/2VvAg9K' },
  { label: '🔥 Yearly Pass',  url: 'https://mpago.li/1Spwqd5' },
  { label: '♾️ Lifetime Pass', url: 'https://mpago.li/1xjtaya' },
];

const PUSH_URL = 'https://pnptv.app/subscribe';
const sleep    = ms => new Promise(r => setTimeout(r, ms));

function caption(lang) {
  if (lang === 'es') {
    return `💳 <b>Activá PRIME con tu tarjeta — 4 planes disponibles</b>\n\nSantino acá. Podés pagar con tarjeta ahora mismo, sin crypto.\n\nElegí tu plan, completá el pago y te activo el acceso el mismo día.`;
  }
  return `💳 <b>Unlock PRIME with your card — 4 plans available</b>\n\nSantino here. You can pay by card right now — no crypto needed.\n\nPick your plan, complete payment, and I'll activate your access today.`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return { title: '💳 Activá PRIME con tu tarjeta', body: 'Pase semanal, mensual, anual o de por vida.', url: PUSH_URL, tag: BATCH_ID, notifType: 'promo' };
  }
  return { title: '💳 Unlock PRIME with your card', body: 'Week, Monthly, Yearly & Lifetime plans available.', url: PUSH_URL, tag: BATCH_ID, notifType: 'promo' };
}

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, text) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: PLANS.map(p => [{ text: p.label, url: p.url }]) },
  });
}

async function main() {
  await initializePostgres();
  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

  const { rows: users } = await query(`
    SELECT u.id, u.telegram,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('PRIME', 'banned')
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
    ORDER BY u.created_at ASC
  `);

  if (!users.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, telegram, CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang FROM users WHERE id=$1`, [SANTINO_ID]
    );
    if (s.length && s[0].telegram) users.unshift(s[0]);
  }

  const { rows: dr } = await query(`SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`, [BATCH_ID + '%']);
  const alreadySent  = parseInt(dr[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Card wave  WAVE_ID=${WAVE_ID}  BATCH=${BATCH_ID}`);
  console.log(`  Audience : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode     : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log(caption('en')); console.log(); console.log(caption('es'));
    console.log(`\nButtons: ${PLANS.map(p => p.label).join(' | ')}`);
    console.log(`\n... to ${users.length} users. Remove --dry-run to send.\n`);
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let tgOk = 0, pushOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id=$2`, [BATCH_ID + '%', u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    try {
      const r = await tgSend(u.telegram, caption(u.lang));
      if (r.ok) {
        await query(`INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [BATCH_ID, u.id]);
        tgOk++;
      } else {
        errors++;
      }
    } catch { errors++; }

    if (!SKIP_PUSH) {
      try { await PushNotificationService.sendToUser(u.id, pushPayload(u.lang)); pushOk++; } catch {}
    }

    if ((tgOk + skipped) % 200 === 0 && tgOk + skipped > 0) {
      console.log(`  → tg=${tgOk} skip=${skipped} err=${errors}`);
    }
    await sleep(100);
  }

  console.log(`\n  Done — TG=${tgOk} push=${pushOk} skipped=${skipped} errors=${errors}\n`);
  process.exit(errors > 5 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
