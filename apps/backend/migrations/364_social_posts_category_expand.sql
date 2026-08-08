-- 364: expand social_posts.category CHECK to match UI (PostComposer POST_CATEGORIES).
-- Prior constraint allowed only 6 values; UI has always offered chemsex/slam/clouds/non_pnp,
-- so every post with those categories 500'd on INSERT with 23514 violates check.
-- socialPostService.js already special-cases 'slam' in feed queries, so it was expected to exist.

ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_category_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_category_check
  CHECK (category IS NULL OR category IN (
    'fun',
    'wellness',
    'adult',       -- legacy, kept for safety in case any old rows use it
    'chemsex',
    'slam',
    'clouds',
    'non_pnp',
    'community',
    'social',
    'media'
  ));
