-- Migration 434: Community Polls for Hangout groups
-- Adds hangout_polls + hangout_poll_votes tables and wires them into chat_messages.
-- hangout_groups.id is INTEGER; users.id is VARCHAR(255).

-- ── Polls table ───────────────────────────────────────────────────────────────
CREATE TABLE hangout_polls (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hangout_id   INTEGER     NOT NULL REFERENCES hangout_groups(id) ON DELETE CASCADE,
  creator_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  question     TEXT        NOT NULL,
  options      JSONB       NOT NULL,       -- [{id: string, text: string}, ...]
  allow_multiple BOOLEAN   NOT NULL DEFAULT false,
  closes_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hangout_polls_hangout_id ON hangout_polls(hangout_id);

-- ── Votes table ───────────────────────────────────────────────────────────────
CREATE TABLE hangout_poll_votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID        NOT NULL REFERENCES hangout_polls(id) ON DELETE CASCADE,
  user_id    VARCHAR(255) NOT NULL REFERENCES users(id),
  option_ids TEXT[]      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX idx_hangout_poll_votes_poll_id ON hangout_poll_votes(poll_id);

-- ── Wire polls into chat_messages ─────────────────────────────────────────────
-- poll_id links a message row back to its poll.
-- The existing CHECK (content IS NOT NULL OR media_url IS NOT NULL) is satisfied
-- by inserting content = '' (empty string is NOT NULL in PG).
ALTER TABLE chat_messages
  ADD COLUMN poll_id UUID REFERENCES hangout_polls(id) ON DELETE SET NULL;

CREATE INDEX idx_chat_messages_poll_id ON chat_messages(poll_id)
  WHERE poll_id IS NOT NULL;
