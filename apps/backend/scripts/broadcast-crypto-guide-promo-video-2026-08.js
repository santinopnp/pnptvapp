#!/usr/bin/env node
'use strict';

/**
 * broadcast-crypto-guide-promo-video-2026-08.js
 *
 * Promotes the Crypto 101 guide with the new promo videos at
 * /crypto-guide/promocionales/. Sends to every user via:
 *   1. In-app bell notification (deep-linked to /crypto-guide)
 *   2. Web push
 *   3. Telegram DM with video + inline buttons (Crypto Guide / Subscribe / Models)
 *   4. Email via emailService.sendViaHostingerApi (banner + 3 CTA buttons)
 *   5. A post in the in-app social feed (square video, PNPtv! official account)
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js --skip-email
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js --skip-push
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js --skip-inapp
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-promo-video-2026-08.js --skip-feed
 */

const path = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }                = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService   = require(path.join(BACKEND, 'services/pushNotificationService'));
const emailService              = require(path.join(BACKEND, 'services/emailservice'));
const SocialPostService         = require(path.join(BACKEND, 'services/socialPostService'));
const { Telegram }              = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_INAPP    = process.argv.includes('--skip-inapp');
const SKIP_FEED     = process.argv.includes('--skip-feed');
const FORCE         = process.argv.includes('--force');

const ENTITY_ID       = 'crypto-guide-promo-video-2026-08';
const APP_URL         = 'https://pnptv.app';
const GUIDE_URL       = `${APP_URL}/crypto-guide`;
const SUBSCRIBE_URL   = `${APP_URL}/subscribe`;
const MODELS_URL      = `${APP_URL}/models`;
const TG_VIDEO_URL    = `${APP_URL}/crypto-guide/promocionales/${encodeURIComponent('Promo Video Cripto (1).mp4')}`;
const FEED_VIDEO_URL  = `${APP_URL}/crypto-guide/promocionales/${encodeURIComponent('Promo Video Cripto - Cuadrado -Feed-.mp4')}`;
const SYSTEM_USER_ID  = '8552451957'; // synthetic "PNPtv!" official poster account
const TG_DELAY_MS     = 80;

// Delivery-tracking log files — under /app/logs, which is a host bind mount
// (see docker-compose.yml), so state survives a container restart/redeploy
// mid-broadcast. Without this, a re-run after a crash would re-send the
// Telegram video / email to everyone already reached in the interrupted run.
const LOG_DIR       = path.join(BACKEND, '../../logs');
const TG_SENT_FILE   = path.join(LOG_DIR, 'crypto-guide-promo-2026-08-tg-sent.log');
const EMAIL_SENT_FILE = path.join(LOG_DIR, 'crypto-guide-promo-2026-08-email-sent.log');
const FEED_DONE_FILE  = path.join(LOG_DIR, 'crypto-guide-promo-2026-08-feed-done.log');

function loadSentSet(file) {
  try {
    return new Set(fsSync.readFileSync(file, 'utf8').split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}
function markSent(file, id) {
  try { fsSync.appendFileSync(file, `${id}\n`); } catch {}
}

// The pnptv-bot container has no direct filesystem access to apps/web/public
// (separate image/build) — download the promo video via plain HTTPS (our own
// fetch, not Telegram's) so priming has a local file to upload from. Cheap to
// redo if /tmp got wiped by a restart mid-broadcast.
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const file = fsSync.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`download failed: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fsSync.unlink(destPath, () => {});
      reject(err);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Messages ──────────────────────────────────────────────────────────────────

const NOTIFICATION_MSG = {
  en: `💸 New: watch the Crypto 101 video — buy & pay with crypto in under 5 minutes.`,
  es: `💸 Nuevo: mira el video Cripto 101 — compra y paga con cripto en menos de 5 minutos.`,
};

const PUSH = {
  en: { title: '💸 New: Crypto 101 video', body: 'Watch how to buy and pay with crypto in under 5 minutes. No jargon.' },
  es: { title: '💸 Nuevo: video Cripto 101', body: 'Mira cómo comprar y pagar con cripto en menos de 5 minutos. Sin tecnicismos.' },
};

const TG_CAPTION = {
  en: `💸 <b>New: Crypto 101 in under 5 minutes</b>

Never bought crypto before? Watch this 👆

Wallet → buy the coin → pay. No bank, no censorship, no one freezing our community.

BTC, ETH, USDC, Dash + 100 more accepted.`,

  es: `💸 <b>Nuevo: Cripto 101 en menos de 5 minutos</b>

¿Nunca has comprado cripto? Mira esto 👆

Wallet → comprar la moneda → pagar. Sin banco, sin censura, sin nadie congelando a la comunidad.

BTC, ETH, USDC, Dash + 100 monedas más.`,
};

const TG_BUTTONS = {
  en: {
    inline_keyboard: [
      [{ text: '🪙 Crypto Guide', url: GUIDE_URL }],
      [{ text: '💳 Subscribe', url: SUBSCRIBE_URL }, { text: '🔥 Models', url: MODELS_URL }],
    ],
  },
  es: {
    inline_keyboard: [
      [{ text: '🪙 Guía Cripto', url: GUIDE_URL }],
      [{ text: '💳 Suscribirme', url: SUBSCRIBE_URL }, { text: '🔥 Modelos', url: MODELS_URL }],
    ],
  },
};

const EMAIL_SUBJECT = {
  en: 'New: watch the Crypto 101 video (under 5 minutes)',
  es: 'Nuevo: mira el video Cripto 101 (menos de 5 minutos)',
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
            💸 ${en ? 'Watch: Crypto 101 in under 5 minutes' : 'Mira: Cripto 101 en menos de 5 minutos'}
          </h1>

          <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6">
            ${en
              ? "Never bought crypto before? We made a quick video so you don't have to guess."
              : '¿Nunca has comprado cripto? Hicimos un video rápido para que no tengas que adivinar.'}
          </p>

          <!-- Video CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center" style="padding:20px;background:rgba(212,0,122,0.07);border:1px solid rgba(212,0,122,0.2);border-radius:12px">
              <p style="margin:0 0 14px;font-size:13px;color:#d1d5db;line-height:1.55">
                ${en
                  ? 'Wallet → buy the coin → pay. No jargon, under 5 minutes.'
                  : 'Wallet → comprar la moneda → pagar. Sin tecnicismos, menos de 5 minutos.'}
              </p>
              <a href="${TG_VIDEO_URL}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:10px">
                ▶ ${en ? 'Watch the video' : 'Ver el video'}
              </a>
            </td></tr>
          </table>

          <!-- CTA buttons -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
            <tr>
              <td align="center" style="padding:4px">
                <a href="${GUIDE_URL}" style="display:block;padding:13px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px">
                  🪙 ${en ? 'Crypto Guide' : 'Guía Cripto'}
                </a>
              </td>
              <td align="center" style="padding:4px">
                <a href="${SUBSCRIBE_URL}" style="display:block;padding:13px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px">
                  💳 ${en ? 'Subscribe' : 'Suscribirme'}
                </a>
              </td>
              <td align="center" style="padding:4px">
                <a href="${MODELS_URL}" style="display:block;padding:13px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px">
                  🔥 ${en ? 'Models' : 'Modelos'}
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center">
            ${en
              ? 'No bank can freeze our community. No processor can censor what PNP means. Privacy, freedom, control.'
              : 'Ningún banco puede congelar a nuestra comunidad. Ningún procesador puede censurar lo que significa PNP. Privacidad, libertad, control.'}
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

const FEED_CONTENT = `💸 New: Crypto 101 — buy & pay with crypto in under 5 minutes, no jargon.

Wallet → buy the coin → pay. No bank, no censorship, no one freezing our community. BTC, ETH, USDC, Dash + 100 more.

👉 pnptv.app/crypto-guide · pnptv.app/subscribe · pnptv.app/models

—

💸 Nuevo: Cripto 101 — compra y paga con cripto en menos de 5 minutos, sin tecnicismos.

Wallet → comprar la moneda → pagar. Sin banco, sin censura, sin nadie congelando a la comunidad. BTC, ETH, USDC, Dash + 100 monedas más.

👉 pnptv.app/crypto-guide · pnptv.app/subscribe · pnptv.app/models`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Crypto Guide Promo Video Broadcast — 2026-08');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent\n');
  if (SKIP_INAPP)    console.log(' --skip-inapp\n');
  if (SKIP_PUSH)     console.log(' --skip-push\n');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram\n');
  if (SKIP_EMAIL)    console.log(' --skip-email\n');
  if (SKIP_FEED)     console.log(' --skip-feed\n');

  const { rows: users } = await query(`
    SELECT u.id, u.first_name, u.username, u.email, u.telegram, u.language
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
    ORDER BY u.id
  `);

  // Independent entity_id from the 2026-07-22 text-only announcement — this is
  // new video content, so it goes out to everyone again regardless of who
  // already saw the previous broadcast.
  let alreadySent = new Set();
  if (!FORCE) {
    const { rows: alreadyRows } = await query(`
      SELECT target_user_id FROM notifications
      WHERE entity_id = $1 AND entity_type = 'system' AND actor_id IS NULL
    `, [ENTITY_ID]);
    alreadySent = new Set(alreadyRows.map(r => r.target_user_id));
  }
  const isNew = (u) => !alreadySent.has(u.id);

  // Crash/redeploy-recovery dedup — separate from the in-app "alreadySent"
  // gate above (which --force bypasses on purpose). These sets are always
  // honored, --force or not, so a re-run after an interrupted broadcast never
  // double-sends the Telegram video or the email to someone already reached.
  const tgAlreadySent    = loadSentSet(TG_SENT_FILE);
  const emailAlreadySent = loadSentSet(EMAIL_SENT_FILE);

  const withTelegram = users.filter(u => u.telegram && isNew(u) && !tgAlreadySent.has(u.id));
  const withEmail    = users.filter(u => u.email && !u.email.includes('@telegram.pnptv.app') && isNew(u) && !emailAlreadySent.has(u.id));

  console.log(`\n   Total users:      ${users.length}`);
  console.log(`   Already notified: ${alreadySent.size}`);
  console.log(`   New targets:      ${users.length - alreadySent.size}`);
  console.log(`   TG already sent (this broadcast): ${tgAlreadySent.size}`);
  console.log(`   Email already sent (this broadcast): ${emailAlreadySent.size}`);
  console.log(`   With Telegram:    ${withTelegram.length}`);
  console.log(`   With real email:  ${withEmail.length}`);

  const stats = { inApp: 0, push: 0, telegram: 0, telegramFailed: 0, email: 0, emailFailed: 0, feed: false };

  // 1. In-app bell notification
  console.log('\n1/5  In-app notifications...');
  if (SKIP_INAPP) {
    console.log('     [SKIPPED] --skip-inapp');
  } else if (!DRY_RUN) {
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
        `, [ids, ENTITY_ID, msg, JSON.stringify({ url: GUIDE_URL })]);
        stats.inApp += ids.length;
      }
      console.log(`     ✓ ${stats.inApp} inserted/upserted`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would notify ${users.length - alreadySent.size} users`);
  }

  // 2. Web push
  console.log('2/5  Web push...');
  if (SKIP_PUSH) {
    console.log('     [SKIPPED] --skip-push');
  } else if (!DRY_RUN) {
    try {
      PushNotificationService.initialize();
      const enIds = users.filter(u =>  isEn(u.language) && isNew(u)).map(u => u.id);
      const esIds = users.filter(u => !isEn(u.language) && isNew(u)).map(u => u.id);
      let pushSent = 0;
      if (enIds.length) pushSent += await PushNotificationService.sendToUsers(enIds, { ...PUSH.en, url: GUIDE_URL, tag: ENTITY_ID });
      if (esIds.length) pushSent += await PushNotificationService.sendToUsers(esIds, { ...PUSH.es, url: GUIDE_URL, tag: ENTITY_ID });
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

    // Telegram's sendVideo-by-URL re-fetches the URL fresh on every call, and
    // for this file it was failing intermittently even on the very first
    // attempt ("wrong type of the web page content") — not a rate-limit
    // symptom, something about fetching this URL confuses Telegram's side.
    // Upload the file directly from local disk instead (multipart, no fetch
    // involved), grab the file_id from the response, then reuse that file_id
    // for every subsequent send — fast and fully sidesteps the URL path.
    const fs = require('fs');
    const LOCAL_VIDEO_PATH = process.env.TG_PROMO_VIDEO_PATH || '/tmp/tg-promo.mp4';
    if (!fs.existsSync(LOCAL_VIDEO_PATH)) {
      try {
        await downloadFile(TG_VIDEO_URL, LOCAL_VIDEO_PATH);
        console.log(`     Downloaded promo video to ${LOCAL_VIDEO_PATH}`);
      } catch (err) {
        console.warn(`     Could not download video locally (${err.message}), falling back to per-user URL sends`);
      }
    }
    let videoRef = TG_VIDEO_URL;
    let primedUserId = null;
    if (fs.existsSync(LOCAL_VIDEO_PATH)) {
      for (let p = 0; p < Math.min(5, withTelegram.length) && videoRef === TG_VIDEO_URL; p++) {
        const candidate = withTelegram[p];
        const lang = isEn(candidate.language) ? 'en' : 'es';
        try {
          const primed = await tg.sendVideo(candidate.telegram, { source: fs.createReadStream(LOCAL_VIDEO_PATH) }, {
            caption: TG_CAPTION[lang],
            parse_mode: 'HTML',
            reply_markup: TG_BUTTONS[lang],
            supports_streaming: true,
          });
          const fileId = primed?.video?.file_id;
          if (fileId) {
            videoRef = fileId;
            primedUserId = candidate.id;
            stats.telegram++; // this recipient is already done
            markSent(TG_SENT_FILE, candidate.id);
            console.log(`     Primed file_id via local upload (uid=${candidate.id}): ${fileId}`);
          }
        } catch (err) {
          console.warn(`     Priming attempt failed (uid=${candidate.id}): ${err.message}`);
        }
      }
    } else {
      console.warn(`     Local video not found at ${LOCAL_VIDEO_PATH}, falling back to per-user URL sends`);
    }
    if (videoRef === TG_VIDEO_URL) {
      console.warn('     Priming exhausted all candidates, falling back to per-user URL sends');
    }

    for (let i = 0; i < withTelegram.length; i++) {
      const u = withTelegram[i];
      if (primedUserId && u.id === primedUserId) continue; // already sent during priming
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
    console.log('\n── Sample TG caption (ES) ──\n');
    console.log(TG_CAPTION.es);
    console.log('\n── Sample TG caption (EN) ──\n');
    console.log(TG_CAPTION.en);
    console.log('\n── Buttons (EN) ──\n', JSON.stringify(TG_BUTTONS.en, null, 2));
  }

  // 4. Email
  console.log(`4/5  Email to ${withEmail.length} users...`);
  if (SKIP_EMAIL) {
    console.log('     [SKIPPED] --skip-email');
  } else if (!DRY_RUN) {
    const EMAIL_DELAY_MS = 350;
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
        'Crypto 101: Buy & Pay With Crypto',
        'Wallet → buy the coin → pay. Under 5 minutes, no jargon.',
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
