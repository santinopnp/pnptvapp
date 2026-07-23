-- Add generic JSONB metadata bag to creator_media so we can attach AI-derived
-- tags (and future annotations) without a wider schema change every time.
-- Populated by creatorMediaService.scheduleAiEnhancement in the background
-- after each upload — never blocks the user-facing insert.
ALTER TABLE creator_media
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
