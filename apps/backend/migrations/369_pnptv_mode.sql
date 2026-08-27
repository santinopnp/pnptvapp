-- Migration 369: PNPtv! Mode — spotlight-lock streaming format
--
-- When a user with pnptv_mode_expires_at > NOW() connects to Main Stage:
--   - Layout auto-locks to spotlight focused on them
--   - Others become small side tiles
--   - No admin can override until they disconnect (+60s grace)
--   - Viewers tip live in tokens; buy-tokens flow available in-stream
--
-- Founders (Santino, Lex, Amadeus) get 'infinity' — permanent grant.
-- Other creators can be granted temporarily via admin panel (task #11).

-- ── 1. users column: privilege flag with optional expiry ────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pnptv_mode_expires_at TIMESTAMPTZ NULL;

-- Partial index — only rows with the privilege matter for the detection query
CREATE INDEX IF NOT EXISTS idx_users_pnptv_mode_active
  ON users (id) WHERE pnptv_mode_expires_at IS NOT NULL;

-- ── 2. session log table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pnptv_mode_sessions (
  id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id      TEXT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ    NULL,
  -- 'tokens' is the internal DB name for what the UI calls Ru$h.
  tokens_tipped_total NUMERIC(14,2)  NOT NULL DEFAULT 0,
  tips_count          INT            NOT NULL DEFAULT 0,
  viewer_peak         INT            NOT NULL DEFAULT 0,
  -- Creator-set goal for the current session (null = no goal). Editable
  -- from the Main Stage UI while the session is active.
  tip_goal_tokens     INT            NULL,
  metadata            JSONB          NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pnptv_mode_sessions_holder
  ON pnptv_mode_sessions (holder_user_id, started_at DESC);

-- Enforce: at most one active (ended_at IS NULL) session per holder
CREATE UNIQUE INDEX IF NOT EXISTS uq_pnptv_mode_sessions_active_per_holder
  ON pnptv_mode_sessions (holder_user_id) WHERE ended_at IS NULL;

-- Fast lookup of the currently-active session (typically 0-3 rows)
CREATE INDEX IF NOT EXISTS idx_pnptv_mode_sessions_active
  ON pnptv_mode_sessions (started_at DESC) WHERE ended_at IS NULL;

-- ── 3. seed founders with permanent grant ────────────────────────────────────
-- Santino Furioso, PNPLatinoBoy (Lex), Amadeus (Jonathan's stage persona).
-- 'infinity' is PostgreSQL's built-in max timestamp — never expires.
UPDATE users
   SET pnptv_mode_expires_at = 'infinity'::timestamptz
 WHERE id IN (
   '8599671840',                            -- Santino
   '8f5f4dd1-7bdb-4571-b026-e09d91113c91',  -- Lex (PNPLatinoBoy)
   '7bdabb03-b447-4e8e-b989-efe1b5e773fd'   -- Amadeus
 );
