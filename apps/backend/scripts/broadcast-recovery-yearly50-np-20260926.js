#!/usr/bin/env node
'use strict';

/**
 * broadcast-recovery-yearly50-np-20260926.js
 *
 * Recovery for the 82+ users who started a yearly50 checkout today
 * (from the subscribe-retarget-worker) but whose NowPayments invoices
 * expired 8+ hours ago before they could complete payment.
 *
 * For each user: creates a fresh NowPayments invoice for yearly50 ($50/yr),
 * stores it in dash_subscription_orders, then sends a platform DM with
 * the direct invoice link.
 *
 * Excludes: platform account (support@pnptv.app), banned users.
 * Always includes Santino (8599671840) for preview/verification.
 * Dedup: broadcast_dedup, batch_id 'recovery-yearly50-np-20260926'
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e NOWPAYMENTS_API_KEY="$(docker exec pnptv-bot printenv NOWPAYMENTS_API_KEY)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-recovery-yearly50-np-20260926.js --dry-run
 *
 * Live: remove --dry-run
 */

const path    = require('path');
const crypto  = require('crypto');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const axios                         = require('axios');
const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN      = process.argv.includes('--dry-run');
const BATCH_ID     = 'recovery-yearly50-np-20260926';
const SENDER_ID    = '8599671840'; // Santino
const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const NP_API_KEY   = process.env.NOWPAYMENTS_API_KEY;
const NP_URL       = 'https://api.nowpayments.io/v1';
const FALLBACK_URL = WEBAPP_URL + '/subscribe';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function dmText(lang, invoiceUrl) {
  const link = invoiceUrl || FALLBACK_URL;
  if (lang === 'es') {
    return `🔥 *Link listo — $50 PRIME anual*

Santino aquí. Viste los planes PRIME y empezaste el checkout, pero el link venció antes de que pudieras pagar.

Aquí está fresco, listo para pagar ahora:
👉 ${link}

*$50/año — acceso PRIME completo, sin mensualidades.*

— Santino`;
  }
  return `🔥 *Your checkout link is ready — $50 annual PRIME*

Santino here. You checked out our PRIME plans today and started checkout, but the payment link expired before you could complete it.

Here's a fresh link, ready to pay right now:
👉 ${link}

*$50/year — full PRIME access, no monthly fees.*

— Santino`;
}

async function createNpInvoice(userId, email) {
  const orderId = `recovery-y50-${userId.slice(-8)}-${Date.now()}`;
  try {
    const resp = await axios.post(`${NP_URL}/invoice`, {
      price_amount: 50,
      price_currency: 'usd',
      pay_currency: 'usdtbsc',
      order_id: orderId,
      order_description: 'PNPtv PRIME Annual — $50/yr',
      ipn_callback_url: `${WEBAPP_URL}/api/webhooks/nowpayments`,
      success_url: `${WEBAPP_URL}/subscribe?nowpayments=success`,
      ...(email ? { customer_email: email } : {}),
    }, { headers: { 'x-api-key': NP_API_KEY }, timeout: 10000 });

    const nowpaymentsInvoiceId = resp.data?.id ? String(resp.data.id) : null;
    const invoiceUrl = resp.data?.invoice_url || null;

    if (!invoiceUrl) throw new Error('No invoice_url in NP response');

    await query(
      `INSERT INTO dash_subscription_orders
         (user_id, plan_id, usd_amount, btcpay_invoice_id, status, metadata)
       VALUES ($1, 'yearly50', 50.00, $2, 'pending', $3)
       ON CONFLICT (btcpay_invoice_id) DO NOTHING`,
      [String(userId), orderId, JSON.stringify({
        provider: 'nowpayments',
        flow: 'recovery',
        source: 'broadcast-recovery-yearly50-np-20260926',
        invoiceUrl,
        ...(nowpaymentsInvoiceId ? { nowpaymentsInvoiceId } : {}),
      })]
    );

    return invoiceUrl;
  } catch (err) {
    console.warn(`  [NP] invoice failed for ${userId}: ${err.message} — will use fallback URL`);
    return null;
  }
}

async function main() {
  await initializePostgres();

  if (!NP_API_KEY) {
    console.error('NOWPAYMENTS_API_KEY not set — cannot create invoices');
    process.exit(1);
  }

  // Query all users with pending yearly50 orders from today, with Telegram, excluding platform account
  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id,
      u.telegram,
      u.username,
      u.email,
      CASE WHEN LOWER(u.language) = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM dash_subscription_orders dso
    JOIN users u ON u.id = dso.user_id
    WHERE dso.plan_id = 'yearly50'
      AND dso.status = 'pending'
      AND dso.created_at > NOW() - INTERVAL '24 hours'
      AND u.telegram IS NOT NULL AND u.telegram != ''
      AND u.email != 'support@pnptv.app'
      AND COALESCE(u.tier, 'free') != 'banned'
    ORDER BY u.id, dso.created_at DESC
  `);

  // Always include Santino for verification
  const withSantino = [...targets];
  if (!withSantino.some(u => u.id === SENDER_ID)) {
    withSantino.unshift({ id: SENDER_ID, telegram: SENDER_ID, username: 'pnptv', email: null, lang: 'en' });
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  yearly50 recovery → fresh NP invoice + DM');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Targets   : ${withSantino.length} users (${targets.length} yearly50 + Santino)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── First 5 users ──');
    withSantino.slice(0, 5).forEach(u => console.log(`  ${u.id} (@${u.username}) [${u.lang}]`));
    console.log(`  ... and ${Math.max(0, withSantino.length - 5)} more`);
    console.log('\n── EN sample (with placeholder URL) ──\n');
    console.log(dmText('en', 'https://nowpayments.io/payment/?iid=XXXXXXXXXX'));
    console.log('\n── ES sample ──\n');
    console.log(dmText('es', 'https://nowpayments.io/payment/?iid=XXXXXXXXXX'));
    console.log('\n-- DRY RUN complete --\n');
    process.exit(0);
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const u of withSantino) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { console.log(`  skip ${u.id} (already sent)`); skipped++; continue; }

    // For Santino's preview: skip invoice creation, use fallback
    const invoiceUrl = (u.id === SENDER_ID)
      ? FALLBACK_URL
      : await createNpInvoice(u.id, u.email || null);

    await sleep(300); // stay well under NP rate limits

    try {
      await sendSystemDM(SENDER_ID, u.id, dmText(u.lang, invoiceUrl), query);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      console.log(`  ✓ ${u.id} (@${u.username}) → ${invoiceUrl ? 'NP invoice' : 'fallback'}`);
      sent++;
    } catch (err) {
      console.error(`  ✗ ${u.id}: ${err.message}`);
      errors++;
    }
    await sleep(300);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Sent    : ${sent}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
