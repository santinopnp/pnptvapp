#!/usr/bin/env node
'use strict';

/**
 * provision-missing-channels.js
 *
 * One-shot: creates Restreamer RTMP ingest processes for every creator that
 * has no live_channel assigned, then writes the slug to users.live_channel.
 * Also sets creator_role = 'performer' when null.
 *
 * Usage (dry run first):
 *   docker exec pnptv-bot node apps/backend/scripts/provision-missing-channels.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/provision-missing-channels.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { getPool }         = require(path.join(BACKEND, 'config/postgres'));
const restreamerService   = require(path.join(BACKEND, 'services/restreamerService'));

const DRY_RUN = process.argv.includes('--dry-run');

function deriveRefId(username, id) {
  const raw = (username || `user${id}`).toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `pnptv-${raw}`;
}

async function run() {
  const pool = getPool();

  const { rows: creators } = await pool.query(`
    SELECT id, username, first_name, last_name, live_channel, creator_role
    FROM users
    WHERE role = 'creator'
      AND live_channel IS NULL
      AND username NOT LIKE 'deleted_%'
    ORDER BY first_name
  `);

  console.log(`Found ${creators.length} creators without a channel.`);
  if (DRY_RUN) console.log('[DRY RUN — no changes will be made]\n');

  const results = { ok: [], failed: [] };

  for (const c of creators) {
    const refId = deriveRefId(c.username, c.id);
    const displayName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || c.id;
    console.log(`\n→ ${displayName} (@${c.username}) → ${refId}`);

    if (DRY_RUN) {
      console.log('  [dry-run] would create Restreamer process + set live_channel');
      results.ok.push({ username: c.username, refId });
      continue;
    }

    try {
      await restreamerService.createProcess({ refId, title: displayName });
      console.log(`  ✓ Restreamer process created: ${refId}`);

      await pool.query(
        `UPDATE users
           SET live_channel  = $1,
               creator_role  = COALESCE(creator_role, 'performer')
         WHERE id = $2 AND live_channel IS NULL`,
        [refId, c.id]
      );
      console.log(`  ✓ DB updated — live_channel='${refId}'`);
      results.ok.push({ username: c.username, refId });
    } catch (err) {
      console.error(`  ✗ FAILED for @${c.username}: ${err.message}`);
      results.failed.push({ username: c.username, error: err.message });
    }
  }

  console.log('\n══════════════════════════════');
  console.log(`Done. OK: ${results.ok.length}  Failed: ${results.failed.length}`);
  if (results.failed.length) {
    console.log('\nFailed:');
    results.failed.forEach(f => console.log(`  @${f.username}: ${f.error}`));
  }
  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
