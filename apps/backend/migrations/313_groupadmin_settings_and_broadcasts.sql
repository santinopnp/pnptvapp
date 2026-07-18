-- Migration 313: Group admin settings and broadcast schedules
-- Required by groupAdminPanel.js banned-word filters, welcome messages,
-- link/forward filtering, and the broadcast scheduler.
-- Note: group_broadcast_schedules was found already present in production DB
-- (created directly without a migration); that CREATE is a safe no-op.

CREATE TABLE IF NOT EXISTS telegram_group_settings (
  telegram_chat_id    TEXT PRIMARY KEY,
  banned_words        TEXT[]    NOT NULL DEFAULT '{}',
  filter_external_links BOOLEAN NOT NULL DEFAULT FALSE,
  block_forwarded     BOOLEAN   NOT NULL DEFAULT FALSE,
  spam_threshold      INTEGER   NOT NULL DEFAULT 3,
  spam_action         TEXT      NOT NULL DEFAULT 'warn',
  welcome_message     TEXT,
  require_onboarding  BOOLEAN   NOT NULL DEFAULT FALSE,
  mute_until_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_broadcast_schedules (
  id                  SERIAL PRIMARY KEY,
  chat_id             TEXT        NOT NULL,
  text                TEXT,
  media_file_id       TEXT,
  media_type          TEXT,
  parse_mode          TEXT        NOT NULL DEFAULT 'Markdown',
  scheduled_at        TIMESTAMPTZ NOT NULL,
  next_run_at         TIMESTAMPTZ NOT NULL,
  recurrence_pattern  TEXT,                                -- NULL / 'once' / 'daily' / 'weekly' / 'monthly'
  status              TEXT        NOT NULL DEFAULT 'scheduled',  -- scheduled / active / cancelled / done
  run_count           INTEGER     NOT NULL DEFAULT 0,
  max_runs            INTEGER,
  created_by          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gbs_chat_status
  ON group_broadcast_schedules (chat_id, status, next_run_at);
