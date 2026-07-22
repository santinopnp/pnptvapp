'use strict';
/**
 * socialPostMuxService — direct browser→Mux upload pipeline for creator
 * social-feed video posts. Mirrors channelVideoService.createMuxUpload +
 * the Mux webhook handling, but writes to social_posts instead of
 * channel_videos.
 *
 * Why: /uploads/posts/ on the VPS is the biggest disk consumer (37 GB and
 * growing). Routing creator video posts through Mux offloads the storage +
 * transcoding + CDN and lets us raise the per-file cap to 50 GB.
 *
 * Flow:
 *   1. Frontend → POST /api/webapp/social/mux-upload-url
 *      → returns { uploadUrl, uploadId } (uploadUrl signed by Mux)
 *   2. Frontend → PUT the video file directly to Mux uploadUrl
 *   3. Frontend → POST /api/webapp/social/posts/mux-finalize with the
 *      uploadId + post metadata (content, category, tier, etc.)
 *      → inserts a social_posts row with mux_upload_id populated;
 *        media_url/media_type stay NULL until the webhook fires
 *   4. Mux webhook → video.upload.asset_created  → sets mux_asset_id
 *                  → video.asset.ready           → sets mux_playback_id +
 *                                                  video_thumbnail_url
 *
 * Only active creators may use this path. Regular users continue to use
 * the legacy multer flow at /api/webapp/social/posts/with-media.
 */

const { query } = require('../config/postgres');
const muxService = require('./muxService');
const SocialPostService = require('./socialPostService');
const logger = require('../utils/logger');

// ── Auth helper ──────────────────────────────────────────────────────────────

async function assertActiveCreator(userId) {
  const { rows } = await query(
    `SELECT creator_status, role FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) throw Object.assign(new Error('User not found'), { status: 404 });
  const isCreator = row.creator_status === 'active';
  const isAdmin = row.role === 'admin' || row.role === 'superadmin';
  if (!isCreator && !isAdmin) {
    throw Object.assign(new Error('Only active creators can use Mux uploads'), { status: 403 });
  }
}

// ── Step 1: create Mux direct upload ─────────────────────────────────────────

async function createMuxUpload(userId) {
  await assertActiveCreator(userId);
  const { id: uploadId, url: uploadUrl } = await muxService.createDirectUpload();
  return { uploadId, uploadUrl };
}

// ── Step 2: finalize (create the social_posts row with mux_upload_id) ────────

async function finalizeMuxPost(userId, params) {
  await assertActiveCreator(userId);

  const {
    uploadId,
    content,
    isExclusive = false,
    isShareable = true,
    hangoutGroupId = null,
    category = null,
    channelId = null,
    taggedPerformerIds = null,
  } = params;

  if (!uploadId || typeof uploadId !== 'string') {
    throw Object.assign(new Error('uploadId required'), { status: 400 });
  }
  if (!content || !String(content).trim()) {
    throw Object.assign(new Error('content required'), { status: 400 });
  }

  // Guard against reuse of the same uploadId (idempotency)
  const { rows: existing } = await query(
    `SELECT id FROM social_posts WHERE mux_upload_id = $1 LIMIT 1`,
    [uploadId]
  );
  if (existing.length) {
    throw Object.assign(new Error('This upload has already been finalized'), { status: 409 });
  }

  // Insert via SocialPostService.createPost so all the classify/tier logic runs,
  // then patch the Mux columns. mediaUrl/mediaType stay NULL until the webhook
  // fires — the frontend renders a "processing" placeholder based on mux_status.
  const post = await SocialPostService.createPost(
    userId,
    String(content).trim(),
    null,        // mediaUrl
    'video',     // mediaType (we know it's a video because we minted a Mux upload)
    null,        // replyToId
    null,        // repostOfId
    false,       // isWof
    !!isExclusive,
    !!isShareable,
    null,        // videoThumbnailUrl (webhook fills this)
    null,        // videoTitle
    null,        // videoDescription
    hangoutGroupId,
    null,        // sourceMessageId
    category
  );

  await query(
    `UPDATE social_posts
        SET mux_upload_id = $1, mux_status = 'uploading'
      WHERE id = $2`,
    [uploadId, post.id]
  );

  // Optional channel assignment
  if (channelId && Number.isFinite(Number(channelId))) {
    await query(`UPDATE social_posts SET channel_id = $1 WHERE id = $2`, [Number(channelId), post.id]);
    post.channel_id = Number(channelId);
  }

  // Tags
  if (Array.isArray(taggedPerformerIds) && taggedPerformerIds.length) {
    try {
      const { createPostTags } = require('./mentionService');
      await createPostTags(post.id, userId, taggedPerformerIds);
    } catch (err) {
      logger.warn('socialPostMuxService: createPostTags failed (non-fatal)', { err: err.message });
    }
  }

  return {
    ...post,
    mux_upload_id: uploadId,
    mux_status: 'uploading',
  };
}

// ── Step 3: webhook handler (called from channelVideoService.handleMuxWebhook) ─

async function handleMuxWebhook(event) {
  const { type, data } = event;

  if (type === 'video.upload.asset_created') {
    const { id: assetId, upload_id: uploadId } = data;
    const result = await query(
      `UPDATE social_posts
          SET mux_asset_id = $1, mux_status = 'preparing'
        WHERE mux_upload_id = $2 AND mux_asset_id IS NULL`,
      [assetId, uploadId]
    );
    if (result.rowCount) {
      logger.info('social mux webhook: upload linked to asset', { uploadId, assetId });
    }
    return result.rowCount;
  }

  if (type === 'video.asset.ready') {
    const { id: assetId, playback_ids, duration } = data;
    const playbackId = playback_ids?.[0]?.id;
    if (!playbackId) return 0;
    const thumbUrl = muxService.getThumbnailUrl(playbackId, { percentage: 25 });
    const playUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    const result = await query(
      `UPDATE social_posts
          SET mux_playback_id = $1,
              mux_status = 'ready',
              media_url = COALESCE(media_url, $2),
              video_thumbnail_url = COALESCE(video_thumbnail_url, $3),
              metadata = metadata || jsonb_build_object('mux_duration_sec', $4::int)
        WHERE mux_asset_id = $5`,
      [playbackId, playUrl, thumbUrl, duration ? Math.round(duration) : null, assetId]
    );
    if (result.rowCount) {
      logger.info('social mux webhook: asset ready', { assetId, playbackId });
    }
    return result.rowCount;
  }

  if (type === 'video.asset.errored') {
    const result = await query(
      `UPDATE social_posts SET mux_status = 'errored' WHERE mux_asset_id = $1`,
      [data.id]
    );
    if (result.rowCount) {
      logger.warn('social mux webhook: asset errored', { assetId: data.id });
    }
    return result.rowCount;
  }

  if (type === 'video.upload.cancelled' || type === 'video.upload.errored') {
    const uploadId = data.id;
    const result = await query(
      `UPDATE social_posts SET mux_status = $1 WHERE mux_upload_id = $2`,
      [type === 'video.upload.cancelled' ? 'cancelled' : 'errored', uploadId]
    );
    if (result.rowCount) {
      logger.warn('social mux webhook: upload cancelled/errored', { uploadId, type });
    }
    return result.rowCount;
  }

  return 0;
}

module.exports = {
  createMuxUpload,
  finalizeMuxPost,
  handleMuxWebhook,
};
