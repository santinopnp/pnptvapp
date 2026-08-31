'use strict';

/**
 * Crystal Creator premium services.
 *
 * Each Crystal Creator can offer a menu of high-tier services (private call,
 * custom content, priority DM, private Main Stage, BTS subscription). Each
 * service has a min_audience gate — the viewer's audience is computed at
 * request time and the response is filtered so a public viewer never sees
 * fam-only services.
 *
 * Audience hierarchy (least → most exclusive):
 *   public (0) → crystal (1) → whale_pig (2) → fam (3)
 *
 * `crystal` audience includes anyone who's a Crystal Creator themselves OR
 * has any active Crystal-tier signal. For phase 1 that's whale_pig + fam +
 * own crystal pass. Subscribers to a Crystal Creator will be added in a
 * follow-up when their sub state is easier to query.
 */

const { getPool } = require('../config/postgres');
const logger = require('../utils/logger');

const AUDIENCE_RANK = Object.freeze({ public: 0, crystal: 1, whale_pig: 2, fam: 3 });

function rank(a) {
  return AUDIENCE_RANK[a] ?? 0;
}

/**
 * Compute the viewer's audience tier. Returns 'public' for anonymous or
 * unknown users. Highest tier wins.
 */
async function getViewerAudience(userId) {
  if (!userId) return 'public';
  const { rows } = await getPool().query(
    `SELECT is_pnptv_fam, is_whale_pig,
            (crystal_creator_active_until IS NOT NULL
             AND (crystal_creator_active_until = 'infinity'::timestamptz
                  OR crystal_creator_active_until > NOW())) AS is_crystal
       FROM users WHERE id = $1 LIMIT 1`,
    [String(userId)]
  );
  const r = rows[0];
  if (!r) return 'public';
  if (r.is_pnptv_fam) return 'fam';
  if (r.is_whale_pig) return 'whale_pig';
  if (r.is_crystal)   return 'crystal';
  return 'public';
}

/**
 * List services for one creator, filtered by viewer's audience.
 * Non-crystal creators return an empty array (only Crystal Creators
 * offer services in phase 1).
 */
async function listServicesForCreator(creatorId, viewerAudience = 'public') {
  const viewerRank = rank(viewerAudience);
  const { rows } = await getPool().query(
    `SELECT s.id, s.service_type, s.price_cents, s.duration_minutes, s.fulfillment_days,
            s.description_en, s.description_es, s.min_audience
       FROM creator_services s
       JOIN users u ON u.id = s.creator_user_id
      WHERE s.creator_user_id = $1
        AND s.is_active = TRUE
        AND u.crystal_creator_active_until IS NOT NULL
        AND (u.crystal_creator_active_until = 'infinity'::timestamptz
             OR u.crystal_creator_active_until > NOW())
      ORDER BY s.price_cents ASC`,
    [String(creatorId)]
  );

  return rows.map((r) => {
    const requiredRank = rank(r.min_audience);
    return {
      id: r.id,
      serviceType: r.service_type,
      priceCents: r.price_cents,
      durationMinutes: r.duration_minutes,
      fulfillmentDays: r.fulfillment_days,
      descriptionEn: r.description_en,
      descriptionEs: r.description_es,
      minAudience: r.min_audience,
      // Viewer can BOOK only if their audience rank meets or exceeds the
      // service's minimum. Lower-audience viewers still SEE the service
      // (as a locked teaser) but can't purchase — the lock label tells
      // them what tier is required.
      canBook: viewerRank >= requiredRank,
    };
  });
}

/**
 * Public showcase for the pinned "Crystal Creators" row. Returns every
 * currently active Crystal Creator with their public display fields and
 * a service count preview (locked + unlocked totals for the viewer).
 */
async function getShowcase(viewerAudience = 'public') {
  const viewerRank = rank(viewerAudience);
  const { rows } = await getPool().query(
    `SELECT u.id, u.username, u.first_name, u.photo_file_id AS photo_url,
            u.bio, u.creator_price_usd, u.creator_verified,
            u.crystal_creator_active_until,
            (SELECT COUNT(*) FROM creator_services s
              WHERE s.creator_user_id = u.id AND s.is_active = TRUE)::int AS total_services
       FROM users u
      WHERE u.crystal_creator_active_until IS NOT NULL
        AND (u.crystal_creator_active_until = 'infinity'::timestamptz
             OR u.crystal_creator_active_until > NOW())
        AND u.creator_status = 'active'
        AND u.is_active = TRUE
      ORDER BY u.crystal_creator_active_until DESC, LOWER(COALESCE(u.username, u.first_name, u.id))`
  );

  // Compute unlocked service count per creator for the viewer.
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const { rows: cnt } = await getPool().query(
        `SELECT COUNT(*)::int AS unlocked
           FROM creator_services
          WHERE creator_user_id = $1
            AND is_active = TRUE
            AND CASE min_audience
                  WHEN 'public'    THEN 0
                  WHEN 'crystal'   THEN 1
                  WHEN 'whale_pig' THEN 2
                  WHEN 'fam'       THEN 3
                END <= $2`,
        [String(r.id), viewerRank]
      );
      return {
        id: String(r.id),
        username: r.username || null,
        firstName: r.first_name || null,
        photoUrl: r.photo_url || null,
        bio: r.bio || null,
        creatorPriceUsd: r.creator_price_usd ? parseFloat(r.creator_price_usd) : null,
        creatorVerified: !!r.creator_verified,
        totalServices: r.total_services,
        unlockedServices: cnt[0]?.unlocked || 0,
      };
    })
  );

  return enriched;
}

module.exports = {
  getViewerAudience,
  listServicesForCreator,
  getShowcase,
  AUDIENCE_RANK,
};
