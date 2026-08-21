#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-tg-topup-2026-08-21.js
 *
 * Week-of-Aug-19 campaign — Fri TG top-up.
 * Segment: non-PRIME users with a telegram_id who have NO wed_tg row
 *          (audience that grew after Wed's send, ~103).
 *          Explicitly skips users who were already tried on Wed —
 *          those 3,109 fails are all hard-fails (blocked/deactivated/no chat)
 *          and retrying is guaranteed noise.
 * Idempotency: broadcast_lifetime100_week_2026_08_19 log table, channel=fri_tg_topup.
 * Copy: Fri weekend angle.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-tg-topup-2026-08-21.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-tg-topup-2026-08-21.js --live
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram }                  = require('telegraf');

const DRY = !process.argv.includes('--live');

const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const LIFETIME_URL = `${WEBAPP_URL}/lifetime100`;

const TG_DELAY_MS = 200;
const LOG_TABLE = 'broadcast_lifetime100_week_2026_08_19';
const CHANNEL = 'fri_tg_topup';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — Fri weekend angle ─────────────────────────────────────────────────

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🖤 <b>El fin de semana ya está aquí</b>\n\n` +
      `Hola${n} — es viernes y la puerta de Lifetime PRIME sigue abierta.\n\n` +
      `Un pago, PRIME de por vida. Sin renovaciones, nunca.\n\n` +
      `✅ $100 · un solo pago\n` +
      `✅ Tarjeta, Apple Pay o cualquier cripto\n` +
      `✅ Todas las funciones — actuales y futuras\n\n` +
      `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
      `🖤`
    );
  }
  return (
    `🖤 <b>The weekend is here</b>\n\n` +
    `Hey${n} — it's Friday and the Lifetime PRIME door is still open.\n\n` +
    `One payment, PRIME for life. No renewals, ever.\n\n` +
    `✅ $100 · one payment\n` +
    `✅ Card, Apple Pay, or any crypto\n` +
    `✅ Every feature — present and future\n\n` +
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

async function loadTopupTargets() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id           AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.language
    FROM users u
    LEFT JOIN ${LOG_TABLE} b
      ON b.user_id = u.id::text AND b.channel = 'wed_tg'
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND u.telegram IS NOT NULL AND u.telegram <> ''
      AND b.user_id IS NULL
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

  const tg = (!DRY && process.env.BOT_TOKEN) ? new Telegram(process.env.BOT_TOKEN) : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — /lifetime100 TG top-up (Fri 2026-08-21)');
  console.log(`  MODE : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets = await loadTopupTargets();
  console.log(`  ${targets.length} TG-reachable non-PRIME user(s) never attempted on Wed\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  if (DRY) {
    const sample = targets[0];
    console.log(`  DRY sample TG (user=${sample.user_id} lang=${sample.language || 'en'}):`);
    console.log('  ────────────');
    console.log(tgText(sample.first_name || sample.username || null, sample.language || 'en'));
    console.log('  ────────────');
    const esSample = targets.find(t => (t.language || '').toLowerCase().startsWith('es'));
    if (esSample) {
      console.log(`\n  DRY sample TG (user=${esSample.user_id} lang=es):`);
      console.log('  ────────────');
      console.log(tgText(esSample.first_name || esSample.username || null, esSample.language));
      console.log('  ────────────');
    }
    console.log(`\n  DRY RUN — would send to ${targets.length} TG user(s). Re-run with --live.\n`);
    process.exit(0);
  }

  const stats = { sent: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const { user_id, username, first_name, telegram, language } = row;
    const name = first_name || username || null;
    const lang = language || 'en';

    if (await alreadySent(user_id, CHANNEL)) {
      stats.skipped++;
      continue;
    }

    try {
      await tg.sendMessage(telegram, tgText(name, lang), { parse_mode: 'HTML' });
      stats.sent++;
      await log(user_id, CHANNEL, 'sent');
    } catch (err) {
      stats.failed++;
      await log(user_id, CHANNEL, 'failed', (err.description || err.message || '?').slice(0, 500));
    }

    await sleep(TG_DELAY_MS);

    if ((i + 1) % 25 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  sent=${stats.sent} fail=${stats.failed} skip=${stats.skipped}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   TG sent   : ${stats.sent}`);
  console.log(`   TG skipped: ${stats.skipped}`);
  console.log(`   TG failed : ${stats.failed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
