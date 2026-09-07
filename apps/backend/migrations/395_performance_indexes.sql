-- Performance indexes for slow query remediation (2026-09-07)

-- Partial covering index for paymentRecoveryService reconciler:
-- queries pending orders with a btcpay_invoice_id within a date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dso_pending_created
  ON dash_subscription_orders (created_at DESC)
  WHERE status = 'pending' AND btcpay_invoice_id IS NOT NULL;

-- Covering index for discoverService mutual_follows CTE:
-- self-join on user_follows (follower_id, following_id) for mutual count
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_follows_follower_following
  ON user_follows (follower_id, following_id);
