-- Migration 413: add user_agent column to payment_errors so we can attribute
-- Privy/Stripe onramp failures to a browser + OS. Previously the stack trace
-- carried line refs but no UA, so cross-browser regressions were invisible.
--
-- Server reads req.get('user-agent') at the /api/wallet/client-error route
-- (authoritative — untamperable by the client body).
--
-- Idempotent: safe to re-run.

ALTER TABLE payment_errors
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
