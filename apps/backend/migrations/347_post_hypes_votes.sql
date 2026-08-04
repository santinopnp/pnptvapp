-- 347_post_hypes_votes.sql
--
-- Reshape "hype" from a post-wrapper into a vote (YouTube-Hype style).
-- Old model: every hype = new social_posts row with metadata.kind='community_hype'
--            + repost_of_id / original_post_id pointer. Noisy in the feed,
--            duplicative attribution, and prone to "unavailable" placeholders
--            whenever the original was deleted or turned exclusive.
-- New model: hype is a vote row in post_hypes with a 7-day TTL. Attribution
--            renders inline on the original post ("🔥 Hyped by @a and 12
--            others"), boosts the post in _applyDiscoveryBoost, and never
--            creates a standalone feed entry.
--
-- Repost stays as-is (repost_of_id column) and finally gets its own UI banner
-- on the frontend; no schema change needed for that half.

BEGIN;

-- ── post_hypes vote table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_hypes (
  user_id     TEXT        NOT NULL,
  post_id     INTEGER     NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  weight      INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_hypes_post_active
  ON post_hypes (post_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_hypes_user_created
  ON post_hypes (user_id, created_at DESC);

-- ── Denormalized hype_score on social_posts ──────────────────────────────
-- Sum of active vote weights. Recomputed on hype/unhype and by the backfill
-- below. Used by _applyDiscoveryBoost — a slightly stale value is fine.
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS hype_score INTEGER NOT NULL DEFAULT 0;

-- ── Backfill: convert existing community_hype posts → post_hypes votes ──
-- Preserve original vote creation time and expire 7d after creation.
INSERT INTO post_hypes (user_id, post_id, weight, created_at, expires_at)
SELECT
  sp.user_id::text,
  ((sp.metadata->>'original_post_id')::int) AS post_id,
  1 AS weight,
  sp.created_at,
  sp.created_at + INTERVAL '7 days'
FROM social_posts sp
JOIN social_posts orig
  ON orig.id = ((sp.metadata->>'original_post_id')::int)
 AND orig.is_deleted = false
WHERE sp.is_deleted = false
  AND sp.metadata IS NOT NULL
  AND (sp.metadata->>'kind') = 'community_hype'
  AND (sp.metadata->>'original_post_id') ~ '^[0-9]+$'
ON CONFLICT (user_id, post_id) DO NOTHING;

-- ── Soft-delete every community_hype wrapper post ────────────────────────
-- Cleans the feed + profile walls in one shot. Original media/authorship are
-- unchanged (media_url on hype rows has been NULL since the "media-never-
-- duplicated" fix landed).
UPDATE social_posts
   SET is_deleted = true,
       updated_at = NOW()
 WHERE is_deleted = false
   AND metadata IS NOT NULL
   AND (metadata->>'kind') = 'community_hype';

-- Corresponding reposts_count decrement on the ORIGINAL for every wrapper
-- we just deleted (matches deletePost's semantics; keeps counts honest).
UPDATE social_posts orig
   SET reposts_count = GREATEST(orig.reposts_count - hype_counts.n, 0)
  FROM (
    SELECT ((metadata->>'original_post_id')::int) AS orig_id, COUNT(*)::int AS n
      FROM social_posts
     WHERE metadata IS NOT NULL
       AND (metadata->>'kind') = 'community_hype'
       AND (metadata->>'original_post_id') ~ '^[0-9]+$'
       AND is_deleted = true
       AND updated_at > NOW() - INTERVAL '5 minutes'
     GROUP BY 1
  ) AS hype_counts
 WHERE orig.id = hype_counts.orig_id;

-- ── Prime hype_score from the fresh vote table ──────────────────────────
UPDATE social_posts sp
   SET hype_score = COALESCE(v.total, 0)
  FROM (
    SELECT post_id, SUM(weight)::int AS total
      FROM post_hypes
     WHERE expires_at > NOW()
     GROUP BY post_id
  ) v
 WHERE sp.id = v.post_id;

COMMIT;
