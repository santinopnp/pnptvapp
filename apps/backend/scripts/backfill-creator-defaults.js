/**
 * Backfill: provision default channels + subscriber hangout for all active creators
 * who don't yet have a linked hangout.
 *
 * Run once inside the bot container:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/backfill-creator-defaults.js
 */
'use strict';

const { query } = require('../config/postgres');
const CreatorService = require('../services/creatorService');

async function main() {
  const { rows } = await query(
    `SELECT DISTINCT u.id, u.username
     FROM users u
     LEFT JOIN creator_channels cc ON cc.creator_id = u.id AND cc.is_active = true AND cc.hangout_group_id IS NOT NULL
     WHERE u.creator_status = 'active'
       AND cc.id IS NULL
     ORDER BY u.username`
  );

  console.log(`Backfilling ${rows.length} creators without a linked subscriber hangout…`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await CreatorService.provisionDefaultChannels(String(row.id));
      if (result) {
        console.log(`  ✓ ${row.username} (${row.id}): free=${result.freeChannelId} sub=${result.subChannelId} hangout=${result.hangoutId}`);
        ok++;
      } else {
        console.log(`  — ${row.username} (${row.id}): skipped (already provisioned)`);
        skipped++;
      }
    } catch (err) {
      console.error(`  ✗ ${row.username} (${row.id}): ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
