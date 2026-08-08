-- Crypto on-chain payment intents (Privy/Wagmi + USDC on Base)
CREATE TABLE IF NOT EXISTS crypto_payments (
  id                    SERIAL PRIMARY KEY,
  user_id               VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id               TEXT NOT NULL,
  chain                 TEXT NOT NULL DEFAULT 'base',
  token                 TEXT NOT NULL DEFAULT 'USDC',
  amount_usd            NUMERIC(10,2) NOT NULL,
  expected_amount_usdc  NUMERIC(18,6) NOT NULL,
  receiving_address     TEXT NOT NULL,
  from_address          TEXT,
  tx_hash               TEXT UNIQUE,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | expired | failed
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  confirmed_at          TIMESTAMPTZ,
  grant_result          JSONB,
  creator_id            VARCHAR REFERENCES users(id),
  scope_type            TEXT,
  scope_id              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_payments_user_status    ON crypto_payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_crypto_payments_from_pending   ON crypto_payments(from_address, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crypto_payments_tx_hash        ON crypto_payments(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crypto_payments_expires        ON crypto_payments(expires_at) WHERE status = 'pending';
