#!/usr/bin/env node
'use strict';

/**
 * Weekend deal blast — $50/yr PRIME Annual + $100 Lifetime PRIME.
 * Targets all free users with Telegram or email.
 * CTA opens inline checkout on pinned post (no /subscribe redirect).
 *
 * Usage:
 *   docker cp apps/backend/scripts/broadcast-weekend-deal-2026-09-18.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-weekend-deal-2026-09-18.js --dry-run
 *   docker run -d --name weekend-deal-blast \
 *     --env-file /tmp/bot-env.txt \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-weekend-deal-2026-09-18.js
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

const CAMPAIGN      = 'weekend-deal-2026-09-18';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

const POST_URL      = 'https://pnptv.app/social/post/16276';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

const TG_MSG = {
  en: (name) => `
🔥 <b>Weekend only: 1 year of PRIME for $50</b>

Hey ${name} — this weekend we're unlocking our best deal ever.

💎 <b>PRIME Annual — $50/yr</b> (normally $99.99)
Full access for a whole year: exclusive content, live streams, private shows.

🖤 <b>Lifetime PRIME — $100</b> one-time payment. Never pay again.

👉 <a href="${POST_URL}">Claim your deal →</a>

Offer ends Sunday.`.trim(),

  es: (name) => `
🔥 <b>Solo este fin de semana: 1 año de PRIME por $50</b>

Hola ${name} — este fin de semana desbloqueamos nuestra mejor oferta.

💎 <b>PRIME Anual — $50/año</b> (normalmente $99.99)
Acceso completo por un año entero: contenido exclusivo, transmisiones, shows privados.

🖤 <b>PRIME de por vida — $100</b> un solo pago. Nunca más vuelves a pagar.

👉 <a href="${POST_URL}">Reclama tu oferta →</a>

La oferta termina el domingo.`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — this weekend only: 1 full year of PNPtv! PRIME for just $50.

Exclusive content, live streams, private shows — unlimited for 365 days.

💎 PRIME Annual: $50/yr (save 50%)
🖤 Or go Lifetime PRIME for just $100 — one payment, forever.

→ ${POST_URL}

Offer ends Sunday. — PNPtv! Team`,

  es: (name) =>
`Hola ${name} — solo este fin de semana: 1 año completo de PNPtv! PRIME por solo $50.

Contenido exclusivo, transmisiones en vivo, shows privados — sin límites por 365 días.

💎 PRIME Anual: $50/año (ahorra 50%)
🖤 O PRIME de por vida por solo $100 — un pago, para siempre.

→ ${POST_URL}

La oferta termina el domingo. — Equipo PNPtv!`,
};

const EMAIL_SUBJECT = {
  en: '🔥 This weekend only: 1 year of PRIME for $50',
  es: '🔥 Solo este fin de semana: 1 año de PRIME por $50',
};

function buildEmail(lang, name) {
  const es  = lang === 'es';
  const h   = es ? '1 año de PRIME · Solo $50 este fin de semana' : '1 year of PRIME · Just $50 this weekend';
  const sub = es
    ? 'Hola ${name}, este fin de semana desbloqueamos nuestra mejor oferta del año.'
    : 'Hey ${name}, this weekend we\'re unlocking our best deal of the year.';
  const body1 = es
    ? 'Acceso completo por 365 días: contenido exclusivo, transmisiones en vivo y shows privados sin límites.'
    : 'Full access for 365 days: exclusive content, live streams, and private shows — unlimited.';
  const body2 = es
    ? 'O elige PRIME de por vida por un único pago de $100. Nunca más vuelves a pagar.'
    : 'Or go Lifetime PRIME for a one-time $100. Never pay again.';
  const cta  = es ? 'Ver oferta →' : 'Claim Deal →';
  const note = es ? 'La oferta termina el domingo 21 de septiembre.' : 'Offer ends Sunday, September 21.';

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
<tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">Hey ${name},</p>
  <h1 style="margin:0 0 6px;font-size:22px;font-weight:900;color:#fff;line-height:1.3;">🔥 ${h}</h1>
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#E69138;text-transform:uppercase;letter-spacing:.1em;">${note}</p>
  <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.7;">${body1}</p>

  <!-- Plan tiles -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  <tr>
    <td style="width:48%;padding:16px;background:rgba(212,0,122,0.1);border:1px solid rgba(212,0,122,0.4);border-radius:12px;text-align:center;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:#f472b6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">🔥 ${es ? 'Exclusivo fin de semana' : 'Weekend exclusive'}</div>
      <div style="font-size:28px;font-weight:900;color:#fff;">$50</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${es ? '/ año · 365 días' : '/ year · 365 days'}</div>
      <div style="font-size:11px;color:#f472b6;margin-top:6px;">${es ? 'Normalmente $99.99' : 'Normally $99.99'}</div>
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

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` WEEKEND DEAL BLAST — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  // Redis dedup
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

  // Ensure Santino gets the DM regardless of his tier
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
      console.log(`[DRY ${i+1}/${targets.length}] @${u.username} (${lang}) TG:${u.telegram||'—'} Email:${u.email||'—'}`);
      continue;
    }

    // Dedup
    const deduped = await redis.sismember(DEDUP_KEY, u.id);
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, u.id);

    // DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, DM_MSG[lang](name), query);
        stats.dm++;
      } catch (e) { stats.dmF++; console.warn(`  ✗ DM @${u.username}: ${e.message}`); }
      await sleep(80);
    }

    // Telegram
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendMessage(u.telegram, TG_MSG[lang](name), { parse_mode: 'HTML', disable_web_page_preview: true });
        stats.tg++;
      } catch (e) { stats.tgF++; }
      await sleep(200);
    }

    // Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      try {
        await transporter.sendMail({
          from:    '"PNPtv!" <noreply@pnptv.app>',
          to:      u.email,
          subject: EMAIL_SUBJECT[lang],
          html:    buildEmail(lang, name),
        });
        stats.email++;
      } catch (e) { stats.emailF++; }
      await sleep(250);
    }
  }

  if (!DRY_RUN && redis) await redis.expire(DEDUP_KEY, 172800); // 48h TTL

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
