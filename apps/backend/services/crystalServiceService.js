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

// Internal (DB) audience keys stay 'whale_pig' — that column has data seeded
// with that value. Client-facing responses translate 'whale_pig' → 'inner_circle'
// so the internal Whale Pig label never leaks (see feedback_whale_pig_internal_only.md).
const AUDIENCE_RANK = Object.freeze({ public: 0, crystal: 1, whale_pig: 2, fam: 3 });
const AUDIENCE_TO_CLIENT = Object.freeze({
  public: 'public', crystal: 'crystal', whale_pig: 'inner_circle', fam: 'fam',
});

function rank(a) {
  return AUDIENCE_RANK[a] ?? 0;
}

function clientAudience(a) {
  return AUDIENCE_TO_CLIENT[a] || 'public';
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
      minAudience: clientAudience(r.min_audience),
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

/**
 * Look up a single service + verify the viewer's audience is high enough to
 * book it. Called by the booking endpoint before initiating a checkout.
 *
 * @returns {Promise<{service:object, price_cents:number, gate:'ok'|'audience_too_low'|'not_found'|'creator_not_crystal'|'inactive'}>}
 */
async function loadServiceForBooking(serviceId, viewerAudience) {
  const { rows } = await getPool().query(
    `SELECT s.*, u.crystal_creator_active_until, u.username, u.first_name
       FROM creator_services s
       JOIN users u ON u.id = s.creator_user_id
      WHERE s.id = $1 LIMIT 1`,
    [String(serviceId)]
  );
  if (!rows[0]) return { gate: 'not_found' };
  const s = rows[0];
  if (!s.is_active) return { gate: 'inactive' };
  const u = s.crystal_creator_active_until;
  const isCrystalActive = u && (String(u) === 'infinity' || new Date(u) > new Date());
  if (!isCrystalActive) return { gate: 'creator_not_crystal' };
  if (rank(viewerAudience) < rank(s.min_audience)) return { gate: 'audience_too_low' };
  return {
    gate: 'ok',
    service: s,
    price_cents: Number(s.price_cents),
  };
}

/**
 * Record a booking row (idempotent by payment_ref) once a payment is
 * confirmed. Called by walletCheckoutService._fulfillCrystalService.
 *
 * For custom_content, sets expires_at = NOW() + fulfillment_days so the
 * cron can flag overdue deliveries.
 */
async function recordBooking({
  serviceId, creatorUserId, buyerUserId, serviceType, priceCents,
  paymentProvider, paymentRef, buyerNote = null, fulfillmentDays = null,
}) {
  const expiresAt = fulfillmentDays
    ? new Date(Date.now() + fulfillmentDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { rows } = await getPool().query(
    `INSERT INTO creator_service_bookings
       (service_id, creator_user_id, buyer_user_id, service_type, price_paid_cents,
        payment_provider, payment_ref, status, buyer_note, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'paid', $8, $9)
     ON CONFLICT (payment_ref) DO NOTHING
     RETURNING id, status, created_at`,
    [
      Number(serviceId), String(creatorUserId), String(buyerUserId), serviceType,
      priceCents, paymentProvider, paymentRef,
      buyerNote ? String(buyerNote).slice(0, 2000) : null,
      expiresAt,
    ]
  );
  if (rows[0]) {
    logger.info('[crystal-service] booking recorded', {
      bookingId: rows[0].id, serviceId, creatorUserId, buyerUserId, serviceType, priceCents,
    });
    return { bookingId: rows[0].id, alreadyApplied: false };
  }
  // ON CONFLICT hit — retried webhook / same intent; find the existing row.
  const { rows: existing } = await getPool().query(
    `SELECT id FROM creator_service_bookings WHERE payment_ref = $1 LIMIT 1`,
    [paymentRef]
  );
  return { bookingId: existing[0]?.id || null, alreadyApplied: true };
}

module.exports = {
  getViewerAudience,
  listServicesForCreator,
  getShowcase,
  loadServiceForBooking,
  recordBooking,
  AUDIENCE_RANK,
};
