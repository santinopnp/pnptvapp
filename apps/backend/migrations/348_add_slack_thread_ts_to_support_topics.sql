-- Migration 348: Add slack_thread_ts to support_topics for bidirectional Slack support bridge
ALTER TABLE support_topics
  ADD COLUMN IF NOT EXISTS slack_thread_ts TEXT;

CREATE INDEX IF NOT EXISTS support_topics_slack_thread_ts_idx
  ON support_topics (slack_thread_ts)
  WHERE slack_thread_ts IS NOT NULL;
