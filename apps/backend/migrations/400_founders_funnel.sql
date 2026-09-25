-- Migration 400: Founders Funnel columns
-- Adds two tracking columns to users for the 3-day trial + founders funnel experiment.
--
-- founders_offer_expires_at: The 1-hour window during which the $99.99 Founders lifetime
--   offer is shown to newly registered users (set at account creation time).
-- year50_promo_sent_at: Timestamp of when the 24-hour follow-up year50 promo DM was
--   delivered, used to prevent re-sending.

ALTER TABLE users ADD COLUMN IF NOT EXISTS founders_offer_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS year50_promo_sent_at TIMESTAMPTZ;

-- Partial index on founders_offer_expires_at for the admin/analytics query pattern
-- (only rows where the offer is still open, i.e. non-NULL)
CREATE INDEX IF NOT EXISTS idx_users_founders_offer_expires_at
  ON users (founders_offer_expires_at)
  WHERE founders_offer_expires_at IS NOT NULL;
