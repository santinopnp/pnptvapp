-- Migration 435: Fix slow query performance
-- Date: 2026-10-20
--
-- Root-cause analysis findings:
--
-- 1. STALE STATISTICS (primary cause of 1.5-3.4s planning overhead):
--    pg_class.reltuples was stale for several tables because ANALYZE had not run
--    recently. The live row counts discovered after VACUUM ANALYZE:
--      user_follows:      159,254 live rows  (stale estimate was ~149k — directionally ok)
--      user_entitlements: 23,112 live rows   (stale estimate was ~37k; 65.6% dead tuples)
--      social_posts:      17,915 live rows   (stale estimate was ~17.7k — ok)
--    The real issue: ANALYZE had never run on user_entitlements or social_posts,
--    so their per-column statistics (histograms, MCVs) were absent, causing the
--    planner to misestimate selectivity and choose seq scans over index scans.
--    user_entitlements had 65.6% dead tuple bloat which amplified the effect.
--    The planning phase itself burns 19-25ms per query because there are 1,612
--    total indexes in the schema — the planner must evaluate all candidate paths.
--    Fix: VACUUM + ANALYZE all affected tables, then add targeted indexes.
--
-- 2. DISTINCT ON (user_id) on social_posts — forced full seq scan + 2265kB
--    quicksort over 9,050 rows. The partial index idx_social_posts_user_created
--    covers (user_id, created_at DESC) WHERE is_deleted=false but lacks the
--    reply_to_id IS NULL predicate, so the planner cannot use it for DISTINCT ON.
--    The new idx_social_posts_distinct_user_feed adds that predicate, enabling
--    an index scan with no sort step when a LIMIT is present. Without LIMIT the
--    planner correctly prefers a seq scan at 17k rows (50% selectivity); the
--    index becomes beneficial when the query is limited (e.g., top-N per user).
--
-- 3. user_entitlements 65.6% dead tuple bloat — VACUUM needed before index
--    work so new index is built on clean pages.
--
-- 4. Performers correlated subquery — idx_bookings_performer already covers
--    (performer_id) but does not filter by status='completed'. Adding a partial
--    index on (performer_id) WHERE status='completed' avoids the per-row seq
--    scan that currently touches all 72 booking rows for every performer.
--    (At current scale this is fast; at 10k+ bookings it will be critical.)
--
-- 5. user_follows idx_user_follows_follower already exists and is used — the
--    follower CTE is NOT the source of the slowness; stale stats are.
--
-- 6. user profile fetch (users by id=PK) already uses the PK index in 0.26ms.
--    The reported 1.5-1.7s was planning time with stale catalog stats, not
--    execution time. ANALYZE fixes this without any new index.
--
-- All CREATE INDEX statements use CONCURRENTLY to avoid locking production.
-- VACUUM/ANALYZE run first so indexes are built against clean, accurate pages.
-- ============================================================================

-- ============================================================================
-- STEP 1: VACUUM + ANALYZE stale tables
-- VACUUM reclaims dead tuple space; ANALYZE refreshes planner statistics.
-- Run sequentially (not in a transaction — VACUUM cannot run inside one).
-- ============================================================================

VACUUM (ANALYZE) user_entitlements;
VACUUM (ANALYZE) social_posts;
VACUUM (ANALYZE) user_follows;
VACUUM (ANALYZE) blocked_users;
VACUUM (ANALYZE) performers;
VACUUM (ANALYZE) bookings;
VACUUM (ANALYZE) users;

-- ============================================================================
-- STEP 2: Covering index for DISTINCT ON (sp.user_id) query
--
-- Query pattern:
--   SELECT DISTINCT ON (sp.user_id) ... FROM social_posts sp
--   WHERE sp.is_deleted = false AND sp.reply_to_id IS NULL
--   ORDER BY sp.user_id, sp.created_at DESC
--
-- Existing idx_social_posts_user_created = (user_id, created_at DESC) WHERE
-- is_deleted=false — but it lacks the reply_to_id IS NULL predicate, so
-- Postgres can't use it for DISTINCT ON and falls back to a seq scan + 2MB
-- quicksort over all ~9k visible rows.
--
-- This partial index adds reply_to_id IS NULL to the predicate. With this index
-- Postgres can satisfy the DISTINCT ON via an index scan in user_id order with
-- no sort step at all (each user_id group is already sorted by created_at DESC).
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_posts_distinct_user_feed
  ON social_posts (user_id, created_at DESC)
  WHERE is_deleted = false AND reply_to_id IS NULL;

-- ============================================================================
-- STEP 3: Partial index on bookings for completed status per performer
--
-- Query pattern:
--   SELECT COUNT(*) FROM bookings WHERE performer_id = p.id AND status = 'completed'
--   (correlated subquery inside a performers scan)
--
-- Existing idx_bookings_performer covers (performer_id) but is not filtered,
-- so every probe reads all booking statuses and filters. The partial index
-- reduces this to only completed rows. At current row counts (72 live rows)
-- the planner uses a seq scan — at >10k bookings this index will be essential.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_performer_completed
  ON bookings (performer_id)
  WHERE status = 'completed';

-- ============================================================================
-- STEP 4: Partial covering index for user_entitlements active check
--
-- Query pattern:
--   SELECT 1 FROM user_entitlements
--   WHERE user_id=$1 AND add_on_id=$2
--     AND (creator_id=$3 OR $3 IS NULL)
--     AND is_consumed=false
--     AND (expires_at > NOW() OR expires_at IS NULL)
--
-- Existing idx_user_entitlements_active_scope = (user_id, add_on_id, creator_id)
-- WHERE is_consumed=false — this already handles the is_consumed filter.
-- However the expires_at filter is applied as a heap-fetch predicate, not
-- index-side. Given 65.6% dead tuple bloat (now cleared by VACUUM above) and
-- stale stats, the planner was choosing a seq scan over the partial index.
-- Post-ANALYZE the existing index will be used correctly. No new index needed
-- for this query — the ANALYZE in step 1 is the fix.
-- (Documented here to confirm this was evaluated, not missed.)

-- ============================================================================
-- STEP 5: Index for social_posts filtered by creator_id (profile wall variant)
--
-- Query pattern:
--   SELECT ... FROM social_posts sp
--   WHERE sp.is_deleted=false AND sp.reply_to_id IS NULL AND sp.user_id=$1
--   ORDER BY sp.id DESC LIMIT 20
--
-- idx_social_posts_profile_wall = (user_id, id DESC) WHERE is_deleted=false
-- AND reply_to_id IS NULL — this already covers this exact query. No new
-- index needed. (Confirmed via EXPLAIN — uses this index in 0.6ms.)

-- ============================================================================
-- STEP 6: Autovacuum tuning for high-churn tables
--
-- user_entitlements had 65.6% dead tuple ratio and autovacuum had NEVER run.
-- True live count: 23,112 rows; default trigger: 50 + 0.2 * 23112 = ~4,672
-- dead tuples. At only ~355 dead tuples autovacuum would not trigger at default
-- settings — which means the table stays bloated after bursts of updates.
-- Tighten the per-table threshold to 5% scale factor + 10-row minimum so small
-- high-churn tables vacuum promptly and statistics stay fresh.
-- ============================================================================

ALTER TABLE user_entitlements SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 10,
  autovacuum_analyze_threshold = 10
);

ALTER TABLE social_posts SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_threshold = 20
);

ALTER TABLE user_follows SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_threshold = 20
);

-- ============================================================================
-- DOWN migration (idempotent)
-- ============================================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_social_posts_distinct_user_feed;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_bookings_performer_completed;
-- ALTER TABLE user_entitlements RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor, autovacuum_vacuum_threshold, autovacuum_analyze_threshold);
-- ALTER TABLE social_posts RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor, autovacuum_vacuum_threshold, autovacuum_analyze_threshold);
-- ALTER TABLE user_follows RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor, autovacuum_vacuum_threshold, autovacuum_analyze_threshold);
