'use strict';

const { query } = require('../config/postgres');

/**
 * Discover Service
 * Tag-based + full-text discovery across members, creators, channels, videos, and hangouts.
 */

/**
 * Returns the tag taxonomy grouped by group_name, sorted by sort_order.
 * Shape: { [group_name]: [{ name, emoji }] }
 */
async function getTagTaxonomy() {
  const res = await query(
    `SELECT name, emoji, group_name
       FROM tag_taxonomy
      WHERE is_active = TRUE
      ORDER BY group_name, sort_order`
  );

  const groups = {};
  for (const row of res.rows) {
    if (!groups[row.group_name]) groups[row.group_name] = [];
    groups[row.group_name].push({ name: row.name, emoji: row.emoji });
  }
  return groups;
}

/**
 * Discover entities by tags and/or free-text query.
 *
 * @param {string[]} tags      - Tag names to match (OR logic via && operator)
 * @param {string}   textQuery - Optional ILIKE search string
 * @param {string}   entity    - 'all' | 'members' | 'creators' | 'channels' | 'videos' | 'hangouts'
 * @param {number}   page      - 1-based page number
 * @param {number}   limit     - Results per entity (max 24)
 * @returns {object} Keys matching requested entities, each an array of rows
 */
async function discoverByTags(tags = [], textQuery = '', entity = 'all', page = 1, limit = 12, viewerId = null, viewerGeoTags = []) {
  const hasTags = Array.isArray(tags) && tags.length > 0;
  const hasText = typeof textQuery === 'string' && textQuery.trim().length > 0;

  // Nothing to search — return empty result sets for requested entities
  if (!hasTags && !hasText) {
    return buildEmptyResult(entity);
  }

  const offset = (page - 1) * limit;
  const likePattern = hasText ? `%${textQuery.replace(/[%_\\]/g, '\\$&')}%` : null;
  const geoTags = Array.isArray(viewerGeoTags) ? viewerGeoTags : [];

  const queries = {};

  const shouldQuery = (name) => entity === 'all' || entity === name;

  // --- members ---
  if (shouldQuery('members')) {
    queries.members = queryMembers(hasTags, tags, hasText, likePattern, limit, offset, geoTags);
  }

  // --- creators ---
  if (shouldQuery('creators')) {
    queries.creators = queryCreators(hasTags, tags, hasText, likePattern, limit, offset, geoTags);
  }

  // --- channels ---
  if (shouldQuery('channels')) {
    queries.channels = queryChannels(hasTags, tags, hasText, likePattern, limit, offset, geoTags);
  }

  // --- videos ---
  if (shouldQuery('videos')) {
    queries.videos = queryVideos(hasTags, tags, hasText, likePattern, limit, offset);
  }

  // --- hangouts ---
  if (shouldQuery('hangouts')) {
    queries.hangouts = queryHangouts(hasTags, tags, hasText, likePattern, limit, offset, viewerId, geoTags);
  }

  // Execute all sub-queries in parallel
  const keys = Object.keys(queries);
  const results = await Promise.all(keys.map((k) => queries[k]));

  const output = {};
  keys.forEach((k, i) => {
    output[k] = results[i].rows;
  });

  return output;
}

// ---------------------------------------------------------------------------
// Sub-query builders — each returns a pg query promise
// ---------------------------------------------------------------------------

function queryMembers(hasTags, tags, hasText, likePattern, limit, offset, geoTags = []) {
  const conditions = ['u.is_deleted = FALSE'];
  const params = [];
  let idx = 1;

  if (hasTags) {
    params.push(tags);
    conditions.push(`u.interests && $${idx++}::text[]`);
  }

  if (hasText) {
    params.push(likePattern, likePattern, likePattern);
    conditions.push(
      `(u.username ILIKE $${idx} OR u.first_name ILIKE $${idx + 1} OR u.last_name ILIKE $${idx + 2})`
    );
    idx += 3;
  }

  // Region privacy — hide users who opted out of being seen from viewer's region.
  params.push(geoTags);
  conditions.push(`NOT (COALESCE(u.hide_from_regions, '{}') && $${idx++}::text[])`);

  params.push(limit, offset);

  return query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.photo_file_id, u.pnptv_id
       FROM users u
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.username
      LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
}

function queryCreators(hasTags, tags, hasText, likePattern, limit, offset, geoTags = []) {
  const conditions = ["u.role IN ('creator', 'model') AND u.is_deleted = FALSE"];
  const params = [];
  let idx = 1;

  if (hasTags) {
    params.push(tags);
    conditions.push(`cc.tags && $${idx++}::text[]`);
  }

  if (hasText) {
    params.push(likePattern, likePattern, likePattern);
    conditions.push(
      `(u.username ILIKE $${idx} OR u.first_name ILIKE $${idx + 1} OR u.last_name ILIKE $${idx + 2})`
    );
    idx += 3;
  }

  params.push(geoTags);
  conditions.push(`NOT (COALESCE(u.hide_from_regions, '{}') && $${idx++}::text[])`);

  params.push(limit, offset);

  return query(
    `SELECT DISTINCT ON (u.id)
            u.id, u.id AS user_id,
            COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username) AS display_name,
            u.username, u.photo_file_id AS photo_url,
            NULL AS category, FALSE AS verified
       FROM users u
       LEFT JOIN creator_channels cc ON cc.creator_id = u.id::text
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.id, u.username
      LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
}

function queryChannels(hasTags, tags, hasText, likePattern, limit, offset, geoTags = []) {
  const conditions = ['cc.is_active = TRUE'];
  const params = [];
  let idx = 1;

  if (hasTags) {
    params.push(tags);
    conditions.push(`cc.tags && $${idx++}::text[]`);
  }

  if (hasText) {
    params.push(likePattern, likePattern);
    conditions.push(
      `(cc.name ILIKE $${idx} OR cc.description ILIKE $${idx + 1})`
    );
    idx += 2;
  }

  // Region privacy — hide channels whose owning creator opted out of viewer's region.
  params.push(geoTags);
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM users uch WHERE uch.id::text = cc.creator_id
      AND COALESCE(uch.hide_from_regions, '{}') && $${idx++}::text[]
  )`);

  params.push(limit, offset);

  return query(
    `SELECT cc.id, cc.name, cc.description, cc.cover_image_url,
            cc.tags, cc.access_type, cc.price_usd, cc.creator_id
       FROM creator_channels cc
      WHERE ${conditions.join(' AND ')}
      ORDER BY cc.name
      LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
}

function queryVideos(hasTags, tags, hasText, likePattern, limit, offset) {
  const conditions = ["cv.status = 'ready'"];
  const params = [];
  let idx = 1;

  if (hasTags) {
    params.push(tags);
    conditions.push(`cv.tags && $${idx++}::text[]`);
  }

  if (hasText) {
    params.push(likePattern);
    conditions.push(`cv.title ILIKE $${idx++}`);
  }

  params.push(limit, offset);

  return query(
    `SELECT cv.id, cv.title, cv.thumbnail_url, cv.tags,
            cv.channel_id, cc.name AS channel_name
       FROM channel_videos cv
       JOIN creator_channels cc ON cc.id = cv.channel_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cv.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
}

function queryHangouts(hasTags, tags, hasText, likePattern, limit, offset, viewerId = null, geoTags = []) {
  // NOTE: dropped the blanket is_public=TRUE filter — creators' *private* hangouts
  // (is_public=false, no channel_id) are now gated on active creator subscription
  // per the unified access rule, not silently omitted. This keeps them
  // "discoverable" to actual subscribers on the general Discover surface.
  const conditions = ['hg.is_main = FALSE AND hg.is_wall_of_fame = FALSE AND hg.parent_group_id IS NULL'];
  const params = [];
  let idx = 1;

  if (hasTags) {
    params.push(tags);
    conditions.push(`hg.tags && $${idx++}::text[]`);
  }

  if (hasText) {
    params.push(likePattern, likePattern);
    conditions.push(
      `(hg.name ILIKE $${idx} OR hg.description ILIKE $${idx + 1})`
    );
    idx += 2;
  }

  // Access filter — same rule as hangoutGroupController.discoverGroups.
  // Unauth callers (viewerId null) only see system + community (public no-channel + free-channel).
  if (viewerId) {
    params.push(String(viewerId));
    const vIdx = idx++;
    conditions.push(`(
      hg.creator_id IS NULL OR hg.creator_id = ''
      OR hg.creator_id = $${vIdx}
      OR (hg.channel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM creator_channels cc WHERE cc.id = hg.channel_id AND (
          cc.access_type = 'free'
          OR (cc.access_type = 'prime' AND EXISTS (
            SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id = $${vIdx} AND ue.add_on_id = 'prime'
              AND (ue.expires_at IS NULL OR ue.expires_at > NOW())
          ))
          OR (cc.access_type IN ('subscription','paid') AND EXISTS (
            SELECT 1 FROM creator_subscriptions cs
            WHERE cs.subscriber_id = $${vIdx} AND cs.creator_id = hg.creator_id
              AND cs.status = 'active'
              AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
          ))
        )
      ))
      OR (hg.channel_id IS NULL AND hg.is_public = true)
      OR (hg.channel_id IS NULL AND hg.is_public = false AND EXISTS (
        SELECT 1 FROM creator_subscriptions cs
        WHERE cs.subscriber_id = $${vIdx} AND cs.creator_id = hg.creator_id
          AND cs.status = 'active'
          AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
      ))
    )`);
  } else {
    // Anonymous: only system hangouts + community (public, no channel) + free channels.
    conditions.push(`(
      hg.creator_id IS NULL OR hg.creator_id = ''
      OR (hg.channel_id IS NULL AND hg.is_public = true)
      OR (hg.channel_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM creator_channels cc WHERE cc.id = hg.channel_id AND cc.access_type = 'free'
      ))
    )`);
  }

  // Region privacy — hide hangouts whose owning creator opted out of viewer's region.
  // System hangouts (creator_id NULL/'') skip the check.
  params.push(geoTags);
  conditions.push(`(
    hg.creator_id IS NULL OR hg.creator_id = ''
    OR NOT EXISTS (
      SELECT 1 FROM users uhg WHERE uhg.id::text = hg.creator_id
        AND COALESCE(uhg.hide_from_regions, '{}') && $${idx++}::text[]
    )
  )`);

  params.push(limit, offset);

  return query(
    `SELECT hg.id, hg.name, hg.avatar_url, hg.tags, hg.description
       FROM hangout_groups hg
      WHERE ${conditions.join(' AND ')}
      ORDER BY hg.name
      LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyResult(entity) {
  const all = ['members', 'creators', 'channels', 'videos', 'hangouts'];
  const keys = entity === 'all' ? all : all.includes(entity) ? [entity] : all;
  return Object.fromEntries(keys.map((k) => [k, []]));
}

// ---------------------------------------------------------------------------
// For-You Recommendations
// ---------------------------------------------------------------------------

const { getRedis, cache } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Build the cache key for for-you recommendations.
 * The key is stored WITHOUT the ioredis keyPrefix — the prefix is applied
 * automatically by the cache helper (same pattern as entitlementAccessService).
 *
 * @param {string} userId
 * @param {string} context  home|live|discover|creator
 * @returns {string}
 */
function forYouCacheKey(userId, context) {
  return `pnpapp:for-you:${userId}:${context}`;
}

/**
 * Invalidate all for-you cache entries for a given user across every context.
 * Fire-and-forget safe — errors are swallowed.
 *
 * @param {string} userId
 */
async function invalidateForYouCache(userId) {
  try {
    await cache.delPattern(`pnpapp:for-you:${userId}:*`);
  } catch (err) {
    logger.warn('[for-you] cache invalidation error', { userId, err: err.message });
  }
}

/**
 * Get for-you recommendations for the requesting user.
 *
 * @param {string}  userId          - Requesting user's ID
 * @param {string}  context         - 'home' | 'live' | 'discover' | 'creator'
 * @param {string|null} creatorId   - Optional: focus on a specific creator (context=creator)
 * @param {number}  limit           - Max creators/follows per bucket (default 5)
 * @returns {Promise<{suggestedCreators, suggestedFollows, contextHints}>}
 */
async function getForYouRecommendations(userId, context = 'home', creatorId = null, limit = 5) {
  const cacheKey = forYouCacheKey(userId, context);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const clampedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 5), 20);

  // ── Viewer's own location (for nearby scoring) ────────────────────────────
  let viewerLat = null;
  let viewerLng = null;
  try {
    const locRes = await query(
      `SELECT latitude, longitude FROM user_locations WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (locRes.rows.length) {
      viewerLat = parseFloat(locRes.rows[0].latitude);
      viewerLng = parseFloat(locRes.rows[0].longitude);
    }
  } catch (_) { /* location unavailable — proximity scores will be 0 */ }

  // ── Run all queries in parallel ───────────────────────────────────────────
  const [
    creatorsResult,
    followsResult,
    primeSoonResult,
    unreadDmResult,
    newFollowersResult,
  ] = await Promise.allSettled([
    _fetchScoredCreators(userId, viewerLat, viewerLng, clampedLimit),
    _fetchScoredFollows(userId, viewerLat, viewerLng, clampedLimit),
    _checkPrimeExpiring(userId),
    _countUnreadDms(userId),
    _countNewFollowers(userId),
  ]);

  const suggestedCreators = creatorsResult.status === 'fulfilled' ? creatorsResult.value : [];
  const suggestedFollows  = followsResult.status  === 'fulfilled' ? followsResult.value  : [];

  // ── Context hints ─────────────────────────────────────────────────────────
  const contextHints = [];

  if (primeSoonResult.status === 'fulfilled' && primeSoonResult.value) {
    contextHints.push(primeSoonResult.value);
  }
  if (unreadDmResult.status === 'fulfilled' && unreadDmResult.value) {
    contextHints.push(unreadDmResult.value);
  }
  if (newFollowersResult.status === 'fulfilled' && newFollowersResult.value) {
    contextHints.push(newFollowersResult.value);
  }
  // Sort hints by priority descending
  contextHints.sort((a, b) => b.priority - a.priority);

  const result = { suggestedCreators, suggestedFollows, contextHints };

  // Cache for 15 minutes (900s)
  await cache.set(cacheKey, result, 900);

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers — not exported
// ---------------------------------------------------------------------------

/**
 * Weighted-score creator pool:
 *   pool = active creators the user does NOT already subscribe to and has NOT blocked
 *
 * Score per creator:
 *   +40  nearby (< 50mi ≈ 80.5km via Haversine on user_locations)
 *   +30  per mutual follower (cap 3 → max +90)  [NOTE: creators don't accept follows;
 *         mutual here means "users who follow the viewer also subscribe to this creator"]
 *   +25  currently live (live_streams.status='live')
 *   +20  has active PRIME entitlement ('prime' add_on_id)
 *   +15  posted in last 24h (social_posts)
 *   +10  has active PNPtv! PRIME channel (creator_channels id=209)
 */
async function _fetchScoredCreators(userId, viewerLat, viewerLng, limit) {
  // 50mi ≈ 80.467km
  const NEARBY_KM = 80.467;

  // Build nearby subquery only if viewer has location
  const hasLocation = viewerLat !== null && viewerLng !== null;

  // Haversine distance expression (km) — uses user_locations for creators
  // Only evaluated in the CTE when viewer has lat/lng
  const haversineExpr = hasLocation
    ? `(6371 * acos(LEAST(1, cos(radians(${viewerLat})) * cos(radians(ul.latitude))
         * cos(radians(ul.longitude) - radians(${viewerLng}))
         + sin(radians(${viewerLat})) * sin(radians(ul.latitude)))))`
    : 'NULL';

  // "Mutual" for creators: viewers who already follow the requesting user AND
  // have an active subscription to this creator.
  // Because creators don't accept user_follows we use creator_subscriptions.
  const sql = `
    WITH
    -- users who follow the requesting viewer
    viewer_followers AS (
      SELECT following_id AS follower_of_viewer
        FROM user_follows
       WHERE follower_id = $1
    ),
    -- active subscriptions the requesting viewer already has (exclude these creators)
    viewer_subs AS (
      SELECT creator_id
        FROM creator_subscriptions
       WHERE subscriber_id = $1
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
    ),
    -- bidirectional block filter
    viewer_blocks AS (
      SELECT blocked_user_id AS blocked_id FROM blocked_users WHERE user_id = $1
      UNION
      SELECT user_id            AS blocked_id FROM blocked_users WHERE blocked_user_id = $1
    ),
    -- creator locations (only joined when viewer has location)
    creator_geo AS (
      SELECT ul.user_id,
             ${hasLocation ? haversineExpr : 'NULL::numeric'} AS distance_km
        FROM user_locations ul
       WHERE ${hasLocation ? '1=1' : '1=0'}
    ),
    -- which creators are live right now
    live_now AS (
      SELECT DISTINCT host_id
        FROM live_streams
       WHERE status = 'live'
    ),
    -- which creators have active PRIME entitlement
    prime_creators AS (
      SELECT DISTINCT user_id
        FROM user_entitlements
       WHERE add_on_id = 'prime'
         AND is_consumed = false
         AND (expires_at IS NULL OR expires_at > NOW())
    ),
    -- which creators posted in the last 24h
    recent_posters AS (
      SELECT DISTINCT user_id
        FROM social_posts
       WHERE created_at > NOW() - INTERVAL '24 hours'
         AND is_deleted = false
    ),
    -- which creators own or co-manage the PNPtv! PRIME channel (id=209).
    -- Both the creator_id AND every user in collaborators[] get the discovery boost —
    -- keeps co-founders (Lex + Santino) treated equally by the ranker.
    prime_channel_creators AS (
      SELECT DISTINCT creator_id
        FROM creator_channels
       WHERE id = 209
         AND is_active = true
      UNION
      SELECT DISTINCT unnest(collaborators) AS creator_id
        FROM creator_channels
       WHERE id = 209
         AND is_active = true
         AND collaborators IS NOT NULL
    ),
    -- mutual: people who follow the viewer AND subscribe to this creator
    mutual_counts AS (
      SELECT cs.creator_id,
             LEAST(COUNT(DISTINCT cs.subscriber_id), 3) AS mutual_cnt
        FROM creator_subscriptions cs
       WHERE cs.subscriber_id IN (SELECT follower_of_viewer FROM viewer_followers)
         AND cs.status = 'active'
         AND (cs.expires_at IS NULL OR cs.expires_at > NOW())
       GROUP BY cs.creator_id
    ),
    -- base creator pool
    creators AS (
      SELECT
        u.id                  AS user_id,
        u.username,
        u.first_name          AS display_name,
        CASE
          WHEN u.photo_file_id IS NULL THEN NULL
          WHEN u.photo_file_id LIKE 'http%' THEN u.photo_file_id
          WHEN u.photo_file_id LIKE '/%' THEN u.photo_file_id
          ELSE '/uploads/avatars/' || u.photo_file_id
        END                   AS avatar_url,
        u.creator_price_usd   AS price,
        COALESCE((ln.host_id IS NOT NULL), false)             AS is_live,
        COALESCE((pc.user_id IS NOT NULL), false)             AS is_prime,
        COALESCE(cg.distance_km, NULL)                        AS distance_km,
        COALESCE(mc.mutual_cnt, 0)                            AS mutual_cnt,
        COALESCE((rp.user_id IS NOT NULL), false)             AS recent_post,
        COALESCE((pcc.creator_id IS NOT NULL), false)         AS has_prime_channel
      FROM users u
      LEFT JOIN creator_geo    cg  ON cg.user_id    = u.id
      LEFT JOIN live_now       ln  ON ln.host_id     = u.id
      LEFT JOIN prime_creators pc  ON pc.user_id     = u.id
      LEFT JOIN recent_posters rp  ON rp.user_id     = u.id
      LEFT JOIN prime_channel_creators pcc ON pcc.creator_id = u.id
      LEFT JOIN mutual_counts  mc  ON mc.creator_id  = u.id
      WHERE u.creator_status = 'active'
        AND u.is_active = true
        AND u.tier != 'banned'
        AND u.id != $1
        AND u.id NOT IN (SELECT creator_id FROM viewer_subs)
        AND u.id NOT IN (SELECT blocked_id FROM viewer_blocks)
    )
    SELECT
      user_id,
      username,
      display_name,
      avatar_url,
      price,
      is_live,
      is_prime,
      distance_km,
      mutual_cnt,
      -- weighted score
      (
        CASE WHEN distance_km IS NOT NULL AND distance_km < ${NEARBY_KM} THEN 40 ELSE 0 END
        + (mutual_cnt * 30)
        + CASE WHEN is_live    THEN 25 ELSE 0 END
        + CASE WHEN avatar_url IS NOT NULL THEN 25 ELSE 0 END
        + CASE WHEN is_prime   THEN 20 ELSE 0 END
        + CASE WHEN recent_post THEN 15 ELSE 0 END
        + CASE WHEN has_prime_channel THEN 10 ELSE 0 END
      ) AS score
    FROM creators
    ORDER BY score DESC, user_id
    LIMIT $2
  `;

  const res = await query(sql, [userId, limit]);

  return res.rows.map((r) => {
    const reasons = [];
    const codes = [];

    if (r.distance_km !== null && parseFloat(r.distance_km) < NEARBY_KM) {
      reasons.push('Nearby');
      codes.push('nearby');
    }
    const mutuals = parseInt(r.mutual_cnt, 10) || 0;
    if (mutuals > 0) {
      reasons.push(`${mutuals} mutual follower${mutuals > 1 ? 's' : ''}`);
      codes.push('mutual');
    }
    if (r.is_live) {
      reasons.push('Live now');
      codes.push('live');
    }
    if (r.is_prime) {
      reasons.push('PRIME creator');
      codes.push('prime');
    }

    return {
      userId:      String(r.user_id),
      username:    r.username || null,
      displayName: r.display_name || '',
      avatarUrl:   r.avatar_url || null,
      price:       r.price != null ? String(parseFloat(r.price).toFixed(2)) : null,
      isLive:      Boolean(r.is_live),
      isPrime:     Boolean(r.is_prime),
      reason:      reasons.join(' · ') || 'Popular creator',
      reasonCode:  codes.join('+') || 'popular',
    };
  });
}

/**
 * Weighted-score member pool:
 *   pool = non-creator users the requesting user does NOT already follow and has NOT blocked
 *
 * Score per user:
 *   +30  per mutual follower (cap 5 → max +150)
 *   +25  online right now (presence:online:{id} Redis key)
 *   +20  nearby (< 50mi)
 *   +15  recent DM or shared hangout (last 7d)
 *   +10  active poster (social_posts last 7d)
 */
async function _fetchScoredFollows(userId, viewerLat, viewerLng, limit) {
  const NEARBY_KM = 80.467;
  const hasLocation = viewerLat !== null && viewerLng !== null;

  const sql = `
    WITH
    viewer_following AS (
      SELECT following_id FROM user_follows WHERE follower_id = $1
    ),
    viewer_blocks AS (
      SELECT blocked_user_id AS blocked_id FROM blocked_users WHERE user_id = $1
      UNION
      SELECT user_id            AS blocked_id FROM blocked_users WHERE blocked_user_id = $1
    ),
    -- mutual followers: users who follow the viewer AND are followed by the candidate
    mutual_counts AS (
      SELECT uf2.follower_id AS candidate_id,
             LEAST(COUNT(*), 5) AS mutual_cnt
        FROM user_follows uf1
        JOIN user_follows uf2 ON uf1.following_id = uf2.follower_id
       WHERE uf1.follower_id = $1
         AND uf2.follower_id != $1
       GROUP BY uf2.follower_id
    ),
    -- recent DM contact or shared hangout group (last 7 days)
    recent_contact AS (
      SELECT DISTINCT
        CASE WHEN dm.sender_id = $1 THEN dm.recipient_id ELSE dm.sender_id END AS contact_id
        FROM direct_messages dm
       WHERE (dm.sender_id = $1 OR dm.recipient_id = $1)
         AND dm.created_at > NOW() - INTERVAL '7 days'
         AND dm.is_deleted = false
      UNION
      SELECT DISTINCT hgm2.user_id AS contact_id
        FROM hangout_group_members hgm1
        JOIN hangout_group_members hgm2
          ON hgm1.group_id = hgm2.group_id
         AND hgm2.user_id != $1
       WHERE hgm1.user_id = $1
         AND (hgm2.last_read_at IS NULL OR hgm2.last_read_at > NOW() - INTERVAL '7 days')
    ),
    -- active posters last 7 days
    recent_posters AS (
      SELECT DISTINCT user_id
        FROM social_posts
       WHERE created_at > NOW() - INTERVAL '7 days'
         AND is_deleted = false
    ),
    candidate_geo AS (
      SELECT ul.user_id,
             ${hasLocation ? `(6371 * acos(LEAST(1, cos(radians(${viewerLat})) * cos(radians(ul.latitude))
               * cos(radians(ul.longitude) - radians(${viewerLng}))
               + sin(radians(${viewerLat})) * sin(radians(ul.latitude)))))` : 'NULL::numeric'} AS distance_km
        FROM user_locations ul
       WHERE ${hasLocation ? '1=1' : '1=0'}
    ),
    candidates AS (
      SELECT
        u.id                    AS user_id,
        u.username,
        u.first_name            AS display_name,
        CASE
          WHEN u.photo_file_id IS NULL THEN NULL
          WHEN u.photo_file_id LIKE 'http%' THEN u.photo_file_id
          WHEN u.photo_file_id LIKE '/%' THEN u.photo_file_id
          ELSE '/uploads/avatars/' || u.photo_file_id
        END                     AS avatar_url,
        COALESCE(cg.distance_km, NULL)               AS distance_km,
        COALESCE(mc.mutual_cnt, 0)                   AS mutual_cnt,
        COALESCE((rc.contact_id IS NOT NULL), false)  AS recent_contact,
        COALESCE((rp.user_id   IS NOT NULL), false)  AS recent_post
      FROM users u
      LEFT JOIN candidate_geo cg ON cg.user_id = u.id
      LEFT JOIN mutual_counts mc ON mc.candidate_id = u.id
      LEFT JOIN recent_contact rc ON rc.contact_id = u.id
      LEFT JOIN recent_posters rp ON rp.user_id = u.id
      WHERE u.creator_status IS DISTINCT FROM 'active'
        AND u.is_active = true
        AND u.tier != 'banned'
        AND u.id != $1
        AND u.id NOT IN (SELECT following_id FROM viewer_following)
        AND u.id NOT IN (SELECT blocked_id FROM viewer_blocks)
    )
    SELECT
      user_id,
      username,
      display_name,
      avatar_url,
      distance_km,
      mutual_cnt,
      recent_contact,
      recent_post,
      -- score without online (online requires Redis lookup after query)
      (
        (mutual_cnt * 30)
        + CASE WHEN avatar_url IS NOT NULL THEN 25 ELSE 0 END
        + CASE WHEN distance_km IS NOT NULL AND distance_km < ${NEARBY_KM} THEN 20 ELSE 0 END
        + CASE WHEN recent_contact THEN 15 ELSE 0 END
        + CASE WHEN recent_post THEN 10 ELSE 0 END
      ) AS base_score
    FROM candidates
    ORDER BY base_score DESC, user_id
    LIMIT $2
  `;

  const res = await query(sql, [userId, limit * 3]); // over-fetch to re-rank with online status
  if (!res.rows.length) return [];

  // Check Redis online presence for the candidate batch
  const redis = getRedis();
  const onlineSet = new Set();
  await Promise.all(
    res.rows.map(async (r) => {
      try {
        const flag = await redis.get(`presence:online:${r.user_id}`);
        if (flag) onlineSet.add(String(r.user_id));
      } catch (_) { /* ignore */ }
    })
  );

  // Re-score with online bonus and trim to limit
  const scored = res.rows.map((r) => {
    const isOnline = onlineSet.has(String(r.user_id));
    const score = parseInt(r.base_score, 10) + (isOnline ? 25 : 0);
    return { ...r, isOnline, score };
  });
  scored.sort((a, b) => b.score - a.score || a.user_id.localeCompare(b.user_id));
  const top = scored.slice(0, limit);

  return top.map((r) => {
    const reasons = [];
    const codes = [];

    const mutuals = parseInt(r.mutual_cnt, 10) || 0;
    if (mutuals > 0) {
      reasons.push(`${mutuals} mutual follower${mutuals > 1 ? 's' : ''}`);
      codes.push('mutual');
    }
    if (r.isOnline) { reasons.push('Online now'); codes.push('online'); }
    if (r.distance_km !== null && parseFloat(r.distance_km) < NEARBY_KM) {
      reasons.push('Nearby'); codes.push('nearby');
    }
    if (r.recent_contact) { reasons.push('Recent contact'); codes.push('recent_contact'); }

    return {
      userId:      String(r.user_id),
      username:    r.username || null,
      avatarUrl:   r.avatar_url || null,
      isOnline:    r.isOnline,
      reason:      reasons.join(' · ') || 'Active member',
      reasonCode:  codes.join('+') || 'active',
    };
  });
}

/**
 * Returns a contextHint if the viewer's PRIME entitlement expires in < 7 days.
 */
async function _checkPrimeExpiring(userId) {
  try {
    const res = await query(
      `SELECT expires_at
         FROM user_entitlements
        WHERE user_id = $1
          AND add_on_id = 'prime'
          AND is_consumed = false
          AND is_lifetime = false
          AND expires_at IS NOT NULL
          AND expires_at > NOW()
          AND expires_at < NOW() + INTERVAL '7 days'
        ORDER BY expires_at ASC
        LIMIT 1`,
      [userId]
    );
    if (!res.rows.length) return null;
    const exp = new Date(res.rows[0].expires_at);
    const daysLeft = Math.ceil((exp - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      type:     'prime_expiring',
      text:     `Prime expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
      action:   '/subscribe',
      priority: 90,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Returns a contextHint if the viewer has unread DMs.
 */
async function _countUnreadDms(userId) {
  try {
    const res = await query(
      `SELECT
         COALESCE(SUM(
           CASE WHEN user_a = $1 THEN unread_for_a ELSE unread_for_b END
         ), 0) AS total_unread
         FROM dm_threads
        WHERE user_a = $1 OR user_b = $1`,
      [userId]
    );
    const total = parseInt(res.rows[0]?.total_unread || 0, 10);
    if (total <= 0) return null;
    return {
      type:     'unread_dms',
      text:     `${total} new message${total !== 1 ? 's' : ''}`,
      action:   '/messages',
      priority: 70,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Returns a contextHint if the viewer gained new followers in the last 24h.
 */
async function _countNewFollowers(userId) {
  try {
    const res = await query(
      `SELECT COUNT(*) AS cnt
         FROM user_follows
        WHERE following_id = $1
          AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    const cnt = parseInt(res.rows[0]?.cnt || 0, 10);
    if (cnt <= 0) return null;
    return {
      type:     'new_followers',
      text:     `${cnt} new follower${cnt !== 1 ? 's' : ''} today`,
      action:   '/profile',
      priority: 60,
    };
  } catch (_) {
    return null;
  }
}

module.exports = { getTagTaxonomy, discoverByTags, getForYouRecommendations, invalidateForYouCache };
