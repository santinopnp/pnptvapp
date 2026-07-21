-- Fix: creator_subscriptions.payment_id was typed UUID, but CreatorService.subscribeToCreator()
-- receives raw provider order-id strings (e.g. NowPayments "pnptv-nowp-<userid>-<ts>"), which are
-- not valid UUIDs. Every NowPayments creator_monthly subscription has been failing with
-- "invalid input syntax for type uuid" since at least 2026-06-25 -- the order gets verified as
-- paid, the grant throws, and the order eventually expires with the customer never receiving
-- their creator subscription. BTCPay avoids this via paymentSettlementService.invoiceToUUID();
-- widening the column is simpler and avoids needing that conversion at every call site.
ALTER TABLE creator_subscriptions ALTER COLUMN payment_id TYPE TEXT;
