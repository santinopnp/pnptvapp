ALTER TABLE hangout_groups ADD COLUMN IF NOT EXISTS telegram_topic_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_hangout_groups_tg_topic
  ON hangout_groups (telegram_topic_id)
  WHERE telegram_topic_id IS NOT NULL;
