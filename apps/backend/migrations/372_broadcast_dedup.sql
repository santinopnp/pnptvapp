-- 372_broadcast_dedup.sql
--
-- Private per-batch dedup table for broadcast-*.js scripts.
-- Replaces the prior pattern of inserting dedup markers into the user-facing
-- `notifications` table, which leaked raw internal strings
-- (e.g. "banxa-btc-broadcast:dual-xxx") into users' notification bells.
--
-- Any broadcast script that needs "did we already DM this user for this
-- campaign?" MUST use this table — never `notifications`.

CREATE TABLE IF NOT EXISTS broadcast_dedup (
  batch_id VARCHAR(255) NOT NULL,
  user_id  VARCHAR(255) NOT NULL,
  sent_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_dedup_batch ON broadcast_dedup(batch_id);
