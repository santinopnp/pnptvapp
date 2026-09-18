#!/usr/bin/env node
'use strict';

/**
 * Target: users whose PRIME entitlement expires in ≤3 days (trial + paid).
 * Sends a personal 25%-off promo code via Telegram, email, and in-app DM.
 *
 * Two message variants:
 *   trial — free trial ending, first paid conversion
 *   paid  — active PRIME subscriber about to lapse, renewal
 *
 * Usage:
 *   docker cp apps/backend/scripts/broadcast-expiry-winback-2026-09-17.js pnptv-bot:/tmp/
 *   docker run --rm --env-file /opt/pnptvapp/.env --env-file /opt/pnptvapp/.env.production \
 *     -v /opt/pnptvapp:/app pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-expiry-winback-2026-09-17.js --dry-run
 *   # Remove --dry-run to go live
 */

const path = require('path');
const crypto = require('crypto');

// When copied to /tmp and run via docker exec/run, __dirname is /tmp.
// Detect that case and fall back to the known container app path.
const fs = require('fs');
const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';

// node_modules are hoisted to monorepo root in the container
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/nodemailer'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));
const nodemailer = nm('nodemailer');
const { Telegram } = nm('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_DM       = process.argv.includes('--skip-dm');

const CAMPAIGN_ID      = 'expiry-winback-2026-09-17';
const SYSTEM_SENDER_ID = '8552451957';   // @pnptv / PNPtv! News
const SANTINO_ID       = '8599671840';   // CC on every blast
const PROMO_VALID_DAYS = 5;
const TG_DELAY_MS      = 220;
const EMAIL_DELAY_MS   = 300;
const DM_DELAY_MS      = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => !lang || /^(en|zh|ar)/i.test(String(lang));

function pickName(u, lang) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  if (u.username) return u.username;
  return lang === 'en' ? 'there' : 'amigo';
}

function genCodeSuffix() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

const CHECKOUT = (code) => `https://pnptv.app/subscribe?promo=${code}`;

// ──────────────────────────────────────────────
// MESSAGE COPY
// ──────────────────────────────────────────────

const TG_MSG = {
  trial: {
    en: (name, code) =>
`⏳ <b>Your PNPtv! trial ends soon</b>

Hey ${name} — you've had PRIME access: the creators, the exclusive streams, Nearby, private calls. All of it.

Keep everything. Here's your personal offer:

🏷 Code: <code>${code}</code>
✅ 25% off any plan
✅ Valid ${PROMO_VALID_DAYS} days · one use

👉 <a href="${CHECKOUT(code)}">Lock it in now</a>`,
    es: (name, code) =>
`⏳ <b>Tu prueba de PNPtv! termina pronto</b>

Hola ${name} — tuviste acceso PRIME: los creadores, los streams exclusivos, Nearby, llamadas privadas. Todo.

Consérvalo todo. Tu oferta personal:

🏷 Código: <code>${code}</code>
✅ 25% de descuento en cualquier plan
✅ Válido ${PROMO_VALID_DAYS} días · un solo uso

👉 <a href="${CHECKOUT(code)}">Actívalo ahora</a>`,
  },
  paid: {
    en: (name, code) =>
`⏰ <b>Your PRIME is expiring soon</b>

Hey ${name} — your PNPtv! PRIME access is running out. The creators, the exclusive content, Nearby — keep it all.

Here's your renewal deal:

🏷 Code: <code>${code}</code>
✅ 25% off any plan
✅ Valid ${PROMO_VALID_DAYS} days · one use

👉 <a href="${CHECKOUT(code)}">Renew now</a>`,
    es: (name, code) =>
`⏰ <b>Tu PRIME está por vencer</b>

Hola ${name} — tu acceso PRIME a PNPtv! está por terminar. Los creadores, el contenido exclusivo, Nearby — no los pierdas.

Tu oferta de renovación:

🏷 Código: <code>${code}</code>
✅ 25% de descuento en cualquier plan
✅ Válido ${PROMO_VALID_DAYS} días · un solo uso

👉 <a href="${CHECKOUT(code)}">Renueva ahora</a>`,
  },
};

const DM_MSG = {
  trial: {
    en: (name, code) =>
`Hey ${name} — your PNPtv! trial is ending soon. Keep the creators, streams, Nearby, and private calls you've been enjoying.

Your personal 25% off code: ${code}
Valid ${PROMO_VALID_DAYS} days · one use

${CHECKOUT(code)}`,
    es: (name, code) =>
`Hola ${name} — tu prueba de PNPtv! termina pronto. Conserva los creadores, streams, Nearby y llamadas privadas que has estado disfrutando.

Tu código personal con 25% de descuento: ${code}
Válido ${PROMO_VALID_DAYS} días · un solo uso

${CHECKOUT(code)}`,
  },
  paid: {
    en: (name, code) =>
`Hey ${name} — your PNPtv! PRIME is expiring soon. Stay in and keep everything you love.

Your personal 25% off code: ${code}
Valid ${PROMO_VALID_DAYS} days · one use

${CHECKOUT(code)}`,
    es: (name, code) =>
`Hola ${name} — tu PRIME de PNPtv! está por vencer. Quédate y conserva todo lo que te gusta.

Tu código personal con 25% de descuento: ${code}
Válido ${PROMO_VALID_DAYS} días · un solo uso

${CHECKOUT(code)}`,
  },
};

const EMAIL_SUBJECT = {
  trial: {
    en: '⏳ Your PNPtv! trial is ending — 25% off inside',
    es: '⏳ Tu prueba de PNPtv! termina pronto — 25% de descuento',
  },
  paid: {
    en: '⏰ Your PNPtv! PRIME is expiring — renew at 25% off',
    es: '⏰ Tu PRIME de PNPtv! vence pronto — renueva con 25% de descuento',
  },
};

function buildEmailHtml(subType, lang, name, code) {
  const en = lang === 'en';
  const isTrial = subType === 'trial';

  const subject = EMAIL_SUBJECT[subType][lang];
  const greeting = en ? `Hey ${name}!` : `¡Hola ${name}!`;
  const headline = en
    ? (isTrial ? 'Your trial is ending — keep the good stuff' : 'Your PRIME is expiring — renew and stay in')
    : (isTrial ? 'Tu prueba termina — quédate con lo bueno' : 'Tu PRIME vence — renueva y quédate');
  const intro = en
    ? (isTrial
        ? `You've had PRIME access to PNPtv! — the creators, streams, Nearby, private calls. Here's your personal 25% off code to keep it all.`
        : `Your PNPtv! PRIME subscription is expiring soon. Here's a personal 25% off to renew and keep everything you love.`)
    : (isTrial
        ? `Tuviste acceso PRIME a PNPtv! — los creadores, streams, Nearby, llamadas privadas. Aquí está tu código personal con 25% de descuento para conservarlo todo.`
        : `Tu suscripción PRIME de PNPtv! está por vencer. Aquí tienes un 25% de descuento personal para renovar y conservar todo lo que te gusta.`);
  const codeLabel  = en ? 'Your personal code' : 'Tu código personal';
  const codeNote   = en ? `25% off any plan · Valid ${PROMO_VALID_DAYS} days · One use` : `25% de descuento en cualquier plan · Válido ${PROMO_VALID_DAYS} días · Un solo uso`;
  const cta        = en ? 'Claim 25% Off →' : 'Obtener 25% Descuento →';
  const urgency    = en ? `Offer expires in ${PROMO_VALID_DAYS} days.` : `La oferta expira en ${PROMO_VALID_DAYS} días.`;
  const footer     = en
    ? `You received this because your PNPtv! ${isTrial ? 'free trial' : 'PRIME subscription'} is ending soon.`
    : `Recibiste esto porque tu ${isTrial ? 'prueba gratuita' : 'suscripción PRIME'} de PNPtv! está por terminar.`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
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
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#5ED1C4;line-height:1.2;">⏳ ${headline}</h1>
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
              <a href="${CHECKOUT(code)}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;letter-spacing:0.05em;">${cta}</a>
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

// ──────────────────────────────────────────────
// PROMO CREATION
// ──────────────────────────────────────────────

async function ensurePromoForUser(userId) {
  const promoName = `STAY25 expiry winback — user ${userId}`;
  const validUntil = new Date(Date.now() + PROMO_VALID_DAYS * 86400 * 1000).toISOString();

  const { rows: existing } = await query(
    `SELECT code FROM promos
     WHERE name = $1 AND active = true AND valid_until > NOW()
     LIMIT 1`,
    [promoName]
  );
  if (existing.length) return existing[0].code;

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `STAY25-${genCodeSuffix()}`;
    const { rows } = await query(`SELECT 1 FROM promos WHERE UPPER(code) = $1`, [candidate.toUpperCase()]);
    if (!rows.length) { code = candidate; break; }
  }
  if (!code) throw new Error(`Could not generate unique promo code for user ${userId}`);

  if (DRY_RUN) {
    console.log(`   [DRY] would create promo ${code}`);
    return code;
  }

  await query(
    `INSERT INTO promos
       (code, name, name_es, description, description_es,
        base_plan_id, discount_type, discount_value,
        target_audience, max_spots, valid_from, valid_until,
        features, features_es, active, hidden, created_by)
     VALUES
       ($1,$2,$3,$4,$5,
        'any','percentage',25,
        'all',1,NOW(),$6,
        '[]'::jsonb,'[]'::jsonb,true,true,$7)`,
    [
      code,
      promoName,
      `STAY25 expiración winback — usuario ${userId}`,
      `25% off, one use. Issued to user ${userId}. Campaign ${CAMPAIGN_ID}.`,
      `25% de descuento, un solo uso. Emitido al usuario ${userId}. Campaña ${CAMPAIGN_ID}.`,
      validUntil,
      CAMPAIGN_ID,
    ]
  );
  console.log(`   ✓ Created promo ${code}`);
  return code;
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` EXPIRY WINBACK — Campaign ${CAMPAIGN_ID}`);
  console.log('═══════════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing sent or written');
  else               console.log(' MODE: LIVE');
  if (SKIP_DM)       console.log(' --skip-dm');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram');
  if (SKIP_EMAIL)    console.log(' --skip-email');
  console.log();

  // Load targets dynamically from DB
  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id, u.username, u.first_name, u.email, u.telegram, u.language,
      CASE WHEN ue.source_plan_id = 'prime-trial-3d' THEN 'trial' ELSE 'paid' END AS sub_type,
      ue.expires_at,
      ROUND(EXTRACT(EPOCH FROM (ue.expires_at - NOW()))/3600)::int AS hours_left
    FROM user_entitlements ue
    JOIN users u ON u.id = ue.user_id
    WHERE ue.expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
      AND ue.is_consumed = false
      AND ue.is_lifetime = false
      AND ue.add_on_id = 'prime'
      AND u.deleted_at IS NULL
      AND u.tier != 'banned'
      AND (
        u.telegram IS NOT NULL
        OR (u.email IS NOT NULL AND u.email NOT LIKE '%@telegram.pnptv.app')
      )
    ORDER BY u.id, ue.expires_at ASC
  `);

  console.log(` Targets: ${targets.length} reachable users`);
  console.log(` Trial expiring: ${targets.filter(t => t.sub_type === 'trial').length}`);
  console.log(` Paid expiring:  ${targets.filter(t => t.sub_type === 'paid').length}`);
  console.log();

  if (!targets.length) {
    console.log(' No targets found — exiting.');
    process.exit(0);
  }

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  // Santino preview DM
  if (!DRY_RUN && !SKIP_DM) {
    try {
      const previewCode = 'STAY25-PREVIEW';
      const previewMsg = TG_MSG.trial.en('Santino', previewCode);
      if (tg) {
        await tg.sendMessage(SANTINO_ID, `[PREVIEW — expiry-winback blast, ${targets.length} users]\n\n${previewMsg}`, { parse_mode: 'HTML' });
      }
      console.log(' ✓ Santino preview sent\n');
    } catch (err) {
      console.warn(` ✗ Santino preview failed: ${err.message}\n`);
    }
  }

  const stats = {
    promos: 0,
    dm: 0, dmFailed: 0,
    tg: 0, tgFailed: 0, tgNoId: 0,
    email: 0, emailFailed: 0, emailNoAddr: 0,
  };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = pickName(u, lang);
    const type = u.sub_type; // 'trial' | 'paid'

    console.log(`[${i + 1}/${targets.length}] @${u.username || u.id} (${type}, ${u.hours_left}h left, ${lang})`);

    const code = await ensurePromoForUser(u.id);
    stats.promos++;

    // 1. In-app DM
    if (!SKIP_DM) {
      const body = DM_MSG[type][lang](name, code);
      if (DRY_RUN) {
        console.log(`   [DRY] DM → ${u.id}`);
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER_ID, u.id, body, query);
          stats.dm++;
          console.log(`   ✓ DM sent`);
        } catch (err) {
          stats.dmFailed++;
          console.warn(`   ✗ DM: ${err.message}`);
        }
        await sleep(DM_DELAY_MS);
      }
    }

    // 2. Telegram
    if (!SKIP_TELEGRAM) {
      if (!u.telegram) {
        stats.tgNoId++;
        console.log(`   – no telegram`);
      } else if (DRY_RUN) {
        console.log(`   [DRY] TG → ${u.telegram}`);
      } else {
        try {
          await tg.sendMessage(u.telegram, TG_MSG[type][lang](name, code), { parse_mode: 'HTML' });
          stats.tg++;
          console.log(`   ✓ TG → ${u.telegram}`);
        } catch (err) {
          stats.tgFailed++;
          console.warn(`   ✗ TG [${u.telegram}]: ${err.message}`);
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
            from:    '"PNPtv!" <noreply@pnptv.app>',
            to:      u.email,
            subject: EMAIL_SUBJECT[type][lang],
            html:    buildEmailHtml(type, lang, name, code),
          });
          stats.email++;
          console.log(`   ✓ Email → ${u.email}`);
        } catch (err) {
          stats.emailFailed++;
          console.warn(`   ✗ Email [${u.email}]: ${err.message}`);
        }
        await sleep(EMAIL_DELAY_MS);
      }
    }
  }

  // Final summary to Santino
  if (!DRY_RUN && tg) {
    try {
      const summary = `✅ <b>Expiry Winback Complete</b>

Campaign: <code>${CAMPAIGN_ID}</code>
Targets: ${targets.length}

Promos created: ${stats.promos}
DMs: ${stats.dm} ✓ / ${stats.dmFailed} ✗
Telegram: ${stats.tg} ✓ / ${stats.tgFailed} ✗ / ${stats.tgNoId} skipped
Email: ${stats.email} ✓ / ${stats.emailFailed} ✗ / ${stats.emailNoAddr} skipped`;
      await tg.sendMessage(SANTINO_ID, summary, { parse_mode: 'HTML' });
    } catch {}
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'} — ${CAMPAIGN_ID}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(` Promos:   ${stats.promos}`);
  console.log(` DM:       ${stats.dm} sent / ${stats.dmFailed} failed`);
  console.log(` Telegram: ${stats.tg} sent / ${stats.tgFailed} failed / ${stats.tgNoId} no-id`);
  console.log(` Email:    ${stats.email} sent / ${stats.emailFailed} failed / ${stats.emailNoAddr} no-addr`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message, err.stack);
  process.exit(1);
});
