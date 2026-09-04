-- 387_add_preferred_wallet_address_to_users.sql
-- Cross-device sync for the user's preferred signing wallet.
-- Before this, WalletHomeSheet / WalletPayCard / Donate / CryptoGuide only
-- persisted the choice in localStorage — so a user who picked Trust on their
-- phone would land back on the embedded PNPtv wallet the next time they
-- opened the app on desktop. This column mirrors the localStorage value so
-- the preference follows the user across devices.
--
-- Nullable + no default so existing rows are unaffected; when null the
-- frontend falls back to embedded → first external (the pre-P3 behavior).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_wallet_address VARCHAR(64);
