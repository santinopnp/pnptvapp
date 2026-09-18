#!/usr/bin/env node
'use strict';

/**
 * 24-hour flash blast: Lifetime PRIME for $99.99 (plan: lifetime100).
 * Target: all free-tier users reachable via Telegram or email.
 * ~8,053 users · ~6,664 via Telegram · ~2,091 via email
 *
 * No per-user promo codes — flat offer, links directly to plan.
 * Redis dedup key prevents double-send if re-run within 48h.
 *
 * Usage (preferred — isolated container so compose up won't kill it):
 *   docker compose build pnptv-bot
 *   docker run --rm \
 *     --env-file /opt/pnptvapp/.env \
 *     --env-file /opt/pnptvapp/.env.production \
 *     --network pnptvapp_default \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-lifetime-flash-2026-09-17.js
 *
 *   # dry run:
 *   docker run ... pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-lifetime-flash-2026-09-17.js --dry-run
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
const Redis        = nm('ioredis');

// Backend services create ioredis clients whose unhandled 'error' events can kill the process.
// Suppress them here so the blast continues even if background services can't reach Redis.
process.on('uncaughtException', (err) => {
  if (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('Connection is closed'))) return;
  console.error('Uncaught exception:', err.message);
  process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_DM       = process.argv.includes('--skip-dm');

const CAMPAIGN_ID      = 'lifetime-flash-2026-09-17';
const DEDUP_KEY        = `pnpapp:broadcast:dedup:${CAMPAIGN_ID}`;
const SYSTEM_SENDER_ID = '8552451957';
const SANTINO_ID       = '8599671840';
const PLAN_ID          = 'lifetime100';
const PLAN_PRICE       = '$99.99';
const PLAN_NORMAL      = '$249.99';
const CTA_URL          = `https://pnptv.app/subscribe?plan=${PLAN_ID}`;
const TG_DELAY_MS      = 220;
const EMAIL_DELAY_MS   = 320;
const DM_DELAY_MS      = 80;
const BATCH_SIZE       = 500; // log progress every N users

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => !lang || /^(en|zh|ar)/i.test(String(lang));

function pickName(u, lang) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  if (u.username) return u.username;
  return lang === 'en' ? 'there' : 'amigo';
}

// ──────────────────────────────────────────────
// MESSAGE COPY
// ──────────────────────────────────────────────

const TG_MSG = {
  en: (name) =>
`🔥 <b>24-Hour Flash — Lifetime PRIME for ${PLAN_PRICE}</b>

Hey ${name} — today only, lock in PNPtv! PRIME forever. One payment. Never again.

✅ Unlimited access to every creator
✅ Private calls & exclusive live streams
✅ Nearby, Hangouts, full VIP status
✅ Normally ${PLAN_NORMAL} — yours for ${PLAN_PRICE}

⏰ Offer ends tonight at midnight.

👉 <a href="${CTA_URL}">Grab Lifetime PRIME →</a>`,
  es: (name) =>
`🔥 <b>Flash 24 Horas — PRIME de por vida por ${PLAN_PRICE}</b>

Hola ${name} — solo hoy, asegura tu acceso PRIME a PNPtv! para siempre. Un solo pago. Nunca más.

✅ Acceso ilimitado a todos los creadores
✅ Llamadas privadas y streams exclusivos
✅ Nearby, Hangouts, estatus VIP completo
✅ Normalmente ${PLAN_NORMAL} — tuyo por ${PLAN_PRICE}

⏰ La oferta termina esta noche a medianoche.

👉 <a href="${CTA_URL}">Obtener PRIME de por vida →</a>`,
};

const DM_MSG = {
  en: (name) =>
`🔥 24-Hour Flash — Lifetime PRIME for ${PLAN_PRICE}

Hey ${name} — today only. Unlock PNPtv! PRIME forever with one payment.

✅ Every creator, every stream, every feature
✅ Private calls, Hangouts, Nearby
✅ Normally ${PLAN_NORMAL} — yours for ${PLAN_PRICE}

Offer ends at midnight tonight.

${CTA_URL}`,
  es: (name) =>
`🔥 Flash 24 Horas — PRIME de por vida por ${PLAN_PRICE}

Hola ${name} — solo hoy. Acceso PRIME a PNPtv! para siempre con un solo pago.

✅ Todos los creadores, todos los streams, todas las funciones
✅ Llamadas privadas, Hangouts, Nearby
✅ Normalmente ${PLAN_NORMAL} — tuyo por ${PLAN_PRICE}

La oferta termina esta noche a medianoche.

${CTA_URL}`,
};

const EMAIL_SUBJECT = {
  en: `🔥 24hrs only: Lifetime PRIME for ${PLAN_PRICE} (normally ${PLAN_NORMAL})`,
  es: `🔥 Solo 24hs: PRIME de por vida por ${PLAN_PRICE} (normalmente ${PLAN_NORMAL})`,
};

function buildEmailHtml(lang, name) {
  const en = lang === 'en';
  const subject  = EMAIL_SUBJECT[lang];
  const greeting = en ? `Hey ${name}!` : `¡Hola ${name}!`;
  const headline = en ? `Lifetime PRIME — ${PLAN_PRICE} for the next 24 hours` : `PRIME de por vida — ${PLAN_PRICE} las próximas 24 horas`;
  const intro    = en
    ? `One payment. Lifetime access. Everything PNPtv! PRIME has to offer — every creator, private calls, exclusive streams, Nearby, Hangouts, full VIP status. Yours forever for ${PLAN_PRICE}.`
    : `Un solo pago. Acceso de por vida. Todo lo que ofrece PNPtv! PRIME — cada creador, llamadas privadas, streams exclusivos, Nearby, Hangouts, estatus VIP completo. Tuyo para siempre por ${PLAN_PRICE}.`;
  const normalPrice = en ? `Normally ${PLAN_NORMAL}` : `Normalmente ${PLAN_NORMAL}`;
  const flashPrice  = en ? `Today: ${PLAN_PRICE}` : `Hoy: ${PLAN_PRICE}`;
  const cta         = en ? `Grab Lifetime PRIME →` : `Obtener PRIME de por vida →`;
  const urgency     = en ? `This offer expires at midnight tonight.` : `Esta oferta expira esta noche a medianoche.`;
  const footer      = en
    ? `You received this because you have a free account on PNPtv!.`
    : `Recibiste esto porque tienes una cuenta gratuita en PNPtv!.`;

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
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(167,139,250,0.3);">
        <tr><td style="height:4px;background:linear-gradient(90deg,#A78BFA,#5ED1C4,#f59e0b);"></td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;">
        </td></tr>
        <tr><td style="padding:16px 32px 32px;">
          <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">${greeting}</p>
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#f59e0b;line-height:1.2;">🔥 ${headline}</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.6;">${intro}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="padding:24px;background:linear-gradient(135deg,rgba(167,139,250,0.12),rgba(94,209,196,0.08));border:2px solid rgba(245,158,11,0.4);border-radius:16px;text-align:center;">
              <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.15em;color:#9ca3af;margin-bottom:6px;text-decoration:line-through;">${normalPrice}</div>
              <div style="font-size:48px;font-weight:900;color:#f59e0b;letter-spacing:-0.02em;">${flashPrice}</div>
              <div style="margin-top:8px;font-size:14px;color:#A78BFA;font-weight:700;">LIFETIME ACCESS · ONE PAYMENT · NEVER AGAIN</div>
            </td></tr>
          </table>

          <p style="margin:0 0 20px;font-size:13px;color:#f87171;font-weight:700;text-align:center;">⏰ ${urgency}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td align="center">
              <a href="${CTA_URL}" style="display:inline-block;padding:18px 48px;background:linear-gradient(90deg,#f59e0b,#A78BFA);color:#ffffff;font-size:17px;font-weight:900;text-decoration:none;border-radius:14px;letter-spacing:0.04em;">${cta}</a>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 12px;text-align:center;font-size:13px;color:#d1d5db;">✅ ${en ? 'Every creator' : 'Todos los creadores'}</td>
              <td style="padding:8px 12px;text-align:center;font-size:13px;color:#d1d5db;">✅ ${en ? 'Private calls' : 'Llamadas privadas'}</td>
              <td style="padding:8px 12px;text-align:center;font-size:13px;color:#d1d5db;">✅ ${en ? 'Hangouts' : 'Hangouts'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;text-align:center;font-size:13px;color:#d1d5db;">✅ ${en ? 'Exclusive streams' : 'Streams exclusivos'}</td>
              <td style="padding:8px 12px;text-align:center;font-size:13px;color:#d1d5db;">✅ Nearby</td>
              <td style="padding:8px 12px;text-align:center;font-size:13px;color:#d1d5db;">✅ VIP</td>
            </tr>
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
// MAIN
// ──────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` LIFETIME FLASH BLAST — Campaign ${CAMPAIGN_ID}`);
  console.log('═══════════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing sent or written');
  else               console.log(' MODE: LIVE');
  if (SKIP_DM)       console.log(' --skip-dm');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram');
  if (SKIP_EMAIL)    console.log(' --skip-email');
  console.log();

  // Redis dedup guard — abort if already run (unless dry-run)
  let redis;
  if (!DRY_RUN) {
    try {
      redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true });
      await redis.connect();
      const already = await redis.get(DEDUP_KEY);
      if (already) {
        console.error(` ✗ Dedup key ${DEDUP_KEY} already set — campaign already ran.`);
        console.error('   Delete the key to force a re-run: redis-cli DEL ' + DEDUP_KEY);
        await redis.quit();
        process.exit(1);
      }
      await redis.set(DEDUP_KEY, '1', 'EX', 172800); // 48h TTL
      console.log(' ✓ Dedup key set (48h)\n');
    } catch (err) {
      console.warn(` ⚠ Redis unavailable: ${err.message} — continuing without dedup guard\n`);
      redis = null;
    }
  }

  // Load targets
  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id, u.username, u.first_name, u.email, u.telegram, u.language
    FROM users u
    WHERE u.tier = 'free'
      AND u.deleted_at IS NULL
      AND (
        u.telegram IS NOT NULL
        OR (u.email IS NOT NULL AND u.email NOT LIKE '%@telegram.pnptv.app')
      )
    ORDER BY u.id
  `);

  console.log(` Targets: ${targets.length} free users`);
  const withTg    = targets.filter(u => u.telegram).length;
  const withEmail = targets.filter(u => u.email && !u.email.includes('@telegram.pnptv.app')).length;
  console.log(` Telegram: ${withTg}  ·  Email: ${withEmail}`);
  console.log(` Est. time: ~${Math.ceil(targets.length * TG_DELAY_MS / 60000)} min\n`);

  if (!targets.length) {
    console.log(' No targets — exiting.');
    process.exit(0);
  }

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  // Santino preview
  if (!DRY_RUN && tg) {
    try {
      const preview = TG_MSG.en('Santino');
      await tg.sendMessage(SANTINO_ID, `[PREVIEW — ${CAMPAIGN_ID}, ${targets.length} free users]\n\n${preview}`, { parse_mode: 'HTML' });
      console.log(' ✓ Santino preview sent\n');
    } catch (err) {
      console.warn(` ✗ Santino preview: ${err.message}\n`);
    }
  }

  const stats = {
    dm: 0, dmFailed: 0,
    tg: 0, tgFailed: 0, tgNoId: 0,
    email: 0, emailFailed: 0, emailNoAddr: 0,
  };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = pickName(u, lang);

    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(`\n--- Progress: ${i}/${targets.length} (TG: ${stats.tg} ✓, Email: ${stats.email} ✓) ---\n`);
    }

    // 1. In-app DM
    if (!SKIP_DM) {
      if (DRY_RUN) {
        if (i < 3) console.log(`[DRY] DM → ${u.id} (${lang})`);
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER_ID, u.id, DM_MSG[lang](name), query);
          stats.dm++;
        } catch { stats.dmFailed++; }
        await sleep(DM_DELAY_MS);
      }
    }

    // 2. Telegram
    if (!SKIP_TELEGRAM) {
      if (!u.telegram) {
        stats.tgNoId++;
      } else if (DRY_RUN) {
        if (i < 3) console.log(`[DRY] TG → ${u.telegram} (${lang})`);
      } else {
        try {
          await tg.sendMessage(u.telegram, TG_MSG[lang](name), { parse_mode: 'HTML', disable_web_page_preview: true });
          stats.tg++;
        } catch { stats.tgFailed++; }
        await sleep(TG_DELAY_MS);
      }
    }

    // 3. Email
    if (!SKIP_EMAIL) {
      const emailOk = u.email && !u.email.includes('@telegram.pnptv.app');
      if (!emailOk) {
        stats.emailNoAddr++;
      } else if (DRY_RUN) {
        if (i < 3) console.log(`[DRY] Email → ${u.email} (${lang})`);
      } else {
        try {
          await transporter.sendMail({
            from:    '"PNPtv!" <noreply@pnptv.app>',
            to:      u.email,
            subject: EMAIL_SUBJECT[lang],
            html:    buildEmailHtml(lang, name),
          });
          stats.email++;
        } catch { stats.emailFailed++; }
        await sleep(EMAIL_DELAY_MS);
      }
    }
  }

  // Final summary to Santino
  if (!DRY_RUN && tg) {
    try {
      await tg.sendMessage(SANTINO_ID,
        `✅ <b>Lifetime Flash Complete</b>\n\nCampaign: <code>${CAMPAIGN_ID}</code>\nTargets: ${targets.length}\n\nDMs: ${stats.dm} ✓ / ${stats.dmFailed} ✗\nTelegram: ${stats.tg} ✓ / ${stats.tgFailed} ✗ / ${stats.tgNoId} no-id\nEmail: ${stats.email} ✓ / ${stats.emailFailed} ✗ / ${stats.emailNoAddr} no-addr`,
        { parse_mode: 'HTML' }
      );
    } catch {}
  }

  if (redis) await redis.quit().catch(() => {});

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'} — ${CAMPAIGN_ID}`);
  console.log('═══════════════════════════════════════════════════════════════');
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
