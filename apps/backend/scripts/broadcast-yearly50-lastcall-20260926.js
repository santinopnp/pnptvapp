#!/usr/bin/env node
'use strict';

/**
 * broadcast-yearly50-lastcall-20260926.js
 *
 * Last-call broadcast for the $50/year PRIME plan on Sep 26 2026.
 * Each user gets a personal NowPayments hosted checkout link.
 *
 * Audience : all non-PRIME, non-banned users with Telegram
 *            + Santino force-included as CC
 * Channels : Telegram DM + push
 * Dedup    : broadcast_dedup LIKE 'yearly50-lastcall-20260926%'
 *
 * Dry run:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e NOWPAYMENTS_API_KEY="$(docker exec pnptv-bot printenv NOWPAYMENTS_API_KEY)" \
 *     -e NOWPAYMENTS_ENVIRONMENT="$(docker exec pnptv-bot printenv NOWPAYMENTS_ENVIRONMENT)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-yearly50-lastcall-20260926.js --dry-run
 *
 * Live: remove --dry-run
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

const BATCH_ID    = 'yearly50-lastcall-20260926';
const PLAN_ID     = 'yearly50';
const PLAN_AMOUNT = 50.00;
const PLAN_NAME   = 'PRIME Annual — $50 Last Call — PNPtv!';
const WEBAPP_URL  = process.env.WEBAPP_URL || 'https://pnptv.app';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';

const NP_BASE = process.env.NOWPAYMENTS_ENVIRONMENT === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';
const NP_KEY  = process.env.NOWPAYMENTS_API_KEY || '';

const API_DELAY_MS = 200;
const TG_DELAY_MS  = 100;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function tgMsg(firstName, invoiceUrl, lang) {
  const name = firstName ? ` ${firstName}` : '';
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');

  if (isEs) {
    return (
      `🔥 <b>Un año de PRIME por $50 — tu link personal cierra esta noche.</b>\n\n` +
      `Hola${name}, preparamos este link exclusivo para vos.\n\n` +
      `Pagá con cualquier cripto (USDC, BTC, ETH, Dash, LTC y más de 100 opciones):\n\n` +
      `👉 <a href="${invoiceUrl}">${invoiceUrl}</a>\n\n` +
      `✅ Sin tarjeta, sin banco, sin registro extra\n` +
      `✅ Acceso PRIME inmediato al confirmar\n` +
      `✅ Sin cobros recurrentes — un pago, un año\n\n` +
      `<i>Este link es personal. ¿Dudas? Respondé acá.</i>\n\n— Santino`
    );
  }
  return (
    `🔥 <b>A full year of PRIME for $50 — your personal link closes tonight.</b>\n\n` +
    `Hi${name}, we created this link exclusively for you.\n\n` +
    `Pay with any crypto (USDC, BTC, ETH, Dash, LTC + 100 more):\n\n` +
    `👉 <a href="${invoiceUrl}">${invoiceUrl}</a>\n\n` +
    `✅ No card, no bank, no extra signup\n` +
    `✅ PRIME access granted instantly on confirmation\n` +
    `✅ No recurring charges — one payment, one year\n\n` +
    `<i>This link is personal. Need help? Just reply here.</i>\n\n— Santino`
  );
}

function pushPayload(lang) {
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  if (isEs) {
    return {
      title: '🔥 Un año de PRIME por $50 — cierra esta noche',
      body:  'Tu link personal de pago está listo. Sin tarjeta.',
      url:   `${WEBAPP_URL}/subscribe`,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '🔥 A full year of PRIME for $50 — closes tonight',
    body:  'Your personal checkout link is ready. No card needed.',
    url:   `${WEBAPP_URL}/subscribe`,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
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
  });
}

async function createInvoice(userId, email) {
  const orderId = `np-y50lc-${userId}-${Date.now()}`;
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

async function main() {
  await initializePostgres();

  if (!NP_KEY)    { console.error('NOWPAYMENTS_API_KEY not set — aborting'); process.exit(1); }
  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set — aborting'); process.exit(1); }

  const { rows: users } = await query(`
    SELECT u.id, u.telegram, u.email, u.first_name, u.username,
           CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('PRIME', 'banned')
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
    ORDER BY u.created_at ASC
  `);

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
  console.log('  PNPtv! — PRIME Annual $50 · Last Call · 2026-09-26');
  console.log(`  Plan      : ${PLAN_ID} @ $${PLAN_AMOUNT}`);
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log(`  NP env    : ${process.env.NOWPAYMENTS_ENVIRONMENT || 'production'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN sample ──');
    console.log(tgMsg('Alex', 'https://nowpayments.io/payment/?iid=SAMPLE_INVOICE_ID', 'en'));
    console.log('\n── ES sample ──');
    console.log(tgMsg('Alex', 'https://nowpayments.io/payment/?iid=SAMPLE_INVOICE_ID', 'es'));
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
        if (r.error_code === 403 || r.error_code === 400) {
          await query(
            `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [BATCH_ID, u.id]
          );
        }
        console.error(`  ✗ TG ${u.id}: ${r.description || r.error || 'unknown'}`);
        tgFail++;
      }
    } catch (err) {
      console.error(`  ✗ TG ${u.id}: ${err.message}`);
      tgFail++;
    }

    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    if ((tgOk + skipped) % 200 === 0 && (tgOk + skipped) > 0) {
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

  process.exit((invoiceFail + tgFail) > 10 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
