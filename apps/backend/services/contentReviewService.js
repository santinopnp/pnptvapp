'use strict';

/**
 * contentReviewService.js
 *
 * Pre-publication review queue for creator / monetized content, required by
 * card-network rules for adult merchants (Mastercard AN 5196). Regular member
 * posts publish instantly; content from active creators waits for a
 * moderator. Admins are reviewers and are never held.
 *
 * Each type stays hidden while pending using a mechanism its readers already
 * respect (see migrations/436_content_reviews.sql).
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const TYPES = ['social_post', 'creator_media', 'channel_video'];

/**
 * Whether content from this user must be reviewed before it goes public.
 *
 * @param {{ creator_status?: string, role?: string }} user
 */
function requiresReview(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return false;
  return user.creator_status === 'active';
}

/** requiresReview() for callers that only have a user id. */
async function requiresReviewForUser(userId) {
  const { rows } = await query('SELECT role, creator_status FROM users WHERE id = $1', [String(userId)]);
  return requiresReview(rows[0]);
}

async function _submit(contentType, contentId, creatorId) {
  const { rows } = await query(
    `INSERT INTO content_reviews (content_type, content_id, creator_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (content_type, content_id) DO UPDATE SET content_type = EXCLUDED.content_type
     RETURNING *`,
    [contentType, String(contentId), String(creatorId)]
  );
  return rows[0];
}

/** Hide a just-created post until approved. */
async function holdSocialPost(postId, creatorId) {
  await query('UPDATE social_posts SET is_deleted = true WHERE id = $1', [postId]);
  const review = await _submit('social_post', postId, creatorId);
  logger.info('[ContentReview] post held for review', { postId, creatorId });
  return review;
}

/** Queue album media that was inserted with review_status = 'pending'. */
async function holdCreatorMedia(mediaId, creatorId) {
  const review = await _submit('creator_media', mediaId, creatorId);
  logger.info('[ContentReview] album media held for review', { mediaId, creatorId });
  return review;
}

/**
 * Called from publishVideo() for non-admins. Returns the review row; the video
 * only publishes once its status is 'approved'.
 */
async function submitChannelVideo(videoId, creatorId) {
  return _submit('channel_video', videoId, creatorId);
}

async function listPending({ limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT r.*, u.username AS creator_username,
            sp.content AS post_content, sp.media_url AS post_media_url, sp.media_type AS post_media_type,
            sp.media_urls AS post_media_urls, sp.is_exclusive AS post_is_exclusive,
            cm.url AS media_url, cm.media_type AS media_media_type, cm.caption AS media_caption,
            cm.is_premium AS media_is_premium,
            cv.title AS video_title, cv.thumbnail_url AS video_thumbnail_url
       FROM content_reviews r
       JOIN users u ON u.id = r.creator_id
       LEFT JOIN social_posts sp    ON r.content_type = 'social_post'   AND sp.id::text = r.content_id
       LEFT JOIN creator_media cm   ON r.content_type = 'creator_media' AND cm.id::text = r.content_id
       LEFT JOIN channel_videos cv  ON r.content_type = 'channel_video' AND cv.id::text = r.content_id
      WHERE r.status = 'pending'
      ORDER BY r.submitted_at ASC
      LIMIT $1`,
    [Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)]
  );
  return rows;
}

async function _decide(reviewId, adminId, status, reason) {
  const { rows } = await query(
    `UPDATE content_reviews
        SET status = $2, reason = $3, reviewed_by = $4, reviewed_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [reviewId, status, reason || null, String(adminId)]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Review not found or already decided'), { status: 404, code: 'REVIEW_NOT_PENDING' });
  }
  return rows[0];
}

const TYPE_LABELS = {
  social_post: { en: 'post', es: 'publicación' },
  creator_media: { en: 'album item', es: 'contenido del álbum' },
  channel_video: { en: 'video', es: 'video' },
};

// Non-fatal: tell the creator the outcome so held content never just vanishes.
function _notifyCreator(review) {
  try {
    const NotificationEmitter = require('./notificationEmitter');
    const label = TYPE_LABELS[review.content_type] || TYPE_LABELS.social_post;
    const approved = review.status === 'approved';
    const message = approved
      ? `Your ${label.en} was approved and is now live. / Tu ${label.es} fue aprobado y ya está publicado.`
      : `Your ${label.en} was not approved${review.reason ? `: ${review.reason}` : '.'} / Tu ${label.es} no fue aprobado.`;
    Promise.resolve(NotificationEmitter.emit({
      type: 'system', category: 'system', priority: 'normal',
      actorId: null, targetUserId: review.creator_id,
      entityType: review.content_type, entityId: String(review.content_id),
      message,
      metadata: { pushTitle: approved ? 'Content approved' : 'Content not approved', pushBody: message },
    })).catch(() => {});
  } catch (err) {
    logger.warn('[ContentReview] creator notification failed', { reviewId: review.id, error: err.message });
  }
}

async function approve(reviewId, adminId) {
  const review = await _decide(reviewId, adminId, 'approved', null);

  if (review.content_type === 'social_post') {
    const { rows } = await query(
      'UPDATE social_posts SET is_deleted = false WHERE id = $1 RETURNING channel_id',
      [review.content_id]
    );
    const channelId = rows[0]?.channel_id;
    if (channelId) {
      await query(
        `UPDATE creator_channels
            SET post_count = (SELECT COUNT(*) FROM social_posts WHERE channel_id = $1 AND is_deleted = false)
          WHERE id = $1`,
        [channelId]
      );
    }
  } else if (review.content_type === 'creator_media') {
    await query(`UPDATE creator_media SET review_status = 'approved' WHERE id = $1`, [review.content_id]);
  } else if (review.content_type === 'channel_video') {
    // Lazy require: channelVideoService requires this module.
    const channelVideoService = require('./channelVideoService');
    try {
      await channelVideoService.publishVideo({ videoId: Number(review.content_id), userId: adminId, isAdmin: true });
    } catch (err) {
      // Approval stands; the creator can press Publish again once e.g. Mux finishes.
      logger.warn('[ContentReview] approved video could not publish yet', { videoId: review.content_id, error: err.message });
    }
  }

  logger.info('[ContentReview] approved', { reviewId, type: review.content_type, contentId: review.content_id, adminId });
  _notifyCreator(review);
  return review;
}

async function reject(reviewId, adminId, reason) {
  const review = await _decide(reviewId, adminId, 'rejected', reason);
  if (review.content_type === 'creator_media') {
    await query(`UPDATE creator_media SET review_status = 'rejected' WHERE id = $1`, [review.content_id]);
  }
  // social_post stays is_deleted; channel_video stays unpublished.
  logger.info('[ContentReview] rejected', { reviewId, type: review.content_type, contentId: review.content_id, adminId });
  _notifyCreator(review);
  return review;
}

module.exports = {
  TYPES,
  requiresReview,
  requiresReviewForUser,
  holdSocialPost,
  holdCreatorMedia,
  submitChannelVideo,
  listPending,
  approve,
  reject,
};
