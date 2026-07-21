#!/usr/bin/env node
'use strict';

/**
 * broadcast-magiclink-passkey-july-2026.js
 *
 * Notifies all users that:
 *  1. Magic-link email login is fixed (was broken due to SMTP auth failure)
 *  2. Passkey (Face ID / fingerprint / PIN) login is now available
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-magiclink-passkey-july-2026.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-magiclink-passkey-july-2026.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-magiclink-passkey-july-2026.js --skip-email
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-magiclink-passkey-july-2026.js --skip-telegram
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }               = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
const emailService            = require(path.join(BACKEND, 'services/emailservice'));
const { Telegram }            = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const FORCE         = process.argv.includes('--force');

const ENTITY_ID = 'magic-link-passkey-fix-2026-07';
const APP_URL   = 'https://pnptv.app';
const TG_DELAY_MS        = 80;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Messages ──────────────────────────────────────────────────────────────────

const NOTIFICATION_MSG = {
  en: `🔐 Sign-in upgrade: email links are fixed + Face ID / fingerprint login is now available!`,
  es: `🔐 Mejora de inicio de sesión: los enlaces por correo están arreglados + ¡ya puedes entrar con Face ID o huella!`,
};

const PUSH = {
  en: { title: '🔐 Sign-in upgraded', body: 'Magic links are fixed. Set up Face ID / fingerprint login now.' },
  es: { title: '🔐 Inicio de sesión mejorado', body: 'Los enlaces mágicos funcionan. Activa Face ID o huella ahora.' },
};

const TG = {
  en: (name) =>
`🔐 <b>Hey ${name} — sign-in just got a big upgrade.</b>

Two things we fixed and added today:

<b>1. Magic link is fixed ✅</b>
Email sign-in was broken for a while. It's fully working again now.

<b>2. Passkey login is here 🆕</b>
You can now sign in with Face ID, fingerprint, or your device PIN — no email, no password, nothing.

<b>How to set up passkey login:</b>
1. Go to <a href="${APP_URL}/login">${APP_URL}/login</a>
2. Tap <b>Email me a sign-in link</b>
3. Click the link from your inbox
4. You'll be asked to save a passkey — tap <b>Yes</b>
5. Done! Next time you'll sign in with one tap.

It's the fastest, most secure way to get in. 🖤

Questions? Just reply here.`,

  es: (name) =>
`🔐 <b>¡Hola ${name}! El inicio de sesión acaba de mejorar.</b>

Dos cosas que arreglamos y añadimos hoy:

<b>1. El enlace mágico está arreglado ✅</b>
El inicio de sesión por correo había dejado de funcionar. Ya está totalmente reparado.

<b>2. Inicio de sesión con huella / Face ID 🆕</b>
Ahora puedes entrar con Face ID, huella digital o el PIN de tu dispositivo — sin correo, sin contraseña.

<b>Cómo activarlo:</b>
1. Ve a <a href="${APP_URL}/login">${APP_URL}/login</a>
2. Toca <b>Envíame un enlace por correo</b>
3. Toca el enlace que llega a tu bandeja
4. Te preguntará si quieres guardar una llave de acceso — toca <b>Sí</b>
5. ¡Listo! La próxima vez entras con un solo toque.

Es la forma más rápida y segura de entrar. 🖤

¿Preguntas? Responde aquí.`,
};

const EMAIL_SUBJECT = {
  en: '🔐 PNPtv! sign-in upgraded — magic link fixed + Face ID login available',
  es: '🔐 PNPtv! mejoró el inicio de sesión — enlace mágico arreglado + Face ID disponible',
};

function buildEmailHtml(lang, name) {
  const en = lang === 'en';
  const greeting = en ? `Hey ${name}!` : `¡Hola ${name}!`;

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
            🔐 ${en ? 'Sign-in just got a big upgrade.' : 'El inicio de sesión mejoró mucho.'}
          </h1>

          <!-- Fix 1: Magic link -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
            <tr><td style="padding:18px 20px;background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.2);border-radius:12px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#4ade80">✅ ${en ? 'Magic link is fixed' : 'Enlace mágico arreglado'}</p>
              <p style="margin:0;font-size:13px;color:#d1d5db;line-height:1.55">
                ${en
                  ? 'Email sign-in was broken for some users. It\'s fully working again — just enter your email on the login page.'
                  : 'El inicio de sesión por correo tenía problemas para algunos usuarios. Ya funciona bien — solo escribe tu correo en la página de inicio de sesión.'}
              </p>
            </td></tr>
          </table>

          <!-- Fix 2: Passkey -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td style="padding:18px 20px;background:rgba(212,0,122,0.07);border:1px solid rgba(212,0,122,0.2);border-radius:12px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#f472b6">🆕 ${en ? 'Face ID / fingerprint login is here' : 'Inicio de sesión con Face ID / huella'}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#d1d5db;line-height:1.55">
                ${en
                  ? 'Sign in with Face ID, fingerprint, or your device PIN. No email, no password, nothing. One tap and you\'re in.'
                  : 'Entra con Face ID, huella digital o el PIN de tu dispositivo. Sin correo, sin contraseña. Un toque y ya estás adentro.'}
              </p>
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#fff">${en ? 'How to set it up:' : 'Cómo activarlo:'}</p>
              <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">1. ${en ? 'Go to pnptv.app/login' : 'Ve a pnptv.app/login'}</p>
              <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">2. ${en ? 'Tap "Email me a sign-in link"' : 'Toca "Envíame un enlace por correo"'}</p>
              <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">3. ${en ? 'Click the link in your inbox' : 'Toca el enlace que llega a tu correo'}</p>
              <p style="margin:0;font-size:12px;color:#9ca3af">4. ${en ? 'Tap "Yes, use Face ID" when prompted' : 'Toca "Sí" cuando te lo pida'}</p>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${APP_URL}/login" style="display:inline-block;padding:15px 44px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:12px">
                ${en ? 'Sign in to PNPtv! →' : 'Entrar a PNPtv! →'}
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.6">
            ${en ? 'Thank you for being part of the community. 🖤' : 'Gracias por ser parte de la comunidad. 🖤'}
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
  console.log(' Magic Link Fix + Passkey Launch Broadcast — July 2026');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent\n');
  if (SKIP_EMAIL)    console.log(' --skip-email\n');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram\n');

  const { rows: users } = await query(`
    SELECT u.id, u.first_name, u.username, u.email, u.telegram, u.language
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
    ORDER BY u.id
  `);

  let alreadySent = new Set();
  if (!FORCE) {
    const { rows: alreadyRows } = await query(`
      SELECT target_user_id FROM notifications
      WHERE entity_id = $1 AND entity_type = 'system' AND actor_id IS NULL
    `, [ENTITY_ID]);
    alreadySent = new Set(alreadyRows.map(r => r.target_user_id));
  }
  const isNew = (u) => !alreadySent.has(u.id);

  const withTelegram = users.filter(u => u.telegram && isNew(u));
  const withEmail    = users.filter(u => u.email && !u.email.includes('@telegram.pnptv.app') && isNew(u));

  console.log(`\n   Total users:      ${users.length}`);
  console.log(`   Already notified: ${alreadySent.size}`);
  console.log(`   New targets:      ${users.length - alreadySent.size}`);
  console.log(`   With Telegram:    ${withTelegram.length}`);
  console.log(`   With real email:  ${withEmail.length}`);

  const stats = { inApp: 0, push: 0, telegram: 0, telegramFailed: 0, email: 0, emailFailed: 0 };

  // 1. In-app bell notification
  console.log('\n1/4  In-app notifications...');
  if (!DRY_RUN) {
    try {
      const enIds = users.filter(u =>  isEn(u.language) && isNew(u)).map(u => u.id);
      const esIds = users.filter(u => !isEn(u.language) && isNew(u)).map(u => u.id);
      for (const [ids, msg] of [[enIds, NOTIFICATION_MSG.en], [esIds, NOTIFICATION_MSG.es]]) {
        if (!ids.length) continue;
        await query(`
          INSERT INTO notifications
            (type, category, priority, actor_id, target_user_id, entity_type, entity_id, message, metadata)
          SELECT 'announcement', 'system', 'normal', NULL,
            t.id, 'system', $2, $3, $4::jsonb
          FROM unnest($1::text[]) AS t(id)
          ON CONFLICT (type, target_user_id, entity_type, entity_id) WHERE actor_id IS NULL
          DO UPDATE SET is_read = FALSE, created_at = NOW(), message = EXCLUDED.message
        `, [ids, ENTITY_ID, msg, JSON.stringify({ url: `${APP_URL}/login` })]);
        stats.inApp += ids.length;
      }
      console.log(`     ✓ ${stats.inApp} inserted/upserted`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would notify ${users.length - alreadySent.size} users`);
  }

  // 2. Web push
  console.log('2/4  Web push...');
  if (!DRY_RUN) {
    try {
      PushNotificationService.initialize();
      const enIds = users.filter(u =>  isEn(u.language) && isNew(u)).map(u => u.id);
      const esIds = users.filter(u => !isEn(u.language) && isNew(u)).map(u => u.id);
      let pushSent = 0;
      if (enIds.length) pushSent += await PushNotificationService.sendToUsers(enIds, { ...PUSH.en, url: `${APP_URL}/login`, tag: ENTITY_ID });
      if (esIds.length) pushSent += await PushNotificationService.sendToUsers(esIds, { ...PUSH.es, url: `${APP_URL}/login`, tag: ENTITY_ID });
      stats.push = pushSent;
      console.log(`     ✓ ${pushSent} push sent`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would push to subscribed users`);
  }

  // 3. Telegram DMs
  console.log(`3/4  Telegram to ${withTelegram.length} users...`);
  if (!DRY_RUN && !SKIP_TELEGRAM) {
    const tg = new Telegram(process.env.BOT_TOKEN);
    for (let i = 0; i < withTelegram.length; i++) {
      const u = withTelegram[i];
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
      if ((i + 1) % 200 === 0) console.log(`     TG progress: ${i + 1}/${withTelegram.length}`);
    }
    console.log(`     ✓ TG: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
  } else if (DRY_RUN) {
    console.log(`     [DRY] Would send to ${withTelegram.length} users`);
    console.log('\n── Sample TG message (ES) ──\n');
    console.log(TG.es('Amigo'));
    console.log('\n── Sample TG message (EN) ──\n');
    console.log(TG.en('Friend'));
  } else {
    console.log('     [SKIPPED] --skip-telegram');
  }

  // 4. Email (via Hostinger Mail API through emailservice — no direct SMTP)
  console.log(`4/4  Email to ${withEmail.length} users...`);
  if (SKIP_EMAIL) {
    console.log('     [SKIPPED] --skip-email');
  } else if (!DRY_RUN) {
    const EMAIL_DELAY_MS = 350; // ~2-3/sec to stay within Hostinger API limits
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
    console.log('\n── Sample email HTML (EN) ──\n');
    console.log(buildEmailHtml('en', 'Member').slice(0, 400) + '...\n');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` BROADCAST ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'}`);
  console.log('═══════════════════════════════════════════════════════════');
  if (!DRY_RUN) {
    console.log(` In-app:   ${stats.inApp}`);
    console.log(` Push:     ${stats.push}`);
    console.log(` Telegram: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
    console.log(` Email:    ${stats.email} sent / ${stats.emailFailed} failed`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
