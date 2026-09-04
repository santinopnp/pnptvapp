#!/usr/bin/env node
'use strict';

/**
 * audit-user-wallets-multichain-2026-09-04.js
 *
 * For every users.wallet_address (Privy-managed) AND users.preferred_wallet_address
 * that differs, checks on-chain balances across 6 EVM chains × (native + USDC + USDT)
 * and outputs a JSON dump of funded, PNPtv-DB-matched users.
 *
 * Read-only. No DMs.
 */

const path = require('path');
const fs = require('fs');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const CHAINS = [
  { name: 'eth',      rpc: 'https://ethereum-rpc.publicnode.com',           nativePriceUsd: 2500, nativeSymbol: 'ETH',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  { name: 'base',     rpc: 'https://mainnet.base.org',                       nativePriceUsd: 2500, nativeSymbol: 'ETH',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdt: null },
  { name: 'polygon',  rpc: 'https://polygon-rpc.com',                        nativePriceUsd: 0.50, nativeSymbol: 'MATIC',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    usdcBridged: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  { name: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc',                   nativePriceUsd: 2500, nativeSymbol: 'ETH',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    usdcBridged: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  { name: 'optimism', rpc: 'https://mainnet.optimism.io',                    nativePriceUsd: 2500, nativeSymbol: 'ETH',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    usdt: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
  { name: 'bsc',      rpc: 'https://bsc-dataseed.binance.org',               nativePriceUsd: 600, nativeSymbol: 'BNB',
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdt: '0x55d398326f99059fF775485246999027B3197955' },
];

async function rpcCall(url, method, params) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await r.json();
    return j.result;
  } catch { return null; }
}

async function balanceOfErc20(rpc, contract, addr) {
  const data = '0x70a08231000000000000000000000000' + addr.replace(/^0x/, '').toLowerCase();
  const res = await rpcCall(rpc, 'eth_call', [{ to: contract, data }, 'latest']);
  return res && res !== '0x' ? parseInt(res, 16) / 1e6 : 0;
}

async function balanceOfNative(rpc, addr) {
  const res = await rpcCall(rpc, 'eth_getBalance', [addr, 'latest']);
  return res && res !== '0x' ? parseInt(res, 16) / 1e18 : 0;
}

async function checkOneChain(chain, addr) {
  const [nat, usdc, usdcB, usdt] = await Promise.all([
    balanceOfNative(chain.rpc, addr),
    chain.usdc ? balanceOfErc20(chain.rpc, chain.usdc, addr) : 0,
    chain.usdcBridged ? balanceOfErc20(chain.rpc, chain.usdcBridged, addr) : 0,
    chain.usdt ? balanceOfErc20(chain.rpc, chain.usdt, addr) : 0,
  ]);
  const usd = nat * chain.nativePriceUsd + usdc + usdcB + usdt;
  return { chain: chain.name, native: nat, nativeSymbol: chain.nativeSymbol, usdc, usdcBridged: usdcB, usdt, usd };
}

async function auditAddress(addr) {
  const results = await Promise.all(CHAINS.map(c => checkOneChain(c, addr).catch(() => null)));
  const perChain = results.filter(Boolean);
  const total_usd = perChain.reduce((s, r) => s + (r.usd || 0), 0);
  return { total_usd, perChain };
}

async function main() {
  await initializePostgres();
  console.log('\n[Multi-chain user wallet audit]\n');
  const rows = (await query(`
    SELECT id, username, first_name, LOWER(COALESCE(language,'en')) AS language,
           LOWER(wallet_address) AS wallet_address,
           LOWER(NULLIF(preferred_wallet_address,'')) AS preferred_wallet_address,
           tier, telegram
    FROM users
    WHERE COALESCE(is_deleted,false) = false
      AND wallet_address IS NOT NULL
      AND wallet_address <> ''
  `)).rows;

  console.log(`  Users with wallets: ${rows.length}\n  Checking 6 chains × 3 tokens each...`);

  const findings = [];
  const CHUNK = 6;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const audits = await Promise.all(batch.map(async (u) => {
      const addrs = [u.wallet_address, u.preferred_wallet_address].filter(Boolean)
        .filter((a, idx, arr) => arr.indexOf(a) === idx);
      const perAddr = await Promise.all(addrs.map(a => auditAddress(a).then(r => ({ address: a, ...r }))));
      const total_usd = perAddr.reduce((s, r) => s + r.total_usd, 0);
      return { ...u, addrs: perAddr, total_usd };
    }));
    for (const a of audits) findings.push(a);
    process.stdout.write(`\r  Checked ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n\n');

  const funded = findings.filter(f => f.total_usd >= 0.50).sort((a, b) => b.total_usd - a.total_usd);
  const totalUsd = funded.reduce((s, f) => s + f.total_usd, 0);
  console.log(`  Funded users (>=$0.50): ${funded.length}`);
  console.log(`  Total $ across their wallets: $${totalUsd.toFixed(2)}\n`);

  const bySeg = { big: 0, mid: 0, small: 0, dust: 0 };
  const segs  = { big: [], mid: [], small: [], dust: [] };
  for (const f of funded) {
    if (f.total_usd >= 30)     { bySeg.big++;   segs.big.push(f); }
    else if (f.total_usd >= 5) { bySeg.mid++;   segs.mid.push(f); }
    else if (f.total_usd >= 1) { bySeg.small++; segs.small.push(f); }
    else                        { bySeg.dust++;  segs.dust.push(f); }
  }
  console.log(`  Segments: big(>=$30)=${bySeg.big}  mid($5-30)=${bySeg.mid}  small($1-5)=${bySeg.small}  dust=${bySeg.dust}\n`);

  console.log('=== FUNDED USERS (top 40) ===\n');
  console.log('username           | tier   |  total$ | telegram        | chains');
  console.log('-'.repeat(120));
  for (const f of funded.slice(0, 40)) {
    const chains = f.addrs.flatMap(a => a.perChain.filter(c => c.usd > 0.05).map(c => `${c.chain}:$${c.usd.toFixed(2)}`)).join(' ');
    console.log(
      String(f.username || f.first_name || f.id).slice(0, 18).padEnd(18), '|',
      String(f.tier || '-').padEnd(6), '|',
      ('$' + f.total_usd.toFixed(2)).padStart(8), '|',
      String(f.telegram || '-').padEnd(15), '|',
      chains
    );
  }

  const outFile = '/tmp/wallet_audit_multichain_2026_09_04.json';
  fs.writeFileSync(outFile, JSON.stringify({
    audited_at: new Date().toISOString(),
    total_users: rows.length,
    funded_count: funded.length,
    total_funded_usd: totalUsd,
    segments: bySeg,
    funded,
  }, null, 2));
  console.log(`\n  Full JSON: ${outFile}`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
