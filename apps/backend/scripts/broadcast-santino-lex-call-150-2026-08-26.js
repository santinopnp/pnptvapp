#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-lex-call-150-2026-08-26.js
 *
 * Mass promo: 1-hour private video call with Santino & Lex — $150 USD.
 *
 * Two payment rails in the DM:
 *   1) MercadoPago (card / Apple Pay / Nequi / PSE)  — https://mpago.li/1xquVEC
 *   2) NowPayments (any crypto)                      — https://nowpayments.io/payment/?iid=5502298044
 *   + "reply for a direct USDC wallet address" as the Privy/on-chain fallback.
 *
 * Reach:
 *   In-app DM: ALL non-banned, non-deleted, non-PRIME-optional users.
 *              (Includes PRIME — this is a paid call offer, not a subscription pitch.)
 *   Telegram : ONLY known-reachable users (any prior success in the lifetime100 log).
 *
 * Channels: slcall_dm, slcall_tg.
 * Idempotency table: broadcast_santino_lex_call_150_2026_08_26.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-santino-lex-call-150-2026-08-26.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-santino-lex-call-150-2026-08-26.js --live
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-santino-lex-call-150-2026-08-26.js --live --skip-telegram
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-santino-lex-call-150-2026-08-26.js --live --skip-dm
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram }                  = require('telegraf');

const DRY     = !process.argv.includes('--live');
const SKIP_TG = process.argv.includes('--skip-telegram');
const SKIP_DM = process.argv.includes('--skip-dm');

const MP_URL   = 'https://mpago.li/1xquVEC';
const NP_URL   = 'https://nowpayments.io/payment/?iid=5502298044';
const SYSTEM_SENDER = '8552451957';

const TG_DELAY_MS = 150;
const DM_DELAY_MS = 80;
const LOG_TABLE = 'broadcast_santino_lex_call_150_2026_08_26';
const REACH_LOG = 'broadcast_lifetime100_week_2026_08_19';
const DM_CHANNEL = 'slcall_dm';
const TG_CHANNEL = 'slcall_tg';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — desire-first, warm, one clear offer ───────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🔥 *Una hora en privado con Santino & Lex*

Videollamada 1:1 — los dos, contigo, una hora entera. $150 USD.

Elige cómo pagar:

💳 Tarjeta · Apple Pay · Nequi · PSE
👉 ${MP_URL}

🪙 Cualquier cripto (BTC · USDC · ETH · Dash · más)
👉 ${NP_URL}

💎 ¿Prefieres USDC directo desde tu wallet? Responde a este mensaje y te pasamos la dirección.

Cuando pagues, envíanos el comprobante por aquí y coordinamos hora.

🖤 — Santino & Lex`;
  }
  return `🔥 *One hour, private, with Santino & Lex*

A 1:1 video call — both of us, with you, one full hour. $150 USD.

Pick how you want to pay:

💳 Card · Apple Pay · Nequi · PSE
👉 ${MP_URL}

🪙 Any crypto (BTC · USDC · ETH · Dash · more)
👉 ${NP_URL}

💎 Prefer USDC straight from your wallet? Reply to this DM and we'll send the address.

Once you've paid, drop the receipt here and we'll lock in a time.

🖤 — Santino & Lex`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🔥 <b>Una hora en privado con Santino &amp; Lex</b>\n\n` +
      `Hola${n} — videollamada 1:1, los dos contigo, una hora entera. <b>$150 USD</b>.\n\n` +
      `💳 Tarjeta · Apple Pay · Nequi · PSE\n` +
      `👉 <a href="${MP_URL}">Pagar con Mercado Pago</a>\n\n` +
      `🪙 Cualquier cripto (BTC · USDC · ETH · Dash · más)\n` +
      `👉 <a href="${NP_URL}">Pagar con cripto</a>\n\n` +
      `💎 ¿USDC directo desde tu wallet? Responde este mensaje y te pasamos la dirección.\n\n` +
      `Envía el comprobante por aquí y agendamos.\n\n` +
      `🖤 — Santino &amp; Lex`
    );
  }
  return (
    `🔥 <b>One hour, private, with Santino &amp; Lex</b>\n\n` +
    `Hey${n} — a 1:1 video call, both of us with you, one full hour. <b>$150 USD</b>.\n\n` +
    `💳 Card · Apple Pay · Nequi · PSE\n` +
    `👉 <a href="${MP_URL}">Pay with Mercado Pago</a>\n\n` +
    `🪙 Any crypto (BTC · USDC · ETH · Dash · more)\n` +
    `👉 <a href="${NP_URL}">Pay with crypto</a>\n\n` +
    `💎 Prefer USDC straight from your wallet? Reply and we'll send the address.\n\n` +
    `Drop the receipt here once paid and we'll lock in a time.\n\n` +
    `🖤 — Santino &amp; Lex`
  );
}

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

async function loadTargets() {
  // Reachability signal: user got at least one successful send in the
  // lifetime100 week log (wed_tg / fri_tg / wed_dm / fri_dm sent).
  // Widest known-reachable Telegram pool without blindly retrying dead ids.
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id        AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.language,
      EXISTS (
        SELECT 1 FROM ${REACH_LOG} b
        WHERE b.user_id = u.id::text
          AND b.status = 'sent'
          AND b.channel IN ('wed_tg','fri_tg')
      ) AS tg_ok
    FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
    ORDER BY u.id
  `);
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  const tg = (!DRY && !SKIP_TG && process.env.BOT_TOKEN)
    ? new Telegram(process.env.BOT_TOKEN)
    : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Santino & Lex 1h call ($150) mass DM+TG (2026-08-26)');
  console.log(`  MODE    : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  SKIP_DM : ${SKIP_DM}   SKIP_TG: ${SKIP_TG}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets = await loadTargets();
  const tgEligible = targets.filter(t => t.tg_ok && t.telegram && String(t.telegram).trim());

  console.log(`  ${targets.length} users total (in-app DM target)`);
  console.log(`  ${tgEligible.length} eligible for TG (known-reachable via lifetime100 log)\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

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
    console.log(`\n  DRY RUN — would DM ${targets.length}, TG ${tgEligible.length}. Re-run with --live.\n`);
    process.exit(0);
  }

  const stats = { dm: 0, dmSkipped: 0, dmFailed: 0, tg: 0, tgSkipped: 0, tgFailed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const { user_id, username, first_name, telegram, language, tg_ok } = row;
    const name = first_name || username || null;
    const lang = language || 'en';

    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmSkip=${stats.dmSkipped} tgSkip=${stats.tgSkipped} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
    }

    // 1. In-app DM (everyone eligible)
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

    // 2. Telegram DM — only known-reachable ids
    if (tg && tg_ok && telegram && String(telegram).trim()) {
      if (await alreadySent(user_id, TG_CHANNEL)) {
        stats.tgSkipped++;
      } else {
        try {
          await tg.sendMessage(telegram, tgText(name, lang), { parse_mode: 'HTML' });
          stats.tg++;
          await log(user_id, TG_CHANNEL, 'sent');
        } catch (err) {
          stats.tgFailed++;
          await log(user_id, TG_CHANNEL, 'failed', (err.description || err.message || '?').slice(0, 500));
        }
        await sleep(TG_DELAY_MS);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs sent   : ${stats.dm}`);
  console.log(`   In-app DMs skipped: ${stats.dmSkipped}`);
  console.log(`   In-app DMs failed : ${stats.dmFailed}`);
  console.log(`   Telegram DMs sent : ${stats.tg}`);
  console.log(`   Telegram skipped  : ${stats.tgSkipped}`);
  console.log(`   Telegram failed   : ${stats.tgFailed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
