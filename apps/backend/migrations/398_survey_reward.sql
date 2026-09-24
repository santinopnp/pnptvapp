-- Migration 398: survey reward credit + call credit scheduling columns
-- Adds reward tracking to call_booking_surveys and scheduling/source metadata to call_credits.

-- Track which survey triggered a reward credit and when
ALTER TABLE call_booking_surveys
  ADD COLUMN IF NOT EXISTS reward_granted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_credit_id   INTEGER REFERENCES call_credits(id) ON DELETE SET NULL;

-- source: e.g. 'purchase' | 'survey_reward' | 'gift' | 'admin'
ALTER TABLE call_credits
  ADD COLUMN IF NOT EXISTS source                  TEXT,
  ADD COLUMN IF NOT EXISTS available_from          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes_override INTEGER;

-- Index for quick lookup of pending survey-reward credits by member
CREATE INDEX IF NOT EXISTS idx_call_credits_source
  ON call_credits (member_id, source)
  WHERE source IS NOT NULL;
