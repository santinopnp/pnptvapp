#!/usr/bin/env node
/**
 * One-off promo bundle for @CHASETHECLOUDS.
 *
 * Buyer pays $40 USD in BTC via NowPayments → gets 300 PNP tokens
 * (worth $50 USD at the 6-tokens/$1 base rate; net +$10 bonus).
 *
 * +10% of buyer tokens shared between Santino & Lex → 15 tokens each.
 * Cash split on the $40 gross: 20% platform / 40% Santino / 40% Lex,
 * recorded to creator_earnings with a 7-day hold (mirrors PRIME split).
 *
 * Run:
 *   docker exec -i pnptv-bot node scripts/mint-promo-bundle-chase-2026-08-01.js
 *
 * On payment 'finished', the /api/webhooks/nowpayments handler for
 * plan_id='promo_token_bundle' fulfills all credits + cash-split rows
 * atomically. Idempotent by (source_payment_id, creator_id).
 */

'use strict';

const axios = require('axios');
const { query } = require('../config/postgres');
const {
  SANTINO_USER_ID,
  LEX_USER_ID,
  PRIME_PLATFORM_RATE,
  PRIME_CREATOR_RATE,
} = require('../config/monetizationConfig');

const BUYER_USER_ID     = '8162853364';  // @CHASETHECLOUDS
const PRICE_USD         = 40;
const TOKENS_FOR_BUYER  = 300;            // $50 worth @ 6 tok/$1 base rate
const BONUS_TOKENS_EACH = 15;             // 5% of buyer tokens (10% shared between S+L)

const NOWPAYMENTS_URL = process.env.NOWPAYMENTS_ENVIRONMENT === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const WEBAPP_URL = process.env.WEB_APP_URL || 'https://pnptv.app';

async function main() {
  if (!NOWPAYMENTS_API_KEY) throw new Error('NOWPAYMENTS_API_KEY missing');

  const buyerRes = await query('SELECT id, username, first_name FROM users WHERE id = $1', [BUYER_USER_ID]);
  if (buyerRes.rowCount === 0) throw new Error(`Buyer ${BUYER_USER_ID} not found`);
  const buyer = buyerRes.rows[0];

  const orderId = `pnptv-promo-bundle-chase-${Date.now()}`;

  const invoiceResp = await axios.post(
    `${NOWPAYMENTS_URL}/invoice`,
    {
      price_amount: PRICE_USD,
      price_currency: 'usd',
      pay_currency: 'btc',
      order_id: orderId,
      order_description: `PNP Tokens promo bundle for @${buyer.username || buyer.first_name}`,
      ipn_callback_url: `${WEBAPP_URL}/api/webhooks/nowpayments`,
      success_url: `${WEBAPP_URL}/wallet?nowpayments=success&order=${encodeURIComponent(orderId)}`,
      cancel_url: `${WEBAPP_URL}/wallet`,
    },
    { headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const invoiceId = invoiceResp.data?.id;
  if (!invoiceId) throw new Error(`NowPayments returned no invoice id: ${JSON.stringify(invoiceResp.data)}`);
  const invoiceUrl = `https://nowpayments.io/payment?iid=${invoiceId}`;

  const metadata = {
    provider: 'nowpayments',
    flow: 'promo_token_bundle',
    buyerUsername: buyer.username,
    tokensForBuyer: TOKENS_FOR_BUYER,
    bonusRecipients: [
      { userId: SANTINO_USER_ID, tokens: BONUS_TOKENS_EACH, label: 'Santino (co-founder bonus)' },
      { userId: LEX_USER_ID,     tokens: BONUS_TOKENS_EACH, label: 'Lex (co-founder bonus)' },
    ],
    cashSplit: {
      gross: PRICE_USD,
      platformRate: PRIME_PLATFORM_RATE,
      perCreatorRate: PRIME_CREATOR_RATE,
      creatorRecipients: [SANTINO_USER_ID, LEX_USER_ID],
    },
    nowpaymentsInvoiceId: String(invoiceId),
    invoiceUrl,
    payCurrency: 'btc',
    mintedAt: new Date().toISOString(),
    mintedBy: 'scripts/mint-promo-bundle-chase-2026-08-01.js',
  };

  await query(
    `INSERT INTO dash_subscription_orders
       (user_id, plan_id, usd_amount, btcpay_invoice_id, status, metadata)
     VALUES ($1, 'promo_token_bundle', $2, $3, 'pending', $4)
     ON CONFLICT (btcpay_invoice_id) DO NOTHING`,
    [BUYER_USER_ID, PRICE_USD, orderId, JSON.stringify(metadata)]
  );

  console.log(JSON.stringify({
    ok: true,
    buyer: `${buyer.id} @${buyer.username || buyer.first_name}`,
    orderId,
    invoiceId,
    invoiceUrl,
    priceUsd: PRICE_USD,
    tokensForBuyer: TOKENS_FOR_BUYER,
    bonusEach: BONUS_TOKENS_EACH,
    cashSplit: `20% platform / 40% Santino / 40% Lex on $${PRICE_USD}`,
  }, null, 2));
}

main().then(() => process.exit(0)).catch(err => {
  console.error('MINT FAILED:', err.response?.data || err.message);
  process.exit(1);
});
