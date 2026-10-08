#!/usr/bin/env node
'use strict';

/**
 * Men.com partnership announcement — all users.
 * Announces Men.com advertising partnership + $1/2-day offer via affiliate link.
 *
 * Usage:
 *   docker cp apps/backend/scripts/broadcast-mencom-partnership-20261006.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-mencom-partnership-20261006.js --dry-run
 *
 *   # Live run (isolated container — required):
 *   docker run --rm --name mencom-partnership-blast \
 *     --env-file /tmp/bot-env.txt \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-mencom-partnership-20261006.js
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

const CAMPAIGN      = 'mencom-partnership-oct2026';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

const MEN_URL       = 'https://landing.mennetwork.com/?ats=eyJhIjoxNzYxNDQzLCJjIjo2NDYwODY2NSwibiI6MjIsInMiOjU0MiwiZSI6OTA5NCwicCI6MTF9';
const BANNER_URL    = 'https://pnptv.app/ads/men/MN_300x250_1.jpg';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

const TG_CAPTION = {
  en: (name) => `
🔥 <b>Big news — Men.com is now on PNPtv!</b>

Hey ${name} — we've partnered with Men.com, the world's hottest gay porn studio. Their banner is live on our site, and clicking it gets you <b>2 days of Men.com for just $1</b>. 🎬

Every click supports PNPtv directly. Help us keep the lights on and get premium content for a buck.`.trim(),

  es: (name) => `
🔥 <b>Gran noticia — ¡Men.com ya está en PNPtv!</b>

Hola ${name} — nos asociamos con Men.com, el estudio de porno gay más caliente del mundo. Su banner está en vivo en nuestro sitio, y al hacer clic obtienes <b>2 días de Men.com por solo $1</b>. 🎬

Cada clic apoya a PNPtv directamente. Ayúdanos a mantener las luces encendidas y obtén contenido premium por un dólar.`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — big news: Men.com is now advertising on PNPtv!

We've partnered with the world's hottest gay porn studio. Click their banner on the site and get 2 days of Men.com for just $1. 🎬

Every click supports PNPtv directly — it helps us keep the platform running.

→ ${MEN_URL}

— PNPtv! Team`,

  es: (name) =>
`Hola ${name} — gran noticia: ¡Men.com ya está en PNPtv!

Nos asociamos con el estudio de porno gay más caliente del mundo. Haz clic en su banner en el sitio y obtén 2 días de Men.com por solo $1. 🎬

Cada clic apoya a PNPtv directamente — nos ayuda a mantener la plataforma activa.

→ ${MEN_URL}

— Equipo PNPtv!`,
};

const EMAIL_SUBJECT = {
  en: '🎬 Men.com is now on PNPtv — 2 days for $1',
  es: '🎬 Men.com ya está en PNPtv — 2 días por $1',
};

function buildEmail(lang, name) {
  const es = lang === 'es';
  const h  = es ? 'Men.com ya está en PNPtv!' : 'Men.com is now on PNPtv!';
  const p1 = es
    ? `Hola ${name}, nos asociamos con el estudio de porno gay más caliente del mundo.`
    : `Hey ${name}, we've partnered with the world's hottest gay porn studio.`;
  const p2 = es
    ? 'Su banner está en vivo en PNPtv, y al hacer clic en él obtienes <b>2 días de Men.com por solo $1</b>.'
    : 'Their banner is live on PNPtv, and clicking it gets you <b>2 days of Men.com for just $1</b>.';
  const p3 = es
    ? 'Cada clic apoya a PNPtv directamente — nos ayuda a mantener la plataforma activa.'
    : 'Every click supports PNPtv directly — it helps us keep the platform running.';
  const cta = es ? 'Ver oferta en Men.com →' : 'Get 2 days of Men.com for $1 →';

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
<tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:0;"><a href="${MEN_URL}"><img src="${BANNER_URL}" alt="Men.com — 2 days for $1" width="600" style="display:block;width:100%;max-width:600px;"></a></td></tr>
<tr><td style="padding:24px 32px 32px;">
  <p style="margin:0 0 8px;font-size:14px;color:#9ca3af;">${p1}</p>
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;line-height:1.3;">🎬 ${h}</h1>
  <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.7;">${p2}</p>
  <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.7;">${p3}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
  <tr><td align="center">
    <a href="${MEN_URL}" style="display:inline-block;padding:16px 48px;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;font-size:16px;font-weight:900;text-decoration:none;border-radius:12px;">${cta}</a>
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
  console.log(` MEN.COM PARTNERSHIP BLAST — ${CAMPAIGN}`);
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
      AND (
        u.telegram IS NOT NULL
        OR (u.email IS NOT NULL AND u.email NOT LIKE '%@telegram.pnptv.app')
      )
    ORDER BY u.created_at DESC
  `);

  const hasSantino = targets.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, email, telegram, language FROM users WHERE id=$1`,
      [SANTINO_ID]
    );
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

    const deduped = await redis.sismember(DEDUP_KEY, u.id);
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, u.id);

    // Platform DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, DM_MSG[lang](name), query);
        stats.dm++;
      } catch (e) { stats.dmF++; console.warn(`  ✗ DM @${u.username}: ${e.message}`); }
      await sleep(80);
    }

    // Telegram — sendPhoto with caption + CTA button
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendPhoto(u.telegram, BANNER_URL, {
          caption:    TG_CAPTION[lang](name),
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{
              text: es ? '🎬 2 días de Men.com por $1 →' : '🎬 2 days of Men.com for $1 →',
              url:  MEN_URL,
            }]],
          },
        });
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

  if (!DRY_RUN && redis) await redis.expire(DEDUP_KEY, 172800);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` DM:       ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram: ${stats.tg} sent / ${stats.tgF} failed`);
  console.log(` Email:    ${stats.email} sent / ${stats.email} failed`);
  console.log(` Skipped:  ${stats.skip} (already sent)`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
