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
DROP INDEX IF EXISTS idx_refunds_payment_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_payment_id_unique
  ON refunds (payment_id)
  WHERE payment_id IS NOT NULL;
