'use strict';
// Backfills creator_media.duration_seconds for existing video rows that predate
// duration capture (migration 318_creator_content_compliance.sql).
//
// Probes each row's remote `url` via ffprobe directly (no download) — best-effort:
// some URLs may 404 or time out, those are logged and skipped, not fatal.
//
// Usage:
//   node scripts/backfill-creator-media-duration.js            # dry run (default, no writes)
//   node scripts/backfill-creator-media-duration.js --confirm  # write duration_seconds + re-check compliance
//
// In --confirm mode, after all rows are processed, ContentComplianceService.markCompliantIfNewlyQualified
// is called once per distinct creator_id whose media was updated (idempotent no-op if not yet compliant
// or already marked compliant).

const { spawnSync } = require('child_process');
const { getPool } = require('../config/postgres');
const ContentComplianceService = require('../services/contentComplianceService');

const CONFIRM = process.argv.includes('--confirm');
const BATCH_SIZE = 100;

// Same pattern as scripts/scanFreeVideosOver4Min.js — raw ffprobe binary, works
// on both local paths and http(s) URLs.
function ffprobeDuration(url) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    url,
  ], { encoding: 'utf8', timeout: 15000 });
  if (r.error || r.status !== 0) return null;
  const sec = parseFloat((r.stdout || '').trim());
  return Number.isFinite(sec) ? Math.round(sec) : null;
}

async function main() {
  const pool = getPool();
  console.log(`\n=== Backfill creator_media.duration_seconds ${CONFIRM ? '(CONFIRM — writing)' : '(DRY RUN)'} ===\n`);

  let lastId = 0;
  let probed = 0;
  let updated = 0;
  let failed = 0;
  const affectedCreatorIds = new Set();

  // Cursor pagination on id — avoids loading everything into memory, and (in
  // --confirm mode) rows drop out of the WHERE clause as they get updated, so
  // this also self-corrects if run multiple times.
  while (true) {
    const { rows } = await pool.query(
      `SELECT id, creator_id, url
       FROM creator_media
       WHERE media_type = 'video' AND duration_seconds IS NULL AND id > $1
       ORDER BY id ASC
       LIMIT $2`,
      [lastId, BATCH_SIZE]
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;

      if (!row.url) {
        console.log(`  [SKIP] id=${row.id} creator=${row.creator_id} — no url`);
        continue;
      }

      const seconds = ffprobeDuration(row.url);
      probed++;

      if (seconds === null) {
        failed++;
        console.log(`  [FAIL] id=${row.id} creator=${row.creator_id} — ffprobe failed for ${row.url}`);
        continue;
      }

      console.log(`  [OK] id=${row.id} creator=${row.creator_id} — duration=${seconds}s`);

      if (CONFIRM) {
        try {
          await pool.query('UPDATE creator_media SET duration_seconds = $2 WHERE id = $1', [row.id, seconds]);
          updated++;
          affectedCreatorIds.add(String(row.creator_id));
        } catch (updateErr) {
          failed++;
          console.log(`  [FAIL] id=${row.id} — DB update failed: ${updateErr.message}`);
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Probed:  ${probed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed:  ${failed}`);

  if (CONFIRM && affectedCreatorIds.size > 0) {
    console.log(`\nRe-checking content compliance for ${affectedCreatorIds.size} affected creator(s)...`);
    for (const creatorId of affectedCreatorIds) {
      try {
        const result = await ContentComplianceService.markCompliantIfNewlyQualified(creatorId);
        if (result.unlocked > 0) {
          console.log(`  [UNLOCKED] creator=${creatorId} — ${result.unlocked} held subscription(s) released`);
        }
      } catch (complianceErr) {
        console.log(`  [ERR] creator=${creatorId} — compliance check failed: ${complianceErr.message}`);
      }
    }
  }

  console.log(`\nDone.${CONFIRM ? '' : ' (dry run — pass --confirm to write changes)'}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
