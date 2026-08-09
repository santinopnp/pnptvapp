-- Migration 364: Narrow creator payout lanes to ETH + USDC-ERC20 + fiat (bre_b, cashapp, wise)
-- Run date: 2026-08-08
-- Removes: Meru, BTC, Dash, USDT-Tron, USDT-Base
-- Adds:    payout_reenroll_needed flag for affected creators

BEGIN;

-- 1. Add payout_reenroll_needed column (signals creator must re-enter payout details)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payout_reenroll_needed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Update fiat_cashout_orders CHECK constraint on 'lane' column to remove retired lanes
--    Drop the old constraint and add the new one. Name may differ — use pg_constraint catalog.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'fiat_cashout_orders'::regclass
    AND contype = 'c'
    AND conname LIKE '%lane%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fiat_cashout_orders DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END;
$$;

ALTER TABLE fiat_cashout_orders
  ADD CONSTRAINT fiat_cashout_orders_lane_check
  CHECK (lane IN ('usdc_erc20', 'eth', 'bre_b', 'cashapp', 'wise'));

-- 3. Null out retired JSONB keys in creator_payout_destinations
UPDATE users
SET creator_payout_destinations = creator_payout_destinations
  - 'meru'
  - 'btc'
  - 'dash'
  - 'usdt_tron'
  - 'usdt_base'
WHERE creator_payout_destinations IS NOT NULL
  AND (
    creator_payout_destinations ? 'meru'
    OR creator_payout_destinations ? 'btc'
    OR creator_payout_destinations ? 'dash'
    OR creator_payout_destinations ? 'usdt_tron'
    OR creator_payout_destinations ? 'usdt_base'
  );

-- 4. Mark creators who had ONLY retired lanes as needing re-enroll
--    (they now have no valid payout destination)
UPDATE users
SET payout_reenroll_needed = TRUE
WHERE creator_status IN ('active', 'pending')
  AND (
    -- No JSONB payout destinations at all, OR destinations is now empty after strip
    creator_payout_destinations IS NULL
    OR creator_payout_destinations = '{}'::jsonb
    OR (
      -- Has destinations but none of the active lanes
      NOT creator_payout_destinations ? 'usdc_erc20'
      AND NOT creator_payout_destinations ? 'eth'
      AND NOT creator_payout_destinations ? 'bre_b'
      AND NOT creator_payout_destinations ? 'cashapp'
      AND NOT creator_payout_destinations ? 'wise'
    )
  )
  -- And they had a now-removed destination (so this is meaningful, not just blank)
  AND (
    creator_dash_address IS NOT NULL
    OR meru_account IS NOT NULL
    OR fiat_payout_method = 'meru'
    OR creator_wallet_address IS NOT NULL  -- may have had usdt/btc in old wallet field
  );

-- 5. Null out fiat_payout_method='meru' rows (no longer valid lane)
UPDATE users
SET fiat_payout_method = NULL
WHERE fiat_payout_method = 'meru';

-- 6. Null out creator_dash_address (retired lane; column kept for historical queries)
UPDATE users
SET creator_dash_address = NULL
WHERE creator_dash_address IS NOT NULL;

-- 7. Null out meru_account (retired lane; column kept for historical queries)
UPDATE users
SET meru_account = NULL
WHERE meru_account IS NOT NULL;

COMMIT;
