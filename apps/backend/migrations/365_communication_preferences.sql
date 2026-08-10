-- Migration 365: Communication preferences — preferred + fallback channel per user
-- Run date: 2026-08-09
-- Context: New anti-spam value (2026-08-09). Users pick ONE preferred channel + ONE fallback.
-- Broadcasts respect this — we do NOT blast every channel a user is reachable on.
-- Complements the existing notification_preferences JSONB (per-category per-channel toggles).

BEGIN;

-- 1. Add columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_channel       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fallback_channel        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS other_channel_details   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS comm_pref_set_at        TIMESTAMPTZ;

-- 2. Constrain the allowed channel values.
--    'other' is allowed but requires other_channel_details to be non-empty.
ALTER TABLE users
  ADD CONSTRAINT users_preferred_channel_check
    CHECK (preferred_channel IS NULL OR preferred_channel IN ('bot', 'x', 'inApp', 'email', 'other')),
  ADD CONSTRAINT users_fallback_channel_check
    CHECK (fallback_channel  IS NULL OR fallback_channel  IN ('bot', 'x', 'inApp', 'email', 'other')),
  ADD CONSTRAINT users_other_channel_details_required
    CHECK (
      (preferred_channel != 'other' AND fallback_channel != 'other')
      OR other_channel_details IS NOT NULL
    );

-- 3. Backfill defaults for existing users who never chose:
--    preferred = 'inApp' (least intrusive), fallback = 'bot' (highest engagement in our data).
--    comm_pref_set_at stays NULL — this is how the frontend detects "user hasn't chosen yet"
--    and shows the one-time gentle modal.
UPDATE users
SET preferred_channel = 'inApp',
    fallback_channel  = 'bot'
WHERE preferred_channel IS NULL
  AND fallback_channel IS NULL;

-- 4. Index for broadcast queries that filter by channel preference
CREATE INDEX IF NOT EXISTS idx_users_preferred_channel
  ON users(preferred_channel)
  WHERE preferred_channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_fallback_channel
  ON users(fallback_channel)
  WHERE fallback_channel IS NOT NULL;

COMMIT;
