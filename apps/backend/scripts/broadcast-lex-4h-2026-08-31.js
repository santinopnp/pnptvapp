#!/usr/bin/env node
'use strict';

/**
 * broadcast-lex-4h-2026-08-31.js
 *
 * Flash promo: Lex available NOW for 1:1 video calls — 4-hour window.
 *   30 min → $80 USD
 *   1 hour → $150 USD
 *
 * Payment rails inline:
 *   1) MercadoPago profile link (card / Apple Pay / Nequi / PSE) — user enters $80 or $150
 *   2) NowPayments $80 invoice (30 min)  — iid 5620807929
 *   3) NowPayments $150 invoice (1 h)    — iid 5502298044 (reused from 2026-08-26)
 *   4) "reply for a direct USDC wallet address" fallback
 *
 * Reach (broadcast, not filtered by lifetime100 log — this is time-sensitive):
 *   In-app DM: ALL non-banned, non-deleted, active users.
 *   Telegram : ALL users with any telegram id.
 *   Web push : ALL users with push_subscriptions.
 *
 * Channels: lex4h_dm, lex4h_tg, lex4h_push_es, lex4h_push_en.
 * Idempotency table: broadcast_lex_4h_2026_08_31.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-4h-2026-08-31.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-4h-2026-08-31.js --live
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-4h-2026-08-31.js --live --skip-telegram
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-4h-2026-08-31.js --live --skip-dm
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lex-4h-2026-08-31.js --live --skip-push
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

const MP_URL      = 'https://link.mercadopago.com.co/pnplatinotv';
const NP_URL_30   = 'https://nowpayments.io/payment/?iid=5620807929';
const NP_URL_60   = 'https://nowpayments.io/payment/?iid=5502298044';
const SYSTEM_SENDER = '8552451957';
// CTA points to the DM thread with the system sender (Cristina) where the promo
// with all payment links already sits. `/c/PNPLATINOBOY` 404s because Lex has
// creator_status='none' — see 2026-08-31 broken-deep-link fix.
const CTA_URL     = `https://pnptv.app/dm/${SYSTEM_SENDER}`;

const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const DM_DELAY_MS = 60;
const LOG_TABLE   = 'broadcast_lex_4h_2026_08_31';
const DM_CHANNEL  = 'lex4h_dm';
const TG_CHANNEL  = 'lex4h_tg';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — desire-first, warm, urgency without pressure ──────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🔥 *Lex disponible AHORA — próximas 4 horas*

Videollamada 1:1 con Lex, arranca ya. Elige tu tiempo:

⏱ 30 min — $80 USD
⏱ 1 hora — $150 USD

Cómo pagar:

💳 Tarjeta · Apple Pay · Nequi · PSE
👉 ${MP_URL}
(ingresa $80 o $150 USD según lo que elijas)

🪙 Cualquier cripto — 30 min · $80
👉 ${NP_URL_30}

🪙 Cualquier cripto — 1 hora · $150
👉 ${NP_URL_60}

💎 ¿USDC directo desde tu wallet? Responde a este mensaje y te pasamos la dirección.

Cuando pagues, envíanos el comprobante por aquí y arrancamos.

🖤 — Lex`;
  }
  return `🔥 *Lex available NOW — next 4 hours*

1:1 video call with Lex, starting now. Pick your time:

⏱ 30 min — $80 USD
⏱ 1 hour — $150 USD

Pay how you like:

💳 Card · Apple Pay · Nequi · PSE
👉 ${MP_URL}
(enter $80 or $150 USD depending on what you pick)

🪙 Any crypto — 30 min · $80
👉 ${NP_URL_30}

🪙 Any crypto — 1 hour · $150
👉 ${NP_URL_60}

💎 Prefer USDC straight from your wallet? Reply to this DM and we'll send the address.

Drop the receipt here once paid and we start.

🖤 — Lex`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🔥 <b>Lex disponible AHORA — próximas 4 horas</b>\n\n` +
      `Hola${n} — videollamada 1:1 con Lex, arranca ya.\n\n` +
      `⏱ <b>30 min · $80 USD</b>\n` +
      `⏱ <b>1 hora · $150 USD</b>\n\n` +
      `💳 Tarjeta · Apple Pay · Nequi · PSE (ingresa el monto)\n` +
      `👉 <a href="${MP_URL}">Pagar con Mercado Pago</a>\n\n` +
      `🪙 Cripto 30 min ($80)\n` +
      `👉 <a href="${NP_URL_30}">Pagar con cripto</a>\n\n` +
      `🪙 Cripto 1 hora ($150)\n` +
      `👉 <a href="${NP_URL_60}">Pagar con cripto</a>\n\n` +
      `💎 ¿USDC desde tu wallet? Responde este mensaje.\n\n` +
      `Envía el comprobante por aquí y arrancamos.\n\n` +
      `🖤 — Lex`
    );
  }
  return (
    `🔥 <b>Lex available NOW — next 4 hours</b>\n\n` +
    `Hey${n} — a 1:1 video call with Lex, starting now.\n\n` +
    `⏱ <b>30 min · $80 USD</b>\n` +
    `⏱ <b>1 hour · $150 USD</b>\n\n` +
    `💳 Card · Apple Pay · Nequi · PSE (enter the amount)\n` +
    `👉 <a href="${MP_URL}">Pay with Mercado Pago</a>\n\n` +
    `🪙 Crypto 30 min ($80)\n` +
    `👉 <a href="${NP_URL_30}">Pay with crypto</a>\n\n` +
    `🪙 Crypto 1 hour ($150)\n` +
    `👉 <a href="${NP_URL_60}">Pay with crypto</a>\n\n` +
    `💎 Prefer USDC from your wallet? Reply here.\n\n` +
    `Drop the receipt here once paid and we start.\n\n` +
    `🖤 — Lex`
  );
}

const PUSH_COPY = {
  es: {
    title: '🔥 Lex AHORA — 4 horas',
    body : 'Videollamada 1:1 · 30 min $80 · 1 h $150',
    btn  : '🎥 Ver a Lex',
  },
  en: {
    title: '🔥 Lex live NOW — 4 hours',
    body : '1:1 video call · 30 min $80 · 1 h $150',
    btn  : '🎥 Go to Lex',
  },
};

const PUSH_COMMON = {
  url : `/dm/${SYSTEM_SENDER}`,
  icon: '/icon-192.png',
  tag : 'lex-4h-2026-08-31',
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

function tgSend(chatId, text, btnLabel, btnUrl) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [[{ text: btnLabel, url: btnUrl }]],
      },
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload); req.end();
  });
}

// ── Push ─────────────────────────────────────────────────────────────────────

async function sendPushBatch(langKey) {
  const isEsBatch = langKey === 'es';
  const copy = PUSH_COPY[langKey];
  const opts = { ...PUSH_COMMON, title: copy.title, body: copy.body };
  const channel = `lex4h_push_${langKey}`;

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

  // Mark log entries for the audience so a re-run skips them
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
  console.log('  PNPtv — Lex 4h flash (30min $80 / 1h $150)  2026-08-31');
  console.log(`  MODE     : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  SKIP_DM  : ${SKIP_DM}   SKIP_TG: ${SKIP_TG}   SKIP_PUSH: ${SKIP_PUSH}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. In-app DM + Telegram DM
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
      console.log(tgText(s.first_name || s.username || null, s.language || 'en'));
      console.log('  ────────────');
    }

    // Push preview
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
          await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
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
        const btnLabel = isEsUser ? '🎥 Ver a Lex' : '🎥 Go to Lex';
        const r = await tgSend(telegram, tgText(name, lang), btnLabel, CTA_URL);
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

  // 2. Web push (per-language batch)
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
