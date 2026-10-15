CREATE TABLE IF NOT EXISTS cristina_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cristina_chat_messages_user_id ON cristina_chat_messages(user_id, created_at DESC);
