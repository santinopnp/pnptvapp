-- Migration 427: widen cristina_chat_messages.user_id from BIGINT to VARCHAR(255)
-- users.id is VARCHAR(255) (UUIDs + legacy integer IDs as strings).
-- The original BIGINT type silently truncates UUID-format user IDs to 0,
-- breaking history lookups for the 6,138+ UUID-format accounts.

ALTER TABLE cristina_chat_messages
  ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::text;
