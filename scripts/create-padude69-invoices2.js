#!/usr/bin/env node
'use strict';

/**
 * One-shot: create two NowPayments invoices for PADude69 (7884718360)
 *  1. $198.84 USDC (Ethereum mainnet) → 1193 tokens
 *  2. $200.00 ETH (Ethereum mainnet)  → 1200 tokens
 */

const axios = require('axios');
const { Pool } = require('pg');

const NP_URL = 'https://api.nowpayments.io/v1';
const NP_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = 'https://pnptv.app';

const PADUDE_USER_ID = '10edc448-4809-45f7-a721-82956504f049';
const PADUDE_TELEGRAM = '7884718360';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: 5432,
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
});

async function createInvoice({ usdAmount, payCurrency, tokens, label }) {
  const orderId = `pnptv-tokens-nowp-${PADUDE_USER_ID}-${Date.now()}-${payCurrency}`;
  const resp = await axios.post(
    `${NP_URL}/invoice`,
    {
      price_amount: usdAmount,
      price_currency: 'usd',
      pay_currency: payCurrency,
      order_id: orderId,
      order_description: `${tokens} PNP Ru$h Tokens (${label})`,
      ipn_callback_url: `${WEB_APP_URL}/api/webhooks/nowpayments`,
      success_url: `${WEB_APP_URL}/wallet?nowpayments=success`,
      cancel_url: `${WEB_APP_URL}/wallet`,
    },
    { headers: { 'x-api-key': NP_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const { id: npInvoiceId, invoice_url: invoiceUrl } = resp.data;
  if (!npInvoiceId) throw new Error(`No invoice id: ${JSON.stringify(resp.data)}`);
  const finalUrl = invoiceUrl || `https://nowpayments.io/payment/?iid=${npInvoiceId}`;

  await pool.query(
    `INSERT INTO dash_subscription_orders
       (user_id, plan_id, email, usd_amount, btcpay_invoice_id, status, metadata)
     VALUES ($1, 'token_purchase', NULL, $2, $3, 'pending', $4)
     ON CONFLICT (btcpay_invoice_id) DO NOTHING`,
    [
      PADUDE_USER_ID, usdAmount, orderId,
      JSON.stringify({
        provider: 'nowpayments', flow: 'token_purchase', packageId: 'custom',
        tokens, bonusTokens: 0, invoiceUrl: finalUrl,
        nowpaymentsInvoiceId: String(npInvoiceId), payCurrency,
      }),
    ]
  );

  return { orderId, invoiceUrl: finalUrl };
}

async function sendTelegram(chatId, text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, { timeout: 10000 });
}

async function main() {
  if (!NP_API_KEY) throw new Error('NOWPAYMENTS_API_KEY not set');
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN not set');

  console.log('Creating USDC invoice ($198.84)...');
  const usdc = await createInvoice({ usdAmount: 198.84, payCurrency: 'usdc', tokens: 1193, label: 'USDC – Ethereum' });
  console.log('USDC:', usdc.invoiceUrl);

  await new Promise(r => setTimeout(r, 100));

  console.log('Creating ETH invoice ($200.00)...');
  const eth = await createInvoice({ usdAmount: 200.00, payCurrency: 'eth', tokens: 1200, label: 'ETH – Ethereum Mainnet' });
  console.log('ETH:', eth.invoiceUrl);

  const msg = [
    '💎 <b>Tus links de pago para Ru$h Tokens:</b>',
    '',
    '🔵 <b>Opción 1 — USDC (Ethereum)</b>',
    'Monto: $198.84 USD',
    'Tokens: 1,193 Ru$h 💎',
    `👉 <a href="${usdc.invoiceUrl}">Pagar con USDC</a>`,
    '',
    '⚡️ <b>Opción 2 — ETH (Ethereum Mainnet)</b>',
    'Monto: $200.00 USD',
    'Tokens: 1,200 Ru$h 💎',
    `👉 <a href="${eth.invoiceUrl}">Pagar con ETH</a>`,
    '',
    'Los tokens se acreditan automáticamente al confirmar el pago. ¡Gracias! 🙌',
  ].join('\n');

  await sendTelegram(PADUDE_TELEGRAM, msg);
  console.log('✅ Message sent to PADude69');

  await pool.end();
}

main().catch(err => {
  console.error('ERROR:', err.response?.data || err.message);
  process.exit(1);
});
