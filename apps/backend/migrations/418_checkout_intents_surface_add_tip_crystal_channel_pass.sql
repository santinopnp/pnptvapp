-- Migration 418: sync chk_checkout_intents_surface with VALID_SURFACES in walletCheckoutService.js
--
-- Migration 363 seeded the constraint with 8 surfaces. Since then the service
-- added tip, crystal_self, crystal_gift, crystal_service, and channel_pass
-- without updating the DB guard. Any INSERT with those surfaces throws a
-- constraint violation (confirmed in production: @OVANTAR tip error 2026-10-13).

ALTER TABLE checkout_intents DROP CONSTRAINT IF EXISTS chk_checkout_intents_surface;
ALTER TABLE checkout_intents ADD CONSTRAINT chk_checkout_intents_surface
  CHECK (surface IS NULL OR surface IN (
    'donation', 'membership', 'prime', 'creator_sub', 'call', 'rush', 'channel', 'hangout',
    'tip',
    'crystal_self', 'crystal_gift', 'crystal_service',
    'channel_pass'
  ));
