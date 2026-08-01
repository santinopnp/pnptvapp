-- x_accounts.created_by was bigint (assumed all admins were Telegram-numeric).
-- Post-Option-A (migration 339), creator webapp OAuth links also mirror into
-- x_accounts using users.id as created_by. users.id is varchar (UUIDs for
-- webapp-native creators, numeric strings for Telegram creators), so a bigint
-- column silently rejected every UUID creator via the fire-and-forget catch.
-- Widen created_by so both id shapes fit; existing bigint rows stringify safely.
ALTER TABLE x_accounts
  ALTER COLUMN created_by TYPE VARCHAR(64) USING created_by::text;

CREATE INDEX IF NOT EXISTS idx_x_accounts_created_by
  ON x_accounts (created_by);
