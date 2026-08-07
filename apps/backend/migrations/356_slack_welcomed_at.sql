-- 356_slack_welcomed_at.sql
-- Track when a creator received their Slack channel welcome message so we
-- don't spam the same post twice. Populated by slack-welcome-creators.js.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slack_welcomed_at TIMESTAMPTZ;
