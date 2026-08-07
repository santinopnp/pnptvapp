-- 357_slack_onboarding_state.sql
-- Full creator onboarding state now lives in Slack. Adds tracking columns for
-- the new onboarding message, the "read Doc 08" reaction ack, first Cal.com
-- booking, and the Day-3 / Day-7 nudge idempotency gates. Used by
-- services/creatorOnboardingService.js (fired from 2257 approval + daily cron).
--
-- slack_welcomed_at (from 356) is left in place: it still marks the OLD
-- "notification tour" welcome. Anyone with welcomed_at IS NOT NULL but
-- onboarded_at IS NULL will receive the new onboarding message on next run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slack_onboarded_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slack_onboarding_msg_ts  TEXT,
  ADD COLUMN IF NOT EXISTS slack_legal_ack_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slack_calbooked_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slack_day3_nudged_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slack_day7_nudged_at     TIMESTAMPTZ;

-- Lookup by message ts is how the Slack reaction listener finds the creator
-- for a ✅ ack. Partial index — only creators with a live onboarding msg.
CREATE INDEX IF NOT EXISTS users_slack_onboarding_msg_ts_idx
  ON users (slack_onboarding_msg_ts)
  WHERE slack_onboarding_msg_ts IS NOT NULL;
