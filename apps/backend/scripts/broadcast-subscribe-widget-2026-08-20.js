#!/usr/bin/env node
'use strict';

/**
 * broadcast-subscribe-widget-2026-08-20.js
 *
 * Announces the new inline "Any crypto" widget on /subscribe (BTC/ETH/USDC/USDT
 * picker + exact-amount address + one-tap wallet buttons, all in the same tab
 * — no more popup redirect to NowPayments hosted checkout).
 *
 * Audience: all active, non-banned, non-deleted users EXCLUDING lifetime PRIME
 * holders (they already own forever — checkout news is irrelevant to them).
 * Active monthly subs are kept in — they may upgrade to lifetime.
 *
 * Channel: in-app DM only (per user request "inapp dm").
 *
 * Idempotency: broadcast_subscribe_widget_2026_08_20 log table.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-subscribe-widget-2026-08-20.js         # DRY
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-subscribe-widget-2026-08-20.js --live  # SEND
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY = !process.argv.includes('--live');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const SYSTEM_SENDER = '8552451957';
const LOG_TABLE = 'broadcast_subscribe_widget_2026_08_20';

const DM_DELAY_MS = 120;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── COPY — desire-first, no fear, matched EN/ES pair ───────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `💎 *Nuevo: paga con cualquier cripto en un toque*

Ya elegiste el plan. Ahora el checkout está a la altura.

En /subscribe → toca "Otra cripto":
₿ Elige BTC · ETH · USDC · USDT
📥 Ve el monto exacto y la dirección en la misma página
📱 Un toque abre MetaMask o Trust Wallet
✅ PRIME se activa apenas la red confirma

Sin popups. Sin redirecciones. Misma página, misma pestaña.

👉 ${WEBAPP_URL}/subscribe

— PNPtv 🏳️‍🌈`;
  }
  return `💎 *New: pay any crypto in one tap*

You picked the plan. Now checkout matches.

On /subscribe → tap "Any crypto":
₿ Pick BTC · ETH · USDC · USDT
📥 See the exact amount + address right on the page
📱 One tap opens MetaMask or Trust Wallet
✅ PRIME activates the moment the network confirms

No popups. No hosted redirects. Same page, same tab.

👉 ${WEBAPP_URL}/subscribe

— PNPtv 🏳️‍🌈`;
}

// ── PLUMBING ───────────────────────────────────────────────────────────────

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

async function loadAudience() {
  // Option B: all active, non-banned, non-deleted, excluding lifetime PRIME.
  // Active monthly subs stay in — they may upgrade to lifetime.
  const { rows } = await query(`
    SELECT
      u.id::text AS user_id,
      u.username,
      u.first_name,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime','pnp-member')
          AND ue.is_consumed = false
          AND ue.is_lifetime = true
      )
    ORDER BY u.id
  `);
  return rows;
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — subscribe widget launch DM');
  console.log(`  MODE : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const audience = await loadAudience();
  const enCount = audience.filter(u => !isEs(u.language)).length;
  const esCount = audience.filter(u =>  isEs(u.language)).length;

  console.log(`  ${audience.length} eligible recipients`);
  console.log(`    EN: ${enCount}`);
  console.log(`    ES: ${esCount}\n`);

  if (audience.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  if (DRY) {
    console.log('  DRY sample DM (EN):');
    console.log('  ─────');
    console.log(dmText('en'));
    console.log('  ─────');
    console.log('\n  DRY sample DM (ES):');
    console.log('  ─────');
    console.log(dmText('es'));
    console.log('  ─────');
    console.log(`\n  DRY RUN — would process ${audience.length} user(s). Re-run with --live.\n`);
    process.exit(0);
  }

  const stats = { sent: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < audience.length; i++) {
    const row = audience[i];
    const lang = row.language || 'en';

    if (await alreadySent(row.user_id, 'dm')) {
      stats.skipped++;
    } else {
      try {
        await sendSystemDM(SYSTEM_SENDER, row.user_id, dmText(lang), query);
        stats.sent++;
        await log(row.user_id, 'dm', 'sent');
      } catch (err) {
        stats.failed++;
        await log(row.user_id, 'dm', 'failed', (err.message || '?').slice(0, 500));
      }
      await sleep(DM_DELAY_MS);
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  progress: ${i + 1}/${audience.length}  sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs sent   : ${stats.sent}`);
  console.log(`   Skipped (dedupe)  : ${stats.skipped}`);
  console.log(`   Failed            : ${stats.failed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
