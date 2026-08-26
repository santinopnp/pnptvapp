-- Migration 368: Extend mercadopago_activations for /subscribe multi-plan support.
-- Adds plan_id so the admin activate endpoint can dispatch the correct grant
-- (7-day PRIME vs monthly vs yearly vs lifetime member+prime, etc.) based on
-- which plan the buyer actually paid for on /subscribe.
--
-- mp_transaction_id is now overloaded: it holds either the URL redirect
-- payment_id/collection_id OR the user-entered "número de operación" (the
-- ~12-digit MercadoPago operation number like 172521754472). Same semantic
-- (identifier admin uses to look up the payment in the MP dashboard).
--
-- status values expanded: awaiting_payment | pending | activated | rejected.
-- awaiting_payment = user asked us to email them the payment link but has not
-- yet submitted their operation number for verification.

ALTER TABLE mercadopago_activations
  ADD COLUMN IF NOT EXISTS plan_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mercadopago_plan_id ON mercadopago_activations (plan_id);
