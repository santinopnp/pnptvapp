#!/usr/bin/env node
'use strict';

/**
 * broadcast-crypto-guide-2026-07-22-resume.js
 *
 * Resumes the 2026-07-22 crypto-guide broadcast that was interrupted by
 * a container restart at 02:07:14 UTC after TG progress 2600/4066.
 *
 * - Skips in-app (5217 already delivered) and web push (644 already delivered).
 * - Resumes Telegram from index TG_SKIP_FIRST (default 2600) in the same
 *   user ordering (ORDER BY u.id ASC) that the original script used.
 * - Sends email to all 1244 real-email users (0 sent so far).
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-resume.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-resume.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-resume.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-resume.js --skip-email
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-resume.js --tg-skip-first 2600
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }    = require(path.join(BACKEND, 'config/postgres'));
const emailService = require(path.join(BACKEND, 'services/emailservice'));
const { Telegram } = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');

const skipIdx = process.argv.indexOf('--tg-skip-first');
const TG_SKIP_FIRST = skipIdx !== -1 ? parseInt(process.argv[skipIdx + 1], 10) || 0 : 2600;

const APP_URL   = 'https://pnptv.app';
const GUIDE_URL = `${APP_URL}/crypto-guide`;
const TG_DELAY_MS = 80;
const EMAIL_DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Messages (identical to the original script) ───────────────────────────────

const TG = {
  en: (name) =>
`💸 <b>Hey ${name} — you asked, we shipped.</b>

You told us the crypto checkout felt confusing. We listened.

<b>What's new:</b>

<b>1. Rebuilt crypto checkout ✅</b>
Faster, cleaner, fewer steps.

<b>2. Crypto 101 wizard 🆕</b>
For anyone who's never touched crypto before. Download a wallet → buy the coin → pay. Under 5 minutes, no jargon.

👉 <a href="${GUIDE_URL}">${GUIDE_URL}</a>

No bank, no censorship, no one freezing our community. Thanks for pushing us to make this better. 🖤

— PNPtv team`,

  es: (name) =>
`💸 <b>¡Hola ${name}! Nos lo pediste, lo hicimos.</b>

Nos dijiste que el checkout con cripto era confuso. Te escuchamos.

<b>Lo nuevo:</b>

<b>1. Checkout rediseñado ✅</b>
Más rápido, más limpio, menos pasos.

<b>2. Asistente Cripto 101 🆕</b>
Para quien nunca haya usado cripto. Descargar wallet → comprar la moneda → pagar. Menos de 5 minutos, sin tecnicismos.

👉 <a href="${GUIDE_URL}">${GUIDE_URL}</a>

Sin banco, sin censura, sin nadie congelando a la comunidad. Gracias por empujarnos a mejorar esto. 🖤

— El equipo de PNPtv`,
};

const EMAIL_SUBJECT = {
  en: 'You asked, we shipped: the new crypto checkout + a 5-minute guide',
  es: 'Nos lo pediste, lo hicimos: nuevo checkout cripto + guía de 5 minutos',
};

function buildEmailHtml(lang, name) {
  const en = lang === 'en';
  const greeting = en ? `Hi ${name}!` : `¡Hola ${name}!`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#121220;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138)"></td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:22px;font-weight:900;color:#fff">PNPtv!</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px">

          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">${greeting}</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:900;color:#fff;line-height:1.25">
            💸 ${en ? 'You asked, we shipped.' : 'Nos lo pediste, lo hicimos.'}
          </h1>

          <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6">
            ${en
              ? 'You told us paying with crypto felt intimidating. We listened.'
              : 'Nos dijiste que pagar con cripto se sentía intimidante. Te escuchamos.'}
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
            <tr><td style="padding:18px 20px;background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.2);border-radius:12px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#4ade80">✅ ${en ? 'Rebuilt crypto checkout' : 'Checkout cripto rediseñado'}</p>
              <p style="margin:0;font-size:13px;color:#d1d5db;line-height:1.55">
                ${en
                  ? 'Faster, cleaner, fewer steps. Same coins (BTC, ETH, USDC, Dash and 100+ more).'
                  : 'Más rápido, más limpio, menos pasos. Las mismas monedas (BTC, ETH, USDC, Dash y más de 100).'}
              </p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="padding:18px 20px;background:rgba(212,0,122,0.07);border:1px solid rgba(212,0,122,0.2);border-radius:12px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#f472b6">🆕 ${en ? 'Crypto 101 wizard' : 'Asistente Cripto 101'}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#d1d5db;line-height:1.55">
                ${en
                  ? 'For anyone who\'s never touched crypto before. Step-by-step: download a wallet, buy the coin, pay. Under 5 minutes, no jargon.'
                  : 'Para quien nunca haya usado cripto. Paso a paso: descargar una wallet, comprar la moneda, pagar. Menos de 5 minutos, sin tecnicismos.'}
              </p>
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#fff">${en ? 'You\'ll learn:' : 'Aprenderás a:'}</p>
              <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">1. ${en ? 'Pick and install a wallet (Trust Wallet, Dash Wallet)' : 'Elegir e instalar una wallet (Trust Wallet, Dash Wallet)'}</p>
              <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">2. ${en ? 'Buy the coin (BTC, ETH, USDC, Dash…)' : 'Comprar la moneda (BTC, ETH, USDC, Dash…)'}</p>
              <p style="margin:0;font-size:12px;color:#9ca3af">3. ${en ? 'Pay at pnptv.app/subscribe — done' : 'Pagar en pnptv.app/subscribe — listo'}</p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${GUIDE_URL}" style="display:inline-block;padding:15px 44px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:12px">
                ${en ? 'Open the Crypto 101 wizard →' : 'Abrir el asistente Cripto 101 →'}
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center">
            ${en
              ? 'Why crypto? No bank can freeze our community. No processor can censor what PNP means. Privacy, freedom, control.'
              : '¿Por qué cripto? Ningún banco puede congelar a nuestra comunidad. Ningún procesador puede censurar lo que significa PNP. Privacidad, libertad, control.'}
          </p>

          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.6">
            ${en
              ? 'Thanks for pushing us to make this better. 🖤'
              : 'Gracias por empujarnos a mejorar esto. 🖤'}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08)">
          <p style="margin:0;font-size:11px;color:#6b7280">
            ${en ? 'You received this as a member of PNPtv!.' : 'Recibiste esto por ser miembro de PNPtv!.'}
            🔒 pnptv.app
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Crypto Guide Broadcast — RESUME (2026-07-22)');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram');
  if (SKIP_EMAIL)    console.log(' --skip-email');
  console.log(` TG_SKIP_FIRST: ${TG_SKIP_FIRST}`);

  const { rows: users } = await query(`
    SELECT u.id, u.first_name, u.username, u.email, u.telegram, u.language
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
    ORDER BY u.id
  `);

  const withTelegramAll = users.filter(u => u.telegram);
  const withEmail       = users.filter(u => u.email && !u.email.includes('@telegram.pnptv.app'));
  const withTelegramResume = withTelegramAll.slice(TG_SKIP_FIRST);

  console.log(`\n   Total users:                ${users.length}`);
  console.log(`   With Telegram (all):        ${withTelegramAll.length}`);
  console.log(`   With Telegram (resume):     ${withTelegramResume.length}  (skipping first ${TG_SKIP_FIRST})`);
  console.log(`   With real email:            ${withEmail.length}`);

  const stats = { telegram: 0, telegramFailed: 0, email: 0, emailFailed: 0 };

  // ── 1. Telegram DMs (resume) ────────────────────────────────────────────────
  console.log(`\n1/2  Telegram to ${withTelegramResume.length} users (resume from index ${TG_SKIP_FIRST})...`);
  if (SKIP_TELEGRAM) {
    console.log('     [SKIPPED] --skip-telegram');
  } else if (!DRY_RUN) {
    const tg = new Telegram(process.env.BOT_TOKEN);
    for (let i = 0; i < withTelegramResume.length; i++) {
      const u = withTelegramResume[i];
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'there' : 'amigo');
      const msg = TG[lang](name);
      try {
        await tg.sendMessage(u.telegram, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
        stats.telegram++;
      } catch (err) {
        stats.telegramFailed++;
        if (stats.telegramFailed <= 5 || stats.telegramFailed % 100 === 0) {
          console.warn(`     TG err [${u.telegram}]: ${err.message}`);
        }
      }
      await sleep(TG_DELAY_MS);
      if ((i + 1) % 200 === 0) {
        console.log(`     TG progress: ${i + 1}/${withTelegramResume.length}  (absolute ${TG_SKIP_FIRST + i + 1}/${withTelegramAll.length})`);
      }
    }
    console.log(`     ✓ TG: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
  } else {
    console.log(`     [DRY] Would send TG to ${withTelegramResume.length} users`);
  }

  // ── 2. Email ───────────────────────────────────────────────────────────────
  console.log(`\n2/2  Email to ${withEmail.length} users...`);
  if (SKIP_EMAIL) {
    console.log('     [SKIPPED] --skip-email');
  } else if (!DRY_RUN) {
    for (let i = 0; i < withEmail.length; i++) {
      const u = withEmail[i];
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'Member' : 'Miembro');
      try {
        await emailService.sendViaHostingerApi({
          to: u.email,
          subject: EMAIL_SUBJECT[lang],
          html: buildEmailHtml(lang, name),
        });
        stats.email++;
      } catch (err) {
        stats.emailFailed++;
        if (stats.emailFailed <= 5 || stats.emailFailed % 50 === 0) {
          console.warn(`     Email err [${u.email}]: ${err.message}`);
        }
      }
      await sleep(EMAIL_DELAY_MS);
      if ((i + 1) % 50 === 0) console.log(`     Email progress: ${i + 1}/${withEmail.length}`);
    }
    console.log(`     ✓ Email: ${stats.email} sent / ${stats.emailFailed} failed`);
  } else {
    console.log(`     [DRY] Would email ${withEmail.length} users`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` RESUME ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'}`);
  console.log('═══════════════════════════════════════════════════════════');
  if (!DRY_RUN) {
    console.log(` Telegram: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
    console.log(` Email:    ${stats.email} sent / ${stats.emailFailed} failed`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
