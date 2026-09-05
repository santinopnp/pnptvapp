-- Migration 392: Composite indexes for the creator-profile pipeline.
--
-- 1. idx_creator_subs_active_lookup
--    Covers getSubscriptionStatus() in creatorService.js which filters by
--    (creator_id, subscriber_id, status='active') and inspects expires_at.
--    The partial WHERE clause prunes all non-active rows from the index,
--    keeping it small and the predicate cheap.
--
-- 2. idx_post_hypes_by_post_desc
--    Covers hydrateTopHypers() in socialPostService.js which does a window
--    function (ROW_NUMBER PARTITION BY post_id ORDER BY created_at DESC)
--    filtered to expires_at > NOW().  The partial index prunes expired hypes
--    so the planner never visits dead rows.

CREATE INDEX IF NOT EXISTS idx_creator_subs_active_lookup
  ON creator_subscriptions(creator_id, subscriber_id, status, expires_at)
  WHERE status = 'active';

-- Note: expires_at > NOW() cannot be a partial index predicate (NOW() is not
-- IMMUTABLE). The index covers post_id + created_at DESC for the window
-- function; the planner applies the expires_at filter as a heap recheck.
CREATE INDEX IF NOT EXISTS idx_post_hypes_by_post_desc
  ON post_hypes(post_id, created_at DESC, expires_at);
