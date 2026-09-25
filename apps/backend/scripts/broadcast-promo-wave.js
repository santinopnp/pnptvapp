#!/usr/bin/env node
'use strict';

/**
 * broadcast-promo-wave.js
 *
 * Dual-offer wave: yearly50 ($50/yr via NowPayments) + lifetime100 ($99.99 via webapp).
 * Sends a single message with 3 inline buttons per user.
 *
 * Requires env var: WAVE_ID  (e.g. "20260923-0600")
 * BATCH_ID = "promo-wave-${WAVE_ID}"
 *
 * Usage:
 *   docker run ... -e WAVE_ID=20260923-0600 node apps/backend/scripts/broadcast-promo-wave.js
 *   Append --dry-run for preview.
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
const WAVE_ID   = process.env.WAVE_ID;

if (!WAVE_ID) { console.error('WAVE_ID env var required'); process.exit(1); }

const BATCH_ID    = `promo-wave-${WAVE_ID}`;
const PLAN_ID     = 'yearly50';
const PLAN_AMOUNT = 50.00;
const PLAN_NAME   = 'PRIME Annual — $50/year Promo — PNPtv!';
const WEBAPP_URL  = process.env.WEBAPP_URL || 'https://pnptv.app';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';

const NP_BASE = process.env.NOWPAYMENTS_ENVIRONMENT === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';
const NP_KEY  = process.env.NOWPAYMENTS_API_KEY || '';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function tgMsg(firstName, lang) {
  const name = firstName ? ` ${firstName}` : '';
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  if (isEs) {
    return (
      `🔥 <b>PRIME — elegí tu plan</b>\n\n` +
      `Hola${name}, dos formas de activar PRIME hoy:\n\n` +
      `📅 <b>PRIME Anual — $50/año</b>\n` +
      `Acceso completo 12 meses. Pagás con cripto.\n\n` +
      `♾️ <b>PRIME de por vida — $99.99</b>\n` +
      `Un solo pago. Nunca más. Precio normal $249.99.\n\n` +
      `Elegí abajo 👇`
    );
  }
  return (
    `🔥 <b>PRIME — choose your plan</b>\n\n` +
    `Hi${name}, two ways to unlock PRIME today:\n\n` +
    `📅 <b>Annual PRIME — $50/year</b>\n` +
    `Full access for 12 months. Pay with any crypto.\n\n` +
    `♾️ <b>Lifetime PRIME — $99.99</b>\n` +
    `One payment. Never pay again. Normally $249.99.\n\n` +
    `Pick below 👇`
  );
}

function inlineKeyboard(invoiceUrl, lang) {
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  return {
    inline_keyboard: [
      [
        { text: '📅 Annual PRIME — $50/yr',  url: invoiceUrl },
        { text: '♾️ Lifetime — $99.99',       url: `${WEBAPP_URL}/subscribe?plan=lifetime100` },
      ],
      [
        { text: '🌐 Subscribe on pnptv.app', url: `${WEBAPP_URL}/subscribe` },
      ],
    ],
  };
}

function pushPayload(lang) {
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  if (isEs) {
    return { title: '🔥 PRIME — $50/yr or $99.99 lifetime', body: 'Two plans, one choice.', url: `${WEBAPP_URL}/subscribe`, tag: BATCH_ID, notifType: 'promo' };
  }
  return { title: '🔥 PRIME — $50/yr or $99.99 lifetime', body: 'Two plans, one choice.', url: `${WEBAPP_URL}/subscribe`, tag: BATCH_ID, notifType: 'promo' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function tgSend(chatId, text, reply_markup) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup,
  });
}

async function getOrCreateInvoice(userId, email) {
  // Reuse an existing pending yearly50 NowPayments order if one exists (avoids duplicate orders)
  const { rows: existing } = await query(`
    SELECT btcpay_invoice_id, (metadata->>'invoiceUrl')::text AS invoice_url
    FROM dash_subscription_orders
    WHERE user_id = $1
      AND plan_id  = 'yearly50'
      AND status   = 'pending'
      AND metadata->>'provider' = 'nowpayments'
      AND created_at > NOW() - INTERVAL '5 days'
    ORDER BY created_at DESC
    LIMIT 1
  `, [String(userId)]);

  if (existing.length && existing[0].invoice_url) {
    return { orderId: existing[0].btcpay_invoice_id, invoiceUrl: existing[0].invoice_url, reused: true };
  }

  // Create fresh invoice
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
  if (!invoiceUrl) throw new Error('No invoice_url in response');

  await query(`
    INSERT INTO dash_subscription_orders
      (user_id, plan_id, email, usd_amount, btcpay_invoice_id, status, metadata)
    VALUES ($1,$2,$3,$4,$5,'pending',$6)
    ON CONFLICT (btcpay_invoice_id) DO NOTHING
  `, [
    String(userId), PLAN_ID,
    (email && !email.includes('@telegram.pnptv.app')) ? email : null,
    PLAN_AMOUNT, orderId,
    JSON.stringify({ provider: 'nowpayments', flow: 'hosted', invoiceUrl, waveId: WAVE_ID }),
  ]);

  return { orderId, invoiceUrl, reused: false };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!NP_KEY)    { console.error('NOWPAYMENTS_API_KEY not set'); process.exit(1); }
  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

  const { rows: users } = await query(`
    SELECT u.id, u.telegram, u.email, u.first_name, u.username,
      CASE WHEN u.language='es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.tier NOT IN ('PRIME','banned')
      AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) != ''
    ORDER BY u.created_at ASC
  `);

  if (!users.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(`
      SELECT id, telegram, email, first_name, username,
        CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang
      FROM users WHERE id=$1`, [SANTINO_ID]);
    if (s.length && s[0].telegram) users.unshift(s[0]);
  }

  const { rows: dr } = await query(`SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`, [BATCH_ID + '%']);
  const alreadySent  = parseInt(dr[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Promo wave  WAVE_ID=${WAVE_ID}  BATCH=${BATCH_ID}`);
  console.log(`  Plans    : ${PLAN_ID} @ $${PLAN_AMOUNT} (NP) + lifetime100 @ $99.99 (webapp)`);
  console.log(`  Env      : ${process.env.NOWPAYMENTS_ENVIRONMENT || 'production'}`);
  console.log(`  Audience : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode     : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    const fakeUrl = 'https://nowpayments.io/payment/?iid=SAMPLE';
    console.log('── EN ──');
    console.log(tgMsg('Alex', 'en'));
    console.log('\nInline keyboard:', JSON.stringify(inlineKeyboard(fakeUrl, 'en'), null, 2));
    console.log('\n── ES ──');
    console.log(tgMsg('Alex', 'es'));
    console.log('\nInline keyboard:', JSON.stringify(inlineKeyboard(fakeUrl, 'es'), null, 2));
    console.log(`\n... to ${users.length} users. Remove --dry-run to send.\n`);
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let invoiceNew = 0, invoiceReused = 0, tgOk = 0, pushOk = 0, skipped = 0, tgFail = 0, invoiceFail = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id=$2`, [BATCH_ID + '%', u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    let orderId, invoiceUrl, reused;
    try {
      ({ orderId, invoiceUrl, reused } = await getOrCreateInvoice(u.id, u.email));
      if (reused) invoiceReused++; else invoiceNew++;
    } catch (err) {
      console.error(`  ✗ invoice ${u.id}: ${err.message}`);
      invoiceFail++;
      await sleep(200);
      continue;
    }

    const name = u.first_name || u.username || null;
    try {
      const r = await tgSend(u.telegram, tgMsg(name, u.lang), inlineKeyboard(invoiceUrl, u.lang));
      if (r.ok) {
        await query(`INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [BATCH_ID, u.id]);
        tgOk++;
      } else {
        tgFail++;
      }
    } catch { tgFail++; }

    if (!SKIP_PUSH) {
      try { await PushNotificationService.sendToUser(u.id, pushPayload(u.lang)); pushOk++; } catch {}
    }

    if ((tgOk + skipped) % 200 === 0 && tgOk + skipped > 0) {
      console.log(`  → tg=${tgOk} new=${invoiceNew} reused=${invoiceReused} skip=${skipped} err=${tgFail}`);
    }

    await sleep(200);
  }

  console.log(`\n  Done — TG=${tgOk} invoices(new=${invoiceNew} reused=${invoiceReused}) push=${pushOk} skipped=${skipped} tgFail=${tgFail} invoiceFail=${invoiceFail}\n`);
  process.exit((tgFail + invoiceFail) > 10 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
