-- 325_creator_grace_auto_backfill.sql
--
-- Guarantee every active, unverified creator has a 2257 grace deadline so
-- they stay visible on /api/performers until they submit their ID docs.
--
-- Background: creatorService.activateCreator() sets
-- identity_verification_required_by on activation (added in C-03), but
-- pre-C-03 activations left 20 creators with NULL. Those creators fell
-- through the /api/performers WHERE clause and became invisible on
-- Models/Live discovery. Backfill has been run; this trigger prevents the
-- gap from reappearing regardless of write path (admin console, service,
-- ad-hoc SQL).
--
-- Trigger fires on INSERT or UPDATE when:
--   - creator_status is 'active'
--   - creator_locked is FALSE (or NULL)
--   - identity_verified is FALSE (or NULL)
--   - identity_verification_required_by IS NULL
-- and stamps a fresh 30-day grace window.

CREATE OR REPLACE FUNCTION ensure_creator_grace_deadline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.creator_status = 'active'
     AND COALESCE(NEW.creator_locked, FALSE) = FALSE
     AND COALESCE(NEW.identity_verified, FALSE) = FALSE
     AND NEW.identity_verification_required_by IS NULL
  THEN
    NEW.identity_verification_required_by := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_creator_grace_deadline ON users;

CREATE TRIGGER trg_ensure_creator_grace_deadline
  BEFORE INSERT OR UPDATE OF creator_status, creator_locked, identity_verified,
                             identity_verification_required_by
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_creator_grace_deadline();
