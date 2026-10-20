'use strict';
/**
 * Privy wallet dry-run — checks USDC balance across 4 EVM chains
 * for every wallet_address in the users table.
 * READS ONLY — does NOT modify any DB rows.
 *
 * Run from pnptv-bot container:
 *   node /app/scripts/privy-wallet-dryrun.js
 */

const { Pool } = require('pg');
const { createPublicClient, http } = require('viem');
const viemChains = require('viem/chains');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const USDC_CHAINS = [
  { name: 'ethereum', chain: 'mainnet',  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', rpcHost: 'eth-mainnet.g.alchemy.com', fallback: 'https://cloudflare-eth.com' },
  { name: 'base',     chain: 'base',     address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', rpcHost: 'base-mainnet.g.alchemy.com', fallback: 'https://mainnet.base.org' },
  { name: 'polygon',  chain: 'polygon',  address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', rpcHost: 'polygon-mainnet.g.alchemy.com', fallback: 'https://polygon-rpc.com' },
  { name: 'arbitrum', chain: 'arbitrum', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', rpcHost: 'arb-mainnet.g.alchemy.com', fallback: 'https://arb1.arbitrum.io/rpc' },
];
const BALANCE_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}];
const chainMap = { mainnet: viemChains.mainnet, base: viemChains.base, polygon: viemChains.polygon, arbitrum: viemChains.arbitrum };

async function checkBalance(address) {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const results = await Promise.allSettled(USDC_CHAINS.map(async (c) => {
    const rpc = alchemyKey ? `https://${c.rpcHost}/v2/${alchemyKey}` : c.fallback;
    const client = createPublicClient({ chain: chainMap[c.chain], transport: http(rpc) });
    const raw = await client.readContract({
      address: c.address, abi: BALANCE_ABI, functionName: 'balanceOf', args: [address],
    });
    return { name: c.name, usd: Number(raw) / 1_000_000 };
  }));

  let total = 0;
  const perChain = {};
  results.forEach((r, i) => {
    const cname = USDC_CHAINS[i].name;
    if (r.status === 'fulfilled') { perChain[cname] = r.value.usd; total += r.value.usd; }
    else { perChain[cname] = null; }
  });
  return { total, perChain };
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, wallet_address, wallet_lock_reason, privy_id
    FROM users
    WHERE wallet_address IS NOT NULL
    ORDER BY id
  `);

  console.log(`\n=== Privy Wallet Dry-Run — ${new Date().toISOString()} ===`);
  console.log(`Total wallet rows: ${rows.length}`);
  console.log(`Locked (skip clean): ${rows.filter(r => r.wallet_lock_reason).length}\n`);

  const funded = [];
  const zeros = [];
  const errors = [];
  let checked = 0;
  const BATCH = 10; // concurrent RPC calls per batch

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (row) => {
      try {
        const { total, perChain } = await checkBalance(row.wallet_address);
        checked++;
        if (total > 0.001) {
          funded.push({ id: row.id, wallet: row.wallet_address, total, perChain, locked: !!row.wallet_lock_reason });
        } else {
          zeros.push({ id: row.id, wallet: row.wallet_address, locked: !!row.wallet_lock_reason });
        }
      } catch (err) {
        errors.push({ id: row.id, wallet: row.wallet_address, error: err.message });
      }
    }));
    process.stdout.write(`\r  Checked ${checked}/${rows.length}...`);
  }
  console.log('\n');

  console.log(`=== RESULTS ===`);
  console.log(`  Checked:      ${checked}`);
  console.log(`  Zero balance: ${zeros.length}`);
  console.log(`  FUNDED:       ${funded.length}`);
  console.log(`  Errors:       ${errors.length}\n`);

  if (funded.length) {
    console.log(`=== FUNDED WALLETS (preserve these) ===`);
    for (const w of funded.sort((a, b) => b.total - a.total)) {
      const chains = Object.entries(w.perChain)
        .filter(([, v]) => v > 0.001)
        .map(([k, v]) => `${k}=$${v.toFixed(4)}`)
        .join(', ');
      console.log(`  $${w.total.toFixed(4).padStart(10)}  [${w.locked ? 'LOCKED' : 'active'}]  ${w.wallet}  (${chains})  user:${w.id}`);
    }
    console.log();
  }

  const cleanable = zeros.filter(w => !w.locked);
  const lockedZeros = zeros.filter(w => w.locked);
  console.log(`=== CLEANABLE (zero balance, not locked): ${cleanable.length} wallets ===`);
  console.log(`    (NULL-out wallet_address + privy_id in users table)`);
  if (lockedZeros.length) console.log(`    Locked rows with zero balance (will skip): ${lockedZeros.length}`);

  if (errors.length) {
    console.log(`\n=== ERRORS (RPC failures, treat as funded/preserve) ===`);
    for (const e of errors) console.log(`  ${e.wallet}  ${e.error}`);
  }

  console.log(`\nDry-run complete. No DB changes made.`);
  await pool.end();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
