-- Migration 342: capture beta-tester feedback from Slack channels so we can
-- audit what testers reported, when, and what the AI triage classified it as.
-- Populated by slackFeedbackService (Slack Events API webhook).

BEGIN;

CREATE TABLE IF NOT EXISTS tester_feedback (
  id                bigserial PRIMARY KEY,
  slack_ts          text        NOT NULL UNIQUE,
  slack_channel     text        NOT NULL,
  slack_channel_name text,
  slack_user        text        NOT NULL,
  slack_user_name   text,
  thread_ts         text,
  text              text        NOT NULL,
  triage_severity   text,
  triage_category   text,
  triage_summary    text,
  triage_actions    jsonb,
  triage_raw        jsonb,
  received_at       timestamptz NOT NULL DEFAULT now(),
  triaged_at        timestamptz
);

CREATE INDEX IF NOT EXISTS tester_feedback_channel_idx
  ON tester_feedback (slack_channel, received_at DESC);

CREATE INDEX IF NOT EXISTS tester_feedback_severity_idx
  ON tester_feedback (triage_severity)
  WHERE triage_severity IS NOT NULL;

COMMIT;
