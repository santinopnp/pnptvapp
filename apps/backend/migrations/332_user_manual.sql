-- Migration 332: Creator user manual (public "how to book / what to expect" text)
--
-- Adds a markdown field creators can edit in Settings + Grok can help draft.
-- Rendered as the "User manual" tab on the creator profile (mockup screen 4).
-- Not exclusive-content — anyone visiting the profile can read it.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_manual_markdown TEXT,
  ADD COLUMN IF NOT EXISTS user_manual_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN users.user_manual_markdown IS
  'Creator-authored markdown describing how to book, what to expect, boundaries. Rendered on /c/:username User manual tab.';
