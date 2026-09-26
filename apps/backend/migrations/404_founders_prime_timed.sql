-- Migration 404: Fix Founders plan prime entitlement — 18 months, not lifetime
--
-- Founders (lifetime100 / lifetime-pass, $99.99) grants:
--   pnp-member   → lifetime
--   prime        → 18 months (540 days)  ← was incorrectly set lifetime by migration 401
--   channel-access → 18 months (540 days) scoped to channel 209 (pnptv-prime)
--
-- prime-lifetime-249 ($249.99) is a separate product: lifetime PRIME.
--   pnp-member   → lifetime
--   prime        → lifetime  ← correct, leave as-is
--   channel-access → 18 months (added by migration 403)
--
-- NOTE: existing user_entitlements rows with is_lifetime=true for prime on
-- source_plan_id IN ('lifetime100','lifetime-pass') are NOT downgraded —
-- those customers received a better deal than advertised; taking it back
-- would be a breach of trust. Fix only affects future purchases.

BEGIN;

-- Fix plan_add_ons for Founders plans: prime becomes 18 months, not lifetime
UPDATE plan_add_ons
   SET is_lifetime  = false,
       duration_days = 540
 WHERE plan_id IN ('lifetime100', 'lifetime-pass')
   AND add_on_id = 'prime';

COMMIT;
