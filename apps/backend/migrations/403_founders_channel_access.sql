-- Migration 403: Founders channel access + prime-lifetime-249 plan_add_ons
--
-- prime-lifetime-249 (new $249.99 Founders) had NO plan_add_ons configured —
-- future buyers would get no entitlements. This fixes it.
--
-- Also adds explicit channel-access to channel 209 (pnptv-prime, is_system=true)
-- for all three Founders plans and backfills all 17 existing buyers.
--
-- scope_id column on plan_add_ons stores the resource ID for scoped add-ons
-- (channel-access, hangout-access) that should be auto-granted without needing
-- the caller to pass paymentMetadata.channelId at purchase time.

BEGIN;

-- ── 1. Add scope_id to plan_add_ons ─────────────────────────────────────────
ALTER TABLE plan_add_ons ADD COLUMN IF NOT EXISTS scope_id TEXT;

-- ── 2. Insert plan_add_ons for prime-lifetime-249 ────────────────────────────
-- pnp-member + prime (both lifetime), matching lifetime100 / lifetime-pass
INSERT INTO plan_add_ons (plan_id, add_on_id, is_lifetime, duration_days)
VALUES
  ('prime-lifetime-249', 'pnp-member', true, NULL),
  ('prime-lifetime-249', 'prime',      true, NULL)
ON CONFLICT (plan_id, add_on_id) DO NOTHING;

-- ── 3. Channel-access (18 months = 540 days) scoped to pnptv-prime (id=209) ─
-- Add to all three Founders plans so future buyers get it automatically.
INSERT INTO plan_add_ons (plan_id, add_on_id, is_lifetime, duration_days, scope_id)
VALUES
  ('lifetime100',        'channel-access', false, 540, '209'),
  ('lifetime-pass',      'channel-access', false, 540, '209'),
  ('prime-lifetime-249', 'channel-access', false, 540, '209')
ON CONFLICT (plan_id, add_on_id) DO UPDATE
  SET duration_days = 540, scope_id = '209', is_lifetime = false;

-- ── 4. Backfill channel-access for all existing Founders buyers ──────────────
-- Grants 540 days from NOW for users who bought any Founders plan and
-- do not already have a channel-access row for channel 209.
INSERT INTO user_entitlements
  (user_id, add_on_id, creator_id, source_plan_id, is_lifetime, expires_at,
   is_consumed, granted_at, grant_source)
SELECT DISTINCT ON (p.user_id)
  p.user_id,
  'channel-access',
  '209',
  p.plan_id,
  false,
  NOW() + INTERVAL '540 days',
  false,
  NOW(),
  'founders_channel_backfill_403'
FROM payments p
WHERE p.plan_id IN ('lifetime100', 'lifetime-pass', 'prime-lifetime-249')
  AND p.status = 'completed'
  AND NOT EXISTS (
    SELECT 1
    FROM user_entitlements x
    WHERE x.user_id    = p.user_id
      AND x.add_on_id  = 'channel-access'
      AND x.creator_id = '209'
  )
ON CONFLICT ON CONSTRAINT uq_user_entitlement_non_creator DO NOTHING;

COMMIT;
