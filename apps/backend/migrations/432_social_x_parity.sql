-- Migration 432: Social feed X-parity upgrade
-- Adds: social_post_bookmarks, social_post_hashtags, quote-posts, reply_control,
--       media_alt_texts, bookmarks_count on social_posts, pinned_post_id on users.
-- Forward-only (no down migration).

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. pg_trgm extension (required for hashtag autocomplete GIN index)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. social_post_bookmarks
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_post_bookmarks (
    post_id    BIGINT       NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    user_id    VARCHAR(255) NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_spb_user_created
    ON social_post_bookmarks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spb_post_id
    ON social_post_bookmarks (post_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. social_post_hashtags
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_post_hashtags (
    tag        TEXT        NOT NULL,
    post_id    BIGINT      NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tag, post_id)
);

CREATE INDEX IF NOT EXISTS idx_sph_tag_created
    ON social_post_hashtags (tag, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sph_post_id
    ON social_post_hashtags (post_id);

CREATE INDEX IF NOT EXISTS idx_social_post_hashtags_tag_trgm
    ON social_post_hashtags USING GIN (tag gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Alter social_posts — new columns (idempotent via DO blocks)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_posts' AND column_name = 'quoted_post_id'
    ) THEN
        ALTER TABLE social_posts
            ADD COLUMN quoted_post_id BIGINT REFERENCES social_posts(id) ON DELETE SET NULL;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_posts' AND column_name = 'reply_control'
    ) THEN
        ALTER TABLE social_posts
            ADD COLUMN reply_control TEXT NOT NULL DEFAULT 'everyone'
                CHECK (reply_control IN ('everyone', 'following', 'mentioned'));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_posts' AND column_name = 'media_alt_texts'
    ) THEN
        ALTER TABLE social_posts
            ADD COLUMN media_alt_texts JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_posts' AND column_name = 'bookmarks_count'
    ) THEN
        ALTER TABLE social_posts
            ADD COLUMN bookmarks_count INTEGER NOT NULL DEFAULT 0;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_sp_quoted_post_id
    ON social_posts (quoted_post_id)
    WHERE quoted_post_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Alter users — pinned_post_id (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'pinned_post_id'
    ) THEN
        ALTER TABLE users
            ADD COLUMN pinned_post_id BIGINT REFERENCES social_posts(id) ON DELETE SET NULL;
    END IF;
END$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Trigger: maintain bookmarks_count on social_posts
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_social_post_bookmarks_count()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE social_posts
           SET bookmarks_count = bookmarks_count + 1
         WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE social_posts
           SET bookmarks_count = GREATEST(bookmarks_count - 1, 0)
         WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookmark_count ON social_post_bookmarks;
CREATE TRIGGER trg_bookmark_count
AFTER INSERT OR DELETE ON social_post_bookmarks
FOR EACH ROW EXECUTE FUNCTION trg_social_post_bookmarks_count();
