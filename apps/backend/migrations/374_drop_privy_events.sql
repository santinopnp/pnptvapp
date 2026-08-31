-- 374: drop privy_events audit table + indexes
--
-- Removed 2026-08-31. Privy Webhooks is a Business-tier feature the platform
-- does not have. The /api/webhooks/privy route was dormant (returned 503 when
-- PRIVY_WEBHOOK_SECRET was unset) and nothing in the codebase ever read from
-- this table — the whole thing was dead weight.
--
-- users.privy_id (added in migration 361) is retained — /api/privy/link still
-- writes to it and downstream wallet lookups still read from it.

DROP INDEX IF EXISTS idx_privy_events_type_time;
DROP INDEX IF EXISTS idx_privy_events_wallet;
DROP INDEX IF EXISTS idx_privy_events_user_id;
DROP TABLE IF EXISTS privy_events;
