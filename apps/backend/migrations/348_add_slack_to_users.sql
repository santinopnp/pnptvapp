-- Migration 348: add slack_member_id and slack_channel_id to users
-- Enables per-creator personal Slack channel notifications.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS slack_member_id TEXT,
  ADD COLUMN IF NOT EXISTS slack_channel_id TEXT;

CREATE INDEX IF NOT EXISTS users_slack_member_id_idx ON users (slack_member_id)
  WHERE slack_member_id IS NOT NULL;
