BEGIN;

-- ── Add 'bts' as a channel access_type ──────────────────────────────────────
-- Crystal Creators can publish a dedicated "BTS" channel that only fans with
-- an active bts_subscription (creator_service_bookings) can see. Gate
-- resolved in EntitlementAccessService.hasResourceAccess via the helper
-- crystalServiceService.hasActiveBtsSubscription(buyer, creator).
--
-- Constraint update strategy: drop the existing CHECK, re-add with 'bts'
-- included. Existing values (free|paid|subscription|prime) unchanged.

ALTER TABLE creator_channels DROP CONSTRAINT IF EXISTS chk_channel_access_type;

ALTER TABLE creator_channels
  ADD CONSTRAINT chk_channel_access_type
  CHECK (access_type IN ('free','paid','subscription','prime','bts'));

COMMIT;
