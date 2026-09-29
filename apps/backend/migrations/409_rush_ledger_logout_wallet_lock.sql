-- 409_rush_ledger_logout_wallet_lock.sql
--
-- Additive to migration 408 (Privy wallet payouts + refunds). Adds:
--
--   1. rush_creator_ledger — Ru$h spend accumulates per creator; on-chain
--      70/20/10 split fires only when the creator's pending balance crosses
--      RUSH_MIN_SETTLE_USD ($100 default). Avoids paying 3 gas legs on a
--      $0.83 tip.
--
--   2. logout_events — every logout is written here. Most users never log
--      out (creator embedded wallets are non-custodial; recovery is hard).
--      Ops watches for spikes and DMs users proactively.
--
--   3. users.wallet_lock_reason — non-null means the row is exempt from the
--      single-wallet rule. Set to 'multi_wallet_funded_exception' when
--      privyLinkService detects a user already has a second on-chain-funded
--      Privy wallet and both are being kept alive.

BEGIN;

-- ── rush_creator_ledger ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rush_creator_ledger (
  creator_id           VARCHAR(64) PRIMARY KEY,
  pending_usd          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pending_usd >= 0),
  total_settled_usd    NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_credit_at       TIMESTAMPTZ,
  last_settled_at      TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rush_creator_ledger IS
  'Ru$h (internal credit) spend accrues per creator. On-chain USDC 70/20/10 split fires when pending_usd >= RUSH_MIN_SETTLE_USD env (default $100).';

-- ── logout_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logout_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       VARCHAR(64) NOT NULL,
  reason        VARCHAR(64),
  ip            VARCHAR(64),
  user_agent    TEXT,
  had_wallet    BOOLEAN NOT NULL DEFAULT FALSE,
  was_creator   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS logout_events_user_idx ON logout_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS logout_events_recent_idx ON logout_events (created_at DESC);

-- ── users.wallet_lock_reason ─────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_lock_reason VARCHAR(64);

COMMENT ON COLUMN users.wallet_lock_reason IS
  'Non-null = row is exempt from single-wallet rule. Value = short code (e.g. multi_wallet_funded_exception).';

COMMIT;
