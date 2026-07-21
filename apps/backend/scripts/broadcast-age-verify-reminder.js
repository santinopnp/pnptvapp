#!/usr/bin/env node
'use strict';

/**
 * broadcast-age-verify-reminder.js
 *
 * Reminds active users who have NOT completed age verification to do so.
 * Targets: age_verified = false AND last_active > NOW() - INTERVAL '30 days'
 *
 * Channels:
 *   - Email (Hostinger Mail API)  → users with a real email address
 *   - Telegram DM                → users with a telegram ID but no real email
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-age-verify-reminder.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-age-verify-reminder.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-age-verify-reminder.js --skip-email
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-age-verify-reminder.js --skip-telegram
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

const SETTINGS_URL = 'https://pnptv.app/settings/account';
const APP_URL      = 'https://pnptv.app';

// 1 email per 400ms (as requested); Telegram at 80ms
const EMAIL_DELAY_MS = 400;
const TG_DELAY_MS    = 80;

// Support mailbox: support@pnptv.app
const MAILBOX_ID = 'ACbaf8cd14bb90ffd57edf302bc5a7';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Messages ──────────────────────────────────────────────────────────────────

const TG = {
  en: (name) =>
`🔞 <b>Hey ${name} — your age hasn't been verified yet.</b>

PNPtv! is an adult platform. We need you to confirm you're 18 or older to continue accessing content.

<b>It takes less than a minute:</b>
👉 <a href="${SETTINGS_URL}">pnptv.app/settings/account</a>

Scroll to the <b>Age Verification</b> section and tap <b>Verify my age</b>.

If you've already done it, please disregard this message. 🖤`,

  es: (name) =>
`🔞 <b>Hola ${name} — tu edad aún no ha sido verificada.</b>

PNPtv! es una plataforma para adultos. Necesitamos que confirmes que tienes 18 años o más para seguir accediendo al contenido.

<b>Solo toma menos de un minuto:</b>
👉 <a href="${SETTINGS_URL}">pnptv.app/settings/account</a>

Desplázate hasta la sección <b>Verificación de edad</b> y toca <b>Verificar mi edad</b>.

Si ya lo hiciste, ignora este mensaje. 🖤`,
};

const EMAIL_SUBJECT = {
  en: 'Action required — verify your age on PNPtv!',
  es: 'Acción requerida — verifica tu edad en PNPtv!',
};

function buildEmailHtml(lang, name) {
  const en = lang === 'en';
  const greeting = en ? `Hey ${name}!` : `¡Hola ${name}!`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${en ? 'Action required — verify your age' : 'Acción requerida — verifica tu edad'}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0"
             style="max-width:540px;width:100%;background:#121220;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#7B61FF)"></td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:22px;font-weight:900;color:#fff">PNPtv!</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px">

          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">${greeting}</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:900;color:#fff;line-height:1.25">
            🔞 ${en ? 'Your age hasn\'t been verified yet.' : 'Tu edad aún no ha sido verificada.'}
          </h1>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
            <tr><td style="padding:18px 20px;background:rgba(212,0,122,0.07);border:1px solid rgba(212,0,122,0.2);border-radius:12px">
              <p style="margin:0 0 10px;font-size:14px;color:#d1d5db;line-height:1.6">
                ${en
                  ? 'PNPtv! is an adult platform. To continue accessing content — including videos, live streams, and community features — you need to confirm you\'re 18 or older.'
                  : 'PNPtv! es una plataforma para adultos. Para seguir accediendo al contenido — incluyendo videos, transmisiones en vivo y funciones de la comunidad — necesitas confirmar que tienes 18 años o más.'}
              </p>
              <p style="margin:0;font-size:14px;color:#d1d5db;line-height:1.6">
                ${en
                  ? 'It takes less than a minute and you only need to do it once.'
                  : 'Toma menos de un minuto y solo necesitas hacerlo una vez.'}
              </p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="padding:18px 20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#fff">
                ${en ? 'How to verify:' : 'Cómo verificar:'}
              </p>
              <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">
                1. ${en ? 'Go to Account Settings' : 'Ve a Configuración de cuenta'}
              </p>
              <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">
                2. ${en ? 'Scroll to the "Age Verification" section' : 'Desplázate hasta "Verificación de edad"'}
              </p>
              <p style="margin:0;font-size:13px;color:#9ca3af">
                3. ${en ? 'Tap "Verify my age"' : 'Toca "Verificar mi edad"'}
              </p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${SETTINGS_URL}"
                 style="display:inline-block;padding:15px 44px;background:linear-gradient(135deg,#D4007A,#7B61FF);color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:12px">
                ${en ? 'Verify my age →' : 'Verificar mi edad →'}
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.6">
            ${en
              ? 'If you\'ve already verified, you can ignore this message. Questions? Reply to this email.'
              : 'Si ya verificaste, puedes ignorar este mensaje. ¿Preguntas? Responde a este correo.'}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08)">
          <p style="margin:0;font-size:11px;color:#6b7280">
            ${en ? 'You received this as a member of PNPtv!.' : 'Recibiste esto por ser miembro de PNPtv!.'}
            🔒 <a href="${APP_URL}" style="color:#6b7280;text-decoration:none">pnptv.app</a>
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
  console.log(' Age Verification Reminder Broadcast');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent\n');
  if (SKIP_EMAIL)    console.log(' --skip-email\n');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram\n');

  // Query: active users with age_verified = false
  const { rows: users } = await query(`
    SELECT
      u.id,
      u.first_name,
      u.username,
      u.email,
      u.telegram,
      u.language
    FROM users u
    WHERE u.age_verified = false
      AND u.last_active > NOW() - INTERVAL '30 days'
      AND COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
    ORDER BY u.last_active DESC
  `);

  // Split into channels
  const withEmail    = users.filter(u => u.email && !u.email.includes('@telegram.pnptv.app'));
  const telegramOnly = users.filter(u => (!u.email || u.email.includes('@telegram.pnptv.app')) && u.telegram);
  const unreachable  = users.filter(u => (!u.email || u.email.includes('@telegram.pnptv.app')) && !u.telegram);

  console.log(`\n   Active unverified users (30d window): ${users.length}`);
  console.log(`   With real email:                       ${withEmail.length}`);
  console.log(`   Telegram-only (no real email):         ${telegramOnly.length}`);
  console.log(`   Unreachable (no email, no telegram):   ${unreachable.length}`);
  console.log(`   Total contactable:                     ${withEmail.length + telegramOnly.length}`);

  const stats = { email: 0, emailFailed: 0, telegram: 0, telegramFailed: 0 };

  // ── 1. Email ────────────────────────────────────────────────────────────────
  console.log(`\n1/2  Email → ${withEmail.length} users...`);
  if (SKIP_EMAIL) {
    console.log('     [SKIPPED] --skip-email');
  } else if (DRY_RUN) {
    console.log(`     [DRY] Would send ${withEmail.length} emails via Hostinger API (support@pnptv.app)`);
    console.log(`     [DRY] Rate: 1 per ${EMAIL_DELAY_MS}ms`);
    console.log('\n     Sample recipients (first 10):');
    withEmail.slice(0, 10).forEach((u, i) => {
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'Member' : 'Miembro');
      console.log(`       [${i + 1}/${withEmail.length}] ${u.email} — ${name} (${lang})`);
    });
    if (withEmail.length > 10) console.log(`       ... and ${withEmail.length - 10} more`);
  } else {
    for (let i = 0; i < withEmail.length; i++) {
      const u = withEmail[i];
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'Member' : 'Miembro');
      try {
        await emailService.sendViaHostingerApi({
          to: u.email,
          subject: EMAIL_SUBJECT[lang],
          html: buildEmailHtml(lang, name),
          mailboxId: MAILBOX_ID,
        });
        stats.email++;
        console.log(`     [${i + 1}/${withEmail.length}] sent to ${u.email}`);
      } catch (err) {
        stats.emailFailed++;
        console.warn(`     [${i + 1}/${withEmail.length}] FAILED ${u.email}: ${err.message}`);
      }
      await sleep(EMAIL_DELAY_MS);
    }
    console.log(`     Done: ${stats.email} sent / ${stats.emailFailed} failed`);
  }

  // ── 2. Telegram ─────────────────────────────────────────────────────────────
  console.log(`\n2/2  Telegram → ${telegramOnly.length} users...`);
  if (SKIP_TELEGRAM) {
    console.log('     [SKIPPED] --skip-telegram');
  } else if (DRY_RUN) {
    console.log(`     [DRY] Would send ${telegramOnly.length} Telegram DMs`);
    console.log(`     [DRY] Rate: 1 per ${TG_DELAY_MS}ms`);
    console.log('\n     Sample recipients (first 10):');
    telegramOnly.slice(0, 10).forEach((u, i) => {
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'there' : 'amigo');
      console.log(`       [${i + 1}/${telegramOnly.length}] TG:${u.telegram} — ${name} (${lang})`);
    });
    if (telegramOnly.length > 10) console.log(`       ... and ${telegramOnly.length - 10} more`);

    console.log('\n── Sample TG message (ES) ──\n');
    console.log(TG.es('Amigo'));
    console.log('\n── Sample TG message (EN) ──\n');
    console.log(TG.en('Friend'));
  } else {
    const tg = new Telegram(process.env.BOT_TOKEN);
    for (let i = 0; i < telegramOnly.length; i++) {
      const u = telegramOnly[i];
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'there' : 'amigo');
      try {
        await tg.sendMessage(u.telegram, TG[lang](name), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
        stats.telegram++;
        if ((i + 1) % 50 === 0 || stats.telegram <= 5) {
          console.log(`     [${i + 1}/${telegramOnly.length}] sent to TG:${u.telegram}`);
        }
      } catch (err) {
        stats.telegramFailed++;
        if (stats.telegramFailed <= 5 || stats.telegramFailed % 100 === 0) {
          console.warn(`     TG err [${u.telegram}]: ${err.message}`);
        }
      }
      await sleep(TG_DELAY_MS);
      if ((i + 1) % 200 === 0) console.log(`     TG progress: ${i + 1}/${telegramOnly.length}`);
    }
    console.log(`     Done: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  if (DRY_RUN) {
    console.log(' DRY RUN SUMMARY');
    console.log(`  Would email:    ${withEmail.length} users`);
    console.log(`  Would TG DM:    ${telegramOnly.length} users`);
    console.log(`  Unreachable:    ${unreachable.length} users`);
    console.log(`  Total to reach: ${withEmail.length + telegramOnly.length}`);
  } else {
    console.log(' BROADCAST COMPLETE');
    console.log(`  Email:     ${stats.email} sent / ${stats.emailFailed} failed`);
    console.log(`  Telegram:  ${stats.telegram} sent / ${stats.telegramFailed} failed`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
