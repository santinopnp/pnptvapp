-- Migration 436: pre-publication review for creator / monetized content
--
-- Card-network rules for adult merchants (Mastercard AN 5196) require content
-- to be reviewed before it is published. Creator media posts, creator album
-- media and channel videos are held in this queue until a moderator approves.
--
-- How each type stays hidden while pending:
--   social_post   → social_posts.is_deleted = true (every feed already filters it)
--   creator_media → creator_media.review_status (public reads filter 'approved')
--   channel_video → stays in its pre-publish status; publishVideo() runs on approval
-- users.id is VARCHAR(255).

CREATE TABLE IF NOT EXISTS content_reviews (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  VARCHAR(32)  NOT NULL CHECK (content_type IN ('social_post', 'creator_media', 'channel_video')),
  content_id    VARCHAR(64)  NOT NULL,
  creator_id    VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason        TEXT,
  submitted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by   VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  UNIQUE (content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reviews_pending
  ON content_reviews (submitted_at)
  WHERE status = 'pending';

-- Existing album media was published before review existed: grandfather it.
ALTER TABLE creator_media
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(16) NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending', 'approved', 'rejected'));
