#!/usr/bin/env node
'use strict';

/**
 * reingest-legacy-prime-to-mux-2026-08-22.js
 *
 * One-shot: URL-ingest the 30 legacy Directus MP4s in PRIME (channel_id=209)
 * that predate the Mux migration and currently render as "Video unavailable"
 * in the webapp (root cause: non-faststart / VVC-encoded raw phone uploads
 * that browsers can't decode).
 *
 * Target rows:
 *   channel_videos WHERE channel_id=209
 *                    AND status='published'
 *                    AND mux_playback_id IS NULL
 *                    AND directus_file_id IS NOT NULL
 *
 * Flow per row:
 *   1. If mux_asset_id already set → skip create, go to poll.
 *   2. mux.video.assets.create({ input: [{ url: cms.pnptv.app/assets/<uuid> }] })
 *   3. UPDATE channel_videos SET mux_asset_id=..., mux_status='preparing'.
 *   4. Poll mux.video.assets.retrieve until status='ready' or 'errored'.
 *   5. On ready → UPDATE mux_playback_id, mux_status='ready',
 *                        duration_sec (COALESCE), thumbnail_url (COALESCE).
 *
 * The listChannelVideos service prefers mux_playback_id over directus_file_id
 * (services/channelVideoService.js:1225-1229), so once mux_playback_id is set
 * the webapp switches to Mux HLS automatically — no cache flush needed.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/reingest-legacy-prime-to-mux-2026-08-22.js            # dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/reingest-legacy-prime-to-mux-2026-08-22.js --live      # create + poll
 *   docker exec pnptv-bot node /app/apps/backend/scripts/reingest-legacy-prime-to-mux-2026-08-22.js --poll-only # skip create, only poll
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const muxService = require('../services/muxService');
const Mux = require('@mux/mux-node');

const LIVE       = process.argv.includes('--live');
const POLL_ONLY  = process.argv.includes('--poll-only');
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS  = 60 * 60 * 1000; // 60 min per batch

function directusUrl(fileId) {
  return `https://cms.pnptv.app/assets/${fileId}`;
}

function nowIso() {
  return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}
function log(msg) {
  console.log(`[${nowIso()}] ${msg}`);
}

async function fetchTargets() {
  const { rows } = await query(
    `SELECT id, title, directus_file_id, video_url, thumbnail_url,
            mux_asset_id, mux_status, duration_sec
       FROM channel_videos
      WHERE channel_id = 209
        AND status = 'published'
        AND mux_playback_id IS NULL
        AND directus_file_id IS NOT NULL
      ORDER BY id ASC`
  );
  return rows;
}

async function createAsset(mux, row) {
  const url = directusUrl(row.directus_file_id);
  const asset = await mux.video.assets.create({
    input: [{ url }],
    playback_policy: ['public'],
    encoding_tier: 'smart',
  });
  return asset;
}

async function markAssetCreated(row, assetId) {
  await query(
    `UPDATE channel_videos
        SET mux_asset_id = $1,
            mux_status   = 'preparing',
            updated_at   = NOW()
      WHERE id = $2 AND mux_asset_id IS NULL`,
    [assetId, row.id]
  );
}

async function markReady(row, playbackId, durationSec, thumbUrl) {
  await query(
    `UPDATE channel_videos
        SET mux_playback_id = $1,
            mux_status      = 'ready',
            duration_sec    = COALESCE(duration_sec, $2),
            thumbnail_url   = COALESCE(thumbnail_url, $3),
            updated_at      = NOW()
      WHERE id = $4`,
    [playbackId, durationSec, thumbUrl, row.id]
  );
}

async function markErrored(row, reason) {
  await query(
    `UPDATE channel_videos SET mux_status = 'errored', updated_at = NOW() WHERE id = $1`,
    [row.id]
  );
  log(`  row=${row.id} → mux_status='errored' (${reason})`);
}

async function ingestPhase(mux, targets) {
  const toCreate = targets.filter(r => !r.mux_asset_id);
  log(`Ingest phase — ${toCreate.length} row(s) need Mux asset creation (${targets.length - toCreate.length} already have one)`);

  for (const row of toCreate) {
    const url = directusUrl(row.directus_file_id);
    if (!LIVE) {
      log(`  [DRY] row=${row.id} title="${(row.title || '').slice(0, 40)}" → would ingest ${url}`);
      continue;
    }
    try {
      const asset = await createAsset(mux, row);
      await markAssetCreated(row, asset.id);
      row.mux_asset_id = asset.id;
      row.mux_status = 'preparing';
      log(`  row=${row.id} → asset=${asset.id} status=${asset.status}`);
    } catch (err) {
      log(`  row=${row.id} → CREATE FAILED: ${err.status || ''} ${err.message}`);
      // don't mark errored — allow rerun to retry
    }
    // gentle: 300ms between creates so we don't hammer the URL-ingest queue
    await new Promise(r => setTimeout(r, 300));
  }
}

async function pollPhase(mux, targets) {
  const pending = targets.filter(r => r.mux_asset_id && r.mux_status !== 'ready');
  if (pending.length === 0) {
    log('Poll phase — nothing pending');
    return;
  }
  log(`Poll phase — ${pending.length} asset(s) to watch (interval=${POLL_INTERVAL_MS / 1000}s, timeout=${POLL_TIMEOUT_MS / 60000}min)`);

  const startedAt = Date.now();
  const remaining = new Map(pending.map(r => [r.id, r]));

  while (remaining.size > 0) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      log(`Timeout — ${remaining.size} still not ready: ${[...remaining.keys()].join(', ')}`);
      return;
    }

    for (const [rowId, row] of [...remaining]) {
      let asset;
      try {
        asset = await mux.video.assets.retrieve(row.mux_asset_id);
      } catch (err) {
        if (err.status === 404) {
          await markErrored(row, 'asset 404');
          remaining.delete(rowId);
          continue;
        }
        log(`  row=${rowId} retrieve failed (non-fatal): ${err.message}`);
        continue;
      }

      if (asset.status === 'errored') {
        await markErrored(row, `errors=${JSON.stringify(asset.errors || {})}`);
        remaining.delete(rowId);
        continue;
      }
      if (asset.status !== 'ready') {
        // preparing / waiting
        continue;
      }

      const playbackId = asset.playback_ids?.[0]?.id;
      if (!playbackId) {
        log(`  row=${rowId} ready but no playback_id — waiting`);
        continue;
      }
      const thumbUrl = muxService.getThumbnailUrl(playbackId, { percentage: 25 });
      const durationSec = asset.duration ? Math.round(asset.duration) : null;
      await markReady(row, playbackId, durationSec, thumbUrl);
      log(`  row=${rowId} READY playback=${playbackId} dur=${durationSec}s`);
      remaining.delete(rowId);
    }

    if (remaining.size > 0) {
      log(`  ${remaining.size} still preparing (${Math.round((Date.now() - startedAt) / 1000)}s elapsed) — sleeping ${POLL_INTERVAL_MS / 1000}s`);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  log('All assets processed.');
}

async function main() {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    throw new Error('MUX_TOKEN_ID / MUX_TOKEN_SECRET missing from env');
  }
  const mux = new Mux({
    tokenId:     process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
  });

  const targets = await fetchTargets();
  log(`Found ${targets.length} legacy PRIME videos with no Mux playback_id`);
  log(`Mode: ${LIVE ? 'LIVE' : POLL_ONLY ? 'POLL-ONLY (no create, still --live implied for poll)' : 'DRY-RUN'}`);

  if (!POLL_ONLY) {
    await ingestPhase(mux, targets);
  } else {
    log('Skipping ingest phase (--poll-only)');
  }

  if (LIVE || POLL_ONLY) {
    // Re-read the rows so we pick up any asset IDs that other runs / partial
    // successes may have set — makes reruns safe.
    const fresh = await fetchTargets();
    await pollPhase(mux, fresh);
  } else {
    log('Skipping poll phase (dry-run).');
  }

  const { rows: after } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE mux_playback_id IS NOT NULL) AS ready,
        COUNT(*) FILTER (WHERE mux_status = 'preparing')    AS preparing,
        COUNT(*) FILTER (WHERE mux_status = 'errored')      AS errored,
        COUNT(*)                                            AS total
      FROM channel_videos
     WHERE channel_id = 209
       AND status = 'published'
       AND directus_file_id IS NOT NULL
       AND video_url IS NOT NULL`
  );
  log(`Final state (legacy pool): ready=${after[0].ready} preparing=${after[0].preparing} errored=${after[0].errored} total=${after[0].total}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL:', err.stack || err.message);
    process.exit(1);
  });
