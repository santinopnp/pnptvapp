-- Migration 431: Store Stripe Crypto Onramp seamless sign-in authIntentId per user.
--
-- Stripe's Seamless Sign-In feature lets returning users skip phone OTP by
-- supplying the `authIntentId` from their first successful onramp session.
-- This column caches that value server-side so the frontend can retrieve it
-- before opening the Privy/Stripe onramp flow.
--
-- NOTE: As of the Privy react-auth SDK version in use, `useAddFunds()` does NOT
-- expose a way to pass `authIntentId` into the fiat flow (AddFundsFiatOptions
-- has no providerSettings/stripe field and AddFundsResult carries no intent id).
-- The column is provisioned here for future use once Privy adds passthrough
-- support, or if we switch to a direct Stripe Crypto Onramp integration.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_onramp_auth_intent_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_onramp_auth_intent_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_stripe_onramp_auth_intent
  ON users(id)
  WHERE stripe_onramp_auth_intent_id IS NOT NULL;
