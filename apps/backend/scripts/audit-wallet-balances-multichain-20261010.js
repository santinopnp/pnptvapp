#!/usr/bin/env node
'use strict';
/**
 * audit-wallet-balances-multichain-20261010.js
 *
 * Scans all wallet addresses linked to platform users (active + orphaned) across
 * Base, Ethereum, Polygon and Arbitrum. Checks ETH + USDC on each network.
 * Saves results to wallet_balance_snapshot and prints a report.
 *
 * Usage:
 *   node audit-wallet-balances-multichain-20261010.js [--dry-run]
 */

const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const crypto = require('crypto');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/ioredis'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN  = process.argv.includes('--dry-run');
const ALCHEMY  = process.env.ALCHEMY_API_KEY;
const RUN_ID   = `run-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;

// ── Network configs ──────────────────────────────────────────────────────────
const NETWORKS = [
  {
    key:      'base',
    rpc:      `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
    usdc:     '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    decimals: 6,
  },
  {
    key:      'ethereum',
    rpc:      `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
    usdc:     '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
  },
  {
    key:      'polygon',
    rpc:      `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
    usdc:     '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    decimals: 6,
  },
  {
    key:      'arbitrum',
    rpc:      `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
    usdc:     '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
  },
];

// ── RPC helpers ──────────────────────────────────────────────────────────────
function rpcCall(rpcUrl, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url  = new URL(rpcUrl);
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('RPC parse error: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('RPC timeout')); });
    req.write(body);
    req.end();
  });
}

async function getEthBalance(rpcUrl, addr) {
  try {
    const r = await rpcCall(rpcUrl, 'eth_getBalance', [addr.toLowerCase(), 'latest']);
    return Number(BigInt(r.result || '0x0')) / 1e18;
  } catch { return 0; }
}

async function getUsdcBalance(rpcUrl, usdcContract, decimals, addr) {
  try {
    const padded = addr.toLowerCase().replace('0x', '').padStart(64, '0');
    const data   = '0x70a08231' + padded;
    const r      = await rpcCall(rpcUrl, 'eth_call', [{ to: usdcContract, data }, 'latest']);
    return Number(BigInt(r.result || '0x0')) / Math.pow(10, decimals);
  } catch { return 0; }
}

async function fetchEthUsdPrice() {
  try {
    const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    const j = await r.json();
    const n = Number(j?.data?.amount);
    return (Number.isFinite(n) && n > 0) ? n : 2500;
  } catch { return 2500; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await initializePostgres();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(` WALLET BALANCE AUDIT — MULTICHAIN`);
  console.log(` RUN ID : ${RUN_ID}`);
  console.log(` MODE   : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // 1. Collect all wallet addresses from DB
  const { rows: activeWallets } = await query(`
    SELECT DISTINCT
      u.id   AS user_id,
      lower(addr) AS wallet_address,
      false  AS is_orphaned
    FROM users u
    CROSS JOIN LATERAL (VALUES
      (u.wallet_address),
      (u.preferred_wallet_address),
      (u.previous_wallet_address),
      (u.creator_wallet_address)
    ) AS w(addr)
    WHERE u.is_deleted = false
      AND addr IS NOT NULL
      AND addr <> ''
      AND addr ~ '^0x[0-9a-fA-F]{40}$'
  `);

  const { rows: orphanWallets } = await query(`
    SELECT
      pnptv_user_id AS user_id,
      lower(wallet_address) AS wallet_address,
      true AS is_orphaned
    FROM deleted_privy_accounts
    WHERE wallet_address IS NOT NULL
      AND wallet_address <> ''
      AND wallet_address ~ '^0x[0-9a-fA-F]{40}$'
  `);

  // Deduplicate: same address may appear under active + orphaned
  const seen    = new Set();
  const wallets = [];
  for (const w of [...activeWallets, ...orphanWallets]) {
    if (!seen.has(w.wallet_address)) {
      seen.add(w.wallet_address);
      wallets.push(w);
    }
  }

  console.log(`  Active user wallets  : ${activeWallets.length}`);
  console.log(`  Orphaned wallets     : ${orphanWallets.length}`);
  console.log(`  Unique addresses     : ${wallets.length}`);
  console.log(`  Networks             : ${NETWORKS.map(n => n.key).join(', ')}\n`);

  const ethPrice = await fetchEthUsdPrice();
  console.log(`  ETH/USD price        : $${ethPrice.toFixed(2)}\n`);

  if (DRY_RUN) {
    console.log('  DRY RUN — skipping on-chain queries.\n');
    process.exit(0);
  }

  // 2. Scan each address × network
  const results   = [];
  let totalChecked = 0;

  for (const w of wallets) {
    for (const net of NETWORKS) {
      const [ethBal, usdcBal] = await Promise.all([
        getEthBalance(net.rpc, w.wallet_address),
        getUsdcBalance(net.rpc, net.usdc, net.decimals, w.wallet_address),
      ]);
      const totalUsd = (ethBal * ethPrice) + usdcBal;

      results.push({
        user_id:        w.user_id || null,
        wallet_address: w.wallet_address,
        network:        net.key,
        eth_balance:    ethBal,
        usdc_balance:   usdcBal,
        eth_usd_price:  ethPrice,
        total_usd_value: totalUsd,
        is_orphaned:    w.is_orphaned,
      });

      totalChecked++;
      if (totalChecked % 50 === 0) {
        console.log(`  checked ${totalChecked}/${wallets.length * NETWORKS.length}...`);
      }

      await sleep(120); // avoid Alchemy rate limit
    }
  }

  // 3. Save to DB
  console.log(`\n  Saving ${results.length} rows to wallet_balance_snapshot...`);
  let saved = 0;
  for (const r of results) {
    await query(
      `INSERT INTO wallet_balance_snapshot
         (user_id, wallet_address, network, eth_balance, usdc_balance, eth_usd_price,
          total_usd_value, is_orphaned, run_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [r.user_id, r.wallet_address, r.network, r.eth_balance, r.usdc_balance,
       r.eth_usd_price, r.total_usd_value, r.is_orphaned, RUN_ID]
    );
    saved++;
  }
  console.log(`  Saved ${saved} rows.\n`);

  // 4. Report — addresses with any funds
  const withFunds = results.filter(r => r.total_usd_value > 0.01);
  const byAddress = {};
  for (const r of withFunds) {
    if (!byAddress[r.wallet_address]) byAddress[r.wallet_address] = { ...r, networks: [] };
    byAddress[r.wallet_address].networks.push({
      network: r.network, eth: r.eth_balance, usdc: r.usdc_balance, usd: r.total_usd_value,
    });
    byAddress[r.wallet_address].total_usd_value =
      (byAddress[r.wallet_address].total_usd_value || 0) +
      (r.network === byAddress[r.wallet_address].network ? 0 : r.total_usd_value);
  }

  // Recompute total across all networks per address
  const summary = [];
  for (const [addr, data] of Object.entries(byAddress)) {
    const totalAcrossNets = results
      .filter(r => r.wallet_address === addr)
      .reduce((s, r) => s + r.total_usd_value, 0);
    summary.push({ ...data, total_all_networks: totalAcrossNets });
  }
  summary.sort((a, b) => b.total_all_networks - a.total_all_networks);

  console.log('══════════════════════════════════════════════════════════════');
  console.log(` ADDRESSES WITH FUNDS (${summary.length} of ${wallets.length})`);
  console.log('══════════════════════════════════════════════════════════════\n');

  let grandTotal = 0;
  for (const s of summary) {
    grandTotal += s.total_all_networks;
    const tag = s.is_orphaned ? '[ORPHAN]' : `[user:${s.user_id}]`;
    console.log(`  ${s.wallet_address}  ${tag}`);
    for (const n of s.networks) {
      if (n.usd > 0.01) {
        console.log(`    ${n.network.padEnd(10)} ETH: ${n.eth.toFixed(6)}  USDC: ${n.usdc.toFixed(2)}  ≈ $${n.usd.toFixed(2)}`);
      }
    }
    console.log(`    TOTAL: $${s.total_all_networks.toFixed(2)}\n`);
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log(` SUMMARY`);
  console.log(`  Addresses scanned    : ${wallets.length}`);
  console.log(`  Addresses with funds : ${summary.length}`);
  console.log(`  Total USD detected   : $${grandTotal.toFixed(2)}`);
  console.log(`  Orphaned with funds  : ${summary.filter(s => s.is_orphaned).length}`);
  console.log(`  Active users w/funds : ${summary.filter(s => !s.is_orphaned).length}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
