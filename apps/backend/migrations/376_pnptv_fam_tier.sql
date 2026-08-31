BEGIN;

-- ── PNPtv fam ───────────────────────────────────────────────────────────────
-- Curated leadership subset of Whale Pigs: Santino + Lex + inner-circle
-- friends who contributed to PNPtv's creation. Lifetime PRIME + pnp-member
-- entitlements, distinctive public badge (rose-gold "PNP Fam"), invite-only,
-- no billing. See migration 375 for the parent Whale Pig / Crystal Creator
-- schema.
--
-- Invariant: is_pnptv_fam = TRUE  ⇒  is_whale_pig = TRUE (enforced by trigger).
-- "Whale Pig" string is INTERNAL only — never expose in public API/UX.
--
-- Founding members (2026-08-31):
--   • PADUDE69       (10edc448-…)   — exists in DB
--   • DUKEOFDENSITY  (8706669302)   — exists in DB
--   • ladsaplatefounder             — pending signup

-- ── 0. Idempotent cleanup of an earlier draft of this migration ─────────────
-- The first pass of 376 used `is_pnp_fam` / `pnp_fam_*` naming. Rename in
-- place if that draft was applied; otherwise these are no-ops.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='is_pnp_fam')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='users' AND column_name='is_pnptv_fam') THEN
    ALTER TABLE users RENAME COLUMN is_pnp_fam    TO is_pnptv_fam;
    ALTER TABLE users RENAME COLUMN pnp_fam_since TO pnptv_fam_since;
    ALTER INDEX idx_users_pnp_fam RENAME TO idx_users_pnptv_fam;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name='pnp_fam_pending_handles')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                     WHERE table_name='pnptv_fam_pending_handles') THEN
    ALTER TABLE pnp_fam_pending_handles RENAME TO pnptv_fam_pending_handles;
    ALTER INDEX idx_pnp_fam_pending_unclaimed RENAME TO idx_pnptv_fam_pending_unclaimed;
  END IF;
END $$;

-- ── 1. Flag column on users ─────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_pnptv_fam    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pnptv_fam_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_pnptv_fam
  ON users(is_pnptv_fam)
  WHERE is_pnptv_fam = TRUE;

-- ── 2. Trigger: fam ⇒ whale_pig ─────────────────────────────────────────────
-- Every PNPtv fam member is automatically a Whale Pig (subset relationship).
-- Toggling fam OFF does NOT touch whale_pig — external VIPs stay Whale Pigs
-- independent of the fam flag.
CREATE OR REPLACE FUNCTION pnptv_fam_implies_whale_pig()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_pnptv_fam = TRUE THEN
    NEW.is_whale_pig := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pnptv_fam_implies_whale_pig ON users;
CREATE TRIGGER trg_pnptv_fam_implies_whale_pig
  BEFORE INSERT OR UPDATE OF is_pnptv_fam ON users
  FOR EACH ROW
  EXECUTE FUNCTION pnptv_fam_implies_whale_pig();

-- ── 3. Pending-handles table (auto-flag on signup) ──────────────────────────
CREATE TABLE IF NOT EXISTS pnptv_fam_pending_handles (
  handle       TEXT PRIMARY KEY,
  invited_by   TEXT REFERENCES users(id),
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at   TIMESTAMPTZ,
  claimed_by   TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pnptv_fam_pending_unclaimed
  ON pnptv_fam_pending_handles(handle)
  WHERE claimed_at IS NULL;

-- ── 4. Seed the 2 existing users (flag + lifetime PRIME + pnp-member) ───────
-- The trigger will coerce is_whale_pig := TRUE automatically.
UPDATE users
   SET is_pnptv_fam    = TRUE,
       pnptv_fam_since = COALESCE(pnptv_fam_since, NOW())
 WHERE id IN ('10edc448-4809-45f7-a721-82956504f049', '8706669302');

INSERT INTO user_entitlements
  (user_id, add_on_id, is_lifetime, granted_at, grant_source, auto_renew)
VALUES
  ('10edc448-4809-45f7-a721-82956504f049', 'prime',      TRUE, NOW(), 'pnptv_fam_grant', FALSE),
  ('10edc448-4809-45f7-a721-82956504f049', 'pnp-member', TRUE, NOW(), 'pnptv_fam_grant', FALSE),
  ('8706669302',                            'prime',      TRUE, NOW(), 'pnptv_fam_grant', FALSE),
  ('8706669302',                            'pnp-member', TRUE, NOW(), 'pnptv_fam_grant', FALSE)
ON CONFLICT (user_id, add_on_id, creator_id) DO UPDATE
  SET is_lifetime  = TRUE,
      expires_at   = NULL,                                      -- chk_lifetime_no_expiry
      is_consumed  = FALSE,
      grant_source = COALESCE(user_entitlements.grant_source, EXCLUDED.grant_source),
      auto_renew   = FALSE;

-- ── 5. Seed pending handle for the third member ─────────────────────────────
INSERT INTO pnptv_fam_pending_handles (handle, invited_by, invited_at)
VALUES ('ladsaplatefounder', '8599671840', NOW())
ON CONFLICT (handle) DO NOTHING;

COMMIT;
