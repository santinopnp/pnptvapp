-- 417_wallet_balance_snapshot.sql
-- Stores periodic on-chain balance snapshots for all wallet addresses linked to
-- platform users (active + orphaned). One row per address/network/run.

CREATE TABLE IF NOT EXISTS wallet_balance_snapshot (
  id                 bigserial PRIMARY KEY,
  user_id            text REFERENCES users(id) ON DELETE SET NULL,
  wallet_address     text        NOT NULL,
  network            text        NOT NULL, -- 'base' | 'ethereum' | 'polygon' | 'arbitrum'
  eth_balance        numeric(30, 18) NOT NULL DEFAULT 0,
  usdc_balance       numeric(20, 6)  NOT NULL DEFAULT 0,
  eth_usd_price      numeric(10, 2),
  total_usd_value    numeric(12, 2)  NOT NULL DEFAULT 0,
  is_orphaned        boolean     NOT NULL DEFAULT false,
  checked_at         timestamptz NOT NULL DEFAULT now(),
  run_id             text        NOT NULL  -- groups all rows from one script run
);

CREATE INDEX idx_wbs_user_id       ON wallet_balance_snapshot (user_id);
CREATE INDEX idx_wbs_address       ON wallet_balance_snapshot (wallet_address);
CREATE INDEX idx_wbs_run_id        ON wallet_balance_snapshot (run_id);
CREATE INDEX idx_wbs_total_usd     ON wallet_balance_snapshot (total_usd_value DESC);
CREATE INDEX idx_wbs_checked_at    ON wallet_balance_snapshot (checked_at DESC);
