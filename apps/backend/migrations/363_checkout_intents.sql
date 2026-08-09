-- 363: Unified checkout_intents table — replaces the 4 scattered payment
-- tables (crypto_payments, nowpayments_orders, dash_subscription_orders,
-- meru_orders) with a single row per purchase attempt across all surfaces
-- (memberships, PRIME, creator subs, calls, Ru$h, channel/hangout access).
--
-- Migration strategy: rename crypto_payments (currently 0 rows) → checkout_intents,
-- ADD new columns without dropping the legacy ones so cryptoPaymentService keeps
-- working while it's rewired. Legacy provider tables (nowpayments_orders etc.)
-- stay untouched — Phase 5 removes them once the wallet rail owns all volume.

ALTER TABLE crypto_payments RENAME TO checkout_intents;

-- Rename existing indexes/constraints so a fresh operator reading \d matches
-- the table name they expect.
ALTER TABLE checkout_intents RENAME CONSTRAINT chk_crypto_payments_status TO chk_checkout_intents_status;
ALTER INDEX IF EXISTS idx_crypto_payments_grant_failed        RENAME TO idx_checkout_intents_grant_failed;
ALTER INDEX IF EXISTS crypto_payments_pkey                    RENAME TO checkout_intents_pkey;
ALTER SEQUENCE IF EXISTS crypto_payments_id_seq               RENAME TO checkout_intents_id_seq;

-- New unified fields.
ALTER TABLE checkout_intents ADD COLUMN IF NOT EXISTS surface           TEXT;
ALTER TABLE checkout_intents ADD COLUMN IF NOT EXISTS provider          TEXT NOT NULL DEFAULT 'wallet_usdc';
ALTER TABLE checkout_intents ADD COLUMN IF NOT EXISTS entitlement_spec  JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE checkout_intents ADD COLUMN IF NOT EXISTS metadata          JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE checkout_intents ADD COLUMN IF NOT EXISTS fulfilled_at      TIMESTAMPTZ;

-- Surface enum guard (Phase 1 seeds only 'donation'; Phase 2+ adds the rest).
ALTER TABLE checkout_intents DROP CONSTRAINT IF EXISTS chk_checkout_intents_surface;
ALTER TABLE checkout_intents ADD CONSTRAINT chk_checkout_intents_surface
  CHECK (surface IS NULL OR surface IN (
    'donation', 'membership', 'prime', 'creator_sub', 'call', 'rush', 'channel', 'hangout'
  ));

-- Provider enum guard.
ALTER TABLE checkout_intents DROP CONSTRAINT IF EXISTS chk_checkout_intents_provider;
ALTER TABLE checkout_intents ADD CONSTRAINT chk_checkout_intents_provider
  CHECK (provider IN ('wallet_usdc', 'wallet_rush', 'nowpayments_legacy', 'meru_legacy'));

-- Indexes for the hot query paths.
CREATE INDEX IF NOT EXISTS idx_checkout_intents_tx_hash
  ON checkout_intents(lower(tx_hash)) WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_intents_user_created
  ON checkout_intents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkout_intents_surface_status
  ON checkout_intents(surface, status) WHERE surface IS NOT NULL;

-- Cleanup helper: pending intents older than their expires_at can be swept.
CREATE INDEX IF NOT EXISTS idx_checkout_intents_expired_pending
  ON checkout_intents(expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Legacy plan_id was NOT NULL because crypto_payments always tied to a plan.
-- Surface-based intents (memberships, calls, Ru$h packs) don't need a plan
-- reference — the entitlement_spec JSONB carries all the grant intent.
ALTER TABLE checkout_intents ALTER COLUMN plan_id DROP NOT NULL;
