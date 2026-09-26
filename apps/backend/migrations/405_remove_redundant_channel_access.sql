-- Migration 405: Remove redundant channel-access from Founders plans
--
-- prime entitlement IS the PRIME channel (access_type='prime' on channel 209).
-- Adding channel-access scoped to 209 on top of prime is redundant, and for
-- prime-lifetime-249 it was actively wrong (18-month expiry on a lifetime plan).
--
-- Founders (lifetime100/lifetime-pass): pnp-member lifetime + prime 18 months
-- PRIME Lifetime (prime-lifetime-249):  pnp-member lifetime + prime lifetime

BEGIN;

-- Remove channel-access from plan_add_ons for all three Founders-family plans
DELETE FROM plan_add_ons
 WHERE plan_id IN ('lifetime100', 'lifetime-pass', 'prime-lifetime-249')
   AND add_on_id = 'channel-access';

-- Delete the channel-access entitlements backfilled by migration 403
-- (grant_source set to 'founders_channel_backfill_403' for safe targeting)
DELETE FROM user_entitlements
 WHERE add_on_id    = 'channel-access'
   AND creator_id   = '209'
   AND grant_source = 'founders_channel_backfill_403';

COMMIT;
