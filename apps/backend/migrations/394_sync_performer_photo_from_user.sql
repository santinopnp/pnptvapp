-- 394: Keep performers.photo_url in sync with users.photo_file_id.
--
-- Problem: performers.photo_url was initialized once (castingRoutes.js:220)
-- and never re-synced on avatar re-upload. When users.photo_file_id changed
-- (via /api/webapp/profile/avatar upload), the old filename was left on
-- performers, so Live / Nearby / call-booking endpoints returned 404'd URLs.
-- Snapshot 2026-09-06: 25 rows drifted.
--
-- Fix: one-shot backfill + trigger that mirrors any future photo_file_id
-- change into performers.photo_url. Trigger is a no-op when the value is
-- unchanged (WHEN clause) and only touches ~30 rows worst case.

-- Backfill drift
UPDATE performers p
   SET photo_url = u.photo_file_id,
       updated_at = NOW()
  FROM users u
 WHERE u.id = p.user_id
   AND u.photo_file_id IS NOT NULL
   AND p.photo_url IS DISTINCT FROM u.photo_file_id;

CREATE OR REPLACE FUNCTION sync_performer_photo_from_user() RETURNS TRIGGER AS $$
BEGIN
  UPDATE performers
     SET photo_url = NEW.photo_file_id,
         updated_at = NOW()
   WHERE user_id = NEW.id::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_performer_photo ON users;

CREATE TRIGGER trg_sync_performer_photo
  AFTER UPDATE OF photo_file_id ON users
  FOR EACH ROW
  WHEN (OLD.photo_file_id IS DISTINCT FROM NEW.photo_file_id)
  EXECUTE FUNCTION sync_performer_photo_from_user();
