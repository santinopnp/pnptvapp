BEGIN;

-- ── 1. Wipe legacy tier data ─────────────────────────────────────────────────
-- Legacy creator plans (ice/crystal/diamond) had 0 FK references in the DB when
-- this migration was written (verified 2026-08-31). If future refs appear, the
-- DELETE below fails inside the transaction and the whole migration rolls back
-- rather than corrupting anything.
DELETE FROM plans WHERE id IN ('creator_ice','creator_crystal','creator_diamond');
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_creator_type_check;
UPDATE users SET creator_type = NULL
 WHERE creator_type IN ('ice','crystal','diamond','occasional','full_time','custom','live','creator');
ALTER TABLE users DROP COLUMN IF EXISTS creator_tier_recommendation;
ALTER TABLE users DROP COLUMN IF EXISTS tiers_seen_at;

-- ── 2. Crystal Creator pass table ────────────────────────────────────────────
-- One active row per creator (partial UNIQUE index below). Cancelled/expired
-- rows accumulate for audit. payment_ref UNIQUE guards against duplicate
-- webhook deliveries (Stripe + NowPayments both retry on 5xx).
CREATE TABLE IF NOT EXISTS crystal_creator_passes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id        VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ,                       -- NULL = lifetime
  next_bill_at           TIMESTAMPTZ,                       -- when auto-renew fires; NULL for lifetime or one-off
  price_paid_cents       INT NOT NULL,                      -- 10000 self, 15000 gift, 0 founder
  is_gift                BOOLEAN NOT NULL DEFAULT FALSE,
  gifted_by_user_id      VARCHAR(255) REFERENCES users(id),
  gift_note              TEXT,
  payment_provider       TEXT NOT NULL,                     -- stripe|wallet_usdc|nowpayments|founder_grant
  payment_ref            TEXT,                              -- Stripe subscription/invoice id | NP payment_id | tx hash
  stripe_subscription_id TEXT,                              -- populated when payment_provider='stripe'
  auto_renew             BOOLEAN NOT NULL DEFAULT FALSE,    -- true for stripe subs, false for one-offs
  cancelled_at           TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'active',    -- active|cancelled|expired|pending
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccp_active_one_per_creator
  ON crystal_creator_passes(creator_user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccp_payment_ref_unique
  ON crystal_creator_passes(payment_ref)
  WHERE payment_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccp_stripe_sub_unique
  ON crystal_creator_passes(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ccp_expires
  ON crystal_creator_passes(expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ccp_next_bill
  ON crystal_creator_passes(next_bill_at)
  WHERE status = 'active' AND next_bill_at IS NOT NULL;

-- ── 3. Denormalized flags on users ───────────────────────────────────────────
-- Fast read path — 'infinity' represents lifetime; kept in sync by service.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS crystal_creator_active_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crystal_creator_invited_at   TIMESTAMPTZ,  -- private invite gate
  ADD COLUMN IF NOT EXISTS is_whale_pig                 BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_crystal_active
  ON users(crystal_creator_active_until)
  WHERE crystal_creator_active_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_whale_pig
  ON users(is_whale_pig)
  WHERE is_whale_pig = TRUE;

-- ── 4. Seed the 3 founding Crystal Creators (lifetime, no charge) ────────────
UPDATE users SET creator_status = 'active'
 WHERE id = '8f5f4dd1-7bdb-4571-b026-e09d91113c91' AND creator_status = 'none';

INSERT INTO crystal_creator_passes
  (creator_user_id, expires_at, price_paid_cents, payment_provider, status, auto_renew)
VALUES
  ('8f5f4dd1-7bdb-4571-b026-e09d91113c91', NULL, 0, 'founder_grant', 'active', FALSE),
  ('8599671840',                            NULL, 0, 'founder_grant', 'active', FALSE),
  ('8b9e2dfb-063e-4c4d-8aaa-87163f198128',  NULL, 0, 'founder_grant', 'active', FALSE)
ON CONFLICT DO NOTHING;

UPDATE users SET crystal_creator_active_until = 'infinity'::timestamptz,
                 crystal_creator_invited_at   = NOW(),
                 creator_verified             = TRUE
 WHERE id IN ('8f5f4dd1-7bdb-4571-b026-e09d91113c91',
              '8599671840',
              '8b9e2dfb-063e-4c4d-8aaa-87163f198128');

COMMIT;
