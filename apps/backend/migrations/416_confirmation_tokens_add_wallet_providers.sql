-- Migration 416: add wallet provider values to confirmation_tokens.check_provider
-- rush_wallet (Ru$h token subs) and wallet_usdc (Privy USDC subs) were missing,
-- causing a CHECK constraint violation on every Ru$h-wallet subscription.
-- The subscription itself completes; only the confirmation email/token fails.

ALTER TABLE confirmation_tokens DROP CONSTRAINT IF EXISTS check_provider;

ALTER TABLE confirmation_tokens ADD CONSTRAINT check_provider
  CHECK (provider IN (
    'epayco',
    'nowpayments',
    'btcpay',
    'stripe',
    'daimo',
    'paypal',
    'manual',
    'dash',
    'rush_wallet',
    'wallet_usdc'
  ));
