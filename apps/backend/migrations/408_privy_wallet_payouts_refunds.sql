-- Migration 408: Privy wallet payout config + refunds + on-chain transaction log
--
-- users.has_pnptv_payout_configured tracks whether an active creator has
-- confirmed "PNPtv Treasury Wallet" as their payout method (auto-set on
-- creator approval by privyWalletService.ensureCreatorWallet, and reset to
-- FALSE by privyLinkService whenever the linked wallet address actually
-- changes — the previous configuration pointed at an address that's no
-- longer theirs).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_pnptv_payout_configured BOOLEAN NOT NULL DEFAULT FALSE;

-- payment_transactions: on-chain leg log for every USDC Base transfer this
-- app sends — creator cashout splits, PRIME channel splits, RUSH spend
-- splits, and refunds. payment_id is a loose reference (no FK) because the
-- source id can come from checkout_intents.id (integer), fiat_cashout_orders.id,
-- refunds.id, or a rush-spend ledger id — callers pass whatever id they have
-- as text for audit/support lookup.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id            BIGSERIAL PRIMARY KEY,
  payment_id    TEXT,
  purpose       TEXT NOT NULL,          -- 'cashout_split_creator' | 'cashout_split_treasury' | 'cashout_split_reinvestment' |
                                         -- 'prime_split_santino' | 'prime_split_lex' | 'prime_split_treasury' | 'prime_split_reinvestment' |
                                         -- 'rush_split_creator' | 'rush_split_treasury' | 'rush_split_reinvestment' | 'refund'
  tx_hash       TEXT,
  from_address  TEXT,
  to_address    TEXT,
  token         TEXT NOT NULL DEFAULT 'USDC',
  chain         TEXT NOT NULL DEFAULT 'base',
  amount_usd    NUMERIC(14,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent',   -- 'sent' | 'confirmed' | 'failed'
  error         TEXT,
  attempt       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id
  ON payment_transactions (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_tx_hash
  ON payment_transactions (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- refunds: 72h manual-review queue. On approval, USDC goes straight to the
-- user's wallet (creating one via Privy first if they don't have one). On
-- denial, a blockchain signature (Privy) is required to acknowledge the
-- denial and waive chargebacks against Moonpay/Privy/Stripe.
CREATE TABLE IF NOT EXISTS refunds (
  id                       BIGSERIAL PRIMARY KEY,
  payment_id               INTEGER REFERENCES checkout_intents(id) ON DELETE SET NULL,
  user_id                  VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  amount_usd               NUMERIC(14,2) NOT NULL,
  reason                   TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'denied'
  reviewed_by              TEXT,
  reviewed_at              TIMESTAMPTZ,
  review_notes             TEXT,
  denial_reasons           TEXT,
  to_address                TEXT,
  tx_hash                  TEXT,
  refund_denial_signed      BOOLEAN NOT NULL DEFAULT FALSE,
  signature_hash            TEXT,
  signature_requested_at    TIMESTAMPTZ,
  signature_deadline_at     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON refunds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds (payment_id);
