#!/usr/bin/env node
'use strict';

/**
 * notify-creators-wallet-balance-20260915.js
 *
 * One-shot: find all creators whose Privy embedded wallets hold >= $1 USDC
 * on Base, then send each a push notification directing them to spend it on
 * PNPtv via the creator dashboard.
 *
 * Eligible creators: creator_status IN ('active','eligible') OR role = 'creator'
 *   AND privy_id IS NOT NULL
 *   AND wallet_address IS NOT NULL (42-char EVM address)
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/notify-creators-wallet-balance-20260915.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/notify-creators-wallet-balance-20260915.js
 */

require('dotenv').config({ path: '/opt/pnptvapp/.env' });
require('dotenv').config({ path: '/opt/pnptvapp/.env.production', override: true });

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN       = process.argv.includes('--dry-run');
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MIN_USDC      = 1.0;          // only notify creators with >= $1 USDC
const RPC_DELAY_MS  = 150;          // courtesy delay between RPC calls
const NOTIF_TYPE    = 'promotions';

// ── Alchemy RPC helper ────────────────────────────────────────────────────────

function alchemyRpcUrl() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('ALCHEMY_API_KEY is not set in environment');
  return `https://base-mainnet.g.alchemy.com/v2/${key}`;
}

async function rpcCall(url, method, params) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`Alchemy RPC HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`Alchemy RPC error ${json.error.code}: ${json.error.message}`);
  }
  return json.result;
}

/**
 * Return the USDC balance (human-readable, 6 decimals) for `addr` on Base.
 * balanceOf(address) selector: 0x70a08231
 * @param {string} rpcUrl
 * @param {string} addr  42-char EVM address, e.g. "0xABCD…"
 * @returns {Promise<number>}
 */
async function usdcBalance(rpcUrl, addr) {
  const padded = addr.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const data   = '0x70a08231' + padded;
  const result = await rpcCall(rpcUrl, 'eth_call', [
    { to: USDC_CONTRACT, data },
    'latest',
  ]);
  if (!result || result === '0x') return 0;
  return parseInt(result, 16) / 1_000_000;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  notify-creators-wallet-balance-20260915');
  console.log(`  MODE: ${DRY_RUN ? 'DRY RUN (no pushes sent)' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════\n');

  await initializePostgres();
  PushNotificationService.initialize();

  const rpcUrl = alchemyRpcUrl();

  // Fetch eligible creators that have both a privy_id and a wallet_address
  const { rows: creators } = await query(`
    SELECT id, username, creator_status, role, wallet_address
      FROM users
     WHERE privy_id IS NOT NULL
       AND wallet_address IS NOT NULL
       AND char_length(wallet_address) = 42
       AND (
             creator_status IN ('active', 'eligible')
             OR role = 'creator'
           )
       AND deleted_at IS NULL
       AND COALESCE(tier, 'free') <> 'banned'
     ORDER BY username
  `);

  console.log(`[wallet-nudge] ${creators.length} eligible creator(s) with wallet_address + privy_id found\n`);

  if (creators.length === 0) {
    console.log('[wallet-nudge] Nothing to do — exiting.');
    process.exit(0);
  }

  let checked = 0;
  let skippedLowBalance = 0;
  let totalSent = 0;
  let totalFailed = 0;

  for (const creator of creators) {
    checked++;

    let balance = 0;
    try {
      balance = await usdcBalance(rpcUrl, creator.wallet_address);
    } catch (err) {
      console.error(
        `[wallet-nudge] RPC error for @${creator.username} (${creator.wallet_address}): ${err.message}`
      );
      // Don't send push when balance is unknown
      await new Promise(r => setTimeout(r, RPC_DELAY_MS));
      continue;
    }

    const balanceFormatted = balance.toFixed(2);
    const label = `@${creator.username} [${creator.wallet_address.slice(0, 10)}…] — $${balanceFormatted} USDC`;

    if (balance < MIN_USDC) {
      console.log(`  [skip] ${label}  (below $${MIN_USDC} threshold)`);
      skippedLowBalance++;
      await new Promise(r => setTimeout(r, RPC_DELAY_MS));
      continue;
    }

    // Build per-creator notification
    const notification = {
      title:     `Your wallet has $${balanceFormatted} USDC`,
      body:      `Convert it to Ru$h 💎 and spend it on PNPtv — one tap from your dashboard`,
      url:       '/creators',
      tag:       `wallet-spend-nudge-${creator.id}`,
      notifType: NOTIF_TYPE,
    };

    if (DRY_RUN) {
      console.log(`  [dry-run] WOULD PUSH → ${label}`);
      console.log(`            title: "${notification.title}"`);
      console.log(`            body:  "${notification.body}"`);
      totalSent++;
    } else {
      const sent = await PushNotificationService.sendToUser(
        creator.id,
        notification,
        { notifType: NOTIF_TYPE }
      );
      if (sent > 0) {
        console.log(`  [sent]   ${label}  → ${sent} device(s)`);
        totalSent++;
      } else {
        console.log(`  [no-sub] ${label}  — no active push subscriptions`);
        totalFailed++;
      }
    }

    await new Promise(r => setTimeout(r, RPC_DELAY_MS));
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Checked:              ${checked}`);
  console.log(`  Skipped (< $${MIN_USDC}):     ${skippedLowBalance}`);
  if (DRY_RUN) {
    console.log(`  Would notify:         ${totalSent}`);
  } else {
    console.log(`  Push sent:            ${totalSent}`);
    console.log(`  No subscriptions:     ${totalFailed}`);
  }
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch(err => {
  console.error('[wallet-nudge] FATAL:', err);
  process.exit(1);
});
