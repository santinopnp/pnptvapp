#!/usr/bin/env node
'use strict';

/**
 * broadcast-rush-launch-2026-08-09.js
 *
 * Ru$h Wallet launch broadcast — Stage 1 (Marketing video).
 * Announces Ru$h 💎 + 20% off yearly / lifetime PRIME (RUSHLAUNCH20Y / RUSHLAUNCH20L).
 *
 * Channels: in-app bell + web push + Telegram DM (native video) + email (Hostinger SMTP).
 * Feed post: optional (--skip-feed default OFF).
 *
 * Creators ARE included in the audience per feedback_creator_ops_via_slack.md
 * (creators = regular members for marketing/promo).
 *
 * Idempotency: notifications.entity_id dedup + per-channel log files.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --only-users=<id1>,<id2>   # test send
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js                             # full send
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --skip-email
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --skip-push
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --skip-inapp
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --skip-feed
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08-09.js --force                     # ignore prior-run dedup
 */

const path  = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }                = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService  = require(path.join(BACKEND, 'services/pushNotificationService'));
const emailService             = require(path.join(BACKEND, 'services/emailservice'));
const SocialPostService        = require(path.join(BACKEND, 'services/socialPostService'));
const { Telegram }             = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_INAPP    = process.argv.includes('--skip-inapp');
const SKIP_FEED     = process.argv.includes('--skip-feed');
const FORCE         = process.argv.includes('--force');
const ONLY_ARG      = process.argv.find(a => a.startsWith('--only-users='));
const ONLY_USERS    = ONLY_ARG ? new Set(ONLY_ARG.split('=')[1].split(',').map(s => s.trim()).filter(Boolean)) : null;

const ENTITY_ID           = 'rush-launch-2026-08-09';
const APP_URL             = 'https://pnptv.app';
const RUSH_URL            = `${APP_URL}/subscribe`;   // no /rush route exists — /subscribe is where the promo lands
const SUBSCRIBE_URL       = `${APP_URL}/subscribe`;
const SUBSCRIBE_YEARLY    = `${APP_URL}/subscribe?promo=RUSHLAUNCH20Y`;
const SUBSCRIBE_LIFETIME  = `${APP_URL}/subscribe?promo=RUSHLAUNCH20L`;
const TG_VIDEO_URL        = `${APP_URL}/rush-wallet/marketing-vertical.mp4`;
const FEED_VIDEO_URL      = TG_VIDEO_URL;
const SYSTEM_USER_ID      = '8552451957';   // synthetic PNPtv! poster (matches precedent)
const TG_DELAY_MS         = 80;
const EMAIL_DELAY_MS      = 350;

const LOG_DIR         = path.join(BACKEND, '../../logs');
const TG_SENT_FILE    = path.join(LOG_DIR, `${ENTITY_ID}-tg-sent.log`);
const EMAIL_SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-email-sent.log`);
const FEED_DONE_FILE  = path.join(LOG_DIR, `${ENTITY_ID}-feed-done.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function loadSentSet(file) {
  try { return new Set(fsSync.readFileSync(file, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
}
function markSent(file, id) { try { fsSync.appendFileSync(file, `${id}\n`); } catch {} }

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const file = fsSync.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`download failed: HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => { fsSync.unlink(destPath, () => {}); reject(err); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Messages ──────────────────────────────────────────────────────────────────

const NOTIFICATION_MSG = {
  en: `💎 Ru$h Wallet is here — plus 20% OFF yearly & lifetime PRIME. Tap to see how it works →`,
  es: `💎 Ya llegó Ru$h Wallet — y 20% DE DESCUENTO en PRIME anual y lifetime. Toca para ver cómo funciona →`,
};

const PUSH = {
  en: { title: '💎 Ru$h Wallet is here', body: '20% off yearly & lifetime PRIME with RUSHLAUNCH20Y / RUSHLAUNCH20L — through Aug 23.' },
  es: { title: '💎 Ya llegó Ru$h Wallet', body: '20% off PRIME anual y lifetime con RUSHLAUNCH20Y / RUSHLAUNCH20L — hasta el 23 de agosto.' },
};

const TG_CAPTION = {
  en: `💎 <b>Meet Ru$h Wallet — the new way to run your account on PNPtv!</b>

Tip creators. Unlock content. Book private calls. All with Ru$h 💎.

To celebrate the launch — <b>20% OFF yearly & lifetime PRIME</b>:
• <code>RUSHLAUNCH20Y</code> → yearly PRIME ($99.99 → $79.99)
• <code>RUSHLAUNCH20L</code> → lifetime PRIME ($250 → $200)

Good through <b>Aug 23</b>.`,

  es: `💎 <b>Te presentamos Ru$h Wallet — la nueva forma de mover tu cuenta en PNPtv!</b>

Da propinas. Desbloquea contenido. Agenda llamadas privadas. Todo con Ru$h 💎.

Para celebrar el lanzamiento — <b>20% DE DESCUENTO en PRIME anual y lifetime</b>:
• <code>RUSHLAUNCH20Y</code> → PRIME anual ($99.99 → $79.99)
• <code>RUSHLAUNCH20L</code> → PRIME lifetime ($250 → $200)

Válido hasta el <b>23 de agosto</b>.`,
};

const TG_BUTTONS = {
  en: {
    inline_keyboard: [
      [{ text: '💳 Yearly PRIME → $79.99', url: SUBSCRIBE_YEARLY }],
      [{ text: '💎 Lifetime PRIME → $200', url: SUBSCRIBE_LIFETIME }],
      [{ text: '🔎 See all plans', url: RUSH_URL }],
    ],
  },
  es: {
    inline_keyboard: [
      [{ text: '💳 PRIME anual → $79.99', url: SUBSCRIBE_YEARLY }],
      [{ text: '💎 PRIME lifetime → $200', url: SUBSCRIBE_LIFETIME }],
      [{ text: '🔎 Ver todos los planes', url: RUSH_URL }],
    ],
  },
};

const EMAIL_SUBJECT = {
  en: '💎 Ru$h Wallet is here — 20% off yearly & lifetime PRIME',
  es: '💎 Ya llegó Ru$h Wallet — 20% off PRIME anual y lifetime',
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
          <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#fff;line-height:1.25">
            💎 ${en ? 'Ru$h Wallet is here' : 'Ya llegó Ru$h Wallet'}
          </h1>

          <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6">
            ${en
              ? 'The new way to run your account on PNPtv!. Tip creators, unlock content, book private calls — all with Ru$h 💎.'
              : 'La nueva forma de mover tu cuenta en PNPtv!. Da propinas, desbloquea contenido, agenda llamadas privadas — todo con Ru$h 💎.'}
          </p>

          <!-- Video CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center" style="padding:20px;background:rgba(212,0,122,0.07);border:1px solid rgba(212,0,122,0.2);border-radius:12px">
              <p style="margin:0 0 14px;font-size:13px;color:#d1d5db;line-height:1.55">
                ${en ? 'Watch the 60-second overview:' : 'Mira el resumen de 60 segundos:'}
              </p>
              <a href="${TG_VIDEO_URL}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:10px">
                ▶ ${en ? 'Watch the video' : 'Ver el video'}
              </a>
            </td></tr>
          </table>

          <!-- Promo block -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
            <tr><td style="padding:18px;background:rgba(230,145,56,0.08);border:1px solid rgba(230,145,56,0.25);border-radius:12px">
              <p style="margin:0 0 10px;font-size:14px;font-weight:800;color:#fff">
                ${en ? '🎉 Launch offer — 20% OFF' : '🎉 Oferta de lanzamiento — 20% OFF'}
              </p>
              <p style="margin:0 0 6px;font-size:13px;color:#d1d5db">
                <b>RUSHLAUNCH20Y</b> → ${en ? 'yearly PRIME' : 'PRIME anual'} — <s>$99.99</s> <b style="color:#fff">$79.99</b>
              </p>
              <p style="margin:0 0 10px;font-size:13px;color:#d1d5db">
                <b>RUSHLAUNCH20L</b> → ${en ? 'lifetime PRIME' : 'PRIME lifetime'} — <s>$250</s> <b style="color:#fff">$200</b>
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af">
                ${en ? 'Good through Aug 23. Apply at checkout.' : 'Válido hasta el 23 de agosto. Se aplica al pagar.'}
              </p>
            </td></tr>
          </table>

          <!-- CTA buttons -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
            <tr>
              <td align="center" style="padding:4px">
                <a href="${SUBSCRIBE_YEARLY}" style="display:block;padding:13px 10px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:10px">
                  💳 ${en ? 'Yearly $79.99' : 'Anual $79.99'}
                </a>
              </td>
              <td align="center" style="padding:4px">
                <a href="${SUBSCRIBE_LIFETIME}" style="display:block;padding:13px 10px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:10px">
                  💎 ${en ? 'Lifetime $200' : 'Lifetime $200'}
                </a>
              </td>
              <td align="center" style="padding:4px">
                <a href="${RUSH_URL}" style="display:block;padding:13px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px">
                  🔎 ${en ? 'All plans' : 'Todos los planes'}
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center">
            ${en
              ? 'Ru$h 💎 — the internal currency built for our community. Fast, private, ours.'
              : 'Ru$h 💎 — la moneda interna hecha para nuestra comunidad. Rápida, privada, nuestra.'}
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

const FEED_CONTENT = `💎 Ru$h Wallet is here — the new way to run your account on PNPtv!.

Tip creators. Unlock content. Book private calls. All with Ru$h 💎.

🎉 Launch offer — 20% OFF yearly & lifetime PRIME:
• RUSHLAUNCH20Y → yearly ($99.99 → $79.99)
• RUSHLAUNCH20L → lifetime ($250 → $200)

Good through Aug 23.

👉 pnptv.app/subscribe

—

💎 Ya llegó Ru$h Wallet — la nueva forma de mover tu cuenta en PNPtv!.

Da propinas. Desbloquea contenido. Agenda llamadas privadas. Todo con Ru$h 💎.

🎉 Oferta de lanzamiento — 20% OFF PRIME anual y lifetime:
• RUSHLAUNCH20Y → anual ($99.99 → $79.99)
• RUSHLAUNCH20L → lifetime ($250 → $200)

Válido hasta el 23 de agosto.

👉 pnptv.app/subscribe`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Ru$h Wallet Launch Broadcast — Stage 1 (Marketing)');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent');
  if (ONLY_USERS)    console.log(` MODE: ONLY-USERS = [${[...ONLY_USERS].join(', ')}]`);
  if (SKIP_INAPP)    console.log(' --skip-inapp');
  if (SKIP_PUSH)     console.log(' --skip-push');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram');
  if (SKIP_EMAIL)    console.log(' --skip-email');
  if (SKIP_FEED)     console.log(' --skip-feed');
  if (FORCE)         console.log(' --force (ignore prior-run dedup)');
  console.log('');

  // Audience: all age-verified, non-deleted, non-banned users.
  // Creators INCLUDED per feedback_creator_ops_via_slack.md (marketing = members).
  const { rows: users } = await query(`
    SELECT u.id, u.first_name, u.username, u.email, u.telegram, u.language
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
      AND u.age_verified = true
    ORDER BY u.id
  `);

  const inScope = ONLY_USERS ? users.filter(u => ONLY_USERS.has(String(u.id))) : users;

  let alreadySent = new Set();
  if (!FORCE) {
    const { rows: alreadyRows } = await query(`
      SELECT target_user_id FROM notifications
      WHERE entity_id = $1 AND entity_type = 'system' AND actor_id IS NULL
    `, [ENTITY_ID]);
    alreadySent = new Set(alreadyRows.map(r => r.target_user_id));
  }
  const isNew = (u) => !alreadySent.has(u.id);

  const tgAlreadySent    = loadSentSet(TG_SENT_FILE);
  const emailAlreadySent = loadSentSet(EMAIL_SENT_FILE);

  const withTelegram = inScope.filter(u => u.telegram && isNew(u) && !tgAlreadySent.has(u.id));
  const withEmail    = inScope.filter(u => u.email && !u.email.includes('@telegram.pnptv.app') && isNew(u) && !emailAlreadySent.has(u.id));

  console.log(`   Total age-verified users: ${users.length}`);
  console.log(`   In scope:                 ${inScope.length}`);
  console.log(`   Already notified:         ${alreadySent.size}`);
  console.log(`   TG already sent:          ${tgAlreadySent.size}`);
  console.log(`   Email already sent:       ${emailAlreadySent.size}`);
  console.log(`   With Telegram:            ${withTelegram.length}`);
  console.log(`   With real email:          ${withEmail.length}`);

  const stats = { inApp: 0, push: 0, telegram: 0, telegramFailed: 0, email: 0, emailFailed: 0, feed: false };

  // 1. In-app bell notification
  console.log('\n1/5  In-app notifications...');
  if (SKIP_INAPP) {
    console.log('     [SKIPPED] --skip-inapp');
  } else if (!DRY_RUN) {
    try {
      const enIds = inScope.filter(u =>  isEn(u.language) && isNew(u)).map(u => u.id);
      const esIds = inScope.filter(u => !isEn(u.language) && isNew(u)).map(u => u.id);
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
        `, [ids, ENTITY_ID, msg, JSON.stringify({ url: RUSH_URL })]);
        stats.inApp += ids.length;
      }
      console.log(`     ✓ ${stats.inApp} inserted/upserted`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would notify ${inScope.length - alreadySent.size} users`);
  }

  // 2. Web push
  console.log('2/5  Web push...');
  if (SKIP_PUSH) {
    console.log('     [SKIPPED] --skip-push');
  } else if (!DRY_RUN) {
    try {
      PushNotificationService.initialize();
      const enIds = inScope.filter(u =>  isEn(u.language) && isNew(u)).map(u => u.id);
      const esIds = inScope.filter(u => !isEn(u.language) && isNew(u)).map(u => u.id);
      let pushSent = 0;
      if (enIds.length) pushSent += await PushNotificationService.sendToUsers(enIds, { ...PUSH.en, url: SUBSCRIBE_URL, tag: ENTITY_ID });
      if (esIds.length) pushSent += await PushNotificationService.sendToUsers(esIds, { ...PUSH.es, url: SUBSCRIBE_URL, tag: ENTITY_ID });
      stats.push = pushSent;
      console.log(`     ✓ ${pushSent} push sent`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would push to subscribed users`);
  }

  // 3. Telegram DMs (video + inline buttons)
  console.log(`3/5  Telegram to ${withTelegram.length} users...`);
  if (SKIP_TELEGRAM) {
    console.log('     [SKIPPED] --skip-telegram');
  } else if (!DRY_RUN) {
    const tg = new Telegram(process.env.BOT_TOKEN);
    const LOCAL_VIDEO_PATH = process.env.TG_RUSH_VIDEO_PATH || '/tmp/tg-rush-marketing.mp4';
    if (!fsSync.existsSync(LOCAL_VIDEO_PATH)) {
      try {
        await downloadFile(TG_VIDEO_URL, LOCAL_VIDEO_PATH);
        console.log(`     Downloaded promo video to ${LOCAL_VIDEO_PATH}`);
      } catch (err) {
        console.warn(`     Could not download video locally (${err.message}), falling back to URL sends`);
      }
    }
    let videoRef = TG_VIDEO_URL;
    let primedUserId = null;
    if (fsSync.existsSync(LOCAL_VIDEO_PATH)) {
      for (let p = 0; p < Math.min(5, withTelegram.length) && videoRef === TG_VIDEO_URL; p++) {
        const candidate = withTelegram[p];
        const lang = isEn(candidate.language) ? 'en' : 'es';
        try {
          const primed = await tg.sendVideo(candidate.telegram, { source: fsSync.createReadStream(LOCAL_VIDEO_PATH) }, {
            caption: TG_CAPTION[lang],
            parse_mode: 'HTML',
            reply_markup: TG_BUTTONS[lang],
            supports_streaming: true,
          });
          const fileId = primed?.video?.file_id;
          if (fileId) {
            videoRef = fileId;
            primedUserId = candidate.id;
            stats.telegram++;
            markSent(TG_SENT_FILE, candidate.id);
            console.log(`     Primed file_id via local upload (uid=${candidate.id}): ${fileId}`);
          }
        } catch (err) {
          console.warn(`     Priming attempt failed (uid=${candidate.id}): ${err.message}`);
        }
      }
    } else {
      console.warn(`     Local video not found at ${LOCAL_VIDEO_PATH}, falling back to URL sends`);
    }
    if (videoRef === TG_VIDEO_URL) {
      console.warn('     Priming exhausted, falling back to per-user URL sends');
    }

    for (let i = 0; i < withTelegram.length; i++) {
      const u = withTelegram[i];
      if (primedUserId && u.id === primedUserId) continue;
      const lang = isEn(u.language) ? 'en' : 'es';
      try {
        await tg.sendVideo(u.telegram, videoRef, {
          caption: TG_CAPTION[lang],
          parse_mode: 'HTML',
          reply_markup: TG_BUTTONS[lang],
          supports_streaming: true,
        });
        stats.telegram++;
        markSent(TG_SENT_FILE, u.id);
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
  } else {
    console.log(`     [DRY] Would send video to ${withTelegram.length} users`);
    console.log(`     Video URL: ${TG_VIDEO_URL}`);
    console.log('\n── Sample TG caption (EN) ──\n');
    console.log(TG_CAPTION.en);
    console.log('\n── Sample TG caption (ES) ──\n');
    console.log(TG_CAPTION.es);
    console.log('\n── Buttons (EN) ──\n', JSON.stringify(TG_BUTTONS.en, null, 2));
  }

  // 4. Email
  console.log(`4/5  Email to ${withEmail.length} users...`);
  if (SKIP_EMAIL) {
    console.log('     [SKIPPED] --skip-email');
  } else if (!DRY_RUN) {
    for (let i = 0; i < withEmail.length; i++) {
      const u = withEmail[i];
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'Member' : 'Miembro');
      try {
        await emailService.send({
          to: u.email,
          subject: EMAIL_SUBJECT[lang],
          html: buildEmailHtml(lang, name),
        });
        stats.email++;
        markSent(EMAIL_SENT_FILE, u.id);
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
    console.log('\n── Sample email HTML (EN, first 400 chars) ──\n');
    console.log(buildEmailHtml('en', 'Member').slice(0, 400) + '...\n');
  }

  // 5. In-app feed post
  console.log('5/5  In-app feed post...');
  if (SKIP_FEED) {
    console.log('     [SKIPPED] --skip-feed');
  } else if (fsSync.existsSync(FEED_DONE_FILE)) {
    console.log('     [SKIPPED] already posted in a previous run of this broadcast');
  } else if (!DRY_RUN) {
    try {
      const post = await SocialPostService.createPost(
        SYSTEM_USER_ID,
        FEED_CONTENT,
        FEED_VIDEO_URL,
        'video',
        null, null, false, false, true,
        null,
        'Ru$h Wallet is here — 20% off yearly & lifetime PRIME',
        'Ru$h 💎 launch + 20% off with RUSHLAUNCH20Y / RUSHLAUNCH20L (through Aug 23).',
        null, null, 'community'
      );
      stats.feed = true;
      markSent(FEED_DONE_FILE, post.id);
      console.log(`     ✓ Feed post created, id=${post.id}`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would create feed post as user ${SYSTEM_USER_ID}`);
    console.log(`     Video URL: ${FEED_VIDEO_URL}`);
    console.log('\n── Sample feed content ──\n');
    console.log(FEED_CONTENT);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` BROADCAST ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'}`);
  console.log('═══════════════════════════════════════════════════════════');
  if (!DRY_RUN) {
    console.log(` In-app:   ${stats.inApp}`);
    console.log(` Push:     ${stats.push}`);
    console.log(` Telegram: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
    console.log(` Email:    ${stats.email} sent / ${stats.emailFailed} failed`);
    console.log(` Feed:     ${stats.feed ? 'posted' : 'not posted'}`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
