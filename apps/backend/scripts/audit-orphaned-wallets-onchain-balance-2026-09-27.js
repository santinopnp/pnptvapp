#!/usr/bin/env node
'use strict';
/**
 * audit-orphaned-wallets-onchain-balance-2026-09-27.js
 *
 * For each of the 137 exported-key orphaned wallets, query Base RPC to check
 * USDC + ETH balances. Identifies which orphans actually have stranded funds
 * and calculates total exposure for user outreach prioritization.
 *
 * Requires audit-orphaned-privy-wallets-2026-09-27.js to have been run first
 * to generate the orphan list. Can either:
 *   1. Feed orphan addresses via stdin (pipe from audit script with --with-export)
 *   2. Or hard-code a list of addresses below
 *
 * Usage:
 *   node audit-orphaned-wallets-onchain-balance-2026-09-27.js < orphan-addresses.txt
 *   OR
 *   docker exec pnptv-bot node /tmp/audit-orphaned-wallets-onchain-balance-2026-09-27.js
 */

const https = require('https');

function baseRpcUrl() {
  const key = process.env.ALCHEMY_API_KEY;
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : 'https://mainnet.base.org';
}

const RPC_URL = baseRpcUrl();
const USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDC_DECIMALS = 6;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url = new URL(RPC_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('RPC parse: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function readUsdc(addr) {
  const padded = addr.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = '0x70a08231' + padded;
  const r = await rpcCall('eth_call', [{ to: USDC_CONTRACT, data }, 'latest']);
  if (r.error) throw new Error(r.error.message);
  return Number(BigInt(r.result || '0x0')) / Math.pow(10, USDC_DECIMALS);
}

async function readEth(addr) {
  const r = await rpcCall('eth_getBalance', [addr.toLowerCase(), 'latest']);
  if (r.error) throw new Error(r.error.message);
  return Number(BigInt(r.result || '0x0')) / 1e18;
}

async function fetchEthUsd() {
  try {
    const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    const j = await r.json();
    const n = Number(j?.data?.amount);
    return (Number.isFinite(n) && n > 0) ? n : null;
  } catch { return null; }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' ORPHANED WALLETS: ON-CHAIN BALANCE CHECK');
  console.log('══════════════════════════════════════════════════════\n');

  const ethUsd = await fetchEthUsd();
  console.log(` ETH spot price: ${ethUsd ? `$${ethUsd.toFixed(2)}` : 'unavailable'}\n`);

  // Parse stdin or use pre-loaded list
  let orphanAddresses = [];
  if (process.stdin.isTTY) {
    // No stdin piped; either use hardcoded list or error
    console.error(' ⚠ No orphan addresses provided. Pipe from audit-orphaned-privy-wallets-2026-09-27.js');
    console.error('   Example: node audit-orphaned-privy-wallets-2026-09-27.js --with-export | ...\n');
    process.exit(1);
  } else {
    // Read from stdin (piped output from audit script)
    const lines = require('fs').readFileSync(0, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/0x[a-fA-F0-9]{40}/);
      if (match) orphanAddresses.push(match[0]);
    }
  }

  console.log(` Checking ${orphanAddresses.length} orphaned wallets…\n`);

  const wallets = [];
  const stats = { checked: 0, nonZero: 0, usdc: 0, eth: 0, error: 0 };

  for (const addr of orphanAddresses) {
    stats.checked++;
    let usdc = 0, eth = 0;
    try {
      usdc = await readUsdc(addr);
      await sleep(100);
      if (ethUsd != null) {
        eth = await readEth(addr);
        await sleep(100);
      }
    } catch (err) {
      console.warn(` ${addr} — balance error: ${err.message}`);
      stats.error++;
      continue;
    }

    const usdcUsd = usdc;
    const ethUsdVal = eth * (ethUsd || 0);
    const total = usdcUsd + ethUsdVal;

    if (total > 0) {
      stats.nonZero++;
      if (usdc > 0) stats.usdc++;
      if (eth > 0.0001) stats.eth++;

      wallets.push({
        address: addr,
        usdc,
        eth,
        usdcUsd,
        ethUsdVal,
        total,
      });
    }

    if (stats.checked % 10 === 0) {
      process.stderr.write(`  … ${stats.checked}/${orphanAddresses.length} checked\n`);
    }
  }

  // Sort by total USD value descending
  wallets.sort((a, b) => b.total - a.total);

  console.log('\n' + '█'.repeat(78));
  console.log(`  WALLETS WITH STRANDED FUNDS (${wallets.length} / ${orphanAddresses.length} checked)`);
  console.log('█'.repeat(78));
  console.log(`  Checked    : ${stats.checked}`);
  console.log(`  Non-zero   : ${stats.nonZero}  ← funds stranded`);
  console.log(`  …with USDC : ${stats.usdc}`);
  console.log(`  …with ETH  : ${stats.eth}`);
  console.log(`  Errors     : ${stats.error}`);
  console.log('─'.repeat(78));

  if (wallets.length > 0) {
    const totalExposure = wallets.reduce((sum, w) => sum + w.total, 0);
    console.log(`\n💰 TOTAL STRANDED: $${totalExposure.toFixed(2)}\n`);
    console.log('PRIORITY LIST (sorted by USD exposure)\n');
    console.log('  #  Address                                  USDC      ETH       Total USD');
    console.log('─'.repeat(78));
    wallets.slice(0, 50).forEach((w, i) => {
      const usdcStr = w.usdc.toFixed(2).padStart(8);
      const ethStr = w.eth.toFixed(6).padStart(8);
      const totalStr = w.total.toFixed(2).padStart(9);
      console.log(`  ${(i + 1).toString().padStart(2)} ${w.address}  ${usdcStr}  ${ethStr}  $${totalStr}`);
    });
    if (wallets.length > 50) {
      const remaining = wallets.slice(50);
      const remainingTotal = remaining.reduce((sum, w) => sum + w.total, 0);
      console.log('  …');
      console.log(`  +${remaining.length} more wallets with $${remainingTotal.toFixed(2)} total exposure`);
    }
  } else {
    console.log('\n  ✓ No stranded funds detected in checked orphaned wallets.');
  }

  console.log('\n' + '═'.repeat(78) + '\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
