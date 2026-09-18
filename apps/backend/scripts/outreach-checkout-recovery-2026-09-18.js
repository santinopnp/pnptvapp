#!/usr/bin/env node
'use strict';

/**
 * Recovery outreach for users who attempted checkout (expired intents) but
 * never completed payment. These are the highest-intent leads on the platform.
 * Sends a personal 25%-off code via in-app DM, Telegram, and email.
 *
 * Excludes: system accounts, coyotee1214 (already messaged separately).
 *
 * Usage:
 *   docker cp ... pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/outreach-checkout-recovery-2026-09-18.js --dry-run
 *   docker exec pnptv-bot node /tmp/outreach-checkout-recovery-2026-09-18.js
 */

const path = require('path');
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

const { query }    = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));
const nodemailer   = nm('nodemailer');
const { Telegram } = nm('telegraf');
const crypto       = require('crypto');

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DM       = process.argv.includes('--skip-dm');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_EMAIL    = process.argv.includes('--skip-email');

const CAMPAIGN     = 'checkout-recovery-2026-09-18';
const SYSTEM_SENDER = '8552451957';
const EXCLUDE_IDS  = [
  '8599671840',                         // SantinoFurioso (test)
  '8552451957',                         // pnptv system
  'fafa6786-de29-4216-b788-4f11d703df4f', // Cuentadeprueba (test)
  'a1dc4daf-a9e1-48ea-bc47-a2167d4f87ea', // COYOTEE1214 (already messaged)
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEn  = (lang) => !lang || /^(en|zh|ar)/i.test(String(lang));

function pickName(u, lang) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (lang === 'en' ? 'there' : 'amigo');
}
function genSuffix() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }

// ─── MESSAGES ────────────────────────────────────────────────────────────────

const SUBSCRIBE = (code) => `https://pnptv.app/subscribe?promo=${code}`;

const TG_MSG = {
  en: (name, code) => `
🔑 <b>Still trying to unlock PRIME?</b>

Hey ${name} — we noticed you started a subscription a while back but it didn't go through.

Your 25% off code, no expiry excuses:

🏷 Code: <code>${code}</code>
✅ 25% off any plan · 7 days · one use

👉 <a href="${SUBSCRIBE(code)}">Complete your subscription →</a>`.trim(),

  es: (name, code) => `
🔑 <b>¿Aún intentas desbloquear PRIME?</b>

Hola ${name} — notamos que intentaste suscribirte pero no se completó el pago.

Aquí tu 25% de descuento, sin más excusas:

🏷 Código: <code>${code}</code>
✅ 25% de descuento en cualquier plan · 7 días · un solo uso

👉 <a href="${SUBSCRIBE(code)}">Completa tu suscripción →</a>`.trim(),
};

const DM_MSG = {
  en: (name, code) =>
`Hey ${name} — we saw you tried to subscribe to PNPtv! but something got in the way.

Here's a personal 25% off code to make it easier:

Code: ${code}
${SUBSCRIBE(code)}

Valid 7 days. Any issues, just reply here.
— PNPtv! Team`,

  es: (name, code) =>
`Hola ${name} — vimos que intentaste suscribirte a PNPtv! pero algo no salió bien.

Aquí tienes un código personal con 25% de descuento:

Código: ${code}
${SUBSCRIBE(code)}

Válido 7 días. Si tienes algún problema, responde aquí.
— Equipo PNPtv!`,
};

const EMAIL_SUBJECT = {
  en: 'Still thinking about PNPtv! PRIME? Here\'s 25% off to make it easy',
  es: '¿Aún pensando en PNPtv! PRIME? Aquí tienes 25% de descuento',
};

function buildEmail(lang, name, code) {
  const en  = lang === 'en';
  const url = SUBSCRIBE(code);
  const h   = en ? 'We saved your spot — 25% off inside' : 'Guardamos tu lugar — 25% de descuento';
  const b   = en
    ? `You started a subscription on PNPtv! but it didn't complete. Here's a personal 25% off code — use it anytime in the next 7 days.`
    : `Empezaste una suscripción en PNPtv! pero no se completó. Aquí tienes un código personal con 25% de descuento — úsalo en los próximos 7 días.`;
  const cta = en ? 'Complete Subscription →' : 'Completar Suscripción →';

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
<tr><td style="height:4px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">Hey ${name},</p>
  <h1 style="margin:0 0 16px;font-size:21px;font-weight:900;color:#5ED1C4;">🔑 ${h}</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.7;">${b}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td style="padding:20px;background:rgba(94,209,196,0.08);border:1px solid rgba(94,209,196,0.3);border-radius:12px;text-align:center;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9ca3af;margin-bottom:8px;">${en ? 'Your code' : 'Tu código'}</div>
    <div style="font-size:28px;font-weight:900;color:#5ED1C4;font-family:monospace;">${code}</div>
    <div style="margin-top:8px;font-size:13px;color:#A78BFA;font-weight:600;">25% off any plan · ${en ? 'Valid 7 days · one use' : 'Válido 7 días · un solo uso'}</div>
  </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <a href="${url}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;">${cta}</a>
  </td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;font-size:11px;color:#6b7280;">🔒 Encrypted · Discreet billing · pnptv.app</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── PROMO ───────────────────────────────────────────────────────────────────

async function ensurePromo(userId) {
  const name = `CHECKOUT25 recovery — user ${userId}`;
  const validUntil = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  const { rows } = await query(
    `SELECT code FROM promos WHERE name = $1 AND active=true AND valid_until > NOW() LIMIT 1`,
    [name]
  );
  if (rows.length) return rows[0].code;

  let code;
  for (let i = 0; i < 5; i++) {
    const c = `BACK25-${genSuffix()}`;
    const { rows: exists } = await query(`SELECT 1 FROM promos WHERE UPPER(code)=$1`, [c]);
    if (!exists.length) { code = c; break; }
  }
  if (!code) throw new Error('Could not generate unique code');

  if (!DRY_RUN) {
    await query(
      `INSERT INTO promos
         (code,name,name_es,description,base_plan_id,discount_type,discount_value,
          target_audience,max_spots,valid_from,valid_until,features,features_es,active,hidden,created_by)
       VALUES($1,$2,$3,$4,'any','percentage',25,'all',1,NOW(),$5,'[]','[]',true,true,$6)`,
      [
        code,
        name,
        `CHECKOUT25 recuperación — usuario ${userId}`,
        `25% off, 1 use. High-intent checkout recovery for ${userId}. Campaign: ${CAMPAIGN}.`,
        validUntil,
        CAMPAIGN,
      ]
    );
  }
  return code;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` CHECKOUT RECOVERY — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  const excludeList = EXCLUDE_IDS.map(id => `'${id}'`).join(',');

  const { rows: targets } = await query(`
    SELECT
      u.id, u.username, u.first_name, u.email, u.telegram, u.language,
      COUNT(ci.id)::int          AS attempts,
      MAX(ci.amount_usd)         AS max_usd,
      MAX(ci.created_at)         AS last_attempt
    FROM checkout_intents ci
    JOIN users u ON u.id = ci.user_id
    WHERE ci.status = 'expired'
      AND ci.tx_hash IS NULL
      AND u.deleted_at IS NULL
      AND u.id NOT IN (${excludeList})
      AND (
        u.telegram IS NOT NULL
        OR (u.email IS NOT NULL AND u.email NOT LIKE '%@telegram.pnptv.app')
      )
    GROUP BY u.id, u.username, u.first_name, u.email, u.telegram, u.language
    ORDER BY MAX(ci.created_at) DESC
  `);

  console.log(` Targets: ${targets.length} high-intent users\n`);

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  const stats = { dm: 0, tg: 0, email: 0, dmFailed: 0, tgFailed: 0, emailFailed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = pickName(u, lang);
    const code = DRY_RUN ? `BACK25-DRY` : await ensurePromo(u.id);

    console.log(`[${i+1}/${targets.length}] @${u.username} (${u.attempts} attempts, max $${u.max_usd}, ${lang})`);
    if (DRY_RUN) { console.log(`   [DRY] code: ${code} | TG:${u.telegram||'—'} Email:${u.email||'—'}`); continue; }

    // DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, DM_MSG[lang](name, code), query);
        stats.dm++; console.log(`   ✓ DM`);
      } catch (e) { stats.dmFailed++; console.warn(`   ✗ DM: ${e.message}`); }
      await sleep(100);
    }

    // Telegram
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendMessage(u.telegram, TG_MSG[lang](name, code), { parse_mode: 'HTML', disable_web_page_preview: true });
        stats.tg++; console.log(`   ✓ TG → ${u.telegram}`);
      } catch (e) { stats.tgFailed++; console.warn(`   ✗ TG: ${e.message}`); }
      await sleep(250);
    }

    // Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      try {
        await transporter.sendMail({
          from: '"PNPtv!" <noreply@pnptv.app>',
          to: u.email,
          subject: EMAIL_SUBJECT[lang],
          html: buildEmail(lang, name, code),
        });
        stats.email++; console.log(`   ✓ Email → ${u.email}`);
      } catch (e) { stats.emailFailed++; console.warn(`   ✗ Email: ${e.message}`); }
      await sleep(300);
    }
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` DM:       ${stats.dm} ✓ / ${stats.dmFailed} ✗`);
  console.log(` Telegram: ${stats.tg} ✓ / ${stats.tgFailed} ✗`);
  console.log(` Email:    ${stats.email} ✓ / ${stats.emailFailed} ✗`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
