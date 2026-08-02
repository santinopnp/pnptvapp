-- 343: Add hype_bot_enabled column to users
-- Controls whether the Cristina hype-bot emits engagement messages
-- during the creator's live stream. Default true (opt-out).
ALTER TABLE users ADD COLUMN IF NOT EXISTS hype_bot_enabled BOOLEAN NOT NULL DEFAULT true;
