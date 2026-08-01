-- Per-creator opt-in flags for auto-posting to X (Twitter) on PNPtv events.
-- All default false — nobody auto-posts until they explicitly opt in.
-- Granularity is per-event so a creator can enable live-alerts without also
-- broadcasting every video publish or availability toggle.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS x_auto_post_live         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS x_auto_post_video        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS x_auto_post_availability BOOLEAN NOT NULL DEFAULT false;
