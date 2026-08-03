-- Migration 346: token_ledger — immutable append-only ledger for Ru$h currency
-- Every mutation of user_token_wallets.{balance_tokens,gifted_balance} must write a ledger row.
-- Wallet columns become a cached materialization; ledger is source of truth.

CREATE TABLE IF NOT EXISTS token_ledger (
  id                    bigserial PRIMARY KEY,
  user_id               varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta_balance         integer NOT NULL DEFAULT 0,   -- signed; Ru$h added/removed from balance_tokens
  delta_gifted          integer NOT NULL DEFAULT 0,   -- signed; Ru$h added/removed from gifted_balance
  reason                varchar(60) NOT NULL,          -- see CHECK below
  source_type           varchar(60),                   -- e.g. 'token_purchase', 'creator_earning', 'live_tip', 'membership_purchase', 'admin_grant', 'refund', 'gift_send', 'gift_receive', 'creator_withdraw', 'earnings_conversion'
  source_id             varchar(255),                  -- id in the referenced table (uuid/int as string)
  actor_id              varchar(255),                  -- who caused this: user_id, admin_id, or 'system'
  balance_after         integer NOT NULL,              -- snapshot for fast reads
  gifted_after          integer NOT NULL,              -- snapshot for fast reads
  metadata              jsonb DEFAULT '{}'::jsonb,     -- free-form context (usd_equiv, note, referenced_ids, etc.)
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT token_ledger_reason_check CHECK (reason IN (
    'purchase',                -- user bought Ru$h with USD
    'admin_grant',             -- admin manually credited (welcome bonus, comp, promo)
    'admin_debit',             -- admin manually debited (correction, clawback)
    'refund_credit',           -- refund credited Ru$h back
    'live_tip_send',           -- user tipped a live creator (debit)
    'live_tip_receive',        -- creator received tip via heartbeat (credit — informational; earnings row is separate)
    'call_book',               -- user booked a private call with Ru$h
    'call_refund',             -- call refunded, Ru$h returned
    'content_purchase',        -- user bought exclusive content
    'membership_purchase',     -- user bought membership with Ru$h
    'gift_send',               -- user gifted Ru$h to another user
    'gift_receive',            -- user received gifted Ru$h
    'earnings_conversion',     -- creator converted USD earnings → Ru$h spend wallet
    'withdraw_hold',           -- creator requested withdraw (funds moved to hold)
    'withdraw_paid',           -- withdraw completed
    'withdraw_reverse',        -- withdraw denied, Ru$h returned
    'pre_ledger_migration'     -- one-time backfill of pre-existing wallets
  ))
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_user_created ON token_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_ledger_reason ON token_ledger (reason);
CREATE INDEX IF NOT EXISTS idx_token_ledger_source ON token_ledger (source_type, source_id) WHERE source_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_token_ledger_created ON token_ledger (created_at DESC);

-- Backfill: one migration row per wallet with current balances.
-- Guarded so re-running the migration doesn't double-backfill.
INSERT INTO token_ledger (user_id, delta_balance, delta_gifted, reason, source_type, actor_id, balance_after, gifted_after, metadata)
SELECT
  w.user_id,
  w.balance_tokens,
  w.gifted_balance,
  'pre_ledger_migration',
  'wallet_backfill',
  'system',
  w.balance_tokens,
  w.gifted_balance,
  jsonb_build_object('migrated_at', now(), 'note', 'One-time backfill on ledger introduction')
FROM user_token_wallets w
WHERE (w.balance_tokens > 0 OR w.gifted_balance > 0)
  AND NOT EXISTS (
    SELECT 1 FROM token_ledger tl
    WHERE tl.user_id = w.user_id AND tl.reason = 'pre_ledger_migration'
  );

-- Withdraw requests table (creator-initiated, admin-approved)
CREATE TABLE IF NOT EXISTS creator_withdraw_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id              varchar(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usd              numeric(10,2) NOT NULL CHECK (amount_usd >= 50),
  destination_currency    varchar(20) NOT NULL DEFAULT 'usdttrc20',
  destination_address     text NOT NULL,
  status                  varchar(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','processing','paid','denied','failed','cancelled')),
  earning_ids             uuid[] NOT NULL DEFAULT '{}',
  payout_id               uuid REFERENCES creator_payouts(id) ON DELETE SET NULL,
  admin_notes             text,
  deny_reason             text,
  requested_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at             timestamptz,
  reviewed_by             varchar(255),
  completed_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_creator ON creator_withdraw_requests (creator_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON creator_withdraw_requests (status, requested_at) WHERE status IN ('pending','approved','processing');
