-- Migration 366: Anti-leakage strikes ledger
-- Run date: 2026-08-10
-- Context: Sprint 1 of the anti-leakage enforcement program. Records every
-- detection of off-platform competitor promotion or off-platform payment
-- solicitation (bio, DM, main-stage chat, hangout chat) so we can:
--   (a) apply the escalation ladder (1=warn, 2=24h mute, 3=ban) with a
--       consistent 30-day rolling window,
--   (b) power the admin triage dashboard (Sprint 2),
--   (c) gate creator payouts (Sprint 2 — creators with active strikes get
--       payout held pending review).
--
-- We use a dedicated table rather than the existing `warnings` table because
-- warnings is group-scoped (requires a group_id) and this violation class is
-- platform-wide, not scoped to any hangout/telegram group.

BEGIN;

CREATE TABLE IF NOT EXISTS anti_leakage_strikes (
  id                BIGSERIAL PRIMARY KEY,
  user_id           VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strike_number     INT          NOT NULL,          -- 1, 2, 3, ... within rolling 30d
  category          VARCHAR(64)  NOT NULL,          -- 'off_platform_competitor' | 'off_platform_payment'
  source_type       VARCHAR(32)  NOT NULL,          -- 'bio' | 'dm' | 'mainstage_chat' | 'hangout_chat' | 'post' | 'channel_description'
  source_ref        VARCHAR(255),                    -- optional pointer (e.g. hangout group id, DM thread id)
  evidence_text     TEXT,                            -- truncated excerpt of the offending content (max 500 chars, enforced app-side)
  matched_terms     JSONB        NOT NULL DEFAULT '[]'::jsonb, -- [{"category":"...","term":"..."}]
  action_taken      VARCHAR(32)  NOT NULL,          -- 'warn' | 'mute_24h' | 'ban' | 'strip_only'
  -- issued_by carries either the sentinel 'system' (auto-detection) or an admin
  -- user id (manual insert). No FK to users(id) because 'system' has no row.
  issued_by         VARCHAR(255) NOT NULL DEFAULT 'system',
  cleared           BOOLEAN      NOT NULL DEFAULT false,
  cleared_by        VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  cleared_at        TIMESTAMPTZ,
  cleared_reason    TEXT,
  appeal_status     VARCHAR(32),                    -- NULL | 'pending' | 'approved' | 'rejected'
  appeal_reason     TEXT,
  appeal_submitted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT anti_leakage_strikes_category_check
    CHECK (category IN ('off_platform_competitor', 'off_platform_payment')),
  CONSTRAINT anti_leakage_strikes_source_check
    CHECK (source_type IN ('bio', 'dm', 'mainstage_chat', 'hangout_chat', 'post', 'channel_description', 'display_name', 'username')),
  CONSTRAINT anti_leakage_strikes_action_check
    CHECK (action_taken IN ('warn', 'mute_24h', 'ban', 'strip_only')),
  CONSTRAINT anti_leakage_strikes_appeal_check
    CHECK (appeal_status IS NULL OR appeal_status IN ('pending', 'approved', 'rejected'))
);

-- Fast lookup for "how many active strikes does this user have in the last 30 days?"
CREATE INDEX IF NOT EXISTS idx_anti_leakage_strikes_user_active
  ON anti_leakage_strikes (user_id, created_at DESC)
  WHERE cleared = false;

-- Admin queue: newest uncleared first
CREATE INDEX IF NOT EXISTS idx_anti_leakage_strikes_admin_queue
  ON anti_leakage_strikes (cleared, created_at DESC);

-- Pending appeals surface
CREATE INDEX IF NOT EXISTS idx_anti_leakage_strikes_appeals_pending
  ON anti_leakage_strikes (appeal_status, appeal_submitted_at DESC)
  WHERE appeal_status = 'pending';

-- Track updated_at automatically
CREATE OR REPLACE FUNCTION touch_anti_leakage_strikes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anti_leakage_strikes_updated_at ON anti_leakage_strikes;
CREATE TRIGGER trg_anti_leakage_strikes_updated_at
  BEFORE UPDATE ON anti_leakage_strikes
  FOR EACH ROW EXECUTE FUNCTION touch_anti_leakage_strikes_updated_at();

COMMIT;
