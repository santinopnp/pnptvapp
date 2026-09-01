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

/**
 * List bookings for a creator's own dashboard. Includes buyer display fields
 * so the creator can identify the fan (username + avatar) without a second
 * lookup. Filterable by status; caller can also cap the result.
 *
 * @param {string} creatorUserId
 * @param {object} opts  — { status?: string|string[], limit?: number }
 */
async function listBookingsForCreator(creatorUserId, { status = null, limit = 100 } = {}) {
  const statusFilter = Array.isArray(status) ? status : (status ? [status] : null);
  const params = [String(creatorUserId)];
  let where = `b.creator_user_id = $1`;
  if (statusFilter?.length) {
    params.push(statusFilter);
    where += ` AND b.status = ANY($${params.length}::text[])`;
  }
  const { rows } = await getPool().query(
    `SELECT b.id, b.service_id, b.service_type, b.price_paid_cents, b.status,
            b.buyer_note, b.payment_provider, b.payment_ref,
            b.created_at, b.fulfilled_at, b.expires_at,
            u.id AS buyer_id, u.username AS buyer_username,
            u.first_name AS buyer_first_name, u.photo_file_id AS buyer_photo_url,
            u.is_pnptv_fam, u.is_whale_pig
       FROM creator_service_bookings b
       JOIN users u ON u.id = b.buyer_user_id
      WHERE ${where}
      ORDER BY b.created_at DESC
      LIMIT ${Math.min(500, Math.max(1, Number(limit) || 100))}`,
    params
  );
  return rows.map((r) => ({
    id: String(r.id),
    serviceId: Number(r.service_id),
    serviceType: r.service_type,
    priceCents: Number(r.price_paid_cents),
    status: r.status,
    buyerNote: r.buyer_note,
    paymentProvider: r.payment_provider,
    paymentRef: r.payment_ref,
    createdAt: r.created_at,
    fulfilledAt: r.fulfilled_at,
    expiresAt: r.expires_at,
    buyer: {
      id: String(r.buyer_id),
      username: r.buyer_username || null,
      firstName: r.buyer_first_name || null,
      photoUrl: r.buyer_photo_url || null,
      // Client-safe: only expose pnptvFam publicly; Whale Pig stays staff-only,
      // but creator can see the "inner circle" hint via combined flag.
      isPnptvFam: !!r.is_pnptv_fam,
      isInnerCircle: !!r.is_whale_pig,  // labeled Inner Circle in UI
    },
  }));
}

/**
 * Mark a booking fulfilled or cancelled by the CREATOR who owns it.
 * Fulfilled = work delivered; cancelled = creator can't deliver, triggers
 * a refund workflow (Slack ping — refund itself is manual for now).
 *
 * Enforces creator ownership at the query level (WHERE creator_user_id = $2)
 * so a hostile creator can't touch someone else's booking.
 *
 * @returns {Promise<{ok:boolean, newStatus?:string, reason?:string}>}
 */
async function updateBookingStatus(bookingId, creatorUserId, newStatus, { fulfillmentNote = null } = {}) {
  if (!['fulfilled', 'cancelled'].includes(newStatus)) {
    return { ok: false, reason: 'invalid_status' };
  }
  const setClause = newStatus === 'fulfilled'
    ? `status = 'fulfilled', fulfilled_at = NOW(), updated_at = NOW()`
    : `status = 'cancelled', updated_at = NOW()`;
  const metaMerge = fulfillmentNote
    ? `, metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('fulfillmentNote', $3::text)`
    : '';
  const params = fulfillmentNote
    ? [String(bookingId), String(creatorUserId), String(fulfillmentNote).slice(0, 2000)]
    : [String(bookingId), String(creatorUserId)];
  const { rows } = await getPool().query(
    `UPDATE creator_service_bookings
        SET ${setClause}${metaMerge}
      WHERE id = $1
        AND creator_user_id = $2
        AND status IN ('paid','pending')
    RETURNING id, status, buyer_user_id, service_type, price_paid_cents`,
    params
  );
  if (!rows.length) return { ok: false, reason: 'not_found_or_wrong_state' };
  logger.info('[crystal-service] booking status updated', {
    bookingId, creatorUserId, newStatus,
  });

  // Fire-and-forget: DM the buyer with status change.
  setImmediate(async () => {
    try {
      const b = rows[0];
      if (!/^\d+$/.test(String(b.buyer_user_id))) return;
      let bot = null;
      try { bot = require('../bot/core/bot'); } catch { return; }
      if (!bot?.telegram) return;
      const usd = (Number(b.price_paid_cents) / 100).toFixed(0);
      const msg = newStatus === 'fulfilled'
        ? `💎 Your ${b.service_type.replace(/_/g, ' ')} was marked delivered by the creator. Any issue? Reply to this DM.`
        : `Your ${b.service_type.replace(/_/g, ' ')} ($${usd}) was cancelled by the creator. Refund is being processed — you'll hear from support shortly.`;
      await bot.telegram.sendMessage(b.buyer_user_id, msg).catch(() => {});
    } catch { /* non-fatal */ }
  });

  // If cancelled, ping ops-slack so support can process the refund.
  if (newStatus === 'cancelled') {
    setImmediate(async () => {
      try {
        const slackOps = require('./slackOpsService');
        await slackOps.notifyPaymentSuccess({
          orderId: `booking:${bookingId}`,
          userId: String(rows[0].buyer_user_id),
          username: '',
          amount: (Number(rows[0].price_paid_cents) / 100).toFixed(0),
          currency: 'USD',
          plan: `⚠ REFUND NEEDED: crystal_service ${rows[0].service_type} cancelled by creator ${creatorUserId}`,
          provider: 'refund_queue',
        }).catch(() => {});
      } catch { /* non-fatal */ }
    });
  }

  return { ok: true, newStatus };
}

/**
 * Boolean helper — does buyer have an active priority_dm booking with this
 * creator? Called from the DM UI so priority senders get a rose-gold marker.
 *
 * "Active" = status='paid' or 'fulfilled', within the past 30 days
 * (priority_dm is a monthly service).
 */
async function hasActivePriorityDm(buyerUserId, creatorUserId) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM creator_service_bookings
      WHERE buyer_user_id = $1
        AND creator_user_id = $2
        AND service_type = 'priority_dm'
        AND status IN ('paid','fulfilled')
        AND created_at > NOW() - INTERVAL '30 days'
      LIMIT 1`,
    [String(buyerUserId), String(creatorUserId)]
  );
  return rows.length > 0;
}

/**
 * Boolean helper — does buyer have an active bts_subscription with this
 * creator? Called from channel-access gates so BTS drops are visible only
 * to paying subscribers. Same 30-day rolling window as priority_dm.
 */
async function hasActiveBtsSubscription(buyerUserId, creatorUserId) {
  const { rows } = await getPool().query(
    `SELECT 1 FROM creator_service_bookings
      WHERE buyer_user_id = $1
        AND creator_user_id = $2
        AND service_type = 'bts_subscription'
        AND status IN ('paid','fulfilled')
        AND created_at > NOW() - INTERVAL '30 days'
      LIMIT 1`,
    [String(buyerUserId), String(creatorUserId)]
  );
  return rows.length > 0;
}

/**
 * Cron sweep — flags custom_content bookings that are past their delivery
 * deadline. Sends a DM to the creator + Slack ops ping so support can
 * intervene. Runs once per day.
 *
 * @returns {Promise<{overdue:number, alerted:number}>}
 */
async function sweepOverdueCustomContent() {
  const { rows: overdue } = await getPool().query(
    `SELECT b.id, b.creator_user_id, b.buyer_user_id, b.expires_at,
            b.price_paid_cents,
            u.username AS creator_username
       FROM creator_service_bookings b
       JOIN users u ON u.id = b.creator_user_id
      WHERE b.service_type = 'custom_content'
        AND b.status = 'paid'
        AND b.expires_at IS NOT NULL
        AND b.expires_at <= NOW()
        AND (b.metadata->>'overdue_alerted') IS NULL
      LIMIT 100`
  );
  let alerted = 0;
  if (!overdue.length) return { overdue: 0, alerted: 0 };

  let bot = null;
  try { bot = require('../bot/core/bot'); } catch { /* no bot */ }
  const slackOps = (() => { try { return require('./slackOpsService'); } catch { return null; } })();

  for (const row of overdue) {
    try {
      // Creator DM (best-effort, TG-signed-up only)
      if (bot?.telegram && /^\d+$/.test(String(row.creator_user_id))) {
        const daysLate = Math.round((Date.now() - new Date(row.expires_at)) / (24 * 60 * 60 * 1000));
        await bot.telegram.sendMessage(
          row.creator_user_id,
          `⚠️ Your custom_content booking is ${daysLate}d overdue. Deliver ASAP or the fan gets refunded.\n\nManage: https://pnptv.app/creators/services`
        ).catch(() => {});
      }
      if (slackOps) {
        slackOps.notifyPaymentSuccess({
          orderId: `booking:${row.id}`,
          userId: String(row.creator_user_id),
          username: row.creator_username ? `@${row.creator_username}` : '',
          amount: (Number(row.price_paid_cents) / 100).toFixed(0),
          currency: 'USD',
          plan: `⏰ OVERDUE custom_content — creator hasn't delivered`,
          provider: 'ops_alert',
        }).catch(() => {});
      }
      // Stamp so we don't re-alert every day
      await getPool().query(
        `UPDATE creator_service_bookings
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('overdue_alerted', NOW()::text),
                updated_at = NOW()
          WHERE id = $1`,
        [row.id]
      );
      alerted++;
    } catch (err) {
      logger.warn('[crystal-service] sweepOverdueCustomContent: alert failed', {
        bookingId: row.id, error: err.message,
      });
    }
  }
  logger.info('[crystal-service] sweepOverdueCustomContent', { overdue: overdue.length, alerted });
  return { overdue: overdue.length, alerted };
}

/**
 * Whether a creator has opted in to offering the free 15-min intro call.
 * True when an active creator_services row with service_type='intro_call'
 * exists for the creator.
 */
async function creatorOffersIntroCall(creatorUserId) {
  const { rows } = await getPool().query(
    `SELECT id FROM creator_services
      WHERE creator_user_id = $1 AND service_type = 'intro_call' AND is_active = TRUE
      LIMIT 1`,
    [String(creatorUserId)]
  );
  return { offers: rows.length > 0, serviceId: rows[0]?.id || null };
}

/**
 * Whether a buyer is eligible for a free intro call — one lifetime, platform-wide.
 * Returns { eligible: bool, reason?: string }.
 */
async function isIntroCallEligible(buyerUserId) {
  const { rows } = await getPool().query(
    `SELECT intro_call_used_at FROM users WHERE id = $1 LIMIT 1`,
    [String(buyerUserId)]
  );
  if (!rows[0]) return { eligible: false, reason: 'unknown_user' };
  if (rows[0].intro_call_used_at) return { eligible: false, reason: 'already_used' };
  return { eligible: true };
}

/**
 * Create a free-intro-call booking. Enforces: creator offers it, buyer is
 * eligible (never used one), buyer ≠ creator. Marks buyer's intro_call_used_at
 * inside the same transaction so a double-tap can't create two.
 *
 * Returns { bookingId, livekitRoomName } on success. Throws on ineligibility
 * with a code the caller maps to a 400/409.
 */
async function createIntroCallBooking(creatorUserId, buyerUserId) {
  if (String(creatorUserId) === String(buyerUserId)) {
    const err = new Error('cannot_book_self');
    err.code = 'cannot_book_self';
    throw err;
  }
  const offers = await creatorOffersIntroCall(creatorUserId);
  if (!offers.offers) {
    const err = new Error('creator_not_opted_in');
    err.code = 'creator_not_opted_in';
    throw err;
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const gate = await client.query(
      `SELECT intro_call_used_at FROM users WHERE id = $1 FOR UPDATE`,
      [String(buyerUserId)]
    );
    if (!gate.rows[0]) {
      await client.query('ROLLBACK');
      const err = new Error('unknown_user'); err.code = 'unknown_user'; throw err;
    }
    if (gate.rows[0].intro_call_used_at) {
      await client.query('ROLLBACK');
      const err = new Error('already_used'); err.code = 'already_used'; throw err;
    }
    const paymentRef = `intro-call-${creatorUserId}-${buyerUserId}-${Date.now()}`;
    const booking = await client.query(
      `INSERT INTO creator_service_bookings
         (service_id, creator_user_id, buyer_user_id, service_type, price_paid_cents,
          payment_provider, payment_ref, status)
       VALUES ($1, $2, $3, 'intro_call', 0, 'free', $4, 'paid')
       RETURNING id`,
      [Number(offers.serviceId), String(creatorUserId), String(buyerUserId), paymentRef]
    );
    const bookingId = booking.rows[0].id;
    await client.query(
      `UPDATE users SET intro_call_used_at = NOW() WHERE id = $1`,
      [String(buyerUserId)]
    );
    await client.query('COMMIT');
    logger.info('[intro-call] booking created', { bookingId, creatorUserId, buyerUserId });

    // Fire-and-forget notifications — do not block the response.
    (async () => {
      try {
        const bot = require('../bot/core/bot');
        const { rows: cr } = await getPool().query(
          `SELECT telegram_id, first_name, username FROM users WHERE id = $1`,
          [String(creatorUserId)]
        );
        const { rows: br } = await getPool().query(
          `SELECT first_name, username FROM users WHERE id = $1`,
          [String(buyerUserId)]
        );
        const buyerName = br[0]?.first_name || br[0]?.username || 'A fan';
        if (cr[0]?.telegram_id && bot?.telegram) {
          await bot.telegram.sendMessage(
            cr[0].telegram_id,
            `🎁 ${buyerName} just booked their free 15-min intro call with you. Open the app to join when you're ready.`
          ).catch(() => {});
        }
      } catch (_) { /* notification best-effort */ }
    })();

    return {
      bookingId,
      livekitRoomName: `intro-call-${bookingId}`,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getViewerAudience,
  listServicesForCreator,
  getShowcase,
  loadServiceForBooking,
  recordBooking,
  listBookingsForCreator,
  updateBookingStatus,
  hasActivePriorityDm,
  hasActiveBtsSubscription,
  sweepOverdueCustomContent,
  creatorOffersIntroCall,
  isIntroCallEligible,
  createIntroCallBooking,
  AUDIENCE_RANK,
};
