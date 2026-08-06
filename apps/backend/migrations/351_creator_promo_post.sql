-- Tracks the creator's own promo post (separate from @pnptv promo_post_id which already exists)
ALTER TABLE channel_videos ADD COLUMN IF NOT EXISTS creator_promo_post_id INTEGER REFERENCES social_posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_channel_videos_creator_promo_post_id ON channel_videos(creator_promo_post_id) WHERE creator_promo_post_id IS NOT NULL;
