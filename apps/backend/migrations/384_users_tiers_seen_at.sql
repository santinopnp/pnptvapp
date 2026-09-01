-- 384_users_tiers_seen_at.sql
-- Adds users.tiers_seen_at, the timestamp for the "tiers" onboarding step
-- (apps/backend/services/onboardingService.js). Prior to this migration, the
-- onboardingService referenced the column but it was never created, so every
-- POST /api/webapp/onboarding/step for step='tiers' returned 500 with
-- `column "tiers_seen_at" of relation "users" does not exist`, blocking new
-- users from clearing the onboarding wizard and reaching checkout.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tiers_seen_at timestamp with time zone;
