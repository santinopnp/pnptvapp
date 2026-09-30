-- Migration 409: one refund per payment, enforced at the DB level
--
-- refundService.requestRefund's duplicate check (SELECT then INSERT) is not
-- atomic: two concurrent requests for the same payment_id can both pass the
-- SELECT before either INSERT commits, producing two refund rows for one
-- payment. approveRefund's per-row atomic claim then lets each row be
-- approved independently, sending USDC twice for the same payment.
--
-- Replaces the plain idx_refunds_payment_id index with a UNIQUE one so the
-- second concurrent INSERT fails with 23505 instead of succeeding — the app
-- already treats that as REFUND_ALREADY_EXISTS.

-- Defensive dedupe first: CREATE UNIQUE INDEX fails outright if any
-- environment already has duplicate non-NULL payment_id rows — exactly the
-- race this migration exists to close. Verified clean on production at the
-- time this migration was written (0 duplicates), but a migration that only
-- works when the bug hasn't fired yet isn't a real fix. For each duplicate
-- group, keep one row: prefer one that's already been decided
-- (approved/denied) over a still-pending duplicate, then the oldest by id;
-- delete the rest. A kept 'approved' row still has its real tx_hash/
-- to_address — nothing about the payout record is lost.
DELETE FROM refunds r
WHERE r.payment_id IS NOT NULL
  AND r.id NOT IN (
    SELECT DISTINCT ON (payment_id) id
    FROM refunds
    WHERE payment_id IS NOT NULL
    ORDER BY payment_id, (status IN ('approved', 'denied')) DESC, id ASC
  );

DROP INDEX IF EXISTS idx_refunds_payment_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_payment_id_unique
  ON refunds (payment_id)
  WHERE payment_id IS NOT NULL;
