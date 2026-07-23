-- Per-user Amazon wishlist URL, surfaced as a CTA on the creator profile
-- alongside the tip/gift/book-call action row. Nullable; blank means the
-- wishlist button is hidden on that user's profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS amazon_wishlist_url TEXT NULL;

-- Guardrail: only accept URLs on Amazon-owned domains + short-link amzn.to.
-- Keeps the CTA from being used to leak users to arbitrary external sites.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_amazon_wishlist_url_check;
ALTER TABLE users
  ADD CONSTRAINT users_amazon_wishlist_url_check
  CHECK (
    amazon_wishlist_url IS NULL
    OR (
      LENGTH(amazon_wishlist_url) <= 500
      AND amazon_wishlist_url ~* '^https://(www\.)?(amazon\.(com|co\.uk|ca|com\.mx|com\.br|de|fr|it|es|co\.jp|com\.au|in)|amzn\.to|amzn\.eu|a\.co)/'
    )
  );
