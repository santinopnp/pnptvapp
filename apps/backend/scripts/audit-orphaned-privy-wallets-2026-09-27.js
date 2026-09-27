#!/usr/bin/env node
'use strict';
/**
 * audit-orphaned-privy-wallets-2026-09-27.js
 *
 * Walks every wallet in Privy's /v1/wallets API and flags orphans —
 * wallets whose owning Privy user account no longer exists (404 from
 * /api/v1/users/{did}). Correlates with our DB users where possible
 * (matching by embedded wallet address in linked_accounts is impossible
 * for orphans, but we can still list them for manual triage).
 *
 * Symptom this catches: user recreated their Privy account, old wallet
 * has funds, new account uses different address, DB stores old address
 * (never re-synced due to write-once COALESCE bug in privyLinkService).
 *
 * Output: table of orphaned wallets with created_at, exported_at,
 * chain_type, address. Filter by --with-export to only see wallets whose
 * key was exported by the user (candidates for user-side rescue).
 */

const https = require('https');
const APP_ID = process.env.PRIVY_APP_ID;
const SECRET = process.env.PRIVY_APP_SECRET;
if (!APP_ID || !SECRET) { console.error('Missing PRIVY_APP_ID / PRIVY_APP_SECRET'); process.exit(1); }
const AUTH = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');
const WITH_EXPORT_ONLY = process.argv.includes('--with-export');

function priv(hostname, p) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path: p, method: 'GET',
      headers: { 'Authorization': `Basic ${AUTH}`, 'privy-app-id': APP_ID, 'Content-Type': 'application/json' },
      timeout: 20000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: null, raw: d }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.end();
  });
}

async function walkWallets() {
  const all = []; let cursor = null;
  while (true) {
    const url = `/v1/wallets?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { status, body } = await priv('api.privy.io', url);
    if (status !== 200 || !body?.data?.length) break;
    all.push(...body.data);
    if (!body.next_cursor) break;
    cursor = body.next_cursor;
    process.stderr.write(`  … ${all.length} wallets fetched\n`);
  }
  return all;
}

async function main() {
  process.stderr.write('Fetching all Privy wallets…\n');
  const wallets = await walkWallets();
  process.stderr.write(`Total wallets: ${wallets.length}\n`);

  // Group by entity.id so we only call users API once per unique entity
  const byEntity = new Map();
  for (const w of wallets) {
    const eid = w.entity?.id;
    if (!eid) continue;
    if (!byEntity.has(eid)) byEntity.set(eid, []);
    byEntity.get(eid).push(w);
  }
  process.stderr.write(`Unique entity.id values: ${byEntity.size}\n`);

  // Check each entity for existence (batched, small concurrency)
  const orphans = [];
  const alive = [];
  const entries = [...byEntity.entries()];
  const CONCURRENCY = 5;
  let i = 0;
  while (i < entries.length) {
    const batch = entries.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ([eid, ws]) => {
      const { status } = await priv('auth.privy.io', `/api/v1/users/did:privy:${eid}`);
      if (status === 404) orphans.push({ eid, wallets: ws });
      else alive.push({ eid, wallets: ws });
    }));
    i += CONCURRENCY;
    if (i % 50 === 0) process.stderr.write(`  … checked ${i}/${entries.length} entities\n`);
  }

  // Report
  console.log('\n' + '█'.repeat(78));
  console.log(`  PRIVY ORPHANED WALLETS AUDIT — ${new Date().toISOString()}`);
  console.log('█'.repeat(78));
  console.log(`  Total server wallets       : ${wallets.length}`);
  console.log(`  Unique owning entities     : ${byEntity.size}`);
  console.log(`  ✅ Alive entities          : ${alive.length}`);
  console.log(`  🚫 ORPHANED entities       : ${orphans.length}`);
  const orphanWallets = orphans.flatMap(o => o.wallets);
  console.log(`  🚫 Orphaned wallets total  : ${orphanWallets.length}`);
  const orphanExported = orphanWallets.filter(w => w.exported_at);
  console.log(`  🔑 …with exported private key: ${orphanExported.length}  ← user may have keys, funds recoverable`);
  const orphanNotExported = orphanWallets.filter(w => !w.exported_at);
  console.log(`  ⚫ …NOT exported (funds LOST): ${orphanNotExported.length}  ← no one has the keys`);
  console.log('─'.repeat(78));

  const list = WITH_EXPORT_ONLY ? orphanExported : orphanWallets;
  if (list.length) {
    console.log(`\n${WITH_EXPORT_ONLY ? '🔑 EXPORTED ORPHANS' : 'ALL ORPHANS'} — chain / created / exported / address / entity.id\n`);
    list.sort((a, b) => (b.exported_at || 0) - (a.exported_at || 0));
    for (const w of list) {
      const created = new Date(w.created_at).toISOString().slice(0, 10);
      const exported = w.exported_at ? new Date(w.exported_at).toISOString().slice(0, 10) : '—';
      console.log(`  ${w.chain_type.padEnd(10)} ${created}  exp:${exported}  ${w.address}  ent:${w.entity.id}`);
    }
  }

  console.log(`\nRerun with --with-export to filter to exported-key orphans only.\n`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
