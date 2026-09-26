#!/usr/bin/env node
'use strict';

/**
 * broadcast-recovery-yearly50-all-20260926.js
 *
 * Follow-up to broadcast-recovery-yearly50-np-20260926.js (platform DM already sent).
 * Adds: direct Telegram bot message + email where available.
 * Reuses the fresh NP invoice URLs already created in the first run.
 *
 * Targets: users with pending yearly50 orders from today (Telegram-reachable).
 * Dedup: broadcast_dedup, batch_id 'recovery-yearly50-all-20260926'
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file /tmp/bot-env.txt \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-recovery-yearly50-all-20260926.js --dry-run
 */

const path = require('path');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/telegraf'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram }  = nm('telegraf');
const nodemailer    = nm('nodemailer');
const axios         = nm('axios');

const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_TG      = process.argv.includes('--skip-telegram');
const SKIP_EMAIL   = process.argv.includes('--skip-email');
const BATCH_ID     = 'recovery-yearly50-all-20260926';
const SENDER_ID    = '8599671840';
const FALLBACK_URL = 'https://pnptv.app/subscribe';

const tg     = new Telegram(process.env.BOT_TOKEN);
const mailer = nodemailer.createTransport({
  host: process.env.EASYBOTS_SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.EASYBOTS_SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.EASYBOTS_SMTP_USER || 'hello@easybots.store', pass: process.env.EASYBOTS_SMTP_PASS },
});

const NP_API_KEY   = process.env.NOWPAYMENTS_API_KEY;
const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => lang && /^es/i.test(String(lang));

async function createNpInvoice(userId, email) {
  const orderId = `recovery-y50b-${String(userId).slice(-8)}-${Date.now()}`;
  try {
    const resp = await axios.post('https://api.nowpayments.io/v1/invoice', {
      price_amount: 50,
      price_currency: 'usd',
      pay_currency: 'usdtbsc',
      order_id: orderId,
      order_description: 'PNPtv PRIME Annual — $50/yr',
      ipn_callback_url: `${WEBAPP_URL}/api/webhooks/nowpayments`,
      success_url: `${WEBAPP_URL}/subscribe?nowpayments=success`,
      ...(email ? { customer_email: email } : {}),
    }, { headers: { 'x-api-key': NP_API_KEY }, timeout: 10000 });
    const invoiceUrl = resp.data?.invoice_url;
    if (!invoiceUrl) throw new Error('no invoice_url');
    const nowpaymentsInvoiceId = resp.data?.id ? String(resp.data.id) : null;
    await query(
      `INSERT INTO dash_subscription_orders
         (user_id, plan_id, usd_amount, btcpay_invoice_id, status, metadata)
       VALUES ($1, 'yearly50', 50.00, $2, 'pending', $3)
       ON CONFLICT (btcpay_invoice_id) DO NOTHING`,
      [String(userId), orderId, JSON.stringify({
        provider: 'nowpayments', flow: 'recovery',
        source: 'broadcast-recovery-yearly50-all-20260926',
        invoiceUrl, ...(nowpaymentsInvoiceId ? { nowpaymentsInvoiceId } : {}),
      })]
    );
    return invoiceUrl;
  } catch (err) {
    console.warn(`  [NP] invoice failed for ${userId}: ${err.message}`);
    return null;
  }
}

function tgText(lang, invoiceUrl) {
  const link = invoiceUrl || FALLBACK_URL;
  if (isEs(lang)) {
    return `🔥 <b>$50/año PRIME — tu link está listo</b>

Santino aquí. Viste los planes PRIME hoy y empezaste el checkout, pero el link venció.

Aquí está tu link directo para pagar ahora:
👉 <a href="${link}">${link}</a>

<b>$50/año · acceso PRIME completo · sin mensualidades.</b>

— Santino`;
  }
  return `🔥 <b>$50 annual PRIME — your link is ready</b>

Santino here. You checked out our PRIME plans today and started checkout, but the payment link expired.

Here's your direct link to pay now:
👉 <a href="${link}">${link}</a>

<b>$50/year · full PRIME access · no monthly fees.</b>

— Santino`;
}

function emailHtml(lang, invoiceUrl) {
  const link = invoiceUrl || FALLBACK_URL;
  const es = isEs(lang);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:0}
    .wrap{max-width:480px;margin:0 auto;padding:32px 20px}
    .badge{background:rgba(212,0,122,0.18);color:#FF6BB0;border:1px solid rgba(212,0,122,0.40);border-radius:99px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;display:inline-block;margin-bottom:20px}
    h1{font-size:26px;font-weight:900;line-height:1.2;margin:0 0 14px;color:#fff}
    p{font-size:15px;line-height:1.6;color:rgba(255,255,255,0.7);margin:0 0 16px}
    .price{font-size:36px;font-weight:900;color:#fff;margin:0 0 4px}
    .price-note{font-size:13px;color:rgba(255,255,255,0.45)}
    .cta{display:inline-block;margin:20px 0;padding:14px 28px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-weight:800;font-size:15px;border-radius:12px;text-decoration:none}
    .footer{font-size:11px;color:rgba(255,255,255,0.3);margin-top:32px;text-align:center}
    .footer a{color:rgba(255,255,255,0.3)}
  </style></head><body><div class="wrap">
    <div class="badge">PRIME Annual</div>
    <h1>${es ? 'Tu link de pago está listo 🔥' : 'Your payment link is ready 🔥'}</h1>
    <p>${es
      ? 'Empezaste el checkout para el plan PRIME anual hoy — el link venció antes de que pudieras pagar. Aquí está fresco:'
      : 'You started checkout for the annual PRIME plan today — the link expired before you could pay. Here it is fresh:'}</p>
    <div class="price">$50<span style="font-size:18px;font-weight:600;color:rgba(255,255,255,0.5)">/yr</span></div>
    <div class="price-note">${es ? 'acceso PRIME completo · sin mensualidades' : 'full PRIME access · no monthly fees'}</div>
    <br>
    <a href="${link}" class="cta">${es ? 'Pagar ahora →' : 'Pay now →'}</a>
    <p style="font-size:13px;margin-top:0">${es
      ? 'Acceso completo a contenido exclusivo, streams en vivo y canales de creadores.'
      : 'Full access to exclusive content, live streams, and creator channels.'}</p>
    <div class="footer">
      PNPtv! &nbsp;·&nbsp; <a href="https://pnptv.app/unsubscribe">Unsubscribe</a>
    </div>
  </div></body></html>`;
}

async function main() {
  await initializePostgres();

  // Load users with pending yearly50 orders from today
  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id, u.telegram, u.username, u.email,
      CASE WHEN LOWER(u.language) = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM dash_subscription_orders dso
    JOIN users u ON u.id = dso.user_id
    WHERE dso.plan_id = 'yearly50'
      AND dso.status = 'pending'
      AND dso.created_at > NOW() - INTERVAL '24 hours'
      AND u.telegram IS NOT NULL AND u.telegram != ''
      AND (u.email IS NULL OR u.email != 'support@pnptv.app')
      AND COALESCE(u.tier,'free') != 'banned'
    ORDER BY u.id
  `);

  // Build invoice URL map from the fresh invoices created in the first recovery run
  const { rows: invoiceRows } = await query(`
    SELECT user_id, metadata->>'invoiceUrl' AS invoice_url
    FROM dash_subscription_orders
    WHERE btcpay_invoice_id LIKE 'recovery-y50-%'
      AND created_at > NOW() - INTERVAL '2 hours'
      AND status = 'pending'
  `);
  const invoiceMap = Object.fromEntries(invoiceRows.map(r => [r.user_id, r.invoice_url]));

  if (!targets.some(u => u.id === SENDER_ID)) {
    targets.unshift({ id: SENDER_ID, telegram: String(SENDER_ID), username: 'pnptv', email: null, lang: 'en' });
  }

  const tgCount    = targets.filter(u => u.telegram).length;
  const emailCount = targets.filter(u => u.email && !u.email.includes('pnptv.app')).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  yearly50 recovery — Telegram + email');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Targets   : ${targets.length} users  |  TG: ${tgCount}  |  email: ${emailCount}`);
  console.log(`  Invoices  : ${invoiceRows.length} fresh NP links loaded`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    targets.slice(0, 5).forEach(u => {
      const inv = invoiceMap[u.id] || '(fallback /subscribe)';
      console.log(`  ${u.id} @${u.username} [${u.lang}] email:${u.email||'—'} url:${inv.slice(0,60)}`);
    });
    console.log(`  ... and ${Math.max(0, targets.length - 5)} more`);
    const sampleInv = invoiceRows[0]?.invoice_url || FALLBACK_URL;
    console.log('\n── TG EN sample ──\n', tgText('en', sampleInv));
    console.log('\n-- DRY RUN complete --\n');
    process.exit(0);
  }

  let tgSent = 0, emailSent = 0, skipped = 0, errors = 0;

  for (const u of targets) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { console.log(`  skip ${u.id}`); skipped++; continue; }

    const lang = u.lang;
    // Use cached invoice URL, create a fresh one if missing, or fall back to /subscribe
    let invoiceUrl = u.id === SENDER_ID ? FALLBACK_URL : (invoiceMap[u.id] || null);
    if (!invoiceUrl && u.id !== SENDER_ID) {
      invoiceUrl = await createNpInvoice(u.id, u.email || null);
      await sleep(300);
    }
    let channelsSent = [];

    // ── Telegram direct ──────────────────────────────────────────────────────
    if (!SKIP_TG && u.telegram) {
      try {
        await tg.sendMessage(u.telegram, tgText(lang, invoiceUrl), {
          parse_mode: 'HTML', disable_web_page_preview: false,
        });
        tgSent++;
        channelsSent.push('TG');
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('blocked') || msg.includes('not found') || msg.includes('deactivated')) {
          console.log(`  [TG] ${u.id}: unavailable — ${msg.slice(0,60)}`);
        } else {
          console.error(`  [TG] ${u.id}: ${msg.slice(0,80)}`);
          errors++;
        }
      }
      await sleep(150);
    }

    // ── Email ────────────────────────────────────────────────────────────────
    if (!SKIP_EMAIL && u.email && !u.email.includes('pnptv.app')) {
      try {
        await mailer.sendMail({
          from: '"Santino @ PNPtv" <hello@easybots.store>',
          to: u.email,
          subject: isEs(lang) ? '🔥 Tu link PRIME anual — listo para pagar' : '🔥 Your annual PRIME link — ready to pay',
          html: emailHtml(lang, invoiceUrl),
        });
        emailSent++;
        channelsSent.push('email');
      } catch (err) {
        console.error(`  [email] ${u.id} (${u.email}): ${err.message.slice(0,80)}`);
        errors++;
      }
      await sleep(200);
    }

    if (channelsSent.length > 0) {
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      console.log(`  ✓ ${u.id} @${u.username} [${channelsSent.join('+')}] ${invoiceUrl ? '→ NP' : '→ fallback'}`);
    }
    await sleep(200);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  TG sent   : ${tgSent}`);
  console.log(`  Email sent: ${emailSent}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Errors    : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
