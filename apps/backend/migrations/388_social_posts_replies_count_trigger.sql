-- 388_social_posts_replies_count_trigger.sql
--
-- Auto-maintain social_posts.replies_count so it always matches the live
-- (non-deleted) child count. Before this, replies_count was incremented on
-- reply INSERT by createReply() but never decremented when a reply was
-- soft-deleted — 196 posts had drifted counts (2026-09-04 audit).
--
-- Trigger fires for INSERT (new reply), UPDATE (soft-delete / undelete), and
-- DELETE (hard delete). Only affects rows where reply_to_id IS NOT NULL.

CREATE OR REPLACE FUNCTION social_posts_maintain_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reply_to_id IS NOT NULL AND NEW.is_deleted = false THEN
      UPDATE social_posts SET replies_count = replies_count + 1 WHERE id = NEW.reply_to_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Reply was soft-deleted (false → true) — decrement parent.
    IF NEW.reply_to_id IS NOT NULL AND OLD.is_deleted = false AND NEW.is_deleted = true THEN
      UPDATE social_posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = NEW.reply_to_id;
    -- Reply was undeleted (true → false) — increment parent back.
    ELSIF NEW.reply_to_id IS NOT NULL AND OLD.is_deleted = true AND NEW.is_deleted = false THEN
      UPDATE social_posts SET replies_count = replies_count + 1 WHERE id = NEW.reply_to_id;
    -- Reply moved to a different parent (rare — reparenting).
    ELSIF NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id AND NEW.is_deleted = false THEN
      IF OLD.reply_to_id IS NOT NULL THEN
        UPDATE social_posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.reply_to_id;
      END IF;
      IF NEW.reply_to_id IS NOT NULL THEN
        UPDATE social_posts SET replies_count = replies_count + 1 WHERE id = NEW.reply_to_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.reply_to_id IS NOT NULL AND OLD.is_deleted = false THEN
      UPDATE social_posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.reply_to_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_posts_maintain_replies_count ON social_posts;
CREATE TRIGGER trg_social_posts_maintain_replies_count
AFTER INSERT OR UPDATE OR DELETE ON social_posts
FOR EACH ROW EXECUTE FUNCTION social_posts_maintain_replies_count();
