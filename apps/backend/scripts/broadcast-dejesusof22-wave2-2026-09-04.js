#!/usr/bin/env node
'use strict';

/**
 * broadcast-dejesusof22-mainstage-2026-09-04.js
 *
 * @Dejesusof22 is live on Main Stage now. Hero video + tight caption + two
 * CTAs: [🔴 Join Main Stage] and [❖ His profile]. Profile page surfaces the
 * Book Call button (30 min $50 / 1 h $100) — so both "watch live" and
 * "book a call" are one tap from every send.
 *
 * Channels: dejesusof22_mainstage_dm, dejesusof22_mainstage_tg,
 *           dejesusof22_mainstage_push_es, dejesusof22_mainstage_push_en.
 * Dedup table (campaign-wide): broadcast_dejesusof22_mainstage_2026_09_04.
 *
 * MUST run in a dedicated `docker run` container (NOT `docker exec pnptv-bot`)
 * so a parallel session's `compose up -d pnptv-bot` does not kill mid-send.
 * See feedback_broadcast_isolated_container.md in memory.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY       = !process.argv.includes('--live');
const SKIP_TG   = process.argv.includes('--skip-telegram');
const SKIP_DM   = process.argv.includes('--skip-dm');
const SKIP_PUSH = process.argv.includes('--skip-push');

const SYSTEM_SENDER    = '8552451957';
const DEJESUS_USER_ID  = '8b9e2dfb-063e-4c4d-8aaa-87163f198128';
const MAIN_STAGE_URL   = 'https://pnptv.app/main-stage';
const DEJESUS_USERNAME = 'Dejesusof22';
// Canonical channel URL + deep link: opens the booking modal on arrival
// (CreatorProfilePage honours ?action=book, &duration=NN preselects the slot).
// Do NOT link /profile/<uuid> here -- it redirects, and without ?action the
// CTA drops the user on a profile page instead of starting a booking.
const BOOK_URL         = `https://pnptv.app/c/${DEJESUS_USERNAME}?action=book&duration=30`;
const VIDEO_URL        = 'https://pnptv.app/broadcast/dejesusof22-mainstage-2026-09-04.mp4';

const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const DM_DELAY_MS = 60;
const LOG_TABLE   = 'broadcast_dejesusof22_wave2_2026_09_04';
const DM_CHANNEL  = 'dejesusof22_wave2_dm';
const TG_CHANNEL  = 'dejesusof22_wave2_tg';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🔴 @Dejesusof22 · SIGUE EN VIVO

Una hora dentro. Nuevo mood. Mismo escenario.

Slots 1:1 aún abiertos — $50 (30 min) · $100 (1 h).

🔴 Entrar a Main Stage 👉 ${MAIN_STAGE_URL}
❖ Su perfil 👉 ${BOOK_URL}`;
  }
  return `🔴 @Dejesusof22 · STILL LIVE

An hour deep. New mood. Same stage.

1:1 slots still open — $50 (30 min) · $100 (1 h).

🔴 Join Main Stage 👉 ${MAIN_STAGE_URL}
❖ His profile 👉 ${BOOK_URL}`;
}

function tgCaption(lang) {
  if (isEs(lang)) {
    return (
      `🔴 <b>@Dejesusof22 · SIGUE EN VIVO</b>\n\n` +
      `Una hora dentro. Nuevo mood. Mismo escenario.\n\n` +
      `Slots <b>1:1 aún abiertos</b> — $50 (30 min) · $100 (1 h).\n\n` +
      `Entra 👇`
    );
  }
  return (
    `🔴 <b>@Dejesusof22 · STILL LIVE</b>\n\n` +
    `An hour deep. New mood. Same stage.\n\n` +
    `<b>1:1 slots still open</b> — $50 (30 min) · $100 (1 h).\n\n` +
    `Jump in 👇`
  );
}

const TG_BUTTONS = {
  en: [[
    { text: '🔴 Join Main Stage', url: MAIN_STAGE_URL },
    { text: '❖ His profile',    url: BOOK_URL },
  ]],
  es: [[
    { text: '🔴 Entrar a Main Stage', url: MAIN_STAGE_URL },
    { text: '❖ Su perfil',           url: BOOK_URL },
  ]],
};

const PUSH_COPY = {
  es: { title: '🔴 @Dejesusof22 · SIGUE EN VIVO', body: 'Nuevo mood en Main Stage · 1:1 desde $50' },
  en: { title: '🔴 @Dejesusof22 · STILL LIVE',    body: 'New mood on Main Stage · 1:1 from $50' },
};

const PUSH_COMMON = {
  url : MAIN_STAGE_URL,
  icon: '/icon-192.png',
  tag : 'dejesusof22-wave2-2026-09-04',
};

// ── Plumbing ─────────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function loadDmTgTargets() {
  const { rows } = await query(`
    SELECT u.id        AS user_id,
           u.username,
           u.first_name,
           u.telegram,
           LOWER(COALESCE(u.language,'en')) AS language
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND COALESCE(u.tier, 'free') <> 'banned'
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);
  return rows;
}

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

// sendVideo with caption + two-CTA button row. Fall back to text with buttons
// if TG rejects the video (rare — e.g. size limit, region block).
async function tgSend(chatId, caption, buttons) {
  const kb = { inline_keyboard: buttons };
  const vidRes = await _tgApi('sendVideo', {
    chat_id: chatId,
    video: VIDEO_URL,
    caption: caption.slice(0, 1024),
    parse_mode: 'HTML',
    supports_streaming: true,
    reply_markup: kb,
  });
  if (vidRes.ok) return vidRes;
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: kb,
  });
}

// ── Push ─────────────────────────────────────────────────────────────────────

async function sendPushBatch(langKey) {
  const isEsBatch = langKey === 'es';
  const copy = PUSH_COPY[langKey];
  const opts = { ...PUSH_COMMON, title: copy.title, body: copy.body };
  const channel = `dejesusof22_mainstage_push_${langKey}`;

  const langFilter = isEsBatch
    ? `LOWER(COALESCE(u.language,'en')) LIKE 'es%'`
    : `(u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')`;

  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_active, true) = true
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND ${langFilter}
  `);

  const userIds = rows.map(r => r.id);
  console.log(`  [PUSH ${langKey.toUpperCase()}] ${userIds.length} eligible`);

  if (DRY) {
    console.log(`    payload:`, opts);
    return { attempted: userIds.length, sent: 0 };
  }
  if (userIds.length === 0) return { attempted: 0, sent: 0 };

  const sent = await PushNotificationService.sendToUsers(userIds, opts);
  console.log(`  [PUSH ${langKey.toUpperCase()}] delivered ${sent}/${userIds.length}`);

  for (const uid of userIds) {
    try { await log(uid, channel, 'sent'); } catch {}
  }
  return { attempted: userIds.length, sent };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  await query('SET statement_timeout = 0');
  if (!DRY) {
    await PushNotificationService.initialize();
    await ensureLogTable();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — @Dejesusof22 Main Stage promo (2026-09-04)');
  console.log(`  MODE     : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  SKIP_DM  : ${SKIP_DM}   SKIP_TG: ${SKIP_TG}   SKIP_PUSH: ${SKIP_PUSH}`);
  console.log(`  Video    : ${VIDEO_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets = await loadDmTgTargets();
  const tgEligible = targets.filter(t => t.telegram && String(t.telegram).trim());

  console.log(`  ${targets.length} users total (in-app DM target)`);
  console.log(`  ${tgEligible.length} eligible for Telegram DM\n`);

  if (DRY) {
    console.log('  DRY sample DM (lang=en):');
    console.log('  ────────────');
    console.log(dmText('en'));
    console.log('  ────────────');
    if (!SKIP_PUSH) {
      console.log('\n  ── PUSH preview ──');
      await sendPushBatch('es');
      await sendPushBatch('en');
    }
    console.log(`\n  DRY RUN — would DM ${targets.length}, TG ${tgEligible.length}. Re-run with --live.\n`);
    process.exit(0);
  }

  const stats = { dm: 0, dmSkipped: 0, dmFailed: 0, tg: 0, tgSkipped: 0, tgFailed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const { user_id, telegram, language } = row;
    const lang = language || 'en';

    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmSkip=${stats.dmSkipped} tgSkip=${stats.tgSkipped} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
    }

    if (!SKIP_DM) {
      if (await alreadySent(user_id, DM_CHANNEL)) {
        stats.dmSkipped++;
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query, { mediaUrl: VIDEO_URL, mediaType: 'video' });
          stats.dm++;
          await log(user_id, DM_CHANNEL, 'sent');
        } catch (err) {
          stats.dmFailed++;
          await log(user_id, DM_CHANNEL, 'failed', (err.message || '?').slice(0, 500));
        }
        await sleep(DM_DELAY_MS);
      }
    }

    if (!SKIP_TG && BOT_TOKEN && telegram && String(telegram).trim()) {
      if (await alreadySent(user_id, TG_CHANNEL)) {
        stats.tgSkipped++;
      } else {
        const buttons = isEs(lang) ? TG_BUTTONS.es : TG_BUTTONS.en;
        const r = await tgSend(telegram, tgCaption(lang), buttons);
        if (r.ok) {
          stats.tg++;
          await log(user_id, TG_CHANNEL, 'sent');
        } else {
          stats.tgFailed++;
          await log(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500));
        }
        await sleep(TG_DELAY_MS);
      }
    }
  }

  let pushEs = { attempted: 0, sent: 0 };
  let pushEn = { attempted: 0, sent: 0 };
  if (!SKIP_PUSH) {
    console.log('\n  ── PUSH ──');
    pushEs = await sendPushBatch('es');
    pushEn = await sendPushBatch('en');
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs sent    : ${stats.dm}`);
  console.log(`   In-app DMs skipped : ${stats.dmSkipped}`);
  console.log(`   In-app DMs failed  : ${stats.dmFailed}`);
  console.log(`   Telegram DMs sent  : ${stats.tg}`);
  console.log(`   Telegram skipped   : ${stats.tgSkipped}`);
  console.log(`   Telegram failed    : ${stats.tgFailed}`);
  console.log(`   Push ES sent       : ${pushEs.sent}/${pushEs.attempted}`);
  console.log(`   Push EN sent       : ${pushEn.sent}/${pushEn.attempted}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
