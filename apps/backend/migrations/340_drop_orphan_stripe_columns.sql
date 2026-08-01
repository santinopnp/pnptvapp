-- Migration 340: Drop remaining orphan Stripe columns
-- Migration 256 missed token_purchases and user_entitlements.
-- Stripe was fully retired 2026-05-28; account cancelled 2026-08-01.

ALTER TABLE token_purchases
  DROP COLUMN IF EXISTS stripe_session_id;

ALTER TABLE user_entitlements
  DROP COLUMN IF EXISTS stripe_subscription_id;
