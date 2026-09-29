-- Migration 410: fix fiat_cashout_orders lane constraint + mark automatic payouts
--
-- 1. cashoutService.requestCashout (the only active cashout path since the
--    2026-09-05 simplification) has inserted lane='privy_wallet' since it was
--    written, but the lane CHECK constraint was never updated past migration
--    364's ('usdc_erc20','eth','bre_b','cashapp','wise') set — every cashout
--    order insert has been violating this constraint. Widen it to include
--    'privy_wallet' (keeping the retired lane values so historical rows still
--    validate).
--
-- 2. is_automatic distinguishes creator-initiated cashouts (cashoutRoutes.js)
--    from the new 48h auto-payout sweep (cashoutService.runAutoPayoutSweep,
--    services/workers/index.js 'earnings-maturation') for ops/audit queries.

BEGIN;

ALTER TABLE fiat_cashout_orders
  DROP CONSTRAINT IF EXISTS fiat_cashout_orders_lane_check;

ALTER TABLE fiat_cashout_orders
  ADD CONSTRAINT fiat_cashout_orders_lane_check
  CHECK (lane IN ('privy_wallet', 'usdc_erc20', 'eth', 'bre_b', 'cashapp', 'wise'));

ALTER TABLE fiat_cashout_orders
  ADD COLUMN IF NOT EXISTS is_automatic BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN fiat_cashout_orders.is_automatic IS
  'true = dispatched by the 48h auto-payout sweep (cashoutService.runAutoPayoutSweep); false = creator clicked "cash out" via cashoutRoutes.js.';

COMMIT;
