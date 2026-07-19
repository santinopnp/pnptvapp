-- Migration 315: Creator tips table + is_tip flag on creator_earnings

CREATE TABLE IF NOT EXISTS creator_tips (
  id                      SERIAL PRIMARY KEY,
  payer_id                TEXT NOT NULL,
  creator_id              TEXT NOT NULL,
  amount_usd              NUMERIC(10,2) NOT NULL,
  order_id                TEXT UNIQUE NOT NULL,
  nowpayments_payment_id  TEXT,
  pay_currency            TEXT,
  message                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  earnings_id             UUID REFERENCES creator_earnings(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_tips_creator_id  ON creator_tips(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_tips_payer_id    ON creator_tips(payer_id);
CREATE INDEX IF NOT EXISTS idx_creator_tips_status      ON creator_tips(status);
CREATE INDEX IF NOT EXISTS idx_creator_tips_created_at  ON creator_tips(created_at DESC);

ALTER TABLE creator_earnings
  ADD COLUMN IF NOT EXISTS is_tip BOOLEAN NOT NULL DEFAULT FALSE;
