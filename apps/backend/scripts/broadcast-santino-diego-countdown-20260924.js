#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-diego-countdown-20260924.js
 *
 * Wave 2 — Countdown. Santino + El Diego live in 30 min. Book a call.
 *
 * Audience : all active users (last 30 days) with Telegram + Santino CC
 * Channels : Telegram DM + push
 * Dedup    : santino-diego-collab-countdown-20260924
 *
 * Dry run:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-santino-diego-countdown-20260924.js --dry-run
 *
 * Live: remove --dry-run
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

const BATCH_ID   = 'santino-diego-collab-countdown-20260924';
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';

const STAGE_URL   = 'https://pnptv.app/main-stage';
const SANTINO_URL = 'https://pnptv.app/creator/SantinoFurioso';
const DIEGO_URL   = 'https://pnptv.app/creator/El_Diego';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function caption(lang) {
  if (lang === 'es') {
    return `🔥 <b>Santino + El Diego — en vivo en 30 minutos</b>

Esta noche los dos toman el Main Stage juntos desde las 6:30 PM hasta medianoche.

Están disponibles para videollamadas privadas toda la noche. Reserva la tuya antes de que se llenen.`;
  }
  return `🔥 <b>Santino + El Diego — live in 30 minutes</b>

Tonight they take the Main Stage together from 6:30 PM until midnight.

Private video calls are open all night. Book yours before they fill up.`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '🔥 En vivo en 30 min — Santino + El Diego',
      body:  'Main Stage esta noche. Videollamadas privadas abiertas.',
      url:   STAGE_URL,
    };
  }
  return {
    title: '🔥 Live in 30 min — Santino + El Diego',
    body:  'Main Stage tonight. Private video calls open.',
    url:   STAGE_URL,
  };
}

function buttons(lang) {
  if (lang === 'es') {
    return [
      [{ text: '🎥 Ver el Main Stage', url: STAGE_URL }],
      [{ text: '📞 Reservar llamada con Santino', url: SANTINO_URL }],
      [{ text: '👤 Conocer a El Diego', url: DIEGO_URL }],
    ];
  }
  return [
    [{ text: '🎥 Watch Main Stage', url: STAGE_URL }],
    [{ text: '📞 Book a call with Santino', url: SANTINO_URL }],
    [{ text: '👤 Meet El Diego', url: DIEGO_URL }],
  ];
}

function _tgApi(method, payload) {
  return new Promise(resolve => {
    const body = JSON.stringify(payload);
    const req  = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, lang) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption(lang),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons(lang) },
  });
}

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT u.id, u.telegram,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('banned')
      AND u.is_active = true
      AND u.is_deleted = false
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
      AND u.last_active > NOW() - INTERVAL '30 days'
    ORDER BY u.last_active DESC
  `);

  if (!users.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, telegram, CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang FROM users WHERE id=$1`,
      [SANTINO_ID]
    );
    if (s.length && s[0].telegram) users.unshift(s[0]);
  }

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [`santino-diego-collab-countdown-20260924%`]
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Santino + El Diego · Countdown · 2026-09-24');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN sample ──\n' + caption('en'));
    console.log('\n── ES sample ──\n' + caption('es'));
    console.log(`\n... to ${users.length} users total`);
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let tgOk = 0, pushOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`santino-diego-collab-countdown-20260924%`, u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    try {
      const r = await tgSend(u.telegram, u.lang);
      if (r.ok) {
        await query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [BATCH_ID, u.id]
        );
        tgOk++;
      } else {
        console.error(`  ✗ TG ${u.id}: ${r.description || r.error || 'unknown'}`);
        errors++;
      }
    } catch (err) {
      console.error(`  ✗ TG ${u.id}: ${err.message}`);
      errors++;
    }

    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    if ((tgOk + skipped) % 100 === 0 && tgOk + skipped > 0) {
      console.log(`  → ${tgOk} sent, ${skipped} skipped, ${errors} errors`);
    }

    await sleep(100);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Telegram : ${tgOk}`);
  console.log(`  Push     : ${pushOk}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
