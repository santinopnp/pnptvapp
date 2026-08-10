#!/usr/bin/env node
'use strict';

/**
 * broadcast-rush-launch-stage2-tutorial-2026-08-12.js
 *
 * Ru$h Wallet launch — Stage 2 (Tutorial video).
 * Friendly-teacher tone. Walks users through the 3 core things Ru$h unlocks.
 *
 * Channels:
 *   - In-app bell notification
 *   - Web push
 *   - Telegram DM (native video + inline buttons)
 *   - X post (single platform-wide post from @PNPTelevision — EN + ES as 2 separate posts)
 *   - In-app social feed post
 *
 * SKIPPED intentionally:
 *   - Email — per the new "anti-spam / respect people's facets" value (2026-08-09).
 *     Users who want email get it via preferences (Phase 2 rollout).
 *
 * RESPECTS user preferences:
 *   - notification_preferences.announcements.bot   → Telegram DM opt-in (default true)
 *   - notification_preferences.announcements.push  → Web push opt-in (default true)
 *   - notification_preferences.announcements.inApp → In-app bell opt-in (default true)
 *   Users can opt out via their settings; this script honors those choices.
 *
 * Idempotency: notifications.entity_id dedup + per-channel log files + FEED_DONE + X_DONE.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --only-users=<id1>,<id2>
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --skip-x
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --skip-push
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --skip-inapp
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --skip-feed
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-stage2-tutorial-2026-08-12.js --force
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }                = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService  = require(path.join(BACKEND, 'services/pushNotificationService'));
const SocialPostService        = require(path.join(BACKEND, 'services/socialPostService'));
const XPostService             = require(path.join(BACKEND, 'services/xPostService'));
const { Telegram }             = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_INAPP    = process.argv.includes('--skip-inapp');
const SKIP_FEED     = process.argv.includes('--skip-feed');
const SKIP_X        = process.argv.includes('--skip-x');
const FORCE         = process.argv.includes('--force');
const ONLY_ARG      = process.argv.find(a => a.startsWith('--only-users='));
const ONLY_USERS    = ONLY_ARG ? new Set(ONLY_ARG.split('=')[1].split(',').map(s => s.trim()).filter(Boolean)) : null;

const ENTITY_ID           = 'rush-launch-stage2-2026-08-12';
const APP_URL             = 'https://pnptv.app';
const SUBSCRIBE_URL       = `${APP_URL}/subscribe`;
const SUBSCRIBE_YEARLY    = `${APP_URL}/subscribe?promo=RUSHLAUNCH20Y`;
const SUBSCRIBE_LIFETIME  = `${APP_URL}/subscribe?promo=RUSHLAUNCH20L`;
const TG_VIDEO_URL        = `${APP_URL}/rush-wallet/tutorial-vertical.mp4`;
const FEED_VIDEO_URL      = TG_VIDEO_URL;
const SYSTEM_USER_ID      = '8552451957';   // synthetic PNPtv! poster
const X_ACCOUNT_ID        = '450eba46-9a7f-46ca-a0dd-7e4ecd5ab1d4';  // @PNPTelevision brand
const TG_DELAY_MS         = 80;

const LOG_DIR         = path.join(BACKEND, '../../logs');
const TG_SENT_FILE    = path.join(LOG_DIR, `${ENTITY_ID}-tg-sent.log`);
const FEED_DONE_FILE  = path.join(LOG_DIR, `${ENTITY_ID}-feed-done.log`);
const X_DONE_FILE     = path.join(LOG_DIR, `${ENTITY_ID}-x-done.log`);
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

// ── Messages (friendly-teacher tone) ──────────────────────────────────────────

const NOTIFICATION_MSG = {
  en: `💎 60-second Ru$h Wallet tutorial — see how to tip, unlock, and book with Ru$h →`,
  es: `💎 Tutorial de Ru$h Wallet en 60 segundos — mira cómo dar propinas, desbloquear y agendar →`,
};

const PUSH = {
  en: { title: '💎 Ru$h Wallet — 60-sec tutorial', body: 'How to tip, unlock content, and book calls with Ru$h. Watch now.' },
  es: { title: '💎 Ru$h Wallet — tutorial de 60 seg', body: 'Cómo dar propinas, desbloquear contenido y agendar llamadas con Ru$h. Míralo.' },
};

const TG_CAPTION = {
  en: `💎 <b>Ru$h Wallet in 60 seconds — how it actually works</b>

Three things Ru$h 💎 unlocks:

1️⃣ <b>Tip a creator live</b> — during streams, calls, main stage. Direct support, instantly.
2️⃣ <b>Unlock exclusive content</b> — pay-per-view videos & photos without a full subscription.
3️⃣ <b>Book a private call</b> — pick a creator, pick a slot, pay in Ru$h, done.

Buy Ru$h from your Wallet. Rate: 1 USD = 6 Ru$h 💎 (bulk packs get bonus 💎).

Launch offer still on until <b>Aug 23</b>: 20% off yearly & lifetime PRIME with <code>RUSHLAUNCH20Y</code> / <code>RUSHLAUNCH20L</code>.`,

  es: `💎 <b>Ru$h Wallet en 60 segundos — cómo funciona en la práctica</b>

Tres cosas que desbloquea Ru$h 💎:

1️⃣ <b>Dar propina en vivo</b> — durante streams, llamadas, main stage. Apoyo directo, al instante.
2️⃣ <b>Desbloquear contenido exclusivo</b> — videos y fotos pay-per-view sin suscribirte a todo.
3️⃣ <b>Agendar una llamada privada</b> — elige creador, elige horario, pagas en Ru$h, listo.

Compra Ru$h desde tu Wallet. Cambio: 1 USD = 6 Ru$h 💎 (los paquetes grandes suman 💎 bonus).

Oferta de lanzamiento sigue hasta el <b>23 de agosto</b>: 20% off PRIME anual y lifetime con <code>RUSHLAUNCH20Y</code> / <code>RUSHLAUNCH20L</code>.`,
};

const TG_BUTTONS = {
  en: {
    inline_keyboard: [
      [{ text: '💎 Open my Wallet', url: `${APP_URL}/subscribe` }],
      [{ text: '💳 Yearly PRIME → $79.99', url: SUBSCRIBE_YEARLY }],
      [{ text: '💎 Lifetime PRIME → $200', url: SUBSCRIBE_LIFETIME }],
    ],
  },
  es: {
    inline_keyboard: [
      [{ text: '💎 Abrir mi Wallet', url: `${APP_URL}/subscribe` }],
      [{ text: '💳 PRIME anual → $79.99', url: SUBSCRIBE_YEARLY }],
      [{ text: '💎 PRIME lifetime → $200', url: SUBSCRIBE_LIFETIME }],
    ],
  },
};

const FEED_CONTENT = `💎 Ru$h Wallet in 60 seconds — how it actually works.

Three things Ru$h 💎 unlocks:
1️⃣ Tip a creator live during streams, calls, main stage.
2️⃣ Unlock pay-per-view content without a full sub.
3️⃣ Book a private call — pick a creator, pick a slot, pay in Ru$h.

Rate: 1 USD = 6 Ru$h 💎 (bulk packs bonus 💎).

👉 pnptv.app/subscribe

—

💎 Ru$h Wallet en 60 segundos — cómo funciona en la práctica.

Tres cosas que desbloquea Ru$h 💎:
1️⃣ Da propina en vivo durante streams, llamadas, main stage.
2️⃣ Desbloquea contenido pay-per-view sin suscripción completa.
3️⃣ Agenda una llamada privada — creador, horario, pagas en Ru$h.

Cambio: 1 USD = 6 Ru$h 💎 (paquetes grandes con bonus 💎).

👉 pnptv.app/subscribe`;

// X posts — 280 char max. Desire-first, hook → development → close+CTA
// (feedback_marketing_copy_desire_first.md). Post 3 "elegant flow" — approved 2026-08-10.
const X_POST_EN = `Best PNP creators. Zero payment friction.

1️⃣ Fund your Ru$h Wallet with your card, right inside the app.
2️⃣ Tap to tip, unlock, book a call.
3️⃣ That's it.

Easy, safe, discreet. The way this should have always worked → pnptv.app/subscribe`;

const X_POST_ES = `Los mejores creadores PNP. Cero fricción al pagar.

1️⃣ Recargas tu Ru$h Wallet con tu tarjeta, dentro de la app.
2️⃣ Un tap: propina, desbloqueo, llamada.
3️⃣ Listo.

Fácil, seguro, discreto. Como siempre debió ser → pnptv.app/subscribe`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Ru$h Wallet Launch Broadcast — Stage 2 (Tutorial)');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)       console.log(' MODE: DRY RUN — nothing will be sent');
  if (ONLY_USERS)    console.log(` MODE: ONLY-USERS = [${[...ONLY_USERS].join(', ')}]`);
  if (SKIP_INAPP)    console.log(' --skip-inapp');
  if (SKIP_PUSH)     console.log(' --skip-push');
  if (SKIP_TELEGRAM) console.log(' --skip-telegram');
  if (SKIP_FEED)     console.log(' --skip-feed');
  if (SKIP_X)        console.log(' --skip-x');
  if (FORCE)         console.log(' --force (ignore prior-run dedup)');
  console.log('');

  // Audience: age-verified, non-deleted, non-banned, creators INCLUDED
  // (per feedback_creator_ops_via_slack.md: marketing = members).
  //
  // Per-user channel filter uses notification_preferences.announcements.{bot|push|inApp}.
  // Defaults to TRUE when the key is missing (legacy users) so no one is silently dropped.
  // Users who explicitly opted out (false) are respected — this is the new anti-spam value.
  const { rows: users } = await query(`
    SELECT
      u.id, u.first_name, u.username, u.telegram, u.language,
      COALESCE((u.notification_preferences->'announcements'->>'bot')::boolean,   true) AS pref_bot,
      COALESCE((u.notification_preferences->'announcements'->>'push')::boolean,  true) AS pref_push,
      COALESCE((u.notification_preferences->'announcements'->>'inApp')::boolean, true) AS pref_inapp
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

  const tgAlreadySent = loadSentSet(TG_SENT_FILE);

  const inAppEligible  = inScope.filter(u => u.pref_inapp && isNew(u));
  const pushEligible   = inScope.filter(u => u.pref_push  && isNew(u));
  const tgEligible     = inScope.filter(u => u.pref_bot   && u.telegram && isNew(u) && !tgAlreadySent.has(u.id));

  const optedOutInApp  = inScope.filter(u => !u.pref_inapp).length;
  const optedOutPush   = inScope.filter(u => !u.pref_push).length;
  const optedOutBot    = inScope.filter(u => !u.pref_bot).length;

  console.log(`   Total age-verified users: ${users.length}`);
  console.log(`   In scope:                 ${inScope.length}`);
  console.log(`   Already notified:         ${alreadySent.size}`);
  console.log(`   TG already sent:          ${tgAlreadySent.size}`);
  console.log(`   Eligible in-app:          ${inAppEligible.length}  (opted-out: ${optedOutInApp})`);
  console.log(`   Eligible push:            ${pushEligible.length}  (opted-out: ${optedOutPush})`);
  console.log(`   Eligible Telegram:        ${tgEligible.length}  (opted-out: ${optedOutBot})`);

  const stats = { inApp: 0, push: 0, telegram: 0, telegramFailed: 0, feed: false, xEn: false, xEs: false };

  // 1. In-app bell notification
  console.log('\n1/5  In-app notifications...');
  if (SKIP_INAPP) {
    console.log('     [SKIPPED] --skip-inapp');
  } else if (!DRY_RUN) {
    try {
      const enIds = inAppEligible.filter(u =>  isEn(u.language)).map(u => u.id);
      const esIds = inAppEligible.filter(u => !isEn(u.language)).map(u => u.id);
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
        `, [ids, ENTITY_ID, msg, JSON.stringify({ url: SUBSCRIBE_URL })]);
        stats.inApp += ids.length;
      }
      console.log(`     ✓ ${stats.inApp} inserted/upserted`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would notify ${inAppEligible.length} users`);
  }

  // 2. Web push
  console.log('2/5  Web push...');
  if (SKIP_PUSH) {
    console.log('     [SKIPPED] --skip-push');
  } else if (!DRY_RUN) {
    try {
      PushNotificationService.initialize();
      const enIds = pushEligible.filter(u =>  isEn(u.language)).map(u => u.id);
      const esIds = pushEligible.filter(u => !isEn(u.language)).map(u => u.id);
      let pushSent = 0;
      if (enIds.length) pushSent += await PushNotificationService.sendToUsers(enIds, { ...PUSH.en, url: SUBSCRIBE_URL, tag: ENTITY_ID });
      if (esIds.length) pushSent += await PushNotificationService.sendToUsers(esIds, { ...PUSH.es, url: SUBSCRIBE_URL, tag: ENTITY_ID });
      stats.push = pushSent;
      console.log(`     ✓ ${pushSent} push sent`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would push to eligible subscribed users`);
  }

  // 3. Telegram DMs (video + inline buttons)
  console.log(`3/5  Telegram to ${tgEligible.length} users...`);
  if (SKIP_TELEGRAM) {
    console.log('     [SKIPPED] --skip-telegram');
  } else if (!DRY_RUN) {
    const tg = new Telegram(process.env.BOT_TOKEN);
    const LOCAL_VIDEO_PATH = process.env.TG_RUSH_TUTORIAL_PATH || '/tmp/tg-rush-tutorial.mp4';
    if (!fsSync.existsSync(LOCAL_VIDEO_PATH)) {
      try {
        await downloadFile(TG_VIDEO_URL, LOCAL_VIDEO_PATH);
        console.log(`     Downloaded tutorial video to ${LOCAL_VIDEO_PATH}`);
      } catch (err) {
        console.warn(`     Could not download video locally (${err.message}), falling back to URL sends`);
      }
    }
    let videoRef = TG_VIDEO_URL;
    let primedUserId = null;
    if (fsSync.existsSync(LOCAL_VIDEO_PATH)) {
      for (let p = 0; p < Math.min(5, tgEligible.length) && videoRef === TG_VIDEO_URL; p++) {
        const candidate = tgEligible[p];
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
    }
    if (videoRef === TG_VIDEO_URL) {
      console.warn('     Priming exhausted, falling back to per-user URL sends');
    }

    for (let i = 0; i < tgEligible.length; i++) {
      const u = tgEligible[i];
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
      if ((i + 1) % 200 === 0) console.log(`     TG progress: ${i + 1}/${tgEligible.length}`);
    }
    console.log(`     ✓ TG: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
  } else {
    console.log(`     [DRY] Would send video to ${tgEligible.length} users`);
    console.log(`     Video URL: ${TG_VIDEO_URL}`);
    console.log('\n── Sample TG caption (EN) ──\n');
    console.log(TG_CAPTION.en);
    console.log('\n── Sample TG caption (ES) ──\n');
    console.log(TG_CAPTION.es);
  }

  // 4. In-app feed post
  console.log('4/5  In-app feed post...');
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
        'Ru$h Wallet — 60-second tutorial',
        'How to tip live, unlock content, and book a private call using Ru$h 💎.',
        null, null, 'community'
      );
      stats.feed = true;
      markSent(FEED_DONE_FILE, post.id);
      console.log(`     ✓ Feed post created, id=${post.id}`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would create feed post as user ${SYSTEM_USER_ID}`);
    console.log(`     Video URL: ${FEED_VIDEO_URL}`);
  }

  // 5. X posts (EN + ES as 2 separate posts from @PNPTelevision)
  console.log('5/5  X posts (EN + ES)...');
  if (SKIP_X) {
    console.log('     [SKIPPED] --skip-x');
  } else {
    const xDone = loadSentSet(X_DONE_FILE);
    for (const [lang, text] of [['en', X_POST_EN], ['es', X_POST_ES]]) {
      if (xDone.has(lang)) {
        console.log(`     [SKIPPED ${lang.toUpperCase()}] already posted`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`     [DRY ${lang.toUpperCase()}] Would post (${text.length} chars):`);
        console.log('     ' + text.replace(/\n/g, '\n     '));
        continue;
      }
      try {
        const result = await XPostService.sendPostNow({
          accountId:     X_ACCOUNT_ID,
          adminId:       null,
          adminUsername: 'rush-launch-stage2-2026-08-12',
          text,
          mediaUrl:      null,  // text-only fallback — @PNPTelevision OAuth 2.0 token lacks media.write scope (2026-08-09)
        });
        console.log(`     ✓ X ${lang.toUpperCase()} posted, jobId=${result.postId}${result.truncated ? ' (truncated)' : ''}`);
        markSent(X_DONE_FILE, lang);
        if (lang === 'en') stats.xEn = true;
        if (lang === 'es') stats.xEs = true;
      } catch (err) {
        console.error(`     ✗ X ${lang.toUpperCase()} failed: ${err.message}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` BROADCAST ${DRY_RUN ? 'DRY RUN' : 'COMPLETE'}`);
  console.log('═══════════════════════════════════════════════════════════');
  if (!DRY_RUN) {
    console.log(` In-app:   ${stats.inApp}`);
    console.log(` Push:     ${stats.push}`);
    console.log(` Telegram: ${stats.telegram} sent / ${stats.telegramFailed} failed`);
    console.log(` Feed:     ${stats.feed ? 'posted' : 'not posted'}`);
    console.log(` X EN:     ${stats.xEn ? 'posted' : 'not posted'}`);
    console.log(` X ES:     ${stats.xEs ? 'posted' : 'not posted'}`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main };
