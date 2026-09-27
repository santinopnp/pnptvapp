#!/usr/bin/env node
'use strict';
/**
 * audit-orphaned-wallets-mainnet-2026-09-27.js
 *
 * Same as the Base checker, but hits Ethereum L1 mainnet where KOBTON1-style
 * stranded funds typically sit (users bought USDC/ETH on Ethereum, then
 * their Privy account got migrated to Base without a fund sweep).
 *
 * Usage:
 *   docker exec -i pnptv-bot node /tmp/audit-orphaned-wallets-mainnet-2026-09-27.js < orphan-addresses.txt
 */

const https = require('https');

function ethRpcUrl() {
  const key = process.env.ALCHEMY_API_KEY;
  return key
    ? `https://eth-mainnet.g.alchemy.com/v2/${key}`
    : 'https://ethereum-rpc.publicnode.com';
}

const RPC_URL = ethRpcUrl();
const USDC_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDT_MAINNET = '0xdac17f958d2ee523a2206206994597c13d831ec7';
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

async function readErc20(contract, addr) {
  const padded = addr.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = '0x70a08231' + padded;
  const r = await rpcCall('eth_call', [{ to: contract, data }, 'latest']);
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
  console.log(' ORPHANED WALLETS: ETHEREUM L1 MAINNET BALANCE CHECK');
  console.log('══════════════════════════════════════════════════════\n');
  console.log(` RPC: ${RPC_URL.replace(/\/v2\/[^/]+/, '/v2/***')}\n`);

  const ethUsd = await fetchEthUsd();
  console.log(` ETH spot price: ${ethUsd ? `$${ethUsd.toFixed(2)}` : 'unavailable'}\n`);

  if (process.stdin.isTTY) {
    console.error(' ⚠ No addresses provided via stdin.');
    process.exit(1);
  }

  const lines = require('fs').readFileSync(0, 'utf-8').split('\n');
  const addrs = [];
  for (const line of lines) {
    const m = line.match(/0x[a-fA-F0-9]{40}/);
    if (m) addrs.push(m[0]);
  }
  const unique = [...new Set(addrs.map(a => a.toLowerCase()))];
  console.log(` Checking ${unique.length} unique addresses on Ethereum L1…\n`);

  const wallets = [];
  const stats = { checked: 0, nonZero: 0, error: 0 };

  for (const addr of unique) {
    stats.checked++;
    let usdc = 0, usdt = 0, eth = 0;
    try {
      usdc = await readErc20(USDC_MAINNET, addr);
      await sleep(150);
      usdt = await readErc20(USDT_MAINNET, addr);
      await sleep(150);
      if (ethUsd != null) {
        eth = await readEth(addr);
        await sleep(150);
      }
    } catch (err) {
      console.warn(` ${addr} — error: ${err.message}`);
      stats.error++;
      continue;
    }

    const ethUsdVal = eth * (ethUsd || 0);
    const total = usdc + usdt + ethUsdVal;

    if (total > 0.01) {
      stats.nonZero++;
      wallets.push({ address: addr, usdc, usdt, eth, ethUsdVal, total });
    }

    if (stats.checked % 10 === 0) {
      process.stderr.write(`  … ${stats.checked}/${unique.length} checked\n`);
    }
  }

  wallets.sort((a, b) => b.total - a.total);

  console.log('\n' + '█'.repeat(78));
  console.log(`  ETHEREUM L1 STRANDED (${wallets.length} / ${unique.length} checked)`);
  console.log('█'.repeat(78));
  console.log(`  Checked   : ${stats.checked}`);
  console.log(`  Non-zero  : ${stats.nonZero}`);
  console.log(`  Errors    : ${stats.error}`);
  console.log('─'.repeat(78));

  if (wallets.length > 0) {
    const total = wallets.reduce((s, w) => s + w.total, 0);
    console.log(`\n💰 TOTAL STRANDED ON L1: $${total.toFixed(2)}\n`);
    console.log('  #  Address                                       USDC      USDT      ETH        Total USD');
    console.log('─'.repeat(102));
    wallets.forEach((w, i) => {
      const usdcStr = w.usdc.toFixed(2).padStart(8);
      const usdtStr = w.usdt.toFixed(2).padStart(8);
      const ethStr = w.eth.toFixed(6).padStart(9);
      const totalStr = w.total.toFixed(2).padStart(10);
      console.log(`  ${(i + 1).toString().padStart(2)} ${w.address}  ${usdcStr}  ${usdtStr}  ${ethStr}   $${totalStr}`);
    });
  } else {
    console.log('\n  ✓ No stranded funds on Ethereum L1.');
  }

  console.log('\n' + '═'.repeat(78) + '\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
