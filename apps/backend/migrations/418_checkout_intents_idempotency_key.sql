-- Migration 418: client idempotency key for checkout_intents
--
-- walletCheckoutService.initiateRushPurchase debits the Ru$h wallet
-- synchronously with no idempotency protection against a network retry or a
-- frontend double-click sending the same purchase request twice (the USDC
-- rail doesn't have this problem — it reconciles later by on-chain tx_hash).
--
-- Adds an optional idempotency_key column: when a caller supplies one
-- (stable across retries of the same user action), the partial UNIQUE index
-- below makes a repeated INSERT with the same (user_id, idempotency_key)
-- fail with 23505 instead of creating a second intent + second debit. NULL
-- (no key supplied) is unconstrained, same as today.

ALTER TABLE checkout_intents
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

COMMENT ON COLUMN checkout_intents.idempotency_key IS
  'Optional client-chosen key, stable across retries of one user action. NULL = caller opted out of idempotency protection.';

-- CONCURRENTLY so the build doesn't hold a lock against inserts/updates on
-- checkout_intents (a hot table) while it scans existing rows. Cannot run
-- inside a transaction block — fine here since this file has no surrounding
-- BEGIN and each statement runs as its own implicit transaction.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_rush_intent_idempotency_key
  ON checkout_intents (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND provider = 'wallet_rush';
