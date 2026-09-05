-- Migration 391: Channel Pass — creator-set monthly subscription price
-- Each creator can enable a Channel Pass and pick a price in USD ($5-$50).
-- Purchase reuses creator_subscriptions (mig 088) + user_entitlements (mig 133, add_on='creator-subscription').
-- No auto-renew — one-shot 30 days like Prime. Rush wallet is the primary rail; fiat/crypto via hosted-link.

ALTER TABLE users
  ADD COLUMN channel_pass_price_usd NUMERIC(6,2)
    CHECK (channel_pass_price_usd IS NULL OR channel_pass_price_usd BETWEEN 5.00 AND 50.00),
  ADD COLUMN channel_pass_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.channel_pass_price_usd IS
  'Creator-set Channel Pass monthly price (USD). Range 5.00-50.00. NULL when not configured.';
COMMENT ON COLUMN users.channel_pass_enabled IS
  'Creator toggle. TRUE = Channel Pass CTA visible on profile + paywall.';

-- Discovery index: fast lookup of creators with an active pass
CREATE INDEX idx_users_channel_pass_enabled
  ON users(id) WHERE channel_pass_enabled = TRUE;

-- Constraint: cannot enable without a price
ALTER TABLE users
  ADD CONSTRAINT check_channel_pass_price_when_enabled
  CHECK (
    channel_pass_enabled = FALSE
    OR channel_pass_price_usd IS NOT NULL
  );
