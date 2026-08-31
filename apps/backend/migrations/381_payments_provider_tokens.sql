-- 381_payments_provider_tokens.sql
-- Allow 'tokens' (Ru$h ledger debit) and 'wallet_usdc' (Base on-chain) as valid
-- payments.provider values. Missing 'tokens' caused every Ru$h-paid call booking
-- to 500 at PaymentModel.create with a 23514 CHECK violation, silently blocking
-- the UI's "Pay with Ru$h" button (surfaced 2026-08-31 when Santino tried to
-- book a 30-min call with Lex via Ru$h).

BEGIN;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_valid;
ALTER TABLE payments ADD CONSTRAINT payments_provider_valid
  CHECK (provider IS NULL OR provider IN (
    'epayco', 'daimo', 'paypal', 'stripe', 'manual',
    'btcpay', 'dash', 'nowpayments', 'efipay',
    'tokens', 'wallet_usdc'
  ));

COMMIT;
