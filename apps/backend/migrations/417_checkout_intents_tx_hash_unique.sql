-- Migration 417: UNIQUE backup for checkout_intents.tx_hash
--
-- walletCheckoutService's fulfillment paths (verifyAndFulfillEth,
-- verifyAndFulfillUsdc) treat tx_hash as a one-to-one idempotency key —
-- `SELECT ... WHERE lower(tx_hash) = lower($1) FOR UPDATE` is how they claim
-- an intent before fulfilling it. That locking works correctly today, but it
-- is the ONLY thing stopping two rows from sharing a tx_hash — the index
-- backing it (idx_checkout_intents_tx_hash, migration 363) is a plain index,
-- not UNIQUE. Any future code path that writes checkout_intents without
-- going through that lock (a backfill script, an admin tool, a new surface)
-- would have no schema-level guard against double-fulfilling the same
-- on-chain transaction. Add the backup now, while the app-level invariant
-- still holds, rather than after it's been violated.

-- Defensive check first: fail loudly rather than silently if any environment
-- already has two rows sharing a non-null tx_hash — that would mean the
-- invariant this migration assumes has already been violated and needs
-- manual review before the index can be created.
DO $$
DECLARE
  dupe_count INT;
BEGIN
  SELECT COUNT(*) INTO dupe_count FROM (
    SELECT lower(tx_hash) AS h
      FROM checkout_intents
     WHERE tx_hash IS NOT NULL
     GROUP BY lower(tx_hash)
    HAVING COUNT(*) > 1
  ) dupes;
  IF dupe_count > 0 THEN
    RAISE EXCEPTION 'migration 417: % tx_hash value(s) already shared by more than one checkout_intents row — resolve manually before creating the unique index', dupe_count;
  END IF;
END $$;

DROP INDEX CONCURRENTLY IF EXISTS idx_checkout_intents_tx_hash;

-- CONCURRENTLY so the build doesn't hold a lock against inserts/updates on
-- checkout_intents (a hot table) while it scans existing rows. Cannot run
-- inside a transaction block — fine here since this file has no surrounding
-- BEGIN and each statement (including the DO block above) runs as its own
-- implicit transaction.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_checkout_intents_tx_hash_unique
  ON checkout_intents (lower(tx_hash))
  WHERE tx_hash IS NOT NULL;
