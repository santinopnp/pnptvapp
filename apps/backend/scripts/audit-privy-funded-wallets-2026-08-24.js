#!/usr/bin/env node
'use strict';

/**
 * audit-privy-funded-wallets-2026-08-24.js
 *
 * Walks ALL Privy users via API, extracts EVM wallet addresses, checks
 * on-chain balances on Base + Ethereum mainnet (USDC + ETH), reports
 * funded wallets and cross-references with our internal users table.
 *
 * Read-only. No DMs sent. Produces a JSON dump for downstream targeting.
 */

const path = require('path');
const fs   = require('fs');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const PRIVY_ID     = process.env.PRIVY_APP_ID;
const PRIVY_SECRET = process.env.PRIVY_APP_SECRET;
if (!PRIVY_ID || !PRIVY_SECRET) { console.error('Missing Privy creds'); process.exit(1); }
const PRIVY_AUTH = 'Basic ' + Buffer.from(PRIVY_ID + ':' + PRIVY_SECRET).toString('base64');

const RPC_BASE = 'https://mainnet.base.org';
const RPC_ETH  = 'https://ethereum-rpc.publicnode.com';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ETH  = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ETH_PRICE = 2500;

async function listAllPrivyUsers() {
  const users = [];
  let cursor = null;
  let page = 0;
  while (true) {
    const url = `https://auth.privy.io/api/v1/users?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: PRIVY_AUTH, 'privy-app-id': PRIVY_ID } });
    if (!r.ok) {
      const t = await r.text();
      console.error('Privy list failed', r.status, t.slice(0, 200));
      break;
    }
    const j = await r.json();
    users.push(...(j.data || []));
    page++;
    process.stdout.write(`\r  Fetched ${users.length} Privy users (page ${page})`);
    if (!j.next_cursor) break;
    cursor = j.next_cursor;
    if (page > 200) { console.warn('safety break at 200 pages'); break; }
  }
  process.stdout.write('\n');
  return users;
}

async function rpcCall(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  return j.result;
}

async function balanceOfUsdc(rpc, contract, addr) {
  const data = '0x70a08231000000000000000000000000' + addr.replace(/^0x/, '').toLowerCase();
  const res = await rpcCall(rpc, 'eth_call', [{ to: contract, data }, 'latest']);
  return res ? parseInt(res, 16) / 1e6 : 0;
}

async function balanceOfEth(rpc, addr) {
  const res = await rpcCall(rpc, 'eth_getBalance', [addr, 'latest']);
  return res ? parseInt(res, 16) / 1e18 : 0;
}

async function walletTotal(addr) {
  try {
    const [uB, eB, uE, eE] = await Promise.all([
      balanceOfUsdc(RPC_BASE, USDC_BASE, addr).catch(() => 0),
      balanceOfEth(RPC_BASE, addr).catch(() => 0),
      balanceOfUsdc(RPC_ETH, USDC_ETH, addr).catch(() => 0),
      balanceOfEth(RPC_ETH, addr).catch(() => 0),
    ]);
    return { usdc_base: uB, eth_base: eB, usdc_eth: uE, eth_eth: eE, total_usd: uB + uE + (eB + eE) * ETH_PRICE };
  } catch (e) {
    return { usdc_base: 0, eth_base: 0, usdc_eth: 0, eth_eth: 0, total_usd: 0, err: e.message };
  }
}

async function main() {
  console.log('\n[Privy funded-wallet audit]\n');
  const users = await listAllPrivyUsers();
  console.log(`  Total Privy users: ${users.length}\n`);

  // Extract EVM wallets
  const wallets = [];
  for (const u of users) {
    const primaryEmail  = (u.linked_accounts || []).find(a => a.type === 'email')?.address || null;
    const twitterHandle = (u.linked_accounts || []).find(a => a.type === 'twitter_oauth')?.username || null;
    for (const acc of (u.linked_accounts || [])) {
      if (acc.type === 'wallet' && acc.chain_type === 'ethereum' && acc.address) {
        wallets.push({
          privy_user_id: u.id.replace(/^did:privy:/, ''),
          address: acc.address.toLowerCase(),
          email: primaryEmail,
          twitter: twitterHandle,
          wallet_client: acc.wallet_client_type || acc.wallet_client,
          imported: !!acc.imported,
        });
      }
    }
  }
  console.log(`  EVM wallets found: ${wallets.length}\n`);

  // Batch on-chain balance check (concurrency 8)
  console.log('  Checking on-chain balances...');
  const chunk = 8;
  const results = [];
  for (let i = 0; i < wallets.length; i += chunk) {
    const batch = wallets.slice(i, i + chunk);
    const bals = await Promise.all(batch.map(w => walletTotal(w.address)));
    for (let j = 0; j < batch.length; j++) results.push({ ...batch[j], ...bals[j] });
    if (i % 40 === 0) process.stdout.write(`\r  Checked ${Math.min(i + chunk, wallets.length)}/${wallets.length}`);
  }
  process.stdout.write('\n');

  const funded = results.filter(r => r.total_usd > 0.5).sort((a, b) => b.total_usd - a.total_usd);
  console.log(`\n  Funded wallets (>$0.50): ${funded.length}`);
  console.log(`  Total $ locked in Privy wallets: $${funded.reduce((s, r) => s + r.total_usd, 0).toFixed(2)}\n`);

  // Cross-reference with our users table
  await initializePostgres();
  const knownRows = await query(`
    SELECT id AS internal_id, username, first_name, LOWER(COALESCE(language,'en')) AS language,
           LOWER(wallet_address) AS wallet_address, privy_id
    FROM users
    WHERE COALESCE(is_deleted,false) = false
      AND (wallet_address IS NOT NULL OR privy_id IS NOT NULL)
  `);
  const byAddr = new Map();
  const byPrivyId = new Map();
  for (const row of knownRows.rows) {
    if (row.wallet_address) byAddr.set(row.wallet_address, row);
    if (row.privy_id) byPrivyId.set(row.privy_id, row);
  }

  console.log('=== TOP 30 FUNDED PRIVY WALLETS ===\n');
  console.log('handle              | address             | usdc_base | usdc_eth | eth_base | eth_eth | ~USD    | our_user?');
  console.log('-'.repeat(140));
  for (const w of funded.slice(0, 30)) {
    const match = byAddr.get(w.address) || byPrivyId.get(w.privy_user_id);
    const handle = w.twitter ? '@' + w.twitter : (w.email || '(anonymous)').slice(0, 20);
    const ours   = match ? (match.username || match.first_name || match.internal_id) : '❌ not in DB';
    console.log(
      handle.padEnd(19), '|',
      w.address.slice(0, 12) + '..', '|',
      w.usdc_base.toFixed(2).padStart(8), '|',
      w.usdc_eth.toFixed(2).padStart(8), '|',
      w.eth_base.toFixed(6).padStart(10), '|',
      w.eth_eth.toFixed(6).padStart(10), '|',
      ('$' + w.total_usd.toFixed(2)).padStart(8), '|', ours
    );
  }

  const outFile = '/tmp/privy_funded_wallets_2026_08_24.json';
  fs.writeFileSync(outFile, JSON.stringify({
    audited_at: new Date().toISOString(),
    total_privy_users: users.length,
    total_wallets: wallets.length,
    funded_count: funded.length,
    total_funded_usd: funded.reduce((s, r) => s + r.total_usd, 0),
    funded_wallets: funded.map(w => {
      const m = byAddr.get(w.address) || byPrivyId.get(w.privy_user_id);
      return { ...w, our_internal_user: m ? { id: m.internal_id, username: m.username, first_name: m.first_name, language: m.language } : null };
    }),
  }, null, 2));
  console.log(`\n  Full JSON: ${outFile}`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
