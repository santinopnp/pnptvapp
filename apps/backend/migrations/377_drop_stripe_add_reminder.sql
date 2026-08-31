BEGIN;

-- ── Drop Stripe scaffolding from crystal_creator_passes ─────────────────────
-- Rationale (2026-08-31): Stripe real subscriptions would require the platform
-- to add a card-recurring rail, but the official rails are NowPayments and
-- Privy wallet — neither supports auto-charge subscriptions:
--   • NP: /v1/subscriptions expires instantly (feedback_nowpayments_subscription_api)
--   • Wallet USDC: user must sign each tx, no on-chain "subscribe" primitive
--
-- Instead: 30-day one-off pass + T-3 renewal reminder DM/email with a 1-tap
-- link that opens the same wallet/NP checkout. If user renews, activateCrystalPass
-- extends expires_at +30d on the same active row. If not, pass expires.

DROP INDEX IF EXISTS idx_ccp_stripe_sub_unique;

ALTER TABLE crystal_creator_passes
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS auto_renew,
  DROP COLUMN IF EXISTS next_bill_at;

-- ── Add reminder tracking so the cron doesn't double-DM the same cycle ──────
ALTER TABLE crystal_creator_passes
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ccp_reminder_due
  ON crystal_creator_passes(expires_at)
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND reminder_sent_at IS NULL;

COMMIT;
