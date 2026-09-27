#!/usr/bin/env node
'use strict';
/**
 * For each stranded orphaned address, fetch its full wallet record from Privy
 * to see what entity metadata is still exposed (custom_metadata, entity type,
 * created_at cluster hints, etc.). This is the last-ditch attribution attempt
 * since deleted_privy_accounts didn't capture these historical migrations.
 */
const https = require('https');
const APP_ID = process.env.PRIVY_APP_ID;
const SECRET = process.env.PRIVY_APP_SECRET;
if (!APP_ID || !SECRET) { console.error('Missing PRIVY_APP_ID / PRIVY_APP_SECRET'); process.exit(1); }
const AUTH = Buffer.from(`${APP_ID}:${SECRET}`).toString('base64');

const STRANDED = [
  '0x750ed59c4133f1698efc2279689d7d368831b1a5',
  '0x57176946f571e7e4521aa35890f38b77c44eda66',
  '0x996c7c672598b0e4896ac0a37350ceec27d3f2b7',
  '0x1f0f67b8cce2efdff0dea6bc3c6cdb4aaddc1697',
  '0xc3d64aa18df4ecce482c2f750b969ce95fe843ec',
  '0x385ab092804858058cfa61d54c4a52c1d6c8faa6',
  '0xb45bac3dac5fcec68f4148b8b0f5c1c53c9f341f',
  '0x55f255a3c5be8285c173e542bd04f2993ebb76ac',
  '0xdc436f4f206ea5fa4317a61b4ce36299300716a8',
  '0xa2d9898043745feb8a9f08d823f9ed82612305c6',
  '0x3c2b2160e5692b490703299491b75deed4ea6f96',
  '0x410dfea7792785e8496770d055b73bd5ef32ea1c',
  '0xaba3e274ee292d779b425fab92f7886708089ef3',
  '0x74833cbb557fc41a2c3143d7f0221101b14d9db5',
  '0x667f821d0e589b6d48c5658c88759d8f97146c9e',
  '0x2eee8024f06e263f30e87d59e62c577604ecb480',
  '0x0a260a1a71daaaa1ddea56e776f141a80f8ac95b',
  '0xa26ebece9bd1bacfab3be357d10e2a7f943cd1ae',
];

function priv(host, path) {
  return new Promise((r) => {
    const req = https.request({
      hostname: host, path, method: 'GET',
      headers: { Authorization: `Basic ${AUTH}`, 'privy-app-id': APP_ID, 'Content-Type': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r({ status: res.statusCode, body: JSON.parse(d) }); } catch { r({ status: res.statusCode, body: null, raw: d }); } });
    });
    req.on('error', () => r({ status: 0 }));
    req.on('timeout', () => { req.destroy(); r({ status: 0 }); });
    req.end();
  });
}

async function main() {
  // First, get the full wallet listing so we can locate each address's full record
  console.log('Fetching all wallets to locate stranded records…');
  const all = []; let cursor = null;
  while (true) {
    const url = `/v1/wallets?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { body } = await priv('api.privy.io', url);
    if (!body?.data?.length) break;
    all.push(...body.data);
    if (!body.next_cursor) break;
    cursor = body.next_cursor;
  }
  console.log(`Loaded ${all.length} wallets\n`);

  for (const target of STRANDED) {
    const matches = all.filter(w => w.address.toLowerCase() === target.toLowerCase());
    if (!matches.length) {
      console.log(`\n${target} — NOT FOUND in /v1/wallets`);
      continue;
    }
    console.log('\n' + '─'.repeat(78));
    console.log(`ADDRESS: ${target}`);
    console.log('─'.repeat(78));
    for (const w of matches) {
      console.log(`  chain=${w.chain_type} created=${new Date(w.created_at).toISOString().slice(0,10)} exported=${w.exported_at ? new Date(w.exported_at).toISOString().slice(0,10) : '—'}`);
      console.log(`  wallet_id: ${w.id}`);
      console.log(`  entity.id: ${w.entity?.id}`);
      console.log(`  entity.type: ${w.entity?.type}`);
      if (w.entity?.custom_metadata) {
        console.log(`  custom_metadata: ${JSON.stringify(w.entity.custom_metadata)}`);
      }
      // Try fetching the entity even though it's orphaned — sometimes 404 payload includes hints
      if (w.entity?.id) {
        const u = await priv('auth.privy.io', `/api/v1/users/did:privy:${w.entity.id}`);
        if (u.status === 200 && u.body) {
          console.log(`  ⚠ entity ALIVE — linked_accounts:`);
          (u.body.linked_accounts || []).forEach(a => {
            console.log(`     type=${a.type}${a.email ? ' email='+a.email : ''}${a.username ? ' username='+a.username : ''}${a.address ? ' addr='+a.address : ''}${a.number ? ' phone='+a.number : ''}`);
          });
        } else if (u.raw) {
          console.log(`  entity fetch: ${u.status} ${u.raw.slice(0,120)}`);
        }
      }
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
