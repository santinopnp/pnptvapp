#!/usr/bin/env node
'use strict';

/**
 * scan-wallet-multichain-usdc-2026-10-05.js
 *
 * Follow-up to broadcast-wallet-funded-rush-2026-10-05.js (Base-only).
 * Scans USDC balances on Ethereum mainnet, Polygon, and Arbitrum for all
 * users with a linked PNPtv wallet.  Reports per-chain and totals.
 *
 * Users already messaged via the Base campaign (≥ $5 USDC on Base) are
 * flagged with [BASE] so we can see overlap.
 *
 * Usage:
 *   docker run --rm \
 *     --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e ALCHEMY_API_KEY="$(docker exec pnptv-bot printenv ALCHEMY_API_KEY)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/scan-wallet-multichain-usdc-2026-10-05.js
 */

const path  = require('path');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const ALCHEMY_KEY   = process.env.ALCHEMY_API_KEY;
const MIN_SHOW_USD  = 1.0;   // only print rows with ≥ $1 anywhere
const BASE_CAMPAIGN = 'wallet-funded-rush-2026-10-05';

const BAL_BATCH    = 8;   // concurrent per-chain calls
const BAL_DELAY_MS = 400; // between batches (4 chains × 8 concurrent = care for rate limits)

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Chain definitions ─────────────────────────────────────────────────────────

const CHAINS = [
  {
    name:    'Ethereum',
    short:   'ETH',
    usdc:    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    rpc:     ALCHEMY_KEY
      ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://cloudflare-eth.com',
    decimals: 6,
  },
  {
    name:    'Polygon',
    short:   'POL',
    usdc:    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    rpc:     ALCHEMY_KEY
      ? `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://polygon-rpc.com',
    decimals: 6,
  },
  {
    name:    'Arbitrum',
    short:   'ARB',
    usdc:    '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    rpc:     ALCHEMY_KEY
      ? `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://arb1.arbitrum.io/rpc',
    decimals: 6,
  },
  {
    name:    'Base',
    short:   'BASE',
    usdc:    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    rpc:     ALCHEMY_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://mainnet.base.org',
    decimals: 6,
  },
];

// ── RPC helper ────────────────────────────────────────────────────────────────

function getUsdcBalance(address, chain) {
  const data = '0x70a08231' + address.toLowerCase().replace('0x', '').padStart(64, '0');
  const payload = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: chain.usdc, data }, 'latest'],
  });

  return new Promise((resolve) => {
    const url = new URL(chain.rpc);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout:  10000,
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (json.error || !json.result || json.result === '0x') { resolve(0); return; }
          resolve(Number(BigInt(json.result)) / Math.pow(10, chain.decimals));
        } catch { resolve(0); }
      });
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.write(payload);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT u.id, u.username, u.first_name, u.wallet_address, u.telegram,
           CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.wallet_address IS NOT NULL
      AND u.wallet_address != ''
      AND u.is_deleted = false
      AND COALESCE(u.tier, 'free') != 'banned'
    ORDER BY u.created_at DESC
  `);

  // Who was already messaged via the Base campaign
  const { rows: baseSent } = await query(
    `SELECT user_id FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [`${BASE_CAMPAIGN}%`]
  );
  const baseSentSet = new Set(baseSent.map(r => String(r.user_id)));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — Multi-chain USDC wallet scan · 2026-10-05');
  console.log(`  Wallets to scan : ${users.length}`);
  console.log(`  Chains          : ${CHAINS.map(c => c.short).join(' · ')}`);
  console.log(`  Already Base-DM'd: ${baseSentSet.size} users`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = [];

  for (let i = 0; i < users.length; i += BAL_BATCH) {
    const batch = users.slice(i, i + BAL_BATCH);

    // Check all 4 chains in parallel for this batch of users
    const batchResults = await Promise.all(
      batch.map(async (u) => {
        const bals = await Promise.all(CHAINS.map(c => getUsdcBalance(u.wallet_address, c)));
        const chainBals = {};
        CHAINS.forEach((c, j) => { chainBals[c.short] = bals[j]; });
        const total = bals.reduce((s, b) => s + b, 0);
        return { ...u, chainBals, total };
      })
    );

    batchResults.forEach(r => {
      process.stdout.write(`  ${r.wallet_address.slice(0, 10)}…  @${(r.username || r.id).slice(0, 16).padEnd(16)}  `);
      CHAINS.forEach(c => {
        const v = r.chainBals[c.short];
        process.stdout.write(`${c.short}:$${v.toFixed(2).padStart(7)}  `);
      });
      process.stdout.write(`TOTAL:$${r.total.toFixed(2)}`);
      if (baseSentSet.has(String(r.id))) process.stdout.write('  [BASE✓]');
      process.stdout.write('\n');
    });

    results.push(...batchResults);
    if (i + BAL_BATCH < users.length) await sleep(BAL_DELAY_MS);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const nonBase = results.filter(r => {
    const ethPlusPlusTotal = (r.chainBals.ETH || 0) + (r.chainBals.POL || 0) + (r.chainBals.ARB || 0);
    return ethPlusPlusTotal >= MIN_SHOW_USD;
  }).sort((a, b) => {
    const aOther = (a.chainBals.ETH||0)+(a.chainBals.POL||0)+(a.chainBals.ARB||0);
    const bOther = (b.chainBals.ETH||0)+(b.chainBals.POL||0)+(b.chainBals.ARB||0);
    return bOther - aOther;
  });

  const baseOnly = results.filter(r => {
    return (r.chainBals.BASE||0) >= MIN_SHOW_USD &&
      (r.chainBals.ETH||0) + (r.chainBals.POL||0) + (r.chainBals.ARB||0) < MIN_SHOW_USD;
  });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  USERS WITH USDC ON ETH/POL/ARB (≥ $${MIN_SHOW_USD}):`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (nonBase.length === 0) {
    console.log('  (none found)');
  } else {
    nonBase.forEach(r => {
      const other = (r.chainBals.ETH||0)+(r.chainBals.POL||0)+(r.chainBals.ARB||0);
      const breakdown = CHAINS.filter(c => c.short !== 'BASE' && r.chainBals[c.short] >= 0.01)
        .map(c => `${c.short}:$${r.chainBals[c.short].toFixed(2)}`)
        .join(' + ');
      const baseDm = baseSentSet.has(String(r.id)) ? ' [already Base-DM\'d]' : '';
      console.log(`  @${(r.username || r.id).padEnd(20)}  ${breakdown.padEnd(28)}  total non-Base: $${other.toFixed(2)}${baseDm}`);
    });
  }

  const totalEth = results.reduce((s, r) => s + (r.chainBals.ETH||0), 0);
  const totalPol = results.reduce((s, r) => s + (r.chainBals.POL||0), 0);
  const totalArb = results.reduce((s, r) => s + (r.chainBals.ARB||0), 0);
  const totalBase= results.reduce((s, r) => s + (r.chainBals.BASE||0), 0);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TOTALS ACROSS ALL WALLETS:');
  console.log(`    Ethereum  : $${totalEth.toFixed(2)}`);
  console.log(`    Polygon   : $${totalPol.toFixed(2)}`);
  console.log(`    Arbitrum  : $${totalArb.toFixed(2)}`);
  console.log(`    Base      : $${totalBase.toFixed(2)}`);
  console.log(`    GRAND TOTAL: $${(totalEth+totalPol+totalArb+totalBase).toFixed(2)}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
