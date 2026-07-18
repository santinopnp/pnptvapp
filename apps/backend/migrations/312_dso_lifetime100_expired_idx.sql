-- Migration 312: Partial index for lifetime100 rescue CTE query
-- The rescue-lifetime100 cron runs every 15min and queries expired lifetime100 orders.
-- This partial index eliminates the table scan on dash_subscription_orders.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dso_lifetime100_expired
  ON dash_subscription_orders (user_id, created_at DESC)
  WHERE plan_id = 'lifetime100' AND status = 'expired';
