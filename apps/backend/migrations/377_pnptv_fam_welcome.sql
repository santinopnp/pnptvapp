BEGIN;

-- ── PNP Fam welcome modal — one-time "you're in the family" celebration ─────
-- Fires on next login for anyone with is_pnptv_fam=TRUE AND welcome_seen_at
-- IS NULL. Dismissing writes NOW(). See PnpFamWelcomeModal.tsx.
--
-- Rollout convention (2026-08-31): the 3 real founding members are pre-marked
-- seen so the modal does NOT auto-fire for them until Santino approves the
-- design. After approval, one UPDATE clears their seen_at and they see it on
-- their next login.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pnptv_fam_welcome_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_pnptv_fam_welcome_pending
  ON users(id)
  WHERE is_pnptv_fam = TRUE AND pnptv_fam_welcome_seen_at IS NULL;

-- Pre-mark the 3 real fam members as seen so the auto-fire waits for Santino
-- to approve the modal via canary. The canary run flags Santino as fam +
-- clears his seen_at; on approval, the same UPDATE runs for the 3 real ones.
UPDATE users
   SET pnptv_fam_welcome_seen_at = NOW()
 WHERE is_pnptv_fam = TRUE
   AND pnptv_fam_welcome_seen_at IS NULL;

COMMIT;
