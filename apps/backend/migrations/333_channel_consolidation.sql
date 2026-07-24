-- Migration 333: Creator channel consolidation (phase 1 — one paid channel per creator).
--
-- Rationale (2026-07-24 change):
--   Free channels are deprecated. Every active creator gets ONE canonical paid
--   channel (access_type='subscription'). All their exclusive posts auto-mirror
--   into that channel so subscribers see a curated feed of premium content.
--   Free/extra-paid channels are consolidated into the canonical channel and
--   then deleted. Later phases will allow creators to add themed extra paid
--   channels.
--
-- Audit table preserves the mapping for rollback.
-- The actual data migration runs from migrations/333_channel_consolidation.js
-- (idempotent Node script) so it can log per-creator decisions.

CREATE TABLE IF NOT EXISTS channel_migration_333_audit (
  id                  BIGSERIAL PRIMARY KEY,
  creator_id          TEXT NOT NULL,
  action              TEXT NOT NULL,        -- 'kept_canonical' | 'deleted' | 'created' | 'moved_posts'
  channel_id          INT,
  canonical_channel_id INT,
  post_count          INT DEFAULT 0,
  detail              JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE channel_migration_333_audit IS
  'One-shot audit trail for the 2026-07-24 creator channel consolidation. Kept for post-mortem/rollback.';

CREATE INDEX IF NOT EXISTS idx_ch_migr_333_creator ON channel_migration_333_audit(creator_id);
CREATE INDEX IF NOT EXISTS idx_ch_migr_333_action  ON channel_migration_333_audit(action);
