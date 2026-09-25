#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-diego-salespush-20260924.js
 *
 * Wave 4 — Mid-show sales push (fire at 8:00 PM COL).
 * They're live right now. Subscribe to El Diego or book a call with Santino.
 *
 * Audience : all active users with Telegram, not yet subscribed to
 *            SantinoFurioso OR El_Diego + Santino CC
 * Channels : Telegram DM + push
 * Dedup    : santino-diego-collab-salespush-20260924
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
 *     node apps/backend/scripts/broadcast-santino-diego-salespush-20260924.js --dry-run
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

const BATCH_ID    = 'santino-diego-collab-salespush-20260924';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';
const DIEGO_ID    = 'fdd1f0b2-c0be-4a5d-853e-d9180dc8b298';

const STAGE_URL   = 'https://pnptv.app/main-stage';
const SANTINO_URL = 'https://pnptv.app/creator/SantinoFurioso';
const DIEGO_URL   = 'https://pnptv.app/creator/El_Diego';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function caption(lang) {
  if (lang === 'es') {
    return `🔴 <b>Santino + El Diego — en vivo AHORA</b>

Están en el Main Stage y tomando videollamadas privadas esta noche.

Suscríbete a El Diego por $15/mes y accede a todo su contenido, o reserva una llamada privada con Santino ahora mismo.`;
  }
  return `🔴 <b>Santino + El Diego — LIVE right now</b>

They're on the Main Stage and taking private video calls tonight.

Subscribe to El Diego for $15/mo and unlock his full content, or book a private call with Santino right now.`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '🔴 En vivo ahora — Santino + El Diego',
      body:  'Videollamadas privadas abiertas. Suscríbete o reserva.',
      url:   STAGE_URL,
    };
  }
  return {
    title: '🔴 Live now — Santino + El Diego',
    body:  'Private calls open tonight. Subscribe or book.',
    url:   STAGE_URL,
  };
}

function buttons(lang) {
  if (lang === 'es') {
    return [
      [{ text: '👤 Suscribirse a El Diego — $15/mes', url: DIEGO_URL }],
      [{ text: '📞 Reservar llamada con Santino', url: SANTINO_URL }],
      [{ text: '🎥 Ver el Main Stage en vivo', url: STAGE_URL }],
    ];
  }
  return [
    [{ text: '👤 Subscribe to El Diego — $15/mo', url: DIEGO_URL }],
    [{ text: '📞 Book a call with Santino', url: SANTINO_URL }],
    [{ text: '🎥 Watch Main Stage live', url: STAGE_URL }],
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

  // Users who haven't subscribed to Santino or El Diego
  const { rows: users } = await query(`
    SELECT u.id, u.telegram,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('banned')
      AND u.is_active = true
      AND u.is_deleted = false
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
      AND NOT EXISTS (
        SELECT 1 FROM creator_subscriptions cs
        WHERE cs.subscriber_id = u.id
          AND cs.creator_id IN ($1, $2)
          AND cs.status = 'active'
      )
    ORDER BY u.last_active DESC NULLS LAST
  `, [SANTINO_ID, DIEGO_ID]);

  if (!users.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, telegram, CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang FROM users WHERE id=$1`,
      [SANTINO_ID]
    );
    if (s.length && s[0].telegram) users.unshift(s[0]);
  }

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [`santino-diego-collab-salespush-20260924%`]
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Santino + El Diego · Sales Push · 2026-09-24');
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
      [`santino-diego-collab-salespush-20260924%`, u.id]
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
