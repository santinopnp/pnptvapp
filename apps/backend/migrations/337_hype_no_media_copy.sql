-- 337_hype_no_media_copy.sql
--
-- Root cause fix for the "hype steals content" bug: community_hype posts
-- used to duplicate media_url/media_type/video_thumbnail_url from the
-- original onto the hyper's row. That meant the media appeared as the
-- hyper's own content on their profile, survived deletion by the original
-- author, and leaked past paywalls if the original later went exclusive.
--
-- Going forward, hype posts store ONLY a metadata pointer. Feed queries
-- hydrate original_* fields at read time via sanitizePostRows() in
-- services/socialPostService.js. This migration cleans out the stale
-- duplicated media on existing hype rows.
--
-- Safe to run multiple times (idempotent — a nulled row stays nulled).

UPDATE social_posts
   SET media_url = NULL,
       media_type = NULL,
       video_thumbnail_url = NULL
 WHERE (metadata->>'kind') = 'community_hype'
   AND (media_url IS NOT NULL OR media_type IS NOT NULL OR video_thumbnail_url IS NOT NULL);
