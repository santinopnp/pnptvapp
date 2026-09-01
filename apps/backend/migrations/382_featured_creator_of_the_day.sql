BEGIN;

-- ── Featured Model of the Day ───────────────────────────────────────────────
-- Editorial pick shown as a full-screen interstitial on the first
-- authenticated pageview per user per day. One row per date; falls back to a
-- rotating PNP Fam creator when no row exists for today.
--
-- pitch_en/pitch_es: editorial copy, distinct from creator.bio.
-- media_url: optional 3-sec cover loop (MP4/WebM) or hero image; when null,
--   the creator's cover_photo_url is used.
-- cta_intro_call: enables the "Book a 15-min intro call" secondary CTA.
-- created_by: admin user_id who scheduled the pick (for audit).

CREATE TABLE IF NOT EXISTS featured_creators (
  date            DATE PRIMARY KEY,
  creator_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pitch_en        TEXT NOT NULL,
  pitch_es        TEXT NOT NULL,
  media_url       TEXT,
  cta_intro_call  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_featured_creators_creator
  ON featured_creators(creator_id);

-- Once-per-day ack timestamp. NULL = never seen; set on POST /ack. The
-- interstitial re-fires when NOW()::date > last_featured_ack_at::date.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_featured_ack_at TIMESTAMPTZ;

COMMIT;
