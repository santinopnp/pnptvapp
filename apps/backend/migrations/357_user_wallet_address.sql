-- 357_user_wallet_address.sql
-- Persist the EVM wallet address a user linked via Privy (or injected MetaMask)
-- during checkout. One address per user; overwritten if the user relinks a
-- different wallet. Nullable — most legacy users won't have one until they
-- complete a Web3 checkout.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42),
  ADD COLUMN IF NOT EXISTS wallet_linked_at TIMESTAMPTZ;

-- Case-insensitive lookup: EVM addresses are hex; we normalize to lowercase on
-- write, but index expression-lower for safety in case any code path forgets.
CREATE INDEX IF NOT EXISTS idx_users_wallet_address
  ON users (LOWER(wallet_address))
  WHERE wallet_address IS NOT NULL;
