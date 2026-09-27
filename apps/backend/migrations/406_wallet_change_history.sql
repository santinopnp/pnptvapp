-- Migration 406: preserve previous wallet address on link/rotation
-- Fixes the write-once bug in privyLinkService.js that silently strands funds
-- when a user's Privy embedded wallet gets recreated on a different chain.
--
-- Before: `wallet_address = COALESCE(NULLIF($2::text, ''), wallet_address)`
--   → the new address is only written if the DB field is empty; any Privy-side
--     rotation is invisible to us and old funds get orphaned.
-- After: overwrite in place, archive the outgoing address into
--   users.previous_wallet_address, and append a row to wallet_changes so we
--   have a full audit trail for support / reconciliation.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS previous_wallet_address TEXT;

CREATE TABLE IF NOT EXISTS wallet_changes (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                TEXT NOT NULL,
  old_wallet_address     TEXT,
  new_wallet_address     TEXT,
  old_privy_id           TEXT,
  new_privy_id           TEXT,
  source                 TEXT NOT NULL,          -- 'privy-link' | 'reconciler' | 'manual'
  changed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_changes_user_id
  ON wallet_changes (user_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_changes_old_wallet
  ON wallet_changes (LOWER(old_wallet_address))
  WHERE old_wallet_address IS NOT NULL;
