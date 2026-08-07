'use strict';

/**
 * One-shot: create $80 NowPayments invoice for @nikoslutt yearly PRIME
 * and send the link via Telegram DM + platform DM.
 */

const axios = require('axios');

const NP_URL         = 'https://api.nowpayments.io/v1';
const NP_KEY         = process.env.NOWPAYMENTS_API_KEY;
const WEBAPP_URL     = process.env.WEBAPP_URL || 'https://pnptv.app';
const BOT_TOKEN      = process.env.BOT_TOKEN;

if (!NP_KEY) throw new Error('NOWPAYMENTS_API_KEY not set');
if (!BOT_TOKEN) throw new Error('BOT_TOKEN not set');

const NIKOS_UUID     = 'bc5e6df6-4cf1-418d-8e0f-a0af2600f96a';
const NIKOS_TG       = '8446772490';
const SANTINO_UUID   = '8599671840';

const PLAN_ID        = 'prime-diamond-pass-365d';
const AMOUNT         = 80.00;

async function createInvoice() {
  const orderId = `pnptv-yearly-prime-${NIKOS_UUID.slice(0, 8)}-${Date.now()}`;
  const resp = await axios.post(`${NP_URL}/invoice`, {
    price_amount:      AMOUNT,
    price_currency:    'usd',
    order_id:          orderId,
    order_description: 'PNPtv! PRIME Yearly Membership — $80 USD',
    ipn_callback_url:  `${WEBAPP_URL}/api/webhooks/nowpayments`,
    success_url:       `${WEBAPP_URL}/subscribe?nowpayments=success&order=${encodeURIComponent(orderId)}`,
    cancel_url:        `${WEBAPP_URL}/subscribe`,
    customer_email:    'nikoslutt@pnptv.app',
  }, {
    headers: { 'x-api-key': NP_KEY, 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  const invoiceUrl = resp.data?.invoice_url;
  if (!invoiceUrl) throw new Error(`No invoice_url in response: ${JSON.stringify(resp.data)}`);
  return { orderId, invoiceUrl, invoiceId: String(resp.data.id || '') };
}

async function storeOrder({ orderId, invoiceUrl, invoiceId }) {
  const { query } = require('../config/postgres');
  await query(`
    INSERT INTO dash_subscription_orders
      (user_id, plan_id, email, usd_amount, btcpay_invoice_id, status, metadata)
    VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
    ON CONFLICT (btcpay_invoice_id) DO NOTHING
  `, [
    NIKOS_UUID,
    PLAN_ID,
    'nikoslutt@pnptv.app',
    AMOUNT,
    orderId,
    JSON.stringify({
      provider:     'nowpayments',
      flow:         'subscription',
      invoiceUrl,
      nowpaymentsInvoiceId: invoiceId,
      sentBy:       'admin-manual',
    }),
  ]);
  console.log('✅  Order stored:', orderId);
}

async function sendTelegramDM(invoiceUrl) {
  const text =
    `🌟 *PNPtv! PRIME — Yearly Membership*\n\n` +
    `Hey @NIKOSLUTT! Here's your exclusive $80 USD link for a full year of PRIME access:\n\n` +
    `👉 ${invoiceUrl}\n\n` +
    `Pay with Bitcoin, USDT, ETH, or any major crypto. ` +
    `Your membership activates automatically once the payment is confirmed. ` +
    `Any questions? Just reply here! 🖤`;

  const resp = await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id:    NIKOS_TG,
      text,
      parse_mode: 'Markdown',
    },
    { timeout: 10000 }
  );

  if (!resp.data?.ok) throw new Error(`Telegram API error: ${JSON.stringify(resp.data)}`);
  console.log('✅  Telegram DM sent, message_id:', resp.data.result?.message_id);
}

async function sendPlatformDM(invoiceUrl) {
  const DmService = require('../services/dmService');
  const text =
    `🌟 PNPtv! PRIME — Yearly Membership\n\n` +
    `Hey @NIKOSLUTT! Here's your exclusive $80 USD link for a full year of PRIME access:\n\n` +
    `${invoiceUrl}\n\n` +
    `Pay with Bitcoin, USDT, ETH, or any major crypto. ` +
    `Your membership activates automatically once the payment is confirmed. ` +
    `Any questions? Just reply here! 🖤`;

  await DmService.sendMessage(SANTINO_UUID, NIKOS_UUID, { content: text }, { isAdmin: true });
  console.log('✅  Platform DM sent');
}

(async () => {
  try {
    console.log('Creating $80 NowPayments invoice for @NIKOSLUTT...');
    const inv = await createInvoice();
    console.log('Invoice URL:', inv.invoiceUrl);
    console.log('Order ID:  ', inv.orderId);

    await storeOrder(inv);
    await sendTelegramDM(inv.invoiceUrl);
    await sendPlatformDM(inv.invoiceUrl);

    console.log('\n🎉 Done. Invoice sent via Telegram + Platform DM.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
    process.exit(1);
  }
})();
