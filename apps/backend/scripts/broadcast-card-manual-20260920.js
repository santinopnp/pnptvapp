#!/usr/bin/env node
'use strict';

/**
 * broadcast-card-manual-20260920.js
 *
 * Wide broadcast promoting card payment with manual activation.
 * Four hosted payment links (Week / Monthly / Yearly / Lifetime).
 *
 * Audience : all non-PRIME, non-banned users with Telegram
 *            + Santino forced-included as CC
 * Channels : Telegram DM (BOT_TOKEN) + push
 * Dedup    : broadcast_dedup LIKE 'card-manual-20260920%'
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-card-manual-20260920.js --dry-run
 *
 * Live run: remove --dry-run
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

const BATCH_ID    = 'card-manual-20260920';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';

const PLANS = [
  { label: '🗓 Week Pass',     url: 'https://mpago.li/2wKDS3q' },
  { label: '📅 Monthly Pass',  url: 'https://mpago.li/2VvAg9K' },
  { label: '🔥 Yearly Pass',   url: 'https://mpago.li/1Spwqd5' },
  { label: '♾️ Lifetime Pass',  url: 'https://mpago.li/1xjtaya' },
];

const PUSH_URL = 'https://pnptv.app/subscribe';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function caption(lang) {
  if (lang === 'es') {
    return `💳 <b>Activá PRIME con tu tarjeta — 4 planes disponibles</b>

Santino acá. Ya podés pagar con tarjeta, sin crypto.

Elegí tu plan, completá el pago y te activo el acceso el mismo día.`;
  }
  return `💳 <b>Unlock PRIME with your card — 4 plans available</b>

Santino here. You can now pay by card — no crypto needed.

Pick your plan, complete payment, and I'll activate your access the same day.`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '💳 Activá PRIME con tu tarjeta',
      body:  'Pase semanal, mensual, anual o de por vida. Tap para elegir.',
      url:   PUSH_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💳 Unlock PRIME with your card',
    body:  'Week, Monthly, Yearly & Lifetime plans. Tap to pick yours.',
    url:   PUSH_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
}

// ── Telegram API ──────────────────────────────────────────────────────────────

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

async function tgSend(chatId, text, lang) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: PLANS.map(p => [{ text: p.label, url: p.url }]),
    },
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT u.id, u.telegram, u.language,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('PRIME', 'banned')
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
    ORDER BY u.created_at ASC
  `);

  // Ensure Santino gets a copy (CC rule)
  if (!users.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, telegram, CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang FROM users WHERE id=$1`,
      [SANTINO_ID]
    );
    if (s.length && s[0].telegram) users.unshift(s[0]);
  }

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [BATCH_ID + '%']
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Pay with card · Manual activation · 2026-09-20');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN sample ──');
    console.log(caption('en'));
    console.log('\nButtons:');
    PLANS.forEach(p => console.log(`  [${p.label}] → ${p.url}`));
    console.log('\n── ES sample ──');
    console.log(caption('es'));
    console.log(`\n... to ${users.length} users total`);
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let tgOk = 0, pushOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [BATCH_ID + '%', u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    try {
      const r = await tgSend(u.telegram, caption(u.lang), u.lang);
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
  console.log(`  Telegram   : ${tgOk}`);
  console.log(`  Push       : ${pushOk}`);
  console.log(`  Skipped    : ${skipped}`);
  console.log(`  Errors     : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
