-- Migration 401: Founders plan merge
-- lifetime-pass (canonical, $99.99) absorbs lifetime100 + lifetime80.
-- Retroactively upgrades all holders to lifetime prime + lifetime pnp-member.

BEGIN;

-- ── 1. Fix lifetime-pass plan ──────────────────────────────────────────────
UPDATE plans
   SET price        = 99.99,
       name         = 'PNPtv Founders',
       display_name = 'PNPtv! Founders',
       updated_at   = NOW()
 WHERE id = 'lifetime-pass';

-- ── 2. Deactivate legacy aliases ───────────────────────────────────────────
UPDATE plans
   SET active     = false,
       updated_at = NOW()
 WHERE id IN ('lifetime100', 'lifetime80');

-- ── 3. Fix plan_add_ons: legacy plans had 540-day non-lifetime prime ───────
UPDATE plan_add_ons
   SET is_lifetime  = true,
       duration_days = NULL
 WHERE plan_id IN ('lifetime100', 'lifetime80')
   AND add_on_id = 'prime';

-- ── 4. Upgrade all non-lifetime entitlements from any lifetime plan ────────
-- Covers: SAMLA100's expiring lifetime-pass rows, lifetime100/80 users with
-- 540-day prime, and any is_consumed=true rows that should be reactivated.
UPDATE user_entitlements
   SET is_lifetime  = true,
       expires_at   = NULL,
       is_consumed  = false,
       grant_source = COALESCE(grant_source, 'retroactive_merge'),
       updated_at   = NOW()
 WHERE source_plan_id IN ('lifetime100', 'lifetime80', 'lifetime-pass')
   AND is_lifetime = false;

-- ── 5. Backfill missing prime rows ─────────────────────────────────────────
INSERT INTO user_entitlements
  (user_id, add_on_id, source_plan_id, is_lifetime, is_consumed, granted_at, grant_source)
SELECT DISTINCT
  ue.user_id,
  'prime',
  ue.source_plan_id,
  true,
  false,
  NOW(),
  'retroactive_merge'
FROM user_entitlements ue
WHERE ue.source_plan_id IN ('lifetime100', 'lifetime80', 'lifetime-pass')
  AND NOT EXISTS (
    SELECT 1
      FROM user_entitlements x
     WHERE x.user_id    = ue.user_id
       AND x.add_on_id  = 'prime'
       AND x.creator_id IS NULL
  )
ON CONFLICT ON CONSTRAINT uq_user_entitlement_non_creator DO NOTHING;

-- ── 6. Backfill missing pnp-member rows ────────────────────────────────────
INSERT INTO user_entitlements
  (user_id, add_on_id, source_plan_id, is_lifetime, is_consumed, granted_at, grant_source)
SELECT DISTINCT
  ue.user_id,
  'pnp-member',
  ue.source_plan_id,
  true,
  false,
  NOW(),
  'retroactive_merge'
FROM user_entitlements ue
WHERE ue.source_plan_id IN ('lifetime100', 'lifetime80', 'lifetime-pass')
  AND NOT EXISTS (
    SELECT 1
      FROM user_entitlements x
     WHERE x.user_id    = ue.user_id
       AND x.add_on_id  = 'pnp-member'
       AND x.creator_id IS NULL
  )
ON CONFLICT ON CONSTRAINT uq_user_entitlement_non_creator DO NOTHING;

COMMIT;
