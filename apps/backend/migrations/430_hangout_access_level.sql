-- Migration 430: Add access_level to hangout_groups
-- Enables creator-controlled visibility: public (everyone), free (everyone, no sub),
-- exclusive (hidden — only active creator subscribers see it in the list).

ALTER TABLE hangout_groups
  ADD COLUMN IF NOT EXISTS access_level varchar(20) NOT NULL DEFAULT 'public'
  CHECK (access_level IN ('public', 'free', 'exclusive'));

-- Backfill: existing invite-only private hangouts → 'free' (visible but needs request)
UPDATE hangout_groups
  SET access_level = 'free'
  WHERE is_public = false
    AND is_main = false
    AND is_wall_of_fame = false;

CREATE INDEX IF NOT EXISTS idx_hangout_groups_access_level
  ON hangout_groups(access_level)
  WHERE access_level = 'exclusive';
