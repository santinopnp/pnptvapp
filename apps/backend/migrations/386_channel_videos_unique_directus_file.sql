-- 386: unique index for the prime_videos → channel_videos mirror upsert.
--
-- The Directus → bot sync webhook (routes.js `prime-videos/sync`) uses
-- INSERT ... ON CONFLICT (channel_id, directus_file_id) WHERE directus_file_id
-- IS NOT NULL to make re-runs idempotent. Without this index the upsert throws
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Partial index — legacy channel_videos rows uploaded via non-Directus paths
-- (Mux-only, local /uploads) have directus_file_id = NULL and should not be
-- constrained. The webhook only ever writes rows where directus_file_id is a
-- valid UUID.

-- Also excludes 'removed' rows so soft-deleting a mirror before re-uploading
-- the same underlying Directus file doesn't collide with the new row.
CREATE UNIQUE INDEX IF NOT EXISTS channel_videos_channel_directus_unique
  ON channel_videos (channel_id, directus_file_id)
  WHERE directus_file_id IS NOT NULL AND status != 'removed';
