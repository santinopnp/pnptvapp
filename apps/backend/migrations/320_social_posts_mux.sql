-- 320: Mux columns for social_posts (creator video uploads via direct browser→Mux)
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS mux_asset_id    TEXT,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT,
  ADD COLUMN IF NOT EXISTS mux_upload_id   TEXT,
  ADD COLUMN IF NOT EXISTS mux_status      TEXT;

CREATE INDEX IF NOT EXISTS idx_social_posts_mux_upload
  ON social_posts (mux_upload_id)
  WHERE mux_upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_mux_asset
  ON social_posts (mux_asset_id)
  WHERE mux_asset_id IS NOT NULL;
