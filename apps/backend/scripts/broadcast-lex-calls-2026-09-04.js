#!/usr/bin/env node
'use strict';

/**
 * broadcast-lex-calls-2026-09-04.js  (v2, polished)
 *
 * 1:1 private video calls with Lex — hero image + tight caption + one CTA.
 *   30 min → $80 USD
 *   1 hour → $150 USD
 *
 * Payment details (card / crypto / USDC) live on the CTA landing page — never
 * in this message body. See feedback_payment_brand_names_hidden.md and
 * feedback_broadcast_visual_polish.md in memory.
 *
 * Channels: lex_calls_dm, lex_calls_tg, lex_calls_push_es, lex_calls_push_en.
 * Idempotency table: broadcast_lex_calls_2026_09_04.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-calls-2026-09-04.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-calls-2026-09-04.js --live
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-calls-2026-09-04.js --live --skip-telegram
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-calls-2026-09-04.js --live --skip-dm
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-calls-2026-09-04.js --live --skip-push
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

const SYSTEM_SENDER = '8552451957';
const LEX_USER_ID   = '8f5f4dd1-7bdb-4571-b026-e09d91113c91';
// CTA → Lex's profile with book action so BookCallModal opens.
// `/c/PNPLATINOBOY` 404s because Lex has creator_status='none'.
const CTA_URL   = `https://pnptv.app/profile/${LEX_USER_ID}?action=book&open=1`;
// Hero image — Lex's album pic (absolute HTTPS URL for Telegram + push).
const HERO_URL  = 'https://pnptv.app/uploads/creator-media/8f5f4dd1-7bdb-4571-b026-e09d91113c91-1788482988067.webp';

const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const DM_DELAY_MS = 60;
const LOG_TABLE   = 'broadcast_lex_calls_2026_09_04';
const DM_CHANNEL  = 'lex_calls_dm';
const TG_CHANNEL  = 'lex_calls_tg';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — hero-first, tight, single CTA, no brand names ────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `Videollamada privada 1:1 con Lex 🖤

⏱ 30 min · $80 USD
⏱ 1 hora · $150 USD

Reserva aquí 👉 ${CTA_URL}`;
  }
  return `Private 1:1 video call with Lex 🖤

⏱ 30 min · $80 USD
⏱ 1 hour · $150 USD

Book here 👉 ${CTA_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `<b>Videollamada 1:1 con Lex</b> 🖤\n\n` +
      `Hola${n} — privado, tú y él.\n\n` +
      `⏱ <b>30 min · $80</b>\n` +
      `⏱ <b>1 hora · $150</b>\n\n` +
      `Reserva abajo — paga con tarjeta o cripto.`
    );
  }
  return (
    `<b>1:1 video call with Lex</b> 🖤\n\n` +
    `Hey${n} — private, just you two.\n\n` +
    `⏱ <b>30 min · $80</b>\n` +
    `⏱ <b>1 hour · $150</b>\n\n` +
    `Book below — pay with card or crypto.`
  );
}

const PUSH_COPY = {
  es: { title: '🖤 Videollamada con Lex', body: 'Privado · 30 min $80 · 1 h $150' },
  en: { title: '🖤 Video call with Lex',  body: 'Private · 30 min $80 · 1 h $150' },
};

const PUSH_COMMON = {
  url : `/dm/${SYSTEM_SENDER}`,
  icon: '/icon-192.png',
  tag : 'lex-calls-2026-09-04',
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
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

// sendPhoto with hero + caption + CTA button. Fall back to text if TG rejects.
async function tgSend(chatId, caption, btnLabel, btnUrl, photoUrl) {
  const kb = { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] };
  if (photoUrl) {
    const photoRes = await _tgApi('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption.slice(0, 1024),
      parse_mode: 'HTML',
      reply_markup: kb,
    });
    if (photoRes.ok) return photoRes;
  }
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
  const channel = `lex_calls_push_${langKey}`;

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
  if (!DRY) {
    await PushNotificationService.initialize();
    await ensureLogTable();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Lex calls promo (30min $80 / 1h $150)  2026-09-04 v2');
  console.log(`  MODE     : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  SKIP_DM  : ${SKIP_DM}   SKIP_TG: ${SKIP_TG}   SKIP_PUSH: ${SKIP_PUSH}`);
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
    console.log('\n  DRY sample DM (lang=es):');
    console.log('  ────────────');
    console.log(dmText('es'));
    console.log('  ────────────');
    if (tgEligible[0]) {
      const s = tgEligible[0];
      console.log(`\n  DRY sample TG (user=${s.user_id} lang=${s.language || 'en'}):`);
      console.log('  ────────────');
      console.log(tgCaption(s.first_name || s.username || null, s.language || 'en'));
      console.log('  ────────────');
    }
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
    const { user_id, username, first_name, telegram, language } = row;
    const name = first_name || username || null;
    const lang = language || 'en';

    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmSkip=${stats.dmSkipped} tgSkip=${stats.tgSkipped} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
    }

    if (!SKIP_DM) {
      if (await alreadySent(user_id, DM_CHANNEL)) {
        stats.dmSkipped++;
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query, { mediaUrl: HERO_URL, mediaType: 'image' });
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
        const isEsUser = isEs(lang);
        const btnLabel = isEsUser ? 'Reservar' : 'Book now';
        const r = await tgSend(telegram, tgCaption(name, lang), btnLabel, CTA_URL, HERO_URL);
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
