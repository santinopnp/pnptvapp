#!/usr/bin/env node
'use strict';

/**
 * Reads the 118 users with a linked Privy wallet, checks USDC balance on
 * Base + Ethereum + Polygon + Arbitrum (via Alchemy), reports who's funded
 * and ready to spend. Pattern lifted from privyLinkService._oldWalletUsdBalance.
 *
 * Dry report only — no DMs. Feeds into the "spend-your-balance-on-Ru$h"
 * broadcast draft.
 *
 * Usage: node scan-funded-privy-wallets.js [--min=5]
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const { createPublicClient, http } = require('viem');
const viemChains = require('viem/chains');

const MIN = Number((process.argv.find(a => a.startsWith('--min=')) || '--min=5').split('=')[1]);

const USDC_BALANCE_ABI = [{
  inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
}];

const USDC_CHAINS = [
  { name: 'base',     chain: viemChains.base,     rpcHost: 'base-mainnet.g.alchemy.com',     fallback: 'https://mainnet.base.org',     address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { name: 'mainnet',  chain: viemChains.mainnet,  rpcHost: 'eth-mainnet.g.alchemy.com',      fallback: 'https://cloudflare-eth.com', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { name: 'polygon',  chain: viemChains.polygon,  rpcHost: 'polygon-mainnet.g.alchemy.com',  fallback: 'https://polygon-rpc.com',    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  { name: 'arbitrum', chain: viemChains.arbitrum, rpcHost: 'arb-mainnet.g.alchemy.com',      fallback: 'https://arb1.arbitrum.io/rpc', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
];

async function usdcBalance(address) {
  const key = process.env.ALCHEMY_API_KEY;
  const results = await Promise.allSettled(USDC_CHAINS.map(async (c) => {
    const rpc = key ? `https://${c.rpcHost}/v2/${key}` : c.fallback;
    const client = createPublicClient({ chain: c.chain, transport: http(rpc) });
    const raw = await client.readContract({
      address: c.address, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [address],
    });
    return { name: c.name, usd: Number(raw) / 1_000_000 };
  }));
  const perChain = {};
  let total = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { perChain[r.value.name] = r.value.usd; total += r.value.usd; }
    else { perChain[USDC_CHAINS[i].name] = null; }
  });
  return { total, perChain };
}

async function main() {
  const { rows } = await query(`
    SELECT id, username, first_name, COALESCE(language,'en') AS language, wallet_address, last_active
      FROM users
     WHERE wallet_address IS NOT NULL
       AND is_active = true
       AND role != 'banned'
     ORDER BY last_active DESC NULLS LAST
  `);

  console.log(`\nScanning ${rows.length} wallets (min threshold: $${MIN} USDC)...\n`);

  const funded = [];
  let scanned = 0;
  for (const u of rows) {
    try {
      const { total, perChain } = await usdcBalance(u.wallet_address);
      scanned++;
      if (total >= MIN) {
        funded.push({ ...u, total, perChain });
      }
      if (scanned % 20 === 0) console.log(`  ${scanned}/${rows.length} scanned, ${funded.length} funded so far`);
    } catch (err) {
      console.error(`  ✗ ${u.id} / ${u.wallet_address}: ${err.message}`);
    }
  }

  console.log(`\n═══ Funded wallets (>$${MIN} USDC) ═══`);
  console.log(`Total: ${funded.length} / ${rows.length} scanned\n`);

  funded.sort((a, b) => b.total - a.total);
  const buckets = { '≥$100': 0, '$50-100': 0, '$20-50': 0, '$10-20': 0, '$5-10': 0, '<$5': 0 };
  for (const f of funded) {
    if (f.total >= 100) buckets['≥$100']++;
    else if (f.total >= 50) buckets['$50-100']++;
    else if (f.total >= 20) buckets['$20-50']++;
    else if (f.total >= 10) buckets['$10-20']++;
    else if (f.total >= 5) buckets['$5-10']++;
    else buckets['<$5']++;
  }

  console.log('By bucket:');
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v}`);

  const byLang = { en: 0, es: 0 };
  let totalUsd = 0;
  for (const f of funded) {
    byLang[String(f.language).toLowerCase().startsWith('es') ? 'es' : 'en']++;
    totalUsd += f.total;
  }
  console.log(`\nBy language: EN ${byLang.en} · ES ${byLang.es}`);
  console.log(`Total USDC held across funded wallets: $${totalUsd.toFixed(2)}`);

  console.log('\nTop 10 by balance:');
  for (const f of funded.slice(0, 10)) {
    console.log(`  ${f.id.slice(0, 12).padEnd(14)}  ${f.wallet_address}  $${f.total.toFixed(2)}  @${f.username}`);
  }

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
