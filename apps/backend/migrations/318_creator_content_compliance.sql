-- Creator content-compliance grace period: new creator_monthly subscribers' membership
-- start is held until the creator has >=4 minutes of exclusive video content; missing
-- the 7-day deadline suspends the creator for 6 months. See
-- services/contentComplianceService.js and config/monetizationConfig.js.

ALTER TABLE creator_media
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS creator_content_compliance_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS creator_content_compliance_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_suspension_reason VARCHAR(50);

-- expires_at was NOT NULL (migration 088); a held subscription has no expiry yet
-- (membership hasn't "started"), so this must become nullable. NULL here already
-- counts as "active" in the subscriber-count recompute query in subscribeToCreator
-- (`expires_at IS NULL OR expires_at > NOW()`), and is correctly treated as NOT
-- granting access by EntitlementAccessService.hasEntitlement on the mirrored
-- user_entitlements row (`is_lifetime = true OR (expires_at IS NOT NULL AND expires_at > NOW())`).
ALTER TABLE creator_subscriptions
  ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE creator_subscriptions
  ADD COLUMN IF NOT EXISTS compliance_hold BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS held_duration_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_content_compliance_deadline
  ON users(creator_content_compliance_deadline)
  WHERE creator_content_compliance_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_users_suspended_until
  ON users(creator_suspended_until)
  WHERE creator_suspension_reason = 'content_compliance';

CREATE INDEX IF NOT EXISTS idx_creator_subscriptions_compliance_hold
  ON creator_subscriptions(creator_id)
  WHERE compliance_hold = true;
