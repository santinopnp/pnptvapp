-- 373_gas_topups.sql
--
-- Audit + rate-limit log for gas-topup service (gasTopupService.js).
-- Every send from the treasury EOA to a user's embedded wallet appends
-- a row here BEFORE the on-chain broadcast, then updates status once the
-- tx lands. Two queries against this table:
--   1. Rate-limit: COUNT rows per user in the last 24h → cap 3/day.
--   2. Daily treasury cap: SUM(wei) across all users in the last 24h
--      → cap at env-configured USD equivalent.

CREATE TABLE IF NOT EXISTS gas_topups (
  id           BIGSERIAL PRIMARY KEY,
  user_id      VARCHAR(255) NOT NULL,
  address      VARCHAR(255) NOT NULL,
  wei          NUMERIC(78, 0) NOT NULL,
  tx_hash      VARCHAR(255),
  status       VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gas_topups_user_created ON gas_topups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gas_topups_created ON gas_topups(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gas_topups_tx_hash ON gas_topups(tx_hash) WHERE tx_hash IS NOT NULL;
