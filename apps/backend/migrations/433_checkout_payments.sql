-- Migration 433: checkout_payments table
-- Records completed USDC-on-Base payments from the /checkout experiment
-- (separate Privy app, 35/35/20/10 split-wallet policy).
-- Separate from checkout_intents — this table is created when the tx is
-- confirmed on-chain, not when a purchase intent is initiated.

CREATE TABLE IF NOT EXISTS checkout_payments (
  id                  BIGSERIAL PRIMARY KEY,
  tx_hash             VARCHAR(66) NOT NULL,
  plan_id             TEXT        NOT NULL,
  pnptv_user_id       TEXT        REFERENCES users(id) ON DELETE SET NULL,
  privy_user_id       TEXT,
  amount_usd          NUMERIC(12, 6) NOT NULL,
  recipient_address   VARCHAR(42) NOT NULL,
  chain               TEXT        NOT NULL DEFAULT 'base',
  token               TEXT        NOT NULL DEFAULT 'USDC',
  status              TEXT        NOT NULL DEFAULT 'confirmed',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tx_hash must be globally unique — prevents the same tx from being applied twice.
CREATE UNIQUE INDEX IF NOT EXISTS checkout_payments_tx_hash_idx
  ON checkout_payments (LOWER(tx_hash));

-- Fast lookup by pnptv user to list their checkout purchases.
CREATE INDEX IF NOT EXISTS checkout_payments_pnptv_user_id_idx
  ON checkout_payments (pnptv_user_id)
  WHERE pnptv_user_id IS NOT NULL;

-- Fast lookup by privy user (for pre-linked / anonymous purchases).
CREATE INDEX IF NOT EXISTS checkout_payments_privy_user_id_idx
  ON checkout_payments (privy_user_id)
  WHERE privy_user_id IS NOT NULL;
