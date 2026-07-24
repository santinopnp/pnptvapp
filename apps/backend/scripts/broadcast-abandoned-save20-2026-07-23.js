#!/usr/bin/env node
'use strict';

/**
 * Recover 11 users who abandoned/expired a subscription attempt in the last
 * 30 days. Creates a unique 20%-off promo code per user (SAVE20-XXXX), then
 * sends it via three channels: in-app DM (from @pnptv system account),
 * Telegram bot DM, and email (Hostinger SMTP).
 *
 * Usage:
 *   docker cp broadcast-abandoned-save20-2026-07-23.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-abandoned-save20-2026-07-23.js --dry-run
 *   docker exec pnptv-bot node /tmp/broadcast-abandoned-save20-2026-07-23.js
 */

const path = require('path');
const crypto = require('crypto');

const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));
const nodemailer = require('nodemailer');
const { Telegram } = require('telegraf');

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_DM = process.argv.includes('--skip-dm');

const SYSTEM_SENDER_ID = '8552451957'; // @pnptv / PNPtv! News
const CAMPAIGN_ID = 'abandoned-save20-2026-07-23';
const PROMO_VALID_DAYS = 7;
const TG_DELAY_MS = 200;
const EMAIL_DELAY_MS = 300;
const DM_DELAY_MS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn = (lang) => !lang || String(lang).toLowerCase().startsWith('en') || String(lang).toLowerCase().startsWith('zh');

const TARGETS = [
  { id: '7ea341de-3d00-496e-b97a-4260c2130320', plan: 'member_monthly' },
  { id: '8347676028', plan: 'prime-diamond-pass-365d' },
  { id: '8218651217', plan: 'lifetime80' },
  { id: '8476718595', plan: 'member_monthly' },
  { id: '6542883338', plan: 'member_monthly' },
  { id: '0d95e901-6994-4620-a6bf-1d8f502deb79', plan: 'prime-week-pass-7d' },
  { id: 'db15c9c1-1719-4e4b-a724-03f22e7b9719', plan: 'member_monthly' },
  { id: '1430773233', plan: 'prime-week-pass-7d' },
  { id: '817624811', plan: 'monthly-pass' },
  { id: '5151884163', plan: 'lifetime80' },
  { id: '5941486777', plan: 'member_monthly' },
];

function genCodeSuffix() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function pickName(u, lang) {
  const raw = String(u.first_name || '').trim();
  const looksReal = raw && raw.length >= 2 && !/^[0-9]+$/.test(raw);
  if (looksReal) return raw.split(/[\s:,]/)[0];
  if (u.username) return u.username;
  return lang === 'en' ? 'there' : 'hola';
}

const CHECKOUT_URL = (code) => `https://pnptv.app/subscribe?promo=${code}`;

const DM_MSG = {
  en: (name, code) =>
`Hey ${name} — noticed you didn't finish your PNPtv! subscription. Here's 20% off any plan on us.

Code: ${code}
Valid: 7 days · One-time use

Redeem here: ${CHECKOUT_URL(code)}`,
  es: (name, code) =>
`Hola ${name} — vimos que no terminaste tu suscripción a PNPtv!. Aquí tienes 20% de descuento en cualquier plan.

Código: ${code}
Válido: 7 días · Un solo uso

Canjéalo aquí: ${CHECKOUT_URL(code)}`,
};

const TG_MSG = {
  en: (name, code) =>
`💸 <b>20% off — on the house</b>

Hey ${name}, we noticed you didn't finish your PNPtv! subscription.

🏷️ Your code: <code>${code}</code>
✅ 20% off any plan
✅ Valid 7 days · one-time use

👉 <a href="${CHECKOUT_URL(code)}">Redeem now</a>`,
  es: (name, code) =>
`💸 <b>20% de descuento — cortesía de la casa</b>

Hola ${name}, vimos que no terminaste tu suscripción a PNPtv!.

🏷️ Tu código: <code>${code}</code>
✅ 20% de descuento en cualquier plan
✅ Válido 7 días · un solo uso

👉 <a href="${CHECKOUT_URL(code)}">Canjéalo aquí</a>`,
};

const EMAIL_SUBJECT = {
  en: '💸 20% off — finish your PNPtv! subscription',
  es: '💸 20% de descuento — completa tu suscripción PNPtv!',
};

function buildEmailHtml(lang, name, code) {
  const en = lang === 'en';
  const greeting = en ? `Hey ${name}!` : `¡Hola ${name}!`;
  const headline = en ? '20% off — Finish your subscription' : '20% de descuento — Completa tu suscripción';
  const intro = en
    ? `We noticed you didn't finish your PNPtv! subscription. Here's a personal 20% off code — on us.`
    : `Vimos que no terminaste tu suscripción a PNPtv!. Aquí tienes un código personal con 20% de descuento — cortesía de la casa.`;
  const codeLabel = en ? 'Your discount code' : 'Tu código de descuento';
  const codeNote = en ? '20% off any plan · Valid 7 days · One-time use' : '20% en cualquier plan · Válido 7 días · Un solo uso';
  const cta = en ? 'Claim 20% Off →' : 'Obtener 20% Descuento →';
  const urgency = en ? 'Offer expires in 7 days.' : 'La oferta expira en 7 días.';
  const footer = en
    ? `You received this because you started (but didn't complete) a subscription on PNPtv!.`
    : `Recibiste esto porque comenzaste (pero no completaste) una suscripción en PNPtv!.`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
        <tr><td style="height:4px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);"></td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;">
        </td></tr>
        <tr><td style="padding:16px 32px 32px;">
          <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">${greeting}</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#5ED1C4;line-height:1.2;">💸 ${headline}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.6;">${intro}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="padding:20px;background:rgba(94,209,196,0.08);border:1px solid rgba(94,209,196,0.3);border-radius:12px;text-align:center;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.15em;color:#9ca3af;margin-bottom:8px;">${codeLabel}</div>
              <div style="font-size:32px;font-weight:900;color:#5ED1C4;letter-spacing:0.08em;font-family:monospace;">${code}</div>
              <div style="margin-top:8px;font-size:13px;color:#A78BFA;font-weight:600;">${codeNote}</div>
            </td></tr>
          </table>

          <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;font-style:italic;">⏳ ${urgency}</p>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${CHECKOUT_URL(code)}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;letter-spacing:0.05em;">${cta}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0 0 6px;font-size:11px;color:#6b7280;line-height:1.5;">${footer}</p>
          <p style="margin:0;font-size:11px;color:#6b7280;">🔒 Encrypted · Discreet billing · pnptv.app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function ensurePromoForUser(userId, plan) {
  const validUntil = new Date(Date.now() + PROMO_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { rows: existing } = await query(
    `SELECT code FROM promos
      WHERE name = $1 AND active = true AND valid_until > NOW()
      LIMIT 1`,
    [`SAVE20 abandoned recovery — user ${userId}`]
  );
  if (existing.length) {
    return existing[0].code;
  }

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `SAVE20-${genCodeSuffix()}`;
    const { rows } = await query(`SELECT 1 FROM promos WHERE UPPER(code) = $1`, [candidate.toUpperCase()]);
    if (!rows.length) { code = candidate; break; }
  }
  if (!code) throw new Error(`Failed to generate unique promo code for user ${userId}`);

  if (DRY_RUN) {
    console.log(`   [DRY] would create promo ${code} for user ${userId}`);
    return code;
  }

  await query(
    `INSERT INTO promos
       (code, name, name_es, description, description_es,
        base_plan_id, discount_type, discount_value,
        target_audience, max_spots, valid_from, valid_until,
        features, features_es, active, hidden, created_by)
     VALUES
       ($1, $2, $3, $4, $5,
        'any', 'percentage', 20,
        'all', 1, NOW(), $6,
        '[]'::jsonb, '[]'::jsonb, true, true, $7)`,
    [
      code,
      `SAVE20 abandoned recovery — user ${userId}`,
      `SAVE20 recuperación abandonada — usuario ${userId}`,
      `20% off, one-time use, issued to user ${userId} (attempted ${plan}). Campaign ${CAMPAIGN_ID}.`,
      `20% de descuento, un solo uso, emitido al usuario ${userId} (intentó ${plan}). Campaña ${CAMPAIGN_ID}.`,
      validUntil,
      CAMPAIGN_ID,
    ]
  );
  console.log(`   ✓ Created promo ${code} for user ${userId}`);
  return code;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` SAVE20 Abandoned-Cart Recovery — ${TARGETS.length} users`);
  console.log('═══════════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent or written');
  else               console.log(' MODE: LIVE');
  if (SKIP_DM)       console.log(' --skip-dm');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram');
  if (SKIP_EMAIL)    console.log(' --skip-email');
  console.log();

  const stats = {
    promos: 0, dm: 0, dmFailed: 0,
    telegram: 0, telegramFailed: 0, telegramNoId: 0,
    email: 0, emailFailed: 0, emailNoAddr: 0,
  };

  const tg = SKIP_TELEGRAM || DRY_RUN ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const { rows } = await query(
      `SELECT id, username, first_name, email, telegram, language
         FROM users WHERE id = $1`,
      [t.id]
    );
    if (!rows.length) {
      console.log(`[${i+1}/${TARGETS.length}] user ${t.id} not found — skip`);
      continue;
    }
    const u = rows[0];
    if (String(u.username || '').startsWith('deleted_')) {
      console.log(`[${i+1}/${TARGETS.length}] user ${t.id} is deleted — skip`);
      continue;
    }
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = pickName(u, lang);
    console.log(`[${i+1}/${TARGETS.length}] ${u.username || u.id} (${lang})`);

    const code = await ensurePromoForUser(u.id, t.plan);
    stats.promos++;

    // 1. In-app DM
    if (!SKIP_DM) {
      const body = DM_MSG[lang](name, code);
      if (DRY_RUN) {
        console.log(`   [DRY] DM → ${u.id}`);
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER_ID, u.id, body, query);
          stats.dm++;
          console.log(`   ✓ DM sent`);
        } catch (err) {
          stats.dmFailed++;
          console.warn(`   ✗ DM error: ${err.message}`);
        }
        await sleep(DM_DELAY_MS);
      }
    }

    // 2. Telegram
    if (!SKIP_TELEGRAM) {
      if (!u.telegram) {
        stats.telegramNoId++;
        console.log(`   – no telegram id`);
      } else if (DRY_RUN) {
        console.log(`   [DRY] TG → ${u.telegram}`);
      } else {
        try {
          await tg.sendMessage(u.telegram, TG_MSG[lang](name, code), {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          });
          stats.telegram++;
          console.log(`   ✓ TG sent to ${u.telegram}`);
        } catch (err) {
          stats.telegramFailed++;
          console.warn(`   ✗ TG error [${u.telegram}]: ${err.message}`);
        }
        await sleep(TG_DELAY_MS);
      }
    }

    // 3. Email
    if (!SKIP_EMAIL) {
      const emailOk = u.email && !u.email.includes('@telegram.pnptv.app');
      if (!emailOk) {
        stats.emailNoAddr++;
        console.log(`   – no real email`);
      } else if (DRY_RUN) {
        console.log(`   [DRY] EMAIL → ${u.email}`);
      } else {
        try {
          await transporter.sendMail({
            from:    '"PNPtv!" <support@pnptv.app>',
            to:      u.email,
            subject: EMAIL_SUBJECT[lang],
            html:    buildEmailHtml(lang, name, code),
          });
          stats.email++;
          console.log(`   ✓ Email sent to ${u.email}`);
        } catch (err) {
          stats.emailFailed++;
          console.warn(`   ✗ Email error [${u.email}]: ${err.message}`);
        }
        await sleep(EMAIL_DELAY_MS);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'} — Campaign ${CAMPAIGN_ID}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(` Promos:   ${stats.promos}`);
  console.log(` DM:       ${stats.dm} sent / ${stats.dmFailed} failed`);
  console.log(` Telegram: ${stats.telegram} sent / ${stats.telegramFailed} failed / ${stats.telegramNoId} skipped-no-id`);
  console.log(` Email:    ${stats.email} sent / ${stats.emailFailed} failed / ${stats.emailNoAddr} skipped-no-addr`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
