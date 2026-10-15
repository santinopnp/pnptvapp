-- Add translation cache columns to UGC tables
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}';

-- Indexes for translation lookup
CREATE INDEX IF NOT EXISTS idx_social_posts_translations ON social_posts USING gin(translations);
CREATE INDEX IF NOT EXISTS idx_chat_messages_translations ON chat_messages USING gin(translations);
