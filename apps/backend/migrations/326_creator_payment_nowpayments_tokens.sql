-- Migration 326: expand creator payout options to the full NowPayments token set
--
-- Prior CHECK only allowed { dash, meru, usdc, usdt } — those were UI groups,
-- not NowPayments currency codes, and the payout service ignored the choice
-- and always sent 'usdttrc20'. This aligns the enum with the exact NowPayments
-- codes so the frontend picker maps 1:1 to what the payout API expects.
--
-- 'meru' is grandfathered in the CHECK to keep the 12 existing Meru rows
-- valid. The controller layer separately rejects 'meru' for NEW enrollments —
-- new creators can only pick crypto.

ALTER TABLE creator_enrollments
  DROP CONSTRAINT IF EXISTS creator_enrollments_payment_method_check;

ALTER TABLE creator_enrollments
  ADD CONSTRAINT creator_enrollments_payment_method_check
  CHECK (payment_method::text = ANY (ARRAY[
    'btc'::varchar,
    'btcln'::varchar,
    'eth'::varchar,
    'ltc'::varchar,
    'xmr'::varchar,
    'bch'::varchar,
    'usdt'::varchar,
    'usdttrc20'::varchar,
    'usdtbsc'::varchar,
    'usdc'::varchar,
    'usdcbsc'::varchar,
    'usdcsol'::varchar,
    'dash'::varchar,
    'sol'::varchar,
    'doge'::varchar,
    'meru'::varchar
  ]::text[]));
