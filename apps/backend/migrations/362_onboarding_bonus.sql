-- 362: Onboarding bonus grant tracking
-- Every new user completing onboarding receives 180 gifted Ru$h + 30-day
-- pnp-member trial. This column is the idempotency guard so users completing
-- onboarding twice (edge case: server crash between grant + onboarding_complete)
-- never receive a double grant.

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_bonus_granted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_onboarding_bonus_granted_at
  ON users(onboarding_bonus_granted_at)
  WHERE onboarding_bonus_granted_at IS NOT NULL;
