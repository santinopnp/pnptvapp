#!/usr/bin/env node
'use strict';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const RPC_BASE  = 'https://mainnet.base.org';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ETH_PRICE = 2600;
const MIN_USD   = 1.0;

async function rpcCall(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  return j.result;
}

async function usdcBalance(addr) {
  const data = '0x70a08231000000000000000000000000' + addr.replace(/^0x/, '').toLowerCase().padStart(40, '0');
  const res = await rpcCall(RPC_BASE, 'eth_call', [{ to: USDC_BASE, data }, 'latest']);
  return res ? parseInt(res, 16) / 1e6 : 0;
}

async function ethBalance(addr) {
  const res = await rpcCall(RPC_BASE, 'eth_getBalance', [addr, 'latest']);
  return res ? parseInt(res, 16) / 1e18 : 0;
}

async function main() {
  await initializePostgres();
  const { rows } = await query(`
    SELECT id, username, first_name, telegram, language, tier, wallet_address
    FROM users
    WHERE wallet_address IS NOT NULL AND wallet_address <> ''
      AND is_deleted IS NOT TRUE
      AND COALESCE(tier,'free') <> 'banned'
    ORDER BY wallet_linked_at DESC NULLS LAST
  `);

  console.log(`\nChecking ${rows.length} wallets on Base...\n`);

  const funded = [];
  for (let i = 0; i < rows.length; i++) {
    const u = rows[i];
    process.stdout.write(`\r  ${i+1}/${rows.length}`);
    try {
      const [usdc, eth] = await Promise.all([
        usdcBalance(u.wallet_address),
        ethBalance(u.wallet_address),
      ]);
      const total_usd = usdc + eth * ETH_PRICE;
      if (total_usd >= MIN_USD) funded.push({ ...u, usdc, eth, total_usd });
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }

  process.stdout.write('\n\n');
  console.log(`FUNDED WALLETS (>= $${MIN_USD} USDC/ETH on Base):\n`);
  const fmt = (u) =>
    (u.username || '(none)').padEnd(22) +
    (u.telegram ? 'TG' : '  ').padEnd(5) +
    u.wallet_address.padEnd(44) +
    ('$' + u.usdc.toFixed(2) + ' USDC').padEnd(14) +
    (u.eth > 0.0001 ? u.eth.toFixed(4) + ' ETH' : '').padEnd(12) +
    '= $' + u.total_usd.toFixed(2);

  funded.sort((a, b) => b.total_usd - a.total_usd).forEach(u => console.log(fmt(u)));
  console.log(`\nTotal funded: ${funded.length} / ${rows.length}`);
  console.log(`Total USDC on Base: $${funded.reduce((s,u) => s + u.usdc, 0).toFixed(2)}`);
  process.exit(0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
