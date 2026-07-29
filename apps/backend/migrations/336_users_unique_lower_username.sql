-- 336: enforce case-insensitive username uniqueness at the DB level.
--
-- Pre-check (2026-07-29): zero LOWER(username) duplicates in `users`, so this
-- constraint can go on cleanly. The functional index doubles as the enforcement
-- vehicle for a UNIQUE constraint via CREATE UNIQUE INDEX.
--
-- CONCURRENTLY so the migration doesn't take an exclusive lock on `users`.
-- Non-transactional; run outside a migration wrapper that opens a txn.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_users_lower_username
  ON users (LOWER(username))
  WHERE username IS NOT NULL AND username != '' AND is_deleted = false;
