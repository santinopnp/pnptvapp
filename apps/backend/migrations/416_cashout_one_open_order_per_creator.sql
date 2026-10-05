-- Migration 416: one open cashout order per creator, enforced at the DB level
--
-- cashoutService.requestCashout's "block concurrent orders" check (SELECT
-- then INSERT) is not atomic: two concurrent requests from the same creator
-- can both pass the "no open order" SELECT before either INSERT commits,
-- producing two simultaneous 'pending'/'processing' orders — bypassing the
-- "one cashout in flight" rule (the FOR UPDATE SKIP LOCKED on creator_earnings
-- still stops them from double-spending the same earnings rows, so no funds
-- are at risk, but the business rule itself can be raced).
--
-- A partial UNIQUE index closes this the same way migration 409 closed the
-- equivalent race in refunds: the second concurrent INSERT fails with 23505
-- instead of succeeding, and the app already translates that into
-- OPEN_ORDER_EXISTS.

-- Defensive dedupe first: fail loudly rather than silently if any environment
-- already has two concurrently-open orders for the same creator — that would
-- mean the race already fired and needs manual review before this index can
-- be created. (Expected to be a no-op — CREATE UNIQUE INDEX below will error
-- out on its own if this ever matches more than one row per creator.)
DO $$
DECLARE
  dupe_count INT;
BEGIN
  SELECT COUNT(*) INTO dupe_count FROM (
    SELECT creator_id
      FROM fiat_cashout_orders
     WHERE status IN ('pending', 'processing')
     GROUP BY creator_id
    HAVING COUNT(*) > 1
  ) dupes;
  IF dupe_count > 0 THEN
    RAISE EXCEPTION 'migration 416: % creator(s) already have more than one open cashout order — resolve manually before creating idx_one_open_cashout_per_creator', dupe_count;
  END IF;
END $$;

-- CONCURRENTLY so the build doesn't hold a lock against inserts/updates on
-- fiat_cashout_orders while it scans the existing rows. Cannot run inside a
-- transaction block — fine here since this file has no surrounding BEGIN and
-- each statement in it (including the DO block above) runs as its own
-- implicit transaction.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_one_open_cashout_per_creator
  ON fiat_cashout_orders (creator_id)
  WHERE status IN ('pending', 'processing');
