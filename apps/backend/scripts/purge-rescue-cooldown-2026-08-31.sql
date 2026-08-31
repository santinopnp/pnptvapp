-- Purge rescue-lifetime100 breadcrumbs created 2026-08-30 / 2026-08-31
-- for users who were victims of the banxa_btc_dual double-broadcast on
-- 2026-08-28 (batches banxa-btc-dual-2026-08-28 and -v2).
--
-- Why:
--   The banxa dual broadcast created 34,793 NowPayments invoices that all
--   auto-expired within ~1h. That fed the rescue-lifetime100 cron cohort
--   (loadCohort filter: plan_id='lifetime100' AND status='expired' AND
--   created_at > NOW() - INTERVAL '7 days'), which then wrote 9,635
--   wallet_deep_link breadcrumbs on 2026-08-30/31. Those breadcrumbs put
--   the affected users on a 30-day rescue cooldown, blocking legitimate
--   recovery outreach until late September.
--
-- What this deletes:
--   dash_subscription_orders rows where all three hold:
--     1. metadata->>'provider' = 'wallet_deep_link'
--     2. metadata->>'source' IN ('rescue-lifetime100-legacy',
--                                'rescue-lifetime100-recurring')
--     3. created_at in [2026-08-30, 2026-09-01)
--     4. user_id also has a banxa_btc_dual row from 2026-08-28
--
-- How to run (from repo root):
--   docker exec -i pg-pnptv psql -U pnptvbot -d pnptvbot \
--     < apps/backend/scripts/purge-rescue-cooldown-2026-08-31.sql
--
-- The transaction ROLLBACKs by default. To commit, change ROLLBACK to COMMIT.

BEGIN;

WITH victims AS (
  SELECT DISTINCT user_id::text AS uid
    FROM dash_subscription_orders
   WHERE metadata->>'flow' = 'banxa_btc_dual'
     AND created_at >= '2026-08-28'
     AND created_at <  '2026-08-29'
),
to_delete AS (
  SELECT id
    FROM dash_subscription_orders
   WHERE metadata->>'provider' = 'wallet_deep_link'
     AND metadata->>'source' IN ('rescue-lifetime100-legacy',
                                 'rescue-lifetime100-recurring')
     AND created_at >= '2026-08-30'
     AND created_at <  '2026-09-01'
     AND user_id::text IN (SELECT uid FROM victims)
),
deleted AS (
  DELETE FROM dash_subscription_orders
   WHERE id IN (SELECT id FROM to_delete)
  RETURNING id, user_id
)
SELECT
  (SELECT count(*) FROM victims)   AS banxa_victims,
  (SELECT count(*) FROM to_delete) AS rows_to_delete,
  (SELECT count(*) FROM deleted)   AS rows_deleted,
  (SELECT count(DISTINCT user_id) FROM deleted) AS users_unblocked;

-- Change to COMMIT after reviewing the row counts above.
ROLLBACK;
