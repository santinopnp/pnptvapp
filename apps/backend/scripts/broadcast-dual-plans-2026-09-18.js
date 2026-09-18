#!/usr/bin/env node
'use strict';

/**
 * Wide blast — $50/yr Annual PRIME + $100 Lifetime PRIME.
 * Targets all non-PRIME users reachable via in-app DM, Telegram, or email.
 * CTA opens pinned post: https://pnptv.app/social/post/16354
 *
 * Usage (isolated container — safe from compose restarts):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     pnptv-bot:latest \
 *     node apps/backend/scripts/broadcast-dual-plans-2026-09-18.js --dry-run
 *
 *   # Live send:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     pnptv-bot:latest \
 *     node apps/backend/scripts/broadcast-dual-plans-2026-09-18.js
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
const IORedis      = nm('ioredis');

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DM       = process.argv.includes('--skip-dm');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_EMAIL    = process.argv.includes('--skip-email');

const CAMPAIGN      = 'dual-plans-2026-09-18';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const POST_URL      = 'https://pnptv.app/social/post/16354';

const TG_DELAY_MS    = 200;
const EMAIL_DELAY_MS = 280;
const DM_DELAY_MS    = 80;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

const TG_MSG = {
  en: (name) => `
🔥 <b>Best deal we've ever offered</b>

Hey ${name} — two ways to go PRIME, both with your card or crypto:

💎 <b>1 Year of PRIME — $50</b>
Exclusive content, live streams, private shows — unlimited for 365 days.

🖤 <b>Lifetime PRIME — $100</b>
One payment. Full access. Forever.

👉 <a href="${POST_URL}">See the plans →</a>`.trim(),

  es: (name) => `
🔥 <b>La mejor oferta que hemos lanzado</b>

Hola ${name} — dos formas de hacerte PRIME, con tarjeta o crypto:

💎 <b>1 Año de PRIME — $50</b>
Contenido exclusivo, transmisiones en vivo, shows privados — sin límites por 365 días.

🖤 <b>PRIME de por vida — $100</b>
Un solo pago. Acceso completo. Para siempre.

👉 <a href="${POST_URL}">Ver los planes →</a>`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — two ways to unlock everything on PNPtv!:

💎 1 Year PRIME — $50
🖤 Lifetime PRIME — $100 (one payment, forever)

Exclusive content, live streams, private shows — card or crypto accepted.

→ ${POST_URL}

— PNPtv! Team`,

  es: (name) =>
`Hola ${name} — dos formas de desbloquear todo en PNPtv!:

💎 1 Año PRIME — $50
🖤 PRIME de por vida — $100 (un pago, para siempre)

Contenido exclusivo, transmisiones en vivo, shows privados — tarjeta o crypto.

→ ${POST_URL}

— Equipo PNPtv!`,
};

const EMAIL_SUBJECT = {
  en: '🔥 1 year of PRIME for $50 — or go Lifetime for $100',
  es: '🔥 1 año de PRIME por $50 — o de por vida por $100',
};

function buildEmail(lang, name) {
  const es   = lang === 'es';
  const h    = es ? 'La mejor oferta que hemos lanzado' : 'Best deal we\'ve ever offered';
  const sub  = es
    ? `Hola ${name}, desbloquea todo PNPtv! con un solo pago.`
    : `Hey ${name}, unlock everything on PNPtv! with a single payment.`;
  const body1 = es
    ? 'Acceso completo: contenido exclusivo, transmisiones en vivo y shows privados. Paga con tarjeta o crypto.'
    : 'Full access: exclusive content, live streams, and private shows. Pay with card or crypto.';
  const body2 = es
    ? 'Elige el plan que más te convenga — ambos se activan al instante.'
    : 'Pick the plan that works for you — both activate instantly.';
  const cta  = es ? 'Ver los planes →' : 'See the plans →';

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
<tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">${sub}</p>
  <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#fff;line-height:1.3;">🔥 ${h}</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.7;">${body1}</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  <tr>
    <td style="width:48%;padding:16px;background:rgba(212,0,122,0.1);border:1px solid rgba(212,0,122,0.4);border-radius:12px;text-align:center;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:#f472b6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">💎 ${es ? '1 Año completo' : '1 Full year'}</div>
      <div style="font-size:28px;font-weight:900;color:#fff;">$50</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${es ? '/ año · 365 días' : '/ year · 365 days'}</div>
    </td>
    <td style="width:4%;"></td>
    <td style="width:48%;padding:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;text-align:center;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">🖤 ${es ? 'De por vida' : 'Forever'}</div>
      <div style="font-size:28px;font-weight:900;color:#fff;">$100</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${es ? 'pago único' : 'one-time'}</div>
      <div style="font-size:11px;color:#fbbf24;margin-top:6px;">${es ? 'Nunca más vuelves a pagar' : 'Never pay again'}</div>
    </td>
  </tr>
  </table>

  <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.7;">${body2}</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
  <tr><td align="center">
    <a href="${POST_URL}" style="display:inline-block;padding:16px 48px;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;font-size:16px;font-weight:900;text-decoration:none;border-radius:12px;">${cta}</a>
  </td></tr>
  </table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;font-size:11px;color:#6b7280;">🔒 ${es ? 'Encriptado · Facturación discreta' : 'Encrypted · Discreet billing'} · pnptv.app</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DUAL PLANS BLAST — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    try { await redis.connect(); } catch {}
    redis.on('error', () => {});
  }

  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.email, u.telegram, u.language
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.id NOT IN ('8552451957','fafa6786-de29-4216-b788-4f11d703df4f')
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id = u.id
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at > NOW())
      )
      AND (
        u.telegram IS NOT NULL
        OR (u.email IS NOT NULL AND u.email NOT LIKE '%@telegram.pnptv.app')
      )
    ORDER BY u.created_at DESC
  `);

  // Ensure Santino receives the message for verification
  const hasSantino = targets.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(`SELECT id, username, first_name, email, telegram, language FROM users WHERE id=$1`, [SANTINO_ID]);
    if (s.length) targets.push(s[0]);
  }

  console.log(` Targets: ${targets.length} users\n`);

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  const stats = { dm: 0, tg: 0, email: 0, dmF: 0, tgF: 0, emailF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const es   = isEs(u.language);
    const lang = es ? 'es' : 'en';
    const name = pickName(u);

    if (i % 500 === 0 && i > 0) {
      console.log(`--- Progress: ${i}/${targets.length} (TG: ${stats.tg} ✓, Email: ${stats.email} ✓) ---`);
    }

    if (DRY_RUN) {
      console.log(`[DRY ${i+1}/${targets.length}] @${u.username || '?'} (${lang}) TG:${u.telegram||'—'} Email:${u.email||'—'}`);
      continue;
    }

    const deduped = await redis.sismember(DEDUP_KEY, u.id);
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, u.id);

    // In-app DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, DM_MSG[lang](name), query);
        stats.dm++;
      } catch (e) { stats.dmF++; }
      await sleep(DM_DELAY_MS);
    }

    // Telegram
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendMessage(u.telegram, TG_MSG[lang](name), { parse_mode: 'HTML', disable_web_page_preview: true });
        stats.tg++;
      } catch { stats.tgF++; }
      await sleep(TG_DELAY_MS);
    }

    // Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      try {
        await transporter.sendMail({
          from:    `"PNPtv!" <${process.env.PNPTV_SMTP_USER || 'support@pnptv.app'}>`,
          to:      u.email,
          subject: EMAIL_SUBJECT[lang],
          html:    buildEmail(lang, name),
        });
        stats.email++;
      } catch { stats.emailF++; }
      await sleep(EMAIL_DELAY_MS);
    }
  }

  if (!DRY_RUN && redis) await redis.expire(DEDUP_KEY, 172800);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` DM:       ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram: ${stats.tg} sent / ${stats.tgF} failed`);
  console.log(` Email:    ${stats.email} sent / ${stats.emailF} failed`);
  console.log(` Skipped:  ${stats.skip} (already sent)`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
