#!/usr/bin/env node
'use strict';

/**
 * broadcast-nowpayments-yearly50-20260920.js
 *
 * Wide broadcast: send a personalized NowPayments invoice to every non-PRIME
 * user for the $50/year promo (plan: yearly50). Each user gets their own
 * hosted checkout URL — no shared link.
 *
 * Per user:
 *   1. Create a hosted NowPayments invoice ($50, yearly50 plan)
 *   2. Store in dash_subscription_orders so the IPN webhook can settle it
 *   3. Send Telegram DM with their personal checkout link
 *   4. Send push notification
 *   5. Record in broadcast_dedup
 *
 * Audience : all non-PRIME, non-banned users with Telegram
 *            + Santino force-included as CC
 * Dedup    : broadcast_dedup LIKE 'nowpayments-yearly50-20260920%'
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e NOWPAYMENTS_API_KEY="$(docker exec pnptv-bot printenv NOWPAYMENTS_API_KEY)" \
 *     -e NOWPAYMENTS_IPN_SECRET="$(docker exec pnptv-bot printenv NOWPAYMENTS_IPN_SECRET)" \
 *     -e NOWPAYMENTS_ENVIRONMENT="$(docker exec pnptv-bot printenv NOWPAYMENTS_ENVIRONMENT)" \
 *     -e WEBAPP_URL="https://pnptv.app" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-nowpayments-yearly50-20260920.js --dry-run
 *
 * Live run: remove --dry-run
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const axios = require('axios');

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY_RUN   = process.argv.includes('--dry-run');
const SKIP_PUSH = process.argv.includes('--skip-push');

const BATCH_ID    = 'nowpayments-yearly50-20260920';
const PLAN_ID     = 'yearly50';
const PLAN_AMOUNT = 50.00;
const PLAN_NAME   = 'PRIME Annual — $50 Weekend Promo — PNPtv!';
const WEBAPP_URL  = process.env.WEBAPP_URL || 'https://pnptv.app';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';

const NP_BASE = process.env.NOWPAYMENTS_ENVIRONMENT === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';
const NP_KEY  = process.env.NOWPAYMENTS_API_KEY || '';

const API_DELAY_MS = 200;  // between NowPayments invoice creates
const TG_DELAY_MS  = 100;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function tgMsg(firstName, invoiceUrl, lang) {
  const name = firstName ? ` ${firstName}` : '';
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');

  if (isEs) {
    return (
      `🔥 <b>Un año de PRIME por $50 — tu link personal de pago ya está listo.</b>\n\n` +
      `Hola${name}, este fin de semana podés activar un año completo de PRIME por solo $50.\n\n` +
      `Preparamos este link exclusivo para vos — pagá con cualquier cripto (USDC, BTC, ETH, Dash, LTC y más de 100 opciones):\n\n` +
      `👉 <a href="${invoiceUrl}">${invoiceUrl}</a>\n\n` +
      `✅ Sin tarjeta, sin banco, sin registro extra\n` +
      `✅ Acceso PRIME inmediato al confirmar\n` +
      `✅ Sin cobros recurrentes — un pago, un año\n\n` +
      `<i>Este link es personal y expira el lunes. ¿Dudas? Escribinos.</i>\n\n— Santino`
    );
  }
  return (
    `🔥 <b>A full year of PRIME for $50 — your personal checkout link is ready.</b>\n\n` +
    `Hi${name}, this weekend you can unlock a full year of PRIME for just $50.\n\n` +
    `We created this link exclusively for you — pay with any crypto (USDC, BTC, ETH, Dash, LTC + 100 more):\n\n` +
    `👉 <a href="${invoiceUrl}">${invoiceUrl}</a>\n\n` +
    `✅ No card, no bank, no extra signup\n` +
    `✅ PRIME access granted instantly on confirmation\n` +
    `✅ No recurring charges — one payment, one year\n\n` +
    `<i>This link is personal and expires Monday. Need help? Just reply here.</i>\n\n— Santino`
  );
}

function pushPayload(lang) {
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  if (isEs) {
    return {
      title: '🔥 Un año de PRIME por $50 — tu link personal ya está',
      body:  'Pagá con cripto. Sin tarjeta. Expira el lunes.',
      url:   `${WEBAPP_URL}/subscribe`,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '🔥 A full year of PRIME for $50 — your personal link is ready',
    body:  'Pay with crypto. No card needed. Expires Monday.',
    url:   `${WEBAPP_URL}/subscribe`,
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

async function tgSend(chatId, text) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// ── NowPayments invoice ───────────────────────────────────────────────────────

async function createInvoice(userId, email) {
  const orderId = `np-yearly50-${userId}-${Date.now()}`;
  const payload = {
    price_amount:      PLAN_AMOUNT,
    price_currency:    'usd',
    order_id:          orderId,
    order_description: PLAN_NAME,
    ipn_callback_url:  `${WEBAPP_URL}/api/webhooks/nowpayments`,
    success_url:       `${WEBAPP_URL}/subscribe?nowpayments=success&order=${encodeURIComponent(orderId)}`,
    cancel_url:        `${WEBAPP_URL}/subscribe`,
  };
  if (email && !email.includes('@telegram.pnptv.app') && !email.includes('@example.com')) {
    payload.customer_email = email;
  }

  const resp = await axios.post(`${NP_BASE}/invoice`, payload, {
    headers: { 'x-api-key': NP_KEY, 'Content-Type': 'application/json' },
    timeout: 12000,
  });

  const invoiceUrl = resp.data?.invoice_url;
  if (!invoiceUrl) throw new Error('No invoice_url in NowPayments response');
  return { orderId, invoiceUrl };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  if (!NP_KEY) {
    console.error('NOWPAYMENTS_API_KEY not set — aborting');
    process.exit(1);
  }
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN not set — aborting');
    process.exit(1);
  }

  const { rows: users } = await query(`
    SELECT u.id, u.telegram, u.email, u.first_name, u.username, u.language,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('PRIME', 'banned')
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
    ORDER BY u.created_at ASC
  `);

  // CC Santino even if he's PRIME
  if (!users.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(`
      SELECT id, telegram, email, first_name, username,
        CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang
      FROM users WHERE id = $1
    `, [SANTINO_ID]);
    if (s.length && s[0].telegram) users.unshift(s[0]);
  }

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [BATCH_ID + '%']
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — NowPayments Yearly $50 · Weekend promo · 2026-09-20');
  console.log(`  Plan      : ${PLAN_ID} @ $${PLAN_AMOUNT}`);
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log(`  NP env    : ${process.env.NOWPAYMENTS_ENVIRONMENT || 'production'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    const fakeName = 'Alex';
    const fakeUrl  = 'https://nowpayments.io/payment/?iid=SAMPLE_INVOICE_ID';
    console.log('── EN sample ──');
    console.log(tgMsg(fakeName, fakeUrl, 'en'));
    console.log('\n── ES sample ──');
    console.log(tgMsg(fakeName, fakeUrl, 'es'));
    console.log(`\nPush EN: ${pushPayload('en').title}`);
    console.log(`Push ES: ${pushPayload('es').title}`);
    console.log(`\n... to ${users.length} users total`);
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let invoiceOk = 0, tgOk = 0, pushOk = 0, skipped = 0, invoiceFail = 0, tgFail = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [BATCH_ID + '%', u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    // 1. Create NowPayments invoice
    let orderId, invoiceUrl;
    try {
      ({ orderId, invoiceUrl } = await createInvoice(u.id, u.email));
      invoiceOk++;
    } catch (err) {
      console.error(`  ✗ invoice ${u.id}: ${err.message}`);
      invoiceFail++;
      await sleep(API_DELAY_MS);
      continue;
    }

    // 2. Store order in dash_subscription_orders for webhook settlement
    try {
      await query(`
        INSERT INTO dash_subscription_orders
          (user_id, plan_id, email, usd_amount, btcpay_invoice_id, status, metadata)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        ON CONFLICT (btcpay_invoice_id) DO NOTHING
      `, [
        String(u.id),
        PLAN_ID,
        (u.email && !u.email.includes('@telegram.pnptv.app')) ? u.email : null,
        PLAN_AMOUNT,
        orderId,
        JSON.stringify({ provider: 'nowpayments', flow: 'hosted', invoiceUrl, batchId: BATCH_ID }),
      ]);
    } catch (err) {
      console.error(`  ✗ order insert ${u.id}: ${err.message}`);
    }

    // 3. Telegram DM with personal checkout link
    const name = u.first_name || u.username || null;
    try {
      const r = await tgSend(u.telegram, tgMsg(name, invoiceUrl, u.lang));
      if (r.ok) {
        await query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [BATCH_ID, u.id]
        );
        tgOk++;
      } else {
        console.error(`  ✗ TG ${u.id}: ${r.description || r.error || 'unknown'}`);
        tgFail++;
      }
    } catch (err) {
      console.error(`  ✗ TG ${u.id}: ${err.message}`);
      tgFail++;
    }

    // 4. Push notification
    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    if ((tgOk + skipped) % 100 === 0 && tgOk + skipped > 0) {
      console.log(`  → ${tgOk} sent, ${skipped} skipped, ${tgFail} TG errors, ${invoiceFail} invoice errors`);
    }

    await sleep(API_DELAY_MS + TG_DELAY_MS);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Invoices created : ${invoiceOk}`);
  console.log(`  Invoice errors   : ${invoiceFail}`);
  console.log(`  Telegram sent    : ${tgOk}`);
  console.log(`  Telegram failed  : ${tgFail}`);
  console.log(`  Push sent        : ${pushOk}`);
  console.log(`  Skipped (dedup)  : ${skipped}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit((invoiceFail + tgFail) > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
