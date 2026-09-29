-- Migration 408: Mondays Spundays — one-time $20 → 2 months PRIME + PRIME
-- Channel offer. Explicitly marketed as a one-time deal that will not repeat
-- (unlike the recurring Sunday Spun Days promo). Plan lives as a real `plans`
-- row (not just config/promotionalPlans.js) because the NOWPayments onchain
-- checkout route (/api/webapp/payments/onchain/prepare) reads directly from
-- the `plans` table and does not fall back to the promo config.
--
-- Idempotent: safe to re-run.

INSERT INTO plans (
  id, sku, name, display_name, tier,
  price, currency,
  duration, duration_days,
  description, features, active,
  is_recurring
)
VALUES (
  'mondays_spundays_promo_20',
  'EASYBOTS-PNP-PROMO-MSD20',
  'Mondays Spundays Promo',
  'Mondays Spundays — 2 Months PRIME',
  'PRIME',
  20.00, 'USD',
  60, 60,
  'One-time promo: 2 months of full PRIME access + PRIME Channel invite. Never repeats.',
  '["2 meses de acceso PRIME completo","Invitación al PRIME Channel incluida","Oferta única — nunca vuelve"]'::jsonb,
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  price = EXCLUDED.price,
  duration = EXCLUDED.duration,
  duration_days = EXCLUDED.duration_days,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Grants 'prime' add-on for 60 days. grantEntitlementsForPlan auto-grants
-- 'pnp-member' alongside 'prime', and the standard payment-confirmation flow
-- (paymentService.sendPaymentConfirmationNotification) issues the PRIME
-- Channel invite link the same way it does for every other PRIME plan.
INSERT INTO plan_add_ons (plan_id, add_on_id, duration_days, is_lifetime)
VALUES ('mondays_spundays_promo_20', 'prime', 60, false)
ON CONFLICT (plan_id, add_on_id) DO NOTHING;

-- One row per send of this one-time campaign (kept plural-table-shaped like
-- sunday_spun_days_campaigns for consistency/reuse, even though this promo
-- is designed to fire once).
CREATE TABLE IF NOT EXISTS mondays_spundays_campaigns (
  id BIGSERIAL PRIMARY KEY,
  campaign_slug TEXT NOT NULL DEFAULT 'mondays_spundays_2026_10_05',
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audience_size INTEGER NOT NULL DEFAULT 0,
  tg_sent INTEGER NOT NULL DEFAULT 0,
  tg_failed INTEGER NOT NULL DEFAULT 0,
  tg_blocked INTEGER NOT NULL DEFAULT 0,
  dm_sent INTEGER NOT NULL DEFAULT 0,
  dm_failed INTEGER NOT NULL DEFAULT 0,
  email_sent INTEGER NOT NULL DEFAULT 0,
  email_failed INTEGER NOT NULL DEFAULT 0,
  redeem_url TEXT,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_mondays_spundays_campaigns_fired_at
  ON mondays_spundays_campaigns (fired_at DESC);

-- Landing page visits (one row per user; this is a one-time offer so we
-- dedup per-user for the lifetime of the campaign, not per-week).
CREATE TABLE IF NOT EXISTS mondays_spundays_visits (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_mondays_spundays_visits_user
  ON mondays_spundays_visits (user_id, visited_at DESC);
