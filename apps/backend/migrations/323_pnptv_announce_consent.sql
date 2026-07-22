-- Migration 323: PNPtv announcement consent
-- Adds columns to users so creators can opt in / out of having their new content
-- (channel videos, live streams) automatically announced by PNPtv on:
--   - the @PNPTelevision X (Twitter) account
--   - PNPtv Telegram groups the bot admins
--   - Telegram DMs to viewers who have opted in to receive creator updates
-- Default is FALSE (creators must explicitly opt in). Revocation only affects
-- future announcements — never retroactively deletes past posts.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pnptv_announce_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pnptv_announce_consent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pnptv_announce_consent_version VARCHAR(50) NULL;

CREATE INDEX IF NOT EXISTS idx_users_pnptv_announce_consent
  ON users (pnptv_announce_consent)
  WHERE pnptv_announce_consent = TRUE;

COMMENT ON COLUMN users.pnptv_announce_consent IS
  'Creator opt-in: allow @pnptv to auto-announce new videos/streams to X, Telegram groups, and consented DM viewers.';
