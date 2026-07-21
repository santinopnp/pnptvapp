-- Reconciliation report: NOWPayments activity in the last 7 days.
-- Run on the production server, e.g.:
--   docker exec -i pg-pnptv psql -U pnptvbot -d <dbname> -f - < apps/backend/scripts/reconcile-nowpayments-7d.sql
-- or, if psql is available with DATABASE_URL set:
--   psql "$DATABASE_URL" -f apps/backend/scripts/reconcile-nowpayments-7d.sql

\echo '=== 1. Summary by status (nowpayments orders, last 7 days) ==='
SELECT
  status,
  COUNT(*)::int                         AS orders,
  COALESCE(SUM(usd_amount), 0)::numeric AS usd_total
FROM dash_subscription_orders
WHERE metadata->>'provider' = 'nowpayments'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY orders DESC;

\echo ''
\echo '=== 2. Stuck orders: pending/partially_paid older than 2 hours (possible missed webhook) ==='
SELECT
  id, user_id, plan_id, usd_amount, status, btcpay_invoice_id AS order_id,
  created_at, notes
FROM dash_subscription_orders
WHERE metadata->>'provider' = 'nowpayments'
  AND created_at > NOW() - INTERVAL '7 days'
  AND status IN ('pending', 'partially_paid')
  AND created_at < NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;

\echo ''
\echo '=== 3. Orders marked completed in last 7 days ==='
SELECT
  id, user_id, plan_id, usd_amount, btcpay_invoice_id AS order_id,
  created_at, completed_at, notes
FROM dash_subscription_orders
WHERE metadata->>'provider' = 'nowpayments'
  AND status = 'completed'
  AND completed_at > NOW() - INTERVAL '7 days'
ORDER BY completed_at DESC;

\echo ''
\echo '=== 4. Completed orders MISSING a matching user_entitlements grant ==='
-- Excludes plan types that do not grant a user_entitlements row directly
-- (token_purchase, call_package, tip/donation are credited/settled elsewhere).
SELECT
  o.id, o.user_id, o.plan_id, o.usd_amount, o.btcpay_invoice_id AS order_id,
  o.completed_at, o.notes
FROM dash_subscription_orders o
WHERE o.metadata->>'provider' = 'nowpayments'
  AND o.status = 'completed'
  AND o.completed_at > NOW() - INTERVAL '7 days'
  AND o.plan_id NOT IN ('token_purchase', 'call_package')
  AND o.metadata->>'flow' IS DISTINCT FROM 'tip'
  AND NOT EXISTS (
    SELECT 1 FROM user_entitlements e
    WHERE e.source_payment_id = o.btcpay_invoice_id
       OR (e.user_id = o.user_id AND e.granted_at BETWEEN o.completed_at - INTERVAL '5 minutes' AND o.completed_at + INTERVAL '5 minutes')
  )
ORDER BY o.completed_at DESC;

\echo ''
\echo '=== 5. Orders with failure/refund/underpayment notes in last 7 days ==='
SELECT
  id, user_id, plan_id, usd_amount, status, btcpay_invoice_id AS order_id,
  created_at, completed_at, notes
FROM dash_subscription_orders
WHERE metadata->>'provider' = 'nowpayments'
  AND created_at > NOW() - INTERVAL '7 days'
  AND (
    notes ILIKE '%failed%' OR
    notes ILIKE '%refund%' OR
    notes ILIKE '%underpaid%' OR
    notes ILIKE '%wrong_asset%' OR
    notes ILIKE '%zero%'
  )
ORDER BY created_at DESC;

\echo ''
\echo '=== 6. Corresponding rows written to payments table (webhook non-fatal insert) ==='
SELECT
  id, user_id, plan_id, status, amount, currency, payment_id, reference,
  transaction_id, created_at, metadata->>'nowpayments_payment_id' AS np_payment_id
FROM payments
WHERE provider = 'nowpayments'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

\echo ''
\echo '=== 7. Completed orders MISSING a matching payments-table row (webhook insert may have failed) ==='
SELECT
  o.id, o.user_id, o.plan_id, o.usd_amount, o.btcpay_invoice_id AS order_id, o.completed_at
FROM dash_subscription_orders o
WHERE o.metadata->>'provider' = 'nowpayments'
  AND o.status = 'completed'
  AND o.completed_at > NOW() - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.reference = o.btcpay_invoice_id AND p.provider = 'nowpayments'
  )
ORDER BY o.completed_at DESC;
