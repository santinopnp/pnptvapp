#!/usr/bin/env node
'use strict';
/**
 * audit-privy-wallet-mismatch-2026-09-27.js
 *
 * For every DB user with a privy_id, ask Privy for their current wallets and
 * flag when users.wallet_address is NOT in Privy's set. Root cause: our link
 * flow is write-once (COALESCE), so if Privy rotates or the user re-links with
 * a different wallet, our DB is stuck on the old address and the user's funds
 * become invisible in-app.
 */

const path = require('path');
const https = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const APP_ID = process.env.PRIVY_APP_ID;
const SECRET = process.env.PRIVY_APP_SECRET;
if (!APP_ID || !SECRET) { console.error('Missing PRIVY_APP_ID / PRIVY_APP_SECRET'); process.exit(1); }

const AUTH = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');

function privyGet(p) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'auth.privy.io', path: p, method: 'GET',
      headers: { 'Authorization': `Basic ${AUTH}`, 'privy-app-id': APP_ID, 'Content-Type': 'application/json' },
      timeout: 20000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error(`bad json: ${d.slice(0,200)}`)); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function getAllPrivyUsers() {
  const out = []; let cursor = null;
  while (true) {
    const url = `/api/v1/users?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await privyGet(url);
    if (!res.data || !res.data.length) break;
    out.push(...res.data);
    if (!res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

function walletsFor(privyUser) {
  return (privyUser.linked_accounts || [])
    .filter(a => a.type === 'wallet' && a.address)
    .map(a => ({
      address: a.address.toLowerCase(),
      client: a.wallet_client || a.wallet_client_type || '?',
      chain: a.chain_type || '?',
      isEmbedded: (a.wallet_client === 'privy' || a.connector_type === 'embedded'),
    }));
}

async function main() {
  await initializePostgres();

  process.stderr.write('Fetching Privy users…\n');
  const privyUsers = await getAllPrivyUsers();
  const byDid = new Map(privyUsers.map(u => [u.id, u]));
  process.stderr.write(`  → ${privyUsers.length} Privy users\n`);

  const { rows: dbUsers } = await query(`
    SELECT id, username, email, tier, role, creator_status,
           privy_id, wallet_address, wallet_linked_at, is_deleted, last_active
    FROM users
    WHERE privy_id IS NOT NULL
      AND (is_deleted IS NULL OR is_deleted = false)
    ORDER BY last_active DESC NULLS LAST
  `);
  process.stderr.write(`  → ${dbUsers.length} active DB users with privy_id\n\n`);

  const mismatches = [];
  const orphans = [];
  const missing = [];

  for (const u of dbUsers) {
    const p = byDid.get(u.privy_id);
    if (!p) { orphans.push(u); continue; }

    const privyWallets = walletsFor(p);
    if (!privyWallets.length) {
      if (u.wallet_address) missing.push({ u, privyWallets });
      continue;
    }
    const addrs = new Set(privyWallets.map(w => w.address));
    const dbAddr = (u.wallet_address || '').toLowerCase();

    if (!dbAddr) continue; // no DB wallet, nothing to mismatch
    if (!addrs.has(dbAddr)) {
      mismatches.push({ u, privyWallets });
    }
  }

  console.log('\n' + '█'.repeat(78));
  console.log(`  PRIVY ↔ DB WALLET MISMATCH REPORT — ${new Date().toISOString()}`);
  console.log('█'.repeat(78));
  console.log(`  DB users w/ privy_id      : ${dbUsers.length}`);
  console.log(`  ⚠️  MISMATCHES            : ${mismatches.length}   (funds may be stranded)`);
  console.log(`  ❓ DB privy_id → not in Privy: ${orphans.length}`);
  console.log(`  🚫 DB has wallet, Privy has none: ${missing.length}`);
  console.log('─'.repeat(78));

  if (mismatches.length) {
    console.log('\n⚠️  MISMATCH DETAILS\n');
    for (const { u, privyWallets } of mismatches) {
      console.log(`  @${u.username || '?'} (${u.email || 'no email'}) tier=${u.tier} role=${u.role} creator=${u.creator_status}`);
      console.log(`    pnptv_id   : ${u.id}`);
      console.log(`    privy_id   : ${u.privy_id}`);
      console.log(`    DB wallet  : ${u.wallet_address}  (linked ${u.wallet_linked_at})`);
      console.log(`    Privy has  :`);
      privyWallets.forEach(w => console.log(`       ${w.address}  [${w.isEmbedded ? 'embedded' : 'external'} · ${w.chain} · ${w.client}]`));
      console.log('');
    }
  }

  if (orphans.length && process.argv.includes('--verbose')) {
    console.log('\n❓ ORPHAN privy_id (DB has privy_id, Privy dashboard does not)\n');
    orphans.slice(0, 20).forEach(u => console.log(`  @${u.username} · ${u.privy_id} · last_active=${u.last_active}`));
    if (orphans.length > 20) console.log(`  … +${orphans.length - 20} more (rerun with --verbose to see all)`);
  }

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
