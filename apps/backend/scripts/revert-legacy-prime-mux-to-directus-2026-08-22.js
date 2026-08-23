#!/usr/bin/env node
'use strict';

/**
 * revert-legacy-prime-mux-to-directus-2026-08-22.js
 *
 * Reverses reingest-legacy-prime-to-mux-2026-08-22.js after Mux became
 * financially non-viable. Assumes the 30 legacy Directus MP4s have already
 * been faststart-remuxed in place (so browsers can now decode them) — this
 * script only handles the DB switch + Mux asset cleanup.
 *
 * Phase A: Revert channel_videos (30 rows).
 *   - NULL mux_asset_id / mux_playback_id / mux_status
 *   - thumbnail_url → https://cms.pnptv.app/video-thumb/<file_id>.jpg
 *     (the Directus video-thumb extension URL — some may 404, frontend
 *     falls back to a placeholder film icon)
 *
 * Phase B: Revert social_posts (29 channel_promo rows).
 *   - metadata.video_url → https://cms.pnptv.app/assets/<file_id>
 *   - media_url → same
 *   - video_thumbnail_url → https://cms.pnptv.app/video-thumb/<file_id>.jpg
 *
 * Phase C: Delete Mux assets (before dropping mux_asset_id references).
 *   Irreversible — only run when Directus playback is verified working.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/revert-legacy-prime-mux-to-directus-2026-08-22.js            # dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/revert-legacy-prime-mux-to-directus-2026-08-22.js --live      # DB revert only, keep Mux assets orphaned
 *   docker exec pnptv-bot node /app/apps/backend/scripts/revert-legacy-prime-mux-to-directus-2026-08-22.js --live --delete-mux
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const Mux = require('@mux/mux-node');

const LIVE       = process.argv.includes('--live');
const DELETE_MUX = process.argv.includes('--delete-mux');

const CMS = (process.env.DIRECTUS_PUBLIC_URL || 'https://cms.pnptv.app').replace(/\/$/, '');

function log(msg) {
  console.log(`[${new Date().toISOString().replace('T',' ').slice(0,19)}] ${msg}`);
}

async function fetchTargets() {
  const { rows } = await query(
    `SELECT id, title, directus_file_id, mux_asset_id, mux_playback_id
       FROM channel_videos
      WHERE channel_id = 209
        AND status = 'published'
        AND directus_file_id IS NOT NULL
        AND mux_asset_id IS NOT NULL
      ORDER BY id ASC`
  );
  return rows;
}

async function revertChannelVideos(targets) {
  log(`Phase A — reverting ${targets.length} channel_videos rows`);
  if (!LIVE) {
    for (const r of targets.slice(0, 3)) {
      log(`  [DRY] row=${r.id} would null mux_* and set thumb=${CMS}/video-thumb/${r.directus_file_id}.jpg`);
    }
    log(`  [DRY] ...and ${targets.length - 3} more`);
    return;
  }
  const { rowCount } = await query(
    `UPDATE channel_videos
        SET mux_asset_id    = NULL,
            mux_playback_id = NULL,
            mux_status      = NULL,
            thumbnail_url   = $1 || '/video-thumb/' || directus_file_id || '.jpg',
            updated_at      = NOW()
      WHERE channel_id = 209
        AND status     = 'published'
        AND mux_asset_id IS NOT NULL
        AND directus_file_id IS NOT NULL`,
    [CMS]
  );
  log(`  ✓ channel_videos updated: ${rowCount}`);
}

async function revertSocialPosts() {
  log('Phase B — reverting social_posts channel_promo metadata + media_url + thumb');
  if (!LIVE) {
    const { rows } = await query(
      `SELECT sp.id, sp.metadata->>'video_id' AS vid, cv.directus_file_id
         FROM social_posts sp
         JOIN channel_videos cv ON cv.id = (sp.metadata->>'video_id')::bigint
        WHERE sp.metadata->>'kind' = 'channel_promo'
          AND cv.channel_id = 209
          AND cv.directus_file_id IS NOT NULL
          AND (sp.metadata->>'video_url') LIKE 'https://stream.mux.com/%'`
    );
    log(`  [DRY] would revert ${rows.length} social_posts to CMS URLs`);
    return;
  }

  // Revert metadata.video_url + media_url + video_thumbnail_url in one UPDATE
  // per column (jsonb_set requires per-column pass).
  const r1 = await query(
    `UPDATE social_posts sp
        SET metadata = sp.metadata || jsonb_build_object(
              'video_url', $1 || '/assets/' || cv.directus_file_id::text
            )
       FROM channel_videos cv
      WHERE cv.id = (sp.metadata->>'video_id')::bigint
        AND cv.channel_id = 209
        AND sp.metadata->>'kind' = 'channel_promo'
        AND cv.directus_file_id IS NOT NULL
        AND (sp.metadata->>'video_url') LIKE 'https://stream.mux.com/%'`,
    [CMS]
  );
  log(`  ✓ metadata.video_url reverted: ${r1.rowCount}`);

  const r2 = await query(
    `UPDATE social_posts sp
        SET media_url = $1 || '/assets/' || cv.directus_file_id::text
       FROM channel_videos cv
      WHERE cv.id = (sp.metadata->>'video_id')::bigint
        AND cv.channel_id = 209
        AND sp.metadata->>'kind' = 'channel_promo'
        AND cv.directus_file_id IS NOT NULL
        AND sp.media_url LIKE 'https://stream.mux.com/%'`,
    [CMS]
  );
  log(`  ✓ media_url reverted: ${r2.rowCount}`);

  const r3 = await query(
    `UPDATE social_posts sp
        SET video_thumbnail_url = $1 || '/video-thumb/' || cv.directus_file_id::text || '.jpg'
       FROM channel_videos cv
      WHERE cv.id = (sp.metadata->>'video_id')::bigint
        AND cv.channel_id = 209
        AND sp.metadata->>'kind' = 'channel_promo'
        AND cv.directus_file_id IS NOT NULL
        AND sp.video_thumbnail_url LIKE 'https://image.mux.com/%'`,
    [CMS]
  );
  log(`  ✓ video_thumbnail_url reverted: ${r3.rowCount}`);
}

async function deleteMuxAssets(targets, mux) {
  log(`Phase C — deleting ${targets.length} Mux assets (irreversible)`);
  if (!LIVE) { log('  [DRY] skip'); return; }
  if (!DELETE_MUX) { log('  --delete-mux not set — leaving assets orphaned on Mux'); return; }

  let ok = 0, fail = 0;
  for (const r of targets) {
    if (!r.mux_asset_id) continue;
    try {
      await mux.video.assets.delete(r.mux_asset_id);
      log(`  ✓ deleted asset ${r.mux_asset_id} (row ${r.id})`);
      ok++;
    } catch (err) {
      log(`  ✗ delete failed asset=${r.mux_asset_id} row=${r.id}: ${err.status || ''} ${err.message}`);
      fail++;
    }
    await new Promise(rs => setTimeout(rs, 200));
  }
  log(`  Mux delete summary: ok=${ok} fail=${fail}`);
}

async function main() {
  if (DELETE_MUX && (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET)) {
    throw new Error('MUX_TOKEN_ID / MUX_TOKEN_SECRET missing but --delete-mux requested');
  }
  const mux = DELETE_MUX ? new Mux({
    tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET,
  }) : null;

  const targets = await fetchTargets();
  log(`Found ${targets.length} legacy Prime rows with mux_asset_id set`);
  log(`Mode: ${LIVE ? (DELETE_MUX ? 'LIVE + DELETE MUX' : 'LIVE (keep Mux)') : 'DRY-RUN'}`);

  // Phase C runs BEFORE Phase A so mux_asset_id is still in the DB rows.
  if (DELETE_MUX) await deleteMuxAssets(targets, mux);
  await revertChannelVideos(targets);
  await revertSocialPosts();

  const { rows: after } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE mux_asset_id IS NOT NULL) AS still_mux_asset,
        COUNT(*) FILTER (WHERE mux_playback_id IS NOT NULL) AS still_mux_pb,
        COUNT(*) AS total
      FROM channel_videos
     WHERE channel_id = 209 AND status = 'published' AND directus_file_id IS NOT NULL`
  );
  log(`After: total=${after[0].total} still_mux_asset=${after[0].still_mux_asset} still_mux_playback=${after[0].still_mux_pb}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
