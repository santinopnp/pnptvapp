#!/usr/bin/env node
'use strict';

/**
 * broadcast-recovery-crypto-plans-2026-08-19.js
 *
 * Recovery DM for the 7,800 users hit by broadcast-crypto-plans-2026-08-19.
 * That send auto-redirected clicks to a NowPayments hosted invoice (crypto-only),
 * which converted at 0.006% (1 payment out of 15,539 clicks). Users landed on
 * a "send X BTC to this address" page, had no crypto or didn't know how, bailed.
 *
 * This follow-up sends a warm, no-guilt DM pointing at pnptv.app/subscribe where
 * card + wallet + all crypto options are now visible in one place.
 *
 * Audience: same as the original — non-lifetime, non-banned, non-deleted users
 * WITH a row in broadcast_crypto_plans_2026_08_19 (they got the original DM).
 * Sends via both Telegram DM + in-app DM.
 *
 * Idempotency: broadcast_recovery_crypto_plans_2026_08_19 log table.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-recovery-crypto-plans-2026-08-19.js         # DRY
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-recovery-crypto-plans-2026-08-19.js --live  # SEND
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram }                  = require('telegraf');

const DRY = !process.argv.includes('--live');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const SYSTEM_SENDER = '8552451957';
const LOG_TABLE = 'broadcast_recovery_crypto_plans_2026_08_19';

const TG_DELAY_MS = 200;
const DM_DELAY_MS = 120;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── COPY — warm, no-guilt, offer clearer path ──────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🖤 *Facilitamos el pago*

Ayer te compartimos los planes PRIME con pagos en cripto directos. Sabemos que la ventana de NowPayments (envía X BTC a esta dirección) es confusa si no eres cripto-nativo.

Reabrimos todo en un solo lugar más simple:

💳 Tarjeta · Apple Pay · Google Pay
💎 Wallet PNPtv (USDC en Base)
₿ BTC / ETH / USDC / USDT (checkout guiado)
🎫 Ru$h 💎 si ya tienes saldo

👉 ${WEBAPP_URL}/subscribe

Sin apuro. Un solo pago, PRIME para siempre disponible por $100 esta semana.

— PNPtv 🏳️‍🌈`;
  }
  return `🖤 *We made paying easier*

Yesterday we sent you the PRIME plans as direct crypto-pay links. We know NowPayments' "send X BTC to this address" screen is confusing if you're not crypto-native.

We reopened everything in one simpler place:

💳 Card · Apple Pay · Google Pay
💎 PNPtv Wallet (USDC on Base)
₿ BTC / ETH / USDC / USDT (guided checkout)
🎫 Ru$h 💎 if you already have some

👉 ${WEBAPP_URL}/subscribe

No pressure. Lifetime PRIME is still $100 this week.

— PNPtv 🏳️‍🌈`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🖤 <b>Facilitamos el pago</b>\n\n` +
      `Hola${n} — sabemos que la ventana de NowPayments de ayer fue confusa. ` +
      `Reabrimos todo en un solo lugar:\n\n` +
      `💳 Tarjeta · Apple Pay\n💎 Wallet PNPtv\n₿ BTC / ETH / USDC / USDT\n🎫 Ru$h 💎\n\n` +
      `👉 <a href="${WEBAPP_URL}/subscribe">pnptv.app/subscribe</a>\n\n` +
      `Sin apuro. Lifetime PRIME sigue en $100 esta semana. 🖤`
    );
  }
  return (
    `🖤 <b>We made paying easier</b>\n\n` +
    `Hey${n} — we know yesterday's NowPayments window was confusing. ` +
    `We reopened everything in one place:\n\n` +
    `💳 Card · Apple Pay\n💎 PNPtv Wallet\n₿ BTC / ETH / USDC / USDT\n🎫 Ru$h 💎\n\n` +
    `👉 <a href="${WEBAPP_URL}/subscribe">pnptv.app/subscribe</a>\n\n` +
    `No pressure. Lifetime PRIME still $100 this week. 🖤`
  );
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
  // Anyone who was DM'd or TG'd in the original crypto-plans broadcast,
  // still active, still non-PRIME (they may have upgraded in the meantime).
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text  AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    JOIN broadcast_crypto_plans_2026_08_19 b ON b.user_id = u.id::text AND b.status='sent'
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime','pnp-member')
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at IS NULL OR ue.expires_at > NOW())
      )
    ORDER BY u.id
  `);
  return rows;
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  const tg = (!DRY && process.env.BOT_TOKEN) ? new Telegram(process.env.BOT_TOKEN) : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — recovery DM for crypto-plans broadcast');
  console.log(`  MODE : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const audience = await loadAudience();
  const withTg = audience.filter(u => u.telegram && String(u.telegram).trim());

  console.log(`  ${audience.length} original recipients still non-PRIME`);
  console.log(`  ${withTg.length} of those have telegram\n`);

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
    if (withTg[0]) {
      console.log(`\n  DRY sample TG (EN):`);
      console.log('  ─────');
      console.log(tgText(withTg[0].first_name || withTg[0].username || null, 'en'));
      console.log('  ─────');
    }
    console.log(`\n  DRY RUN — would process ${audience.length} user(s). Re-run with --live.\n`);
    process.exit(0);
  }

  const stats = { dm: 0, tg: 0, dmSkipped: 0, tgSkipped: 0, failed: 0 };

  for (let i = 0; i < audience.length; i++) {
    const row = audience[i];
    const name = row.first_name || row.username || null;
    const lang = row.language || 'en';

    if (await alreadySent(row.user_id, 'dm')) {
      stats.dmSkipped++;
    } else {
      try {
        await sendSystemDM(SYSTEM_SENDER, row.user_id, dmText(lang), query);
        stats.dm++;
        await log(row.user_id, 'dm', 'sent');
      } catch (err) {
        stats.failed++;
        await log(row.user_id, 'dm', 'failed', (err.message || '?').slice(0, 500));
      }
      await sleep(DM_DELAY_MS);
    }

    if (tg && row.telegram && String(row.telegram).trim()) {
      if (await alreadySent(row.user_id, 'tg')) {
        stats.tgSkipped++;
      } else {
        try {
          await tg.sendMessage(row.telegram, tgText(name, lang), { parse_mode: 'HTML' });
          stats.tg++;
          await log(row.user_id, 'tg', 'sent');
        } catch (err) {
          await log(row.user_id, 'tg', 'failed', (err.description || err.message || '?').slice(0, 500));
        }
        await sleep(TG_DELAY_MS);
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${audience.length}  dm=${stats.dm} tg=${stats.tg}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs sent   : ${stats.dm}`);
  console.log(`   In-app DMs skipped: ${stats.dmSkipped}`);
  console.log(`   Telegram DMs sent : ${stats.tg}`);
  console.log(`   Telegram skipped  : ${stats.tgSkipped}`);
  console.log(`   In-app DM failed  : ${stats.failed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
