#!/usr/bin/env node
'use strict';

/**
 * purge-privy-unused-wallets.js
 *
 * Two-pass purge to keep the Privy free-tier wallet count low:
 *
 * Pass 1 — DB-first (original):
 *   Deletes Privy users recorded in our DB with ZERO purchase activity.
 *
 * Pass 2 — Privy-first (orphan sweep):
 *   Lists ALL users directly from the Privy API and deletes any whose
 *   privy_id does NOT appear in our users table. These are "ghost" accounts
 *   created when a user opened the Privy auth flow but never completed
 *   /api/privy/link (tab closed, network error, etc.).
 *   Safety: skips any Privy user whose wallet address appears in our DB
 *   as wallet_address — that account IS linked, just via address not privy_id.
 *
 * Safety (both passes):
 *   - Users with ANY token_purchases row (any status) are skipped.
 *   - Users with ANY successful gas topup are skipped.
 *   - Users with ANY completed checkout_intent are skipped.
 *   - Wallets with on-chain ETH > 0.00001 or USDC > $0.001 are SKIPPED
 *     and listed for manual review — funded slots count against the Privy
 *     free tier even after account deletion, so we must drain first.
 *   - Dry-run by default. Pass --execute to actually delete.
 *   - 200ms delay between Privy API calls to avoid rate limiting.
 *
 * Usage:
 *   node purge-privy-unused-wallets.js           # dry-run (both passes)
 *   node purge-privy-unused-wallets.js --execute # live delete
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const PRIVY_ID     = process.env.PRIVY_APP_ID;
const PRIVY_SECRET = process.env.PRIVY_APP_SECRET;
if (!PRIVY_ID || !PRIVY_SECRET) { console.error('Missing PRIVY_APP_ID / PRIVY_APP_SECRET'); process.exit(1); }

const AUTH_HEADER = 'Basic ' + Buffer.from(`${PRIVY_ID}:${PRIVY_SECRET}`).toString('base64');
const EXECUTE  = process.argv.includes('--execute');
const DELAY_MS = 200;

// On-chain balance check (Base mainnet)
const BASE_RPC        = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_BASE       = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ETH_DUST_WEI    = BigInt('10000000000000');  // 0.00001 ETH
const USDC_DUST_UNITS = BigInt('1000');             // $0.001 USDC (6 decimals)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function isAddressFunded(address) {
  if (!address) return false;
  const addr = address.toLowerCase();
  try {
    const [ethRes, usdcRes] = await Promise.all([
      fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] }),
      }),
      fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 2, method: 'eth_call',
          params: [{ to: USDC_BASE, data: '0x70a08231000000000000000000000000' + addr.slice(2) }, 'latest'],
        }),
      }),
    ]);
    const ethBal  = BigInt((await ethRes.json()).result  || '0x0');
    const usdcBal = BigInt((await usdcRes.json()).result || '0x0');
    return ethBal > ETH_DUST_WEI || usdcBal > USDC_DUST_UNITS;
  } catch {
    return true; // RPC error → skip delete to be safe
  }
}

async function anyLinkedWalletFunded(linkedAccounts) {
  const wallets = (Array.isArray(linkedAccounts) ? linkedAccounts : [])
    .filter(a => a?.type === 'wallet' && a.address);
  for (const w of wallets) {
    if (await isAddressFunded(w.address)) return true;
  }
  return false;
}

async function deletePrivyUser(privyId) {
  const url = `https://auth.privy.io/api/v1/users/${encodeURIComponent(privyId)}`;
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: AUTH_HEADER, 'privy-app-id': PRIVY_ID },
  });
  if (!r.ok && r.status !== 404) {
    const body = await r.text().catch(() => '');
    throw new Error(`Privy DELETE ${privyId} → ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.status;
}

async function listAllPrivyUsers() {
  const users = [];
  let cursor = null;
  let page   = 0;
  while (true) {
    const url = `https://auth.privy.io/api/v1/users?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: AUTH_HEADER, 'privy-app-id': PRIVY_ID } });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Privy list failed ${r.status}: ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    users.push(...(j.data || []));
    page++;
    process.stdout.write(`\r  Fetched ${users.length} Privy users (page ${page})…`);
    if (!j.next_cursor) break;
    cursor = j.next_cursor;
    if (page > 300) { console.warn('\nsafety break at 300 pages'); break; }
  }
  process.stdout.write('\n');
  return users;
}

async function runPass1() {
  console.log('\n--- Pass 1: DB-first (zero-purchase linked accounts) ---\n');
  const { rows } = await query(`
    SELECT u.id, u.privy_id, u.wallet_address, u.created_at
    FROM users u
    WHERE u.privy_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM token_purchases tp WHERE tp.user_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM gas_topups gt
        WHERE gt.user_id::text = u.id::text AND gt.status = 'success'
      )
      AND NOT EXISTS (
        SELECT 1 FROM checkout_intents ci
        WHERE ci.user_id = u.id AND ci.status = 'completed'
      )
    ORDER BY u.created_at ASC
  `);

  console.log(`Candidates: ${rows.length}`);
  if (rows.length === 0) { console.log('Pass 1: nothing to do.'); return; }

  let deleted = 0, skipped = 0, funded = 0, errors = 0;
  for (const user of rows) {
    process.stdout.write(`  [${deleted + skipped + funded + errors + 1}/${rows.length}] ${user.privy_id} (pnptv: ${user.id}) … `);
    if (!EXECUTE) { console.log('DRY RUN'); skipped++; continue; }
    if (user.wallet_address && await isAddressFunded(user.wallet_address)) {
      console.log('SKIP (funded wallet — drain before deleting)');
      funded++;
      continue;
    }
    try {
      const status = await deletePrivyUser(user.privy_id);
      await query(
        `UPDATE users SET privy_id = NULL, wallet_address = NULL, wallet_linked_at = NULL WHERE id = $1`,
        [user.id],
      );
      console.log(`deleted (privy ${status})`);
      deleted++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
    await sleep(DELAY_MS);
  }
  console.log(`\nPass 1 done. deleted=${deleted}  skipped=${skipped}  funded=${funded}  errors=${errors}`);
}

async function runPass2() {
  console.log('\n--- Pass 2: Privy-first (orphan accounts not in our DB) ---\n');

  const [linkedRes, walletRes] = await Promise.all([
    query(`SELECT privy_id FROM users WHERE privy_id IS NOT NULL`),
    query(`SELECT LOWER(wallet_address) AS addr FROM users WHERE wallet_address IS NOT NULL AND wallet_address <> ''`),
  ]);
  const knownPrivyIds    = new Set(linkedRes.rows.map(r => r.privy_id));
  const knownWalletAddrs = new Set(walletRes.rows.map(r => r.addr));

  console.log(`Known privy_ids in DB: ${knownPrivyIds.size}`);
  console.log(`Known wallet addrs in DB: ${knownWalletAddrs.size}`);

  const allPrivyUsers = await listAllPrivyUsers();
  console.log(`Total Privy users fetched: ${allPrivyUsers.length}\n`);

  const orphans = allPrivyUsers.filter(pu => {
    if (knownPrivyIds.has(pu.id)) return false;
    const linked = Array.isArray(pu.linked_accounts) ? pu.linked_accounts : [];
    const wallets = linked.filter(a => a.type === 'wallet' && a.address);
    if (wallets.some(w => knownWalletAddrs.has(String(w.address).toLowerCase()))) return false;
    return true;
  });

  console.log(`Orphan candidates: ${orphans.length}`);
  if (orphans.length === 0) { console.log('Pass 2: nothing to do.'); return; }

  let deleted = 0, skipped = 0, funded = 0, errors = 0;
  const fundedList = [];

  for (const pu of orphans) {
    process.stdout.write(`  [${deleted + skipped + funded + errors + 1}/${orphans.length}] ${pu.id} … `);
    if (!EXECUTE) { console.log('DRY RUN'); skipped++; continue; }
    if (await anyLinkedWalletFunded(pu.linked_accounts)) {
      const addrs = (Array.isArray(pu.linked_accounts) ? pu.linked_accounts : [])
        .filter(a => a?.type === 'wallet' && a.address)
        .map(a => a.address);
      console.log(`SKIP (funded: ${addrs.join(', ')})`);
      fundedList.push({ privyId: pu.id, addrs });
      funded++;
      continue;
    }
    try {
      const status = await deletePrivyUser(pu.id);
      console.log(`deleted (privy ${status})`);
      deleted++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
    await sleep(DELAY_MS);
  }

  if (fundedList.length > 0) {
    console.log('\nFunded orphan wallets skipped (manual review / drain needed):');
    for (const { privyId, addrs } of fundedList) {
      console.log(`  privy: ${privyId}  wallet(s): ${addrs.join(', ')}`);
    }
  }

  console.log(`\nPass 2 done. deleted=${deleted}  skipped=${skipped}  funded=${funded}  errors=${errors}`);
}

async function main() {
  await initializePostgres();
  console.log(`\n=== Privy Wallet Purge — ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} ===`);
  await runPass1();
  await runPass2();
  console.log('\n=== All passes complete ===\n');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
