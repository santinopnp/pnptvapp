BEGIN;

-- ── Crystal Services bookings ───────────────────────────────────────────────
-- One row per fan-initiated purchase of a creator's premium service.
-- Fulfillment is service-type specific: private_call schedules a LiveKit
-- session, custom_content sets a 7-day delivery clock, priority_dm/bts flip
-- a per-fan flag, private_main_stage schedules a long private session.
--
-- Payment rails: wallet (USDC on Base via walletCheckoutService) or
-- nowpayments (hosted invoice). Stripe is intentionally not a rail here
-- (see feedback in the crystal creator refactor).

CREATE TABLE IF NOT EXISTS creator_service_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        BIGINT NOT NULL REFERENCES creator_services(id) ON DELETE RESTRICT,
  creator_user_id   VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_user_id     VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_type      TEXT NOT NULL,                    -- snapshot of creator_services.service_type
  price_paid_cents  INT NOT NULL,                     -- snapshot of price at booking time
  payment_provider  TEXT NOT NULL,                    -- 'wallet_usdc' | 'nowpayments'
  payment_ref       TEXT,                             -- tx hash / NP payment_id / intent id
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | fulfilled | cancelled | refunded
  buyer_note        TEXT,                             -- what the fan wants (custom_content brief, etc.)
  fulfilled_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,                      -- deadline for creator to deliver (custom_content)
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_csb_payment_ref_unique
  ON creator_service_bookings(payment_ref)
  WHERE payment_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csb_creator_status
  ON creator_service_bookings(creator_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_csb_buyer_status
  ON creator_service_bookings(buyer_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_csb_expires
  ON creator_service_bookings(expires_at)
  WHERE status IN ('paid') AND expires_at IS NOT NULL;

COMMIT;
