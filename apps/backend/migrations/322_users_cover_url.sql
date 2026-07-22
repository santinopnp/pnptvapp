-- Add cover_url column to users. Backs the "cover pic" surface on the
-- Creator Profile page + Profile page banner. Path is a URL relative to
-- the webapp root (e.g. "/uploads/covers/USERID-TIMESTAMP.webp") — matches
-- the photo_file_id convention already used for avatars.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT NULL;
