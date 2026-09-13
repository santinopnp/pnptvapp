-- 396_profile_username_redirects.sql
-- Permanent redirect index for platform username renames.
-- When a user renames their handle on the webapp, old profile links
-- auto-redirect to the new handle instead of 404ing.

-- 1. Redirect lookup table
CREATE TABLE IF NOT EXISTS profile_username_redirects (
  old_username  TEXT        NOT NULL,
  user_id       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profile_username_redirects_pkey PRIMARY KEY (old_username)
);
CREATE INDEX IF NOT EXISTS idx_pur_user_id ON profile_username_redirects (user_id);

-- 2. DB trigger: auto-captures old username whenever a web rename happens
CREATE OR REPLACE FUNCTION trg_fn_capture_username_redirect()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.username IS NOT NULL AND OLD.username != ''
     AND (NEW.username IS NULL OR lower(NEW.username) != lower(OLD.username)) THEN
    -- Persist the old handle so resolveUserId can still find this user
    INSERT INTO profile_username_redirects (old_username, user_id)
    VALUES (lower(OLD.username), OLD.id::text)
    ON CONFLICT (old_username) DO UPDATE
      SET user_id = EXCLUDED.user_id, created_at = NOW();
    -- If the new handle was previously someone else's alias, drop that stale entry
    IF NEW.username IS NOT NULL AND NEW.username != '' THEN
      DELETE FROM profile_username_redirects
      WHERE lower(old_username) = lower(NEW.username);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_username_redirect ON users;
CREATE TRIGGER trg_username_redirect
  AFTER UPDATE OF username ON users
  FOR EACH ROW EXECUTE FUNCTION trg_fn_capture_username_redirect();

-- 3. Seed: ferbearcdmx → cloudcomputa (the rename that prompted this fix)
INSERT INTO profile_username_redirects (old_username, user_id)
VALUES ('ferbearcdmx', '5643392748')
ON CONFLICT DO NOTHING;

-- 4. Backfill null/empty usernames with a deterministic pnptv_ handle.
--    Covers ALL rows (including soft-deleted) so the NOT NULL constraint can land.
UPDATE users
SET username = 'pnptv_' || LEFT(COALESCE(pnptv_id::text, id::text), 8)
WHERE username IS NULL OR username = '';

-- Resolve any accidental duplicates from the backfill on non-deleted rows
DO $$
DECLARE
  rec     RECORD;
  candidate TEXT;
  suffix  INT;
BEGIN
  FOR rec IN
    WITH ranked AS (
      SELECT id, lower(username) AS lname,
             ROW_NUMBER() OVER (PARTITION BY lower(username) ORDER BY created_at) AS rn
      FROM users
      WHERE username LIKE 'pnptv_%' AND is_deleted IS NOT TRUE
    )
    SELECT id, lname FROM ranked WHERE rn > 1
  LOOP
    suffix := 2;
    LOOP
      candidate := rec.lname || '_' || suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM users
        WHERE lower(username) = candidate AND is_deleted IS NOT TRUE
      );
      suffix := suffix + 1;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- 5. Enforce username NOT NULL going forward
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
