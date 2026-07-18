-- Migration 310: Formalize main_stage_consents table
-- Previously created lazily via ensureTable(); now a proper numbered migration.
-- All statements are idempotent — safe to run against an existing table.

CREATE TABLE IF NOT EXISTS main_stage_consents (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NULL,
  guest_identity    TEXT NULL,
  guest_display_name TEXT NULL,
  guest_email       TEXT NULL,
  guest_email_hash  TEXT NULL,
  invite_id         BIGINT NULL,
  terms_version     TEXT NOT NULL,
  privacy_version   TEXT NOT NULL,
  age_confirmed     BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip                TEXT NULL,
  user_agent        TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE main_stage_consents ADD COLUMN IF NOT EXISTS guest_display_name TEXT NULL;
ALTER TABLE main_stage_consents ADD COLUMN IF NOT EXISTS guest_email       TEXT NULL;
ALTER TABLE main_stage_consents ADD COLUMN IF NOT EXISTS guest_email_hash  TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_main_stage_consents_user_id
  ON main_stage_consents (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_main_stage_consents_guest_identity
  ON main_stage_consents (guest_identity) WHERE guest_identity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_main_stage_consents_guest_email
  ON main_stage_consents (LOWER(guest_email)) WHERE guest_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_main_stage_consents_guest_email_hash
  ON main_stage_consents (guest_email_hash) WHERE guest_email_hash IS NOT NULL;
