#!/usr/bin/env node
'use strict';

/**
 * broadcast-yearly50-abandoned-recovery-20261009.js
 *
 * Recovery DM for users who opened a yearly50 invoice in the last 7 days
 * but never completed payment. Each gets a fresh personal NowPayments link.
 *
 * Audience : expired yearly50 orders (last 7d), non-PRIME, non-banned,
 *            + Santino force-included as CC
 * Channels : Telegram (sendPhoto + CTA btn) + Email (HTML)
 * Dedup    : broadcast_dedup LIKE 'yearly50-abandoned-recovery-20261009%'
 *
 * Dry run:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-yearly50-abandoned-recovery-20261009.js --dry-run
 *
 * Live (remove --dry-run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-yearly50-abandoned-recovery-20261009.js
 */

const path = require('path');
const https = require('https');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/nodemailer'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN    = process.argv.includes('--dry-run');
const INAPP_ONLY = process.argv.includes('--inapp-only');
const SKIP_TG    = process.argv.includes('--skip-telegram') || INAPP_ONLY;
const SKIP_EMAIL = process.argv.includes('--skip-email')    || INAPP_ONLY;
const SKIP_INAPP = process.argv.includes('--skip-inapp');

const CAMPAIGN       = 'yearly50-abandoned-recovery-20261009';
const INAPP_CAMPAIGN = CAMPAIGN + '-inapp';
const PLAN_ID     = 'yearly50';
const PLAN_AMOUNT = 50.00;
const PLAN_NAME   = 'PRIME Annual — $50 · PNPtv!';
const WEBAPP_URL  = process.env.WEBAPP_URL || 'https://pnptv.app';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';
const HERO_URL    = 'https://pnptv.app/uploads/creator-media/8599671840-1783409405497.webp';

const NP_BASE = process.env.NOWPAYMENTS_ENVIRONMENT === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';
const NP_KEY  = process.env.NOWPAYMENTS_API_KEY || '';

const TG_DELAY_MS    = 150;
const EMAIL_DELAY_MS = 280;
const NP_DELAY_MS    = 200;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || null;
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

function tgCaption(name, invoiceUrl, available, lang) {
  const n   = name ? ` ${name}` : '';
  const url = invoiceUrl;
  const slots = available != null ? available : '50';

  if (isEs(lang)) {
    return (
      `🔥 <b>Ey${n} — casi lo tenías.</b>\n\n` +
      `Quedan <b>${slots} de 50 cupos</b> para PRIME Anual a $50. Tu pago no se completó — tu lugar sigue disponible.\n\n` +
      `✅ <b>1 año completo</b> de acceso PRIME — todo el contenido\n` +
      `✅ Prime Channel, sesiones privadas, sin límites\n` +
      `✅ Sin tarjeta — pagá con cripto al instante\n` +
      `✅ Un solo pago. Sin cobros recurrentes.\n\n` +
      `👉 <a href="${url}">Completar mi pago →</a>\n\n` +
      `<i>Link personal. Válido 24 h. ¿Dudas? Respondé acá.</i>\n— Santino`
    );
  }
  return (
    `🔥 <b>Hey${n} — you were this close.</b>\n\n` +
    `<b>${slots} of 50 spots</b> left for Annual PRIME at $50. Your payment didn't complete — your spot is still open.\n\n` +
    `✅ <b>1 full year</b> of PRIME access — all content\n` +
    `✅ Prime Channel, private sessions, no limits\n` +
    `✅ No card — pay with crypto instantly\n` +
    `✅ One payment. No recurring charges.\n\n` +
    `👉 <a href="${url}">Complete my payment →</a>\n\n` +
    `<i>Personal link. Valid 24 h. Need help? Just reply.</i>\n— Santino`
  );
}

const EMAIL_SUBJECT = {
  en: (name, slots) => `🔥 ${name ? name + ', your' : 'Your'} $50 PRIME spot is still open — ${slots} left`,
  es: (name, slots) => `🔥 ${name ? name + ', tu' : 'Tu'} cupo de $50 PRIME sigue disponible — quedan ${slots}`,
};

function buildEmail(name, invoiceUrl, available, lang) {
  const es    = isEs(lang);
  const slots = available != null ? available : '50';
  const n     = name || (es ? 'amigo' : 'there');

  const subject  = es ? `Ey ${n}, casi lo tenías` : `Hey ${n}, you were this close`;
  const headline = es ? '🔥 Tu cupo de PRIME Anual sigue abierto' : '🔥 Your Annual PRIME spot is still open';
  const body1    = es
    ? `Iniciaste el pago pero no se completó. Quedan <strong>${slots} de 50 cupos</strong> — y el tuyo todavía está disponible.`
    : `You started a payment but it didn't go through. <strong>${slots} of 50 spots</strong> remain — and yours is still here.`;
  const body2 = es
    ? '1 año completo de PRIME por $50. Todo el contenido, Prime Channel, sesiones privadas, sin cobros recurrentes.'
    : '1 full year of PRIME for $50. All content, Prime Channel, private sessions, no recurring charges.';
  const cta   = es ? 'Completar mi pago →' : 'Complete my payment →';
  const note  = es ? 'Link personal · válido 24 h · sin tarjeta necesaria' : 'Personal link · valid 24 h · no card needed';

  return `<!DOCTYPE html><html lang="${es ? 'es' : 'en'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(255,107,176,0.25);">
<tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#ff9933);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">${subject}</p>
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#fff;line-height:1.3;">${headline}</h1>
  <p style="margin:0 0 12px;font-size:15px;color:#d1d5db;line-height:1.7;">${body1}</p>
  <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.6;">${body2}</p>

  <div style="background:rgba(255,153,51,0.08);border:1px solid rgba(255,153,51,0.30);border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center;">
    <div style="font-size:11px;font-weight:700;color:#ff9933;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">PRIME ANNUAL</div>
    <div style="font-size:48px;font-weight:900;color:#fff;line-height:1;">$50</div>
    <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${es ? '/ año · pago único' : '/ year · one-time payment'}</div>
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  <tr><td align="center">
    <a href="${invoiceUrl}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#D4007A,#ff9933);color:#fff;font-size:15px;font-weight:900;text-decoration:none;border-radius:12px;">${cta}</a>
  </td></tr>
  </table>

  <p style="margin:0 0 24px;font-size:11px;color:#6b7280;text-align:center;">${note}</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;font-size:11px;color:#6b7280;">🔒 ${es ? 'Facturación discreta' : 'Discreet billing'} · pnptv.app</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── IN-APP DM ────────────────────────────────────────────────────────────────

function inAppText(name, invoiceUrl, available, lang) {
  const n     = name ? ` ${name}` : '';
  const slots = available != null ? available : '50';
  if (isEs(lang)) {
    return (
      `🔥 Ey${n} — casi lo tenías.\n\n` +
      `Quedan ${slots} de 50 cupos para PRIME Anual a $50. Tu pago no se completó — tu lugar sigue disponible.\n\n` +
      `✅ 1 año completo de acceso PRIME — todo el contenido\n` +
      `✅ Prime Channel, sesiones privadas, sin límites\n` +
      `✅ Sin tarjeta — pagá con cripto al instante\n` +
      `✅ Un solo pago. Sin cobros recurrentes.\n\n` +
      `👉 Completar mi pago → ${invoiceUrl}\n\n` +
      `Link personal. Válido 24 h. ¿Dudas? Respondé acá.\n— Santino`
    );
  }
  return (
    `🔥 Hey${n} — you were this close.\n\n` +
    `${slots} of 50 spots left for Annual PRIME at $50. Your payment didn't complete — your spot is still open.\n\n` +
    `✅ 1 full year of PRIME access — all content\n` +
    `✅ Prime Channel, private sessions, no limits\n` +
    `✅ No card — pay with crypto instantly\n` +
    `✅ One payment. No recurring charges.\n\n` +
    `👉 Complete my payment → ${invoiceUrl}\n\n` +
    `Personal link. Valid 24 h. Need help? Just reply.\n— Santino`
  );
}

async function sendInAppDM(senderId, recipientId, text, mediaUrl) {
  if (String(senderId) === String(recipientId)) return;
  const content = String(text).trim().slice(0, 4000);
  await query(
    `INSERT INTO direct_messages (sender_id, recipient_id, content, media_url, media_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [senderId, recipientId, content, mediaUrl || null, mediaUrl ? 'image' : null]
  );
  const [a, b]    = [senderId, recipientId].sort();
  const incrementB = senderId === a;
  await query(
    `INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at, unread_for_a, unread_for_b)
     VALUES ($1, $2, $3, NOW(), CASE WHEN $4 THEN 0 ELSE 1 END, CASE WHEN $4 THEN 1 ELSE 0 END)
     ON CONFLICT (user_a, user_b) DO UPDATE SET
       last_message    = EXCLUDED.last_message,
       last_message_at = NOW(),
       unread_for_a    = dm_threads.unread_for_a + CASE WHEN $4 THEN 0 ELSE 1 END,
       unread_for_b    = dm_threads.unread_for_b + CASE WHEN $4 THEN 1 ELSE 0 END`,
    [a, b, content.slice(0, 100), incrementB]
  );
}

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req  = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/${method}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout:  10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error',   () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, caption, btnLabel, invoiceUrl) {
  const kb = { inline_keyboard: [[{ text: btnLabel, url: invoiceUrl }]] };
  const r  = await _tgApi('sendPhoto', {
    chat_id:      chatId,
    photo:        HERO_URL,
    caption:      caption.slice(0, 1024),
    parse_mode:   'HTML',
    reply_markup: kb,
  });
  if (r.ok) return r;
  // fallback to text if photo fails
  return _tgApi('sendMessage', {
    chat_id:                  chatId,
    text:                     caption,
    parse_mode:               'HTML',
    disable_web_page_preview: false,
    reply_markup:             kb,
  });
}

// ─── NOWPAYMENTS INVOICE ──────────────────────────────────────────────────────

async function createInvoice(userId, email) {
  const axios   = nm('axios');
  const orderId = `pnptv-y50-rec-${String(userId).slice(0, 16)}-${Date.now()}`;
  const payload = {
    price_amount:      PLAN_AMOUNT,
    price_currency:    'usd',
    order_id:          orderId,
    order_description: PLAN_NAME,
    ipn_callback_url:  `${WEBAPP_URL}/api/webhooks/nowpayments`,
    success_url:       `${WEBAPP_URL}/yearly50?paid=1&order=${encodeURIComponent(orderId)}`,
    cancel_url:        `${WEBAPP_URL}/yearly50`,
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

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  if (!NP_KEY)    { console.error('NOWPAYMENTS_API_KEY not set — aborting'); process.exit(1); }
  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set — aborting'); process.exit(1); }

  // Available slots (live count)
  const { rows: slotRows } = await query(
    `SELECT 50 - COUNT(*)::int AS available
     FROM dash_subscription_orders
     WHERE plan_id = 'yearly50' AND status = 'completed'
       AND metadata->>'flow' = 'yearly50-public'`
  );
  const available = Math.max(0, slotRows[0]?.available ?? 50);

  // Target audience: users with expired yearly50 orders last 7d, non-PRIME
  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id, u.username, u.first_name, u.email, u.telegram,
      CASE WHEN LOWER(COALESCE(u.language,'en')) LIKE 'es%' THEN 'es' ELSE 'en' END AS lang
    FROM dash_subscription_orders dso
    JOIN users u ON u.id::text = dso.user_id::text
    WHERE dso.plan_id = 'yearly50'
      AND dso.status = 'expired'
      AND dso.created_at >= NOW() - INTERVAL '7 days'
      AND COALESCE(u.is_deleted, false) = false
      AND UPPER(COALESCE(u.tier,'free')) NOT IN ('PRIME','BANNED')
    ORDER BY u.id, dso.created_at DESC
  `);

  // Force-include Santino for verification
  if (!targets.some(u => String(u.id) === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, email, telegram,
              CASE WHEN LOWER(COALESCE(language,'en')) LIKE 'es%' THEN 'es' ELSE 'en' END AS lang
       FROM users WHERE id::text = $1`, [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  const withTg    = targets.filter(t => t.telegram);
  const withEmail = targets.filter(t => t.email && !t.email.includes('@telegram.pnptv.app'));
  const withInApp = targets; // everyone has an in-app account

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — yearly50 Abandoned Recovery — 2026-10-09');
  console.log(`  Slots available : ${available} / 50`);
  console.log(`  Audience        : ${targets.length} users`);
  console.log(`  With Telegram   : ${withTg.length}`);
  console.log(`  With email      : ${withEmail.length}`);
  console.log(`  With in-app DM  : ${withInApp.length}`);
  console.log(`  Campaign        : ${CAMPAIGN}`);
  console.log(`  Mode            : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── TG caption EN ──');
    console.log(tgCaption('Alex', 'https://nowpayments.io/payment/?iid=SAMPLE', available, 'en'));
    console.log('\n── TG caption ES ──');
    console.log(tgCaption('Alejandro', 'https://nowpayments.io/payment/?iid=SAMPLE', available, 'es'));
    console.log(`\n  Subject EN: ${EMAIL_SUBJECT.en('Alex', available)}`);
    console.log(`  Subject ES: ${EMAIL_SUBJECT.es('Alejandro', available)}`);
    console.log('\n── In-app DM EN ──');
    console.log(inAppText('Alex', 'https://nowpayments.io/payment/?iid=SAMPLE', available, 'en'));
    console.log('\n── In-app DM ES ──');
    console.log(inAppText('Alejandro', 'https://nowpayments.io/payment/?iid=SAMPLE', available, 'es'));
    console.log('\n  DRY RUN complete. Remove --dry-run to send.\n');
    process.exit(0);
  }

  const nodemailer  = nm('nodemailer');
  const transporter = SKIP_EMAIL ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  const stats = { tg: 0, email: 0, inApp: 0, tgF: 0, emailF: 0, inAppF: 0, npF: 0, skip: 0 };

  for (const u of targets) {
    // Dedup check (inapp-only mode uses its own namespace)
    const dedupCheck = INAPP_ONLY
      ? `SELECT 1 FROM broadcast_dedup WHERE batch_id = $1 AND user_id = $2`
      : `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`;
    const dedupArg = INAPP_ONLY ? INAPP_CAMPAIGN : CAMPAIGN + '%';
    const { rows: already } = await query(dedupCheck, [dedupArg, u.id]);
    if (already.length > 0) { stats.skip++; continue; }

    const name = pickName(u);

    // Create NowPayments invoice
    let orderId, invoiceUrl;
    try {
      ({ orderId, invoiceUrl } = await createInvoice(u.id, u.email));
    } catch (err) {
      console.error(`  ✗ NP invoice ${u.username}: ${err.message}`);
      stats.npF++;
      await sleep(NP_DELAY_MS);
      continue;
    }

    // Insert order row so IPN can grant on completion
    try {
      await query(
        `INSERT INTO dash_subscription_orders
           (user_id, plan_id, email, usd_amount, btcpay_invoice_id, status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT (btcpay_invoice_id) DO NOTHING`,
        [
          String(u.id), PLAN_ID,
          (u.email && !u.email.includes('@telegram.pnptv.app')) ? u.email : null,
          PLAN_AMOUNT, orderId,
          JSON.stringify({ provider: 'nowpayments', flow: 'yearly50-public', source: 'yearly50-recovery', invoiceUrl, batchId: CAMPAIGN }),
        ]
      );
    } catch (err) {
      console.error(`  ✗ order insert ${u.username}: ${err.message}`);
    }

    await sleep(NP_DELAY_MS);

    // Telegram
    if (!SKIP_TG && u.telegram) {
      const btnLabel = isEs(u.lang) ? '🔥 Completar mi pago' : '🔥 Complete my payment';
      const caption  = tgCaption(name, invoiceUrl, available, u.lang);
      const r = await tgSend(u.telegram, caption, btnLabel, invoiceUrl);
      if (r.ok) {
        await query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [CAMPAIGN, u.id]
        );
        stats.tg++;
      } else {
        if (r.error_code === 403 || r.error_code === 400) {
          await query(
            `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [CAMPAIGN, u.id]
          );
        }
        console.error(`  ✗ TG ${u.username}: ${r.description || r.error || 'unknown'}`);
        stats.tgF++;
      }
      await sleep(TG_DELAY_MS);
    }

    // Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      try {
        const subjectFn = isEs(u.lang) ? EMAIL_SUBJECT.es : EMAIL_SUBJECT.en;
        await transporter.sendMail({
          from:    `"Santino @ PNPtv!" <${process.env.PNPTV_SMTP_USER || 'support@pnptv.app'}>`,
          to:      u.email,
          subject: subjectFn(name, available),
          html:    buildEmail(name, invoiceUrl, available, u.lang),
        });
        if (!u.telegram) {
          await query(
            `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [CAMPAIGN, u.id]
          );
        }
        stats.email++;
      } catch (err) {
        console.error(`  ✗ email ${u.username}: ${err.message}`);
        stats.emailF++;
      }
      await sleep(EMAIL_DELAY_MS);
    }

    // In-app DM
    if (!SKIP_INAPP) {
      // Check in-app specific dedup even when running full mode
      const { rows: inAppDone } = await query(
        `SELECT 1 FROM broadcast_dedup WHERE batch_id = $1 AND user_id = $2`,
        [INAPP_CAMPAIGN, u.id]
      );
      if (inAppDone.length === 0) {
        try {
          await sendInAppDM(SANTINO_ID, String(u.id), inAppText(name, invoiceUrl, available, u.lang), HERO_URL);
          await query(
            `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [INAPP_CAMPAIGN, u.id]
          );
          stats.inApp++;
        } catch (err) {
          console.error(`  ✗ in-app ${u.username}: ${err.message}`);
          stats.inAppF++;
        }
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Telegram sent   : ${stats.tg}`);
  console.log(`  Telegram failed : ${stats.tgF}`);
  console.log(`  Email sent      : ${stats.email}`);
  console.log(`  Email failed    : ${stats.emailF}`);
  console.log(`  In-app DM sent  : ${stats.inApp}`);
  console.log(`  In-app DM failed: ${stats.inAppF}`);
  console.log(`  NP failures     : ${stats.npF}`);
  console.log(`  Skipped (dedup) : ${stats.skip}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit((stats.tgF + stats.emailF) > 10 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
