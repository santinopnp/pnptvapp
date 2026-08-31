-- Migration 378: creator_subscriptions active-subscription dedup guard
--
-- Background: A test purchase (sub id=a68b3c26, 2026-08-31) produced two
-- token_ledger debits + two creator_earnings rows for the same (subscriber,
-- creator) pair when the token payment path was called concurrently.
--
-- The table already has a non-partial UNIQUE constraint on (creator_id,
-- subscriber_id), so a second partial unique on status='active' would conflict
-- at CREATE time.  The real fix is the application-level idempotency guard
-- added to subscribeToCreator().  This migration adds a covering index to make
-- that guard's look-up fast and records the incident for schema history.

-- Index used by the idempotency guard at the top of subscribeToCreator():
--   SELECT id, expires_at FROM creator_subscriptions
--   WHERE subscriber_id=$1 AND creator_id=$2 AND status='active'
--     AND (expires_at IS NULL OR expires_at > NOW())
CREATE INDEX IF NOT EXISTS idx_creator_sub_active_lookup
  ON creator_subscriptions (subscriber_id, creator_id)
  WHERE status = 'active';
