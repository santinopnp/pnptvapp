'use strict';

/**
 * muxReconcilerService — periodic Mux poll that makes the system tolerant
 * of a missing / misconfigured Mux webhook.
 *
 * The webhook at /api/webhooks/mux does two things:
 *   (a) video.upload.asset_created  → sets mux_asset_id on the DB row
 *   (b) video.asset.ready           → sets mux_playback_id + media_url + thumb
 *
 * When the webhook isn't configured on the Mux dashboard (or points at a
 * stale URL, or hits a rate-limited endpoint), those linkages never happen.
 * Videos upload to Mux successfully but stay "waiting" forever from the
 * webapp's point of view — creators see broken cards, we see the leak as
 * "10 orphan Mux assets, 0 rows updated" (see 2026-07-23 incident).
 *
 * This service closes the loop by polling Mux directly for every row that
 * still has `mux_upload_id` but a non-ready `mux_status`. It reuses the
 * exact same UPDATE statements the webhook handlers use — so a live
 * webhook and a stale poll converge to identical DB state.
 *
 * Cadence: 30s. Per-tick cap: 20 rows across both tables so a burst of
 * uploads can't stall the process on Mux rate limits.
 */

const { query } = require('../config/postgres');
const muxService = require('./muxService');
const logger = require('../utils/logger');

const POLL_INTERVAL_MS = 30 * 1000;
const ROWS_PER_TICK = 20;
const STALE_AGE_MIN = 1;   // Only reconcile rows older than 1 min — gives the webhook a chance first
const GIVE_UP_HOURS = 24;  // Rows older than 24h with no asset_id → mark errored

let pollerHandle = null;
let pollerBusy = false;

async function fetchStaleChannelVideoRows() {
  const { rows } = await query(
    `SELECT id, mux_upload_id, mux_asset_id, mux_status
       FROM channel_videos
      WHERE mux_upload_id IS NOT NULL
        AND (mux_status IS NULL OR mux_status NOT IN ('ready', 'errored', 'cancelled'))
        AND created_at < NOW() - INTERVAL '${STALE_AGE_MIN} minutes'
        AND created_at > NOW() - INTERVAL '${GIVE_UP_HOURS} hours'
      ORDER BY created_at ASC
      LIMIT $1`,
    [ROWS_PER_TICK]
  );
  return rows;
}

async function fetchStaleSocialPostRows() {
  const { rows } = await query(
    `SELECT id, mux_upload_id, mux_asset_id, mux_status
       FROM social_posts
      WHERE mux_upload_id IS NOT NULL
        AND (mux_status IS NULL OR mux_status NOT IN ('ready', 'errored', 'cancelled'))
        AND created_at < NOW() - INTERVAL '${STALE_AGE_MIN} minutes'
        AND created_at > NOW() - INTERVAL '${GIVE_UP_HOURS} hours'
      ORDER BY created_at ASC
      LIMIT $1`,
    [ROWS_PER_TICK]
  );
  return rows;
}

/**
 * Reconcile a single row: pull latest Mux state, mirror it into DB.
 * Idempotent — safe to run repeatedly; converges to the webhook's end state.
 */
async function reconcileRow(table, row) {
  const { id, mux_upload_id, mux_asset_id, mux_status } = row;

  // Step 1: if we don't have an asset_id yet, ask Mux what the upload became.
  let assetId = mux_asset_id;
  if (!assetId) {
    let upload;
    try {
      upload = await muxService.getUpload(mux_upload_id);
    } catch (err) {
      if (err.status === 404) {
        // Upload was deleted / expired — cancel the row and stop polling it.
        await query(
          `UPDATE ${table} SET mux_status = 'errored' WHERE id = $1`,
          [id]
        );
        logger.warn(`muxReconciler: ${table}#${id} upload 404 — marked errored`, { mux_upload_id });
        return;
      }
      throw err;
    }

    if (upload.status === 'cancelled' || upload.status === 'timed_out') {
      await query(
        `UPDATE ${table} SET mux_status = 'cancelled' WHERE id = $1`,
        [id]
      );
      return;
    }
    if (upload.status === 'errored') {
      await query(
        `UPDATE ${table} SET mux_status = 'errored' WHERE id = $1`,
        [id]
      );
      return;
    }
    if (upload.status === 'waiting') {
      // Creator hasn't PUT the file yet. Nothing to do.
      return;
    }
    // 'asset_created' — we have an asset id now.
    assetId = upload.asset_id;
    if (!assetId) return;

    await query(
      `UPDATE ${table}
          SET mux_asset_id = $1,
              mux_status = CASE WHEN mux_status IN ('ready') THEN mux_status ELSE 'preparing' END
        WHERE id = $2 AND mux_asset_id IS NULL`,
      [assetId, id]
    );
    logger.info(`muxReconciler: ${table}#${id} linked to asset`, { assetId });
  }

  // Step 2: check if the asset is ready → pull playback_id + duration + thumb.
  if (mux_status === 'ready') return;

  let asset;
  try {
    asset = await muxService.getAsset(assetId);
  } catch (err) {
    if (err.status === 404) {
      await query(
        `UPDATE ${table} SET mux_status = 'errored' WHERE id = $1`,
        [id]
      );
      logger.warn(`muxReconciler: ${table}#${id} asset 404 — marked errored`, { assetId });
      return;
    }
    throw err;
  }

  if (asset.status === 'errored') {
    await query(
      `UPDATE ${table} SET mux_status = 'errored' WHERE id = $1`,
      [id]
    );
    return;
  }
  if (asset.status !== 'ready') return; // still preparing

  const playbackId = asset.playback_ids?.[0]?.id;
  if (!playbackId) return;

  const thumbUrl = muxService.getThumbnailUrl(playbackId, { percentage: 25 });
  const playUrl = `https://stream.mux.com/${playbackId}.m3u8`;
  const durationSec = asset.duration ? Math.round(asset.duration) : null;

  if (table === 'channel_videos') {
    // Resurrect status when Mux confirms ready: the 1h→6h stuck scheduler still
    // won't cover every long upload, and Mux sometimes takes hours to finish
    // processing. If our row was flipped to 'failed' but Mux says the asset is
    // ready, publish it. Only 'removed' (explicit user delete) is respected.
    await query(
      `UPDATE channel_videos
          SET mux_playback_id = $1,
              mux_status = 'ready',
              duration_sec = COALESCE(duration_sec, $2),
              thumbnail_url = COALESCE(thumbnail_url, $3),
              status = CASE WHEN status = 'removed' THEN status ELSE 'published' END,
              updated_at = NOW()
        WHERE id = $4`,
      [playbackId, durationSec, thumbUrl, id]
    );
  } else if (table === 'social_posts') {
    await query(
      `UPDATE social_posts
          SET mux_playback_id = $1,
              mux_status = 'ready',
              media_url = COALESCE(media_url, $2),
              video_thumbnail_url = COALESCE(video_thumbnail_url, $3),
              metadata = metadata || jsonb_build_object('mux_duration_sec', $4::int)
        WHERE id = $5`,
      [playbackId, playUrl, thumbUrl, durationSec, id]
    );
  }
  logger.info(`muxReconciler: ${table}#${id} asset ready`, { assetId, playbackId, durationSec });
}

async function pollTick() {
  if (pollerBusy) return;
  pollerBusy = true;
  try {
    const [chRows, spRows] = await Promise.all([
      fetchStaleChannelVideoRows(),
      fetchStaleSocialPostRows(),
    ]);
    if (chRows.length === 0 && spRows.length === 0) return;

    logger.debug('muxReconciler: reconciling stale rows', {
      channelVideos: chRows.length, socialPosts: spRows.length,
    });

    for (const row of chRows) {
      await reconcileRow('channel_videos', row).catch((err) => {
        logger.warn('muxReconciler: channel_videos row failed', { id: row.id, error: err.message });
      });
    }
    for (const row of spRows) {
      await reconcileRow('social_posts', row).catch((err) => {
        logger.warn('muxReconciler: social_posts row failed', { id: row.id, error: err.message });
      });
    }

    // Give-up sweep: any row older than GIVE_UP_HOURS with no asset_id →
    // mark errored so we stop polling and creators see the failure.
    await query(
      `UPDATE channel_videos SET mux_status = 'errored'
        WHERE mux_upload_id IS NOT NULL
          AND mux_asset_id IS NULL
          AND (mux_status IS NULL OR mux_status NOT IN ('ready', 'errored', 'cancelled'))
          AND created_at < NOW() - INTERVAL '${GIVE_UP_HOURS} hours'`
    );
    await query(
      `UPDATE social_posts SET mux_status = 'errored'
        WHERE mux_upload_id IS NOT NULL
          AND mux_asset_id IS NULL
          AND (mux_status IS NULL OR mux_status NOT IN ('ready', 'errored', 'cancelled'))
          AND created_at < NOW() - INTERVAL '${GIVE_UP_HOURS} hours'`
    );
  } catch (err) {
    logger.error('muxReconciler: tick error', { error: err.message });
  } finally {
    pollerBusy = false;
  }
}

function startMuxReconciler() {
  if (process.env.PNP_DISABLE_MUX_RECONCILER === '1') {
    logger.info('muxReconciler: disabled via PNP_DISABLE_MUX_RECONCILER=1');
    return;
  }
  if (pollerHandle) return;
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    logger.warn('muxReconciler: MUX_TOKEN_ID/SECRET not configured — skipping start');
    return;
  }
  pollerHandle = setInterval(pollTick, POLL_INTERVAL_MS);
  logger.info(`muxReconciler: started (${POLL_INTERVAL_MS / 1000}s interval)`);
}

function stopMuxReconciler() {
  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
    logger.info('muxReconciler: stopped');
  }
}

module.exports = { startMuxReconciler, stopMuxReconciler, pollTick };
