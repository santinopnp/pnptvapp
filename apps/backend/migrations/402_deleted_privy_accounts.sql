-- Migration 402: archive table for purged Privy accounts
-- Preserves privy_id + wallet_address before we null them on the users row,
-- so we can respond to Privy support requests without losing the mapping.

CREATE TABLE IF NOT EXISTS deleted_privy_accounts (
  id              SERIAL PRIMARY KEY,
  pnptv_user_id   TEXT,                         -- NULL for Pass-2 orphan accounts
  privy_id        TEXT NOT NULL UNIQUE,
  wallet_address  TEXT,
  reason          TEXT NOT NULL DEFAULT 'purge', -- 'purge' | 'purge-orphan'
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deleted_privy_accounts_wallet
  ON deleted_privy_accounts (LOWER(wallet_address))
  WHERE wallet_address IS NOT NULL;
