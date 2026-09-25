#!/usr/bin/env node
'use strict';
/**
 * audit-privy-wallet-owners.js
 *
 * Cross-references every Privy embedded wallet against our DB users table.
 * Reports:
 *   - MATCHED   : wallet address found in DB (wallet_address or preferred_wallet_address)
 *   - PRIVY_ONLY: Privy user exists, wallet address NOT in our DB → shows linked identifiers
 *   - DB_ONLY   : DB user has a wallet_address we never saw in Privy
 *
 * Usage:
 *   node apps/backend/scripts/audit-privy-wallet-owners.js
 *   node apps/backend/scripts/audit-privy-wallet-owners.js --csv   (machine-readable)
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const APP_ID = process.env.PRIVY_APP_ID;
const SECRET = process.env.PRIVY_APP_SECRET;
const CSV    = process.argv.includes('--csv');

if (!APP_ID || !SECRET) {
  console.error('Missing PRIVY_APP_ID or PRIVY_APP_SECRET');
  process.exit(1);
}

const AUTH = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');

// ── Privy API helpers ──────────────────────────────────────────────────────

function privyGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'auth.privy.io',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'privy-app-id': APP_ID,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error(`JSON parse failed: ${d.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function getAllPrivyUsers() {
  const users = [];
  let cursor  = null;
  while (true) {
    const url = `/api/v1/users?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await privyGet(url);
    if (!res.data || !res.data.length) break;
    users.push(...res.data);
    if (!res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return users;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractWallets(user) {
  return (user.linked_accounts || []).filter(a => a.type === 'wallet');
}

function extractIdentifiers(user) {
  return (user.linked_accounts || [])
    .filter(a => a.type !== 'wallet')
    .map(a => {
      switch (a.type) {
        case 'email':         return `email:${a.address}`;
        case 'phone':         return `phone:${a.phoneNumber || a.phone_number}`;
        case 'google_oauth':  return `google:${a.email || a.subject}`;
        case 'twitter_oauth': return `twitter:@${a.username || a.subject}`;
        case 'discord_oauth': return `discord:${a.username || a.subject}`;
        case 'github_oauth':  return `github:${a.username || a.subject}`;
        case 'apple_oauth':   return `apple:${a.email || a.subject}`;
        default:              return `${a.type}:${a.subject || a.address || '?'}`;
      }
    });
}

function fmt(label, rows) {
  if (!rows.length) return;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${label} (${rows.length})`);
  console.log('═'.repeat(70));
  rows.forEach(r => console.log(r));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  // 1. Pull all Privy users
  process.stderr.write('Fetching Privy users...\n');
  const privyUsers = await getAllPrivyUsers();
  process.stderr.write(`  → ${privyUsers.length} Privy users fetched\n`);

  // Build: privy_wallet_address (lowercase) → privy user
  const privyByAddress = new Map();
  for (const u of privyUsers) {
    for (const w of extractWallets(u)) {
      if (w.address) privyByAddress.set(w.address.toLowerCase(), u);
    }
  }

  // 2. Pull all DB users that have a wallet address
  const { rows: dbUsers } = await query(`
    SELECT id, username, email, pnptv_id, tier, is_deleted,
           wallet_address, preferred_wallet_address, privy_id,
           last_login_method, last_active, created_at
    FROM users
    WHERE wallet_address IS NOT NULL
       OR preferred_wallet_address IS NOT NULL
       OR privy_id IS NOT NULL
    ORDER BY created_at DESC
  `);
  process.stderr.write(`  → ${dbUsers.length} DB users with wallet/privy data\n`);

  // Build: db_wallet_address (lowercase) → db user
  const dbByAddress = new Map();
  for (const u of dbUsers) {
    if (u.wallet_address)           dbByAddress.set(u.wallet_address.toLowerCase(), u);
    if (u.preferred_wallet_address) dbByAddress.set(u.preferred_wallet_address.toLowerCase(), u);
  }

  // Build: privy_id → db user
  const dbByPrivyId = new Map();
  for (const u of dbUsers) {
    if (u.privy_id) dbByPrivyId.set(u.privy_id, u);
  }

  // ── Classify ──────────────────────────────────────────────────────────────

  const matched   = [];  // address in both Privy and DB
  const privyOnly = [];  // Privy wallet not in DB
  const dbOnly    = [];  // DB wallet not in Privy
  const softDeleted = []; // DB user is_deleted=true but has a Privy wallet

  // A. Walk Privy wallets
  for (const [addr, privyUser] of privyByAddress) {
    const dbUser  = dbByAddress.get(addr) || dbByPrivyId.get(privyUser.id);
    const wallets = extractWallets(privyUser);
    const ids     = extractIdentifiers(privyUser);
    const wallet  = wallets.find(w => w.address?.toLowerCase() === addr);
    const isEmbedded = wallet?.wallet_client === 'privy' || wallet?.connector_type === 'embedded';

    if (dbUser) {
      if (dbUser.is_deleted) {
        softDeleted.push({ addr, privyUser, dbUser, ids, isEmbedded });
      } else {
        matched.push({ addr, privyUser, dbUser, ids, isEmbedded });
      }
    } else {
      privyOnly.push({ addr, privyUser, ids, isEmbedded, walletObj: wallet });
    }
  }

  // B. Walk DB wallets not seen in Privy
  for (const [addr, dbUser] of dbByAddress) {
    if (!privyByAddress.has(addr)) {
      dbOnly.push({ addr, dbUser });
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────

  if (CSV) {
    // Machine-readable CSV
    const lines = ['status,wallet_address,privy_did,linked_identifiers,db_username,db_email,db_tier,is_deleted,is_embedded,privy_created_at'];
    for (const { addr, privyUser, dbUser, ids, isEmbedded } of matched) {
      lines.push([
        'MATCHED', addr, privyUser.id,
        ids.join('|'), dbUser.username, dbUser.email, dbUser.tier, false, isEmbedded,
        new Date(privyUser.created_at * 1000).toISOString(),
      ].join(','));
    }
    for (const { addr, privyUser, ids, isEmbedded } of privyOnly) {
      lines.push([
        'PRIVY_ONLY', addr, privyUser.id,
        ids.join('|'), '', '', '', false, isEmbedded,
        new Date(privyUser.created_at * 1000).toISOString(),
      ].join(','));
    }
    for (const { addr, privyUser, dbUser, ids, isEmbedded } of softDeleted) {
      lines.push([
        'SOFT_DELETED', addr, privyUser.id,
        ids.join('|'), dbUser.username, dbUser.email, dbUser.tier, true, isEmbedded,
        new Date(privyUser.created_at * 1000).toISOString(),
      ].join(','));
    }
    for (const { addr, dbUser } of dbOnly) {
      lines.push([
        'DB_ONLY', addr, '',
        '', dbUser.username, dbUser.email, dbUser.tier, dbUser.is_deleted, '',
        '',
      ].join(','));
    }
    console.log(lines.join('\n'));
    process.exit(0);
  }

  // Human-readable report
  console.log('\n' + '█'.repeat(70));
  console.log('  PRIVY WALLET AUDIT — PNPtv');
  console.log('  ' + new Date().toISOString());
  console.log('█'.repeat(70));
  console.log(`  Privy users total   : ${privyUsers.length}`);
  console.log(`  Privy wallet addrs  : ${privyByAddress.size}`);
  console.log(`  DB users w/ wallets : ${dbUsers.length}`);
  console.log(`  DB wallet addrs     : ${dbByAddress.size}`);
  console.log('─'.repeat(70));
  console.log(`  ✅ MATCHED          : ${matched.length}`);
  console.log(`  ⚠️  PRIVY ONLY      : ${privyOnly.length}  ← funds at risk`);
  console.log(`  🗑️  SOFT-DELETED     : ${softDeleted.length}  ← DB deleted, Privy intact`);
  console.log(`  🔍 DB ONLY          : ${dbOnly.length}  ← wallet in DB, not in Privy`);

  fmt('✅ MATCHED — Privy wallet found in our DB', matched.map(({ addr, privyUser, dbUser, ids, isEmbedded }) =>
    `  ${addr}\n    Privy : ${privyUser.id} | type=${isEmbedded ? 'embedded' : 'external'}\n    DB    : @${dbUser.username} (${dbUser.email || 'no email'}) tier=${dbUser.tier}\n    Logins: ${ids.join(', ') || '(none linked)'}`
  ));

  fmt('⚠️  PRIVY ONLY — Wallet exists in Privy but NOT matched in our DB', privyOnly.map(({ addr, privyUser, ids, isEmbedded, walletObj }) =>
    `  ${addr}\n    Privy : ${privyUser.id} | type=${isEmbedded ? 'embedded' : 'external'} | created=${new Date(privyUser.created_at * 1000).toISOString().slice(0, 10)}\n    Logins: ${ids.join(', ') || '⛔ NO LOGIN METHOD — likely pregenerated/unclaimed'}\n    Chain : ${walletObj?.chain_type || '?'} | client=${walletObj?.wallet_client || '?'}`
  ));

  fmt('🗑️  SOFT-DELETED — DB user deleted but Privy wallet still active', softDeleted.map(({ addr, privyUser, dbUser, ids }) =>
    `  ${addr}\n    Privy : ${privyUser.id}\n    DB    : @${dbUser.username} (DELETED) | privy_id=${dbUser.privy_id}\n    Logins: ${ids.join(', ') || '(none)'}`
  ));

  fmt('🔍 DB ONLY — Wallet address in our DB but not found in Privy', dbOnly.map(({ addr, dbUser }) =>
    `  ${addr}\n    DB    : @${dbUser.username} (${dbUser.email || 'no email'}) | privy_id=${dbUser.privy_id || 'NONE'} | deleted=${dbUser.is_deleted}`
  ));

  console.log('\n' + '─'.repeat(70));
  console.log('  Run with --csv for machine-readable output.');
  console.log('─'.repeat(70) + '\n');

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
