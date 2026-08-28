-- Migration 370: Enforce uniqueness on users.wallet_address to prevent
-- wallet hijacking. Without this constraint, if two users linked the same
-- Privy embedded wallet address (via an SDK bug, a manual overwrite, or a
-- deliberate hijack attempt), on-chain payment fulfillment would credit
-- entitlements to whichever user row won the ORDER BY tiebreaker — silently
-- routing the payer's money to another account.
--
-- Backfill audit run 2026-08-28: 0 duplicate wallet_address values.
--
-- Partial UNIQUE index (excludes NULL + empty string) so users without a
-- linked wallet keep working, and any legacy empty-string writes don't
-- collide across the whole table.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wallet_address_unique
  ON users (LOWER(wallet_address))
  WHERE wallet_address IS NOT NULL AND wallet_address <> '';
