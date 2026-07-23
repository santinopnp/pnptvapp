-- Document that 'bre_b' is a valid lane in users.creator_payout_destinations.
-- Bre-B is Colombia's new interoperable instant payment key (Banrep / SPI):
-- the creator registers a phone number, national ID, or email once with their
-- bank and receives payments from any bank via that key.
--
-- Schema is unchanged (creator_payout_destinations is JSONB and already
-- accepts arbitrary lane keys). This migration only updates the column comment.
COMMENT ON COLUMN users.creator_payout_destinations IS
  'Per-lane payout destinations. Valid lanes: btc, dash, usdt_tron, usdt_base, meru, bre_b. bre_b payload: { key: string, key_type: "phone"|"cedula"|"email" }';
