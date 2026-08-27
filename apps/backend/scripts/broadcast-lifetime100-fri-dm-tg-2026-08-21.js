#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-fri-dm-tg-2026-08-21.js
 *
 * Week-of-Aug-19 campaign — Fri full-audience closer via in-app DM + Telegram.
 * Fresh weekend copy — not a duplicate of Wed's "behind the $100" story.
 *
 * In-app DM: ALL non-PRIME users (~8,090). Channel=fri_dm.
 * Telegram DM: ONLY non-PRIME users whose wed_tg='sent' (~2,799 known-reachable).
 *              Deliberately excludes the 3,109 wed_tg hard-fails
 *              (blocked/deactivated/no-prior-DM — retrying is guaranteed noise).
 * Channel=fri_tg.
 *
 * Idempotency: broadcast_lifetime100_week_2026_08_19 log table.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-fri-dm-tg-2026-08-21.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-fri-dm-tg-2026-08-21.js --live
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-fri-dm-tg-2026-08-21.js --live --skip-telegram
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-fri-dm-tg-2026-08-21.js --live --skip-dm
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

const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const LIFETIME_URL = `${WEBAPP_URL}/lifetime100`;
const SYSTEM_SENDER = '8552451957';

const TG_DELAY_MS = 150;
const DM_DELAY_MS = 80;
const LOG_TABLE = 'broadcast_lifetime100_week_2026_08_19';
const DM_CHANNEL = 'fri_dm';
const TG_CHANNEL = 'fri_tg';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — Fri weekend, warm, desire-first ────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🖤 *Ya es viernes — la puerta sigue abierta*

Lifetime PRIME · $100 · un solo pago · PRIME para siempre.

Todas las funciones actuales y todas las que vamos a lanzar — incluidas.

✅ Tarjeta, Apple Pay, Nequi o cualquier cripto
✅ Activación manual en menos de 2h (máx 24h)
✅ Sin renovaciones, nunca

Este fin de semana es un buen momento.

👉 ${LIFETIME_URL}

🖤 — PNPtv`;
  }
  return `🖤 *It's Friday — the door is still open*

Lifetime PRIME · $100 · one payment · PRIME forever.

Every current feature and every one we ship next — included.

✅ Card, Apple Pay, Nequi, or any crypto
✅ Manually activated in <2h (24h max)
✅ No renewals, ever

This weekend's a good moment.

👉 ${LIFETIME_URL}

🖤 — PNPtv`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🖤 <b>Ya es viernes — la puerta sigue abierta</b>\n\n` +
      `Hola${n} — Lifetime PRIME sigue a $100. Un pago, PRIME para siempre.\n\n` +
      `Tarjeta, Apple Pay, Nequi o cualquier cripto. Activación manual en &lt;2h.\n\n` +
      `Buen momento para entrar 👇\n\n` +
      `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
      `🖤`
    );
  }
  return (
    `🖤 <b>It's Friday — the door is still open</b>\n\n` +
    `Hey${n} — Lifetime PRIME is still $100. One payment, PRIME forever.\n\n` +
    `Card, Apple Pay, Nequi, or any crypto. Manually activated in &lt;2h.\n\n` +
    `Good moment to step in 👇\n\n` +
    `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
    `🖤`
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
  // In-app DM: all non-PRIME. TG eligibility = wed_tg='sent'.
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id        AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.language,
      EXISTS (
        SELECT 1 FROM ${LOG_TABLE} b
        WHERE b.user_id = u.id::text AND b.channel='wed_tg' AND b.status='sent'
      ) AS tg_ok
    FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime', 'pnp-member')
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at > NOW())
      )
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
  console.log('  PNPtv — /lifetime100 Fri full DM+TG closer (Fri 2026-08-21)');
  console.log(`  MODE    : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  SKIP_DM : ${SKIP_DM}   SKIP_TG: ${SKIP_TG}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets = await loadTargets();
  const tgEligible = targets.filter(t => t.tg_ok && t.telegram && String(t.telegram).trim());

  console.log(`  ${targets.length} non-PRIME users total (DM target)`);
  console.log(`  ${tgEligible.length} eligible for TG (known-reachable via wed_tg='sent')\n`);

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

    // 1. In-app DM (all non-PRIME)
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

    // 2. Telegram DM — only if wed_tg='sent' (skip known hard-fails)
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
