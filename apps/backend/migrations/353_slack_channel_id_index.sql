-- Migration 353: add missing index on users.slack_channel_id
-- Complements 348_add_slack_to_users.sql which only indexed slack_member_id.

CREATE INDEX IF NOT EXISTS users_slack_channel_id_idx ON users (slack_channel_id)
  WHERE slack_channel_id IS NOT NULL;
