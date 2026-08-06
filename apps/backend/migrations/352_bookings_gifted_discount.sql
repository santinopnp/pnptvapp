-- Migration 352: add gifted-token discount columns to bookings
-- Tracks how many Ru$h tokens were applied from gifted_balance at checkout time
-- and the corresponding USD discount that was subtracted from the NowPayments invoice.
-- Only populated when the performer is a GIFTED_ALLOWED_PERFORMER (Santino / Lex).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gifted_tokens_applied INTEGER      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gifted_discount_usd   NUMERIC(10,2) DEFAULT NULL;
