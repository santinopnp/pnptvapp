'use strict';

/**
 * PNPtv Fam — CRM service.
 *
 * Two write paths:
 *   • logEvent(userId, type, payload)     — append-only lifecycle log.
 *   • logContentCredit(fam, creator, ...) — creator compensation receipts.
 *
 * Two read paths:
 *   • getMemberProfile(userId) — aggregated CRM profile for one Fam member.
 *   • getSegments()            — counts by lifecycle stage / segment.
 *
 * All writes are safe to call for non-fam users (they no-op) so integration
 * hooks in existing services don't need to gate.
 */

const { getPool } = require('../config/postgres');
const logger = require('../utils/logger');

// ── Credit rate table (cents) ───────────────────────────────────────────────
// Chosen to feel meaningful without exploding a creator's monthly bill from
// a single Fam member's binge session. Tunable; keep in sync with the
// compensation clause in the benefits modal copy.
const CREDIT_RATES_CENTS = Object.freeze({
  exclusive_video: 5,        // per view
  exclusive_photo: 1,        // per view
  exclusive_post:  2,        // per view (mixed-media posts)
  dm_open:         10,       // per DM opened from a creator
  live_view_minute: 3,       // per minute of live watch
});

const VALID_CONTENT_TYPES = new Set(Object.keys(CREDIT_RATES_CENTS));

const VALID_EVENT_TYPES = new Set([
  'login', 'logout',
  'welcome_dismissed', 'benefits_dismissed', 'customizer_saved',
  'feed_toggle', 'shortcut_click', 'shortcut_added', 'shortcut_removed',
  'content_view', 'creator_gift', 'crystal_upsell_view', 'crystal_upsell_click',
  'dwell_ms', 'dm_open',
  'featured_view', 'featured_dismiss', 'featured_cta_click',
]);

// ── Small internal helpers ─────────────────────────────────────────────────
async function _isFam(userId) {
  if (!userId) return false;
  const { rows } = await getPool().query(
    `SELECT is_pnptv_fam FROM users WHERE id = $1 LIMIT 1`,
    [String(userId)]
  );
  return !!rows[0]?.is_pnptv_fam;
}

// ── Public writes ──────────────────────────────────────────────────────────

/**
 * Append a lifecycle event. Safe on non-fam users (no-op). Fire-and-forget
 * from callers — never let an event write break the user's request.
 */
async function logEvent(userId, eventType, payload = {}) {
  try {
    if (!userId || !eventType) return { logged: false };
    if (!VALID_EVENT_TYPES.has(eventType)) {
      logger.warn('[pnp-fam-crm] unknown event_type dropped', { eventType });
      return { logged: false };
    }
    if (!(await _isFam(userId))) return { logged: false };
    await getPool().query(
      `INSERT INTO pnptv_fam_events (user_id, event_type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [String(userId), eventType, JSON.stringify(payload || {})]
    );
    return { logged: true };
  } catch (err) {
    logger.warn('[pnp-fam-crm] logEvent failed', { err: err.message });
    return { logged: false, error: err.message };
  }
}

/**
 * Log a content-consumption credit for the creator. Deduped per day per
 * (fam, creator, type, ref) tuple so a rewatch on the same day doesn't
 * double-count. Safe on non-fam users (no-op).
 */
async function logContentCredit(famUserId, creatorUserId, contentType, contentRef, extra = {}) {
  try {
    if (!famUserId || !creatorUserId) return { credited: false };
    if (String(famUserId) === String(creatorUserId)) return { credited: false, reason: 'self' };
    if (!VALID_CONTENT_TYPES.has(contentType)) {
      logger.warn('[pnp-fam-crm] unknown content_type dropped', { contentType });
      return { credited: false };
    }
    if (!(await _isFam(famUserId))) return { credited: false };

    // Dedup per day, per (fam, creator, type, ref).
    const dedupRef = contentRef || 'null';
    const { rows: dup } = await getPool().query(
      `SELECT 1 FROM pnptv_fam_content_credits
        WHERE fam_user_id = $1
          AND creator_user_id = $2
          AND content_type = $3
          AND COALESCE(content_ref, 'null') = $4
          AND occurred_at::date = CURRENT_DATE
        LIMIT 1`,
      [String(famUserId), String(creatorUserId), contentType, dedupRef]
    );
    if (dup.length) return { credited: false, reason: 'dedup' };

    let creditCents = CREDIT_RATES_CENTS[contentType];
    // live_view_minute allows a `minutes` multiplier for batched entries.
    if (contentType === 'live_view_minute' && Number(extra.minutes) > 0) {
      creditCents = CREDIT_RATES_CENTS[contentType] * Math.floor(Number(extra.minutes));
    }

    await getPool().query(
      `INSERT INTO pnptv_fam_content_credits
        (fam_user_id, creator_user_id, content_type, content_ref, credit_cents)
       VALUES ($1, $2, $3, $4, $5)`,
      [String(famUserId), String(creatorUserId), contentType, contentRef || null, creditCents]
    );
    return { credited: true, cents: creditCents };
  } catch (err) {
    logger.warn('[pnp-fam-crm] logContentCredit failed', { err: err.message });
    return { credited: false, error: err.message };
  }
}

// ── Public reads ───────────────────────────────────────────────────────────

/**
 * Aggregated CRM profile for one Fam member. Returns:
 *   - lifecycleStage (fresh|engaged|dormant)
 *   - totals: events, credits, cents credited
 *   - topCreatorsSupported [{ creator_id, username, cents, credits }]
 *   - upsellFunnel { views, clicks, gifted }
 *   - recentEvents (last 10)
 */
async function getMemberProfile(userId) {
  const pool = getPool();
  const uid = String(userId);
  const { rows: baseRows } = await pool.query(
    `SELECT id, username, first_name, email, telegram, is_pnptv_fam, is_whale_pig,
            pnptv_fam_since, pnptv_fam_welcome_seen_at, pnptv_fam_benefits_seen_at,
            pnptv_fam_feed_layout, last_active, created_at
       FROM users WHERE id = $1 LIMIT 1`,
    [uid]
  );
  if (!baseRows.length) return null;
  const base = baseRows[0];

  const [{ rows: eventStats }, { rows: creditStats }, { rows: topCreators }, { rows: funnel }, { rows: recentEvents }] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total,
              MAX(occurred_at) AS last_event_at,
              MIN(occurred_at) FILTER (WHERE occurred_at > NOW() - INTERVAL '30 days') AS first_event_30d,
              COUNT(*) FILTER (WHERE occurred_at > NOW() - INTERVAL '7 days')::int AS last_7d
         FROM pnptv_fam_events WHERE user_id = $1`,
      [uid]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS credits,
              COALESCE(SUM(credit_cents), 0)::int AS cents,
              COALESCE(SUM(credit_cents) FILTER (WHERE occurred_at > NOW() - INTERVAL '30 days'), 0)::int AS cents_30d
         FROM pnptv_fam_content_credits WHERE fam_user_id = $1`,
      [uid]
    ),
    pool.query(
      `SELECT c.creator_user_id AS creator_id,
              u.username, u.first_name, u.photo_file_id AS photo_url,
              COUNT(*)::int AS credits,
              SUM(c.credit_cents)::int AS cents
         FROM pnptv_fam_content_credits c
         JOIN users u ON u.id = c.creator_user_id
        WHERE c.fam_user_id = $1
        GROUP BY c.creator_user_id, u.username, u.first_name, u.photo_file_id
        ORDER BY cents DESC
        LIMIT 5`,
      [uid]
    ),
    pool.query(
      `SELECT
          COUNT(*) FILTER (WHERE event_type = 'crystal_upsell_view')::int  AS views,
          COUNT(*) FILTER (WHERE event_type = 'crystal_upsell_click')::int AS clicks,
          COUNT(*) FILTER (WHERE event_type = 'creator_gift')::int         AS gifted
         FROM pnptv_fam_events WHERE user_id = $1`,
      [uid]
    ),
    pool.query(
      `SELECT event_type, payload, occurred_at
         FROM pnptv_fam_events WHERE user_id = $1
        ORDER BY occurred_at DESC LIMIT 10`,
      [uid]
    ),
  ]);

  // Lifecycle stage — simple heuristic; refine later.
  const now = Date.now();
  const lastActive = base.last_active ? new Date(base.last_active).getTime() : 0;
  const daysSinceActive = lastActive ? Math.floor((now - lastActive) / (24 * 3600 * 1000)) : 999;
  let lifecycleStage = 'fresh';
  if (eventStats[0].total > 20 && daysSinceActive <= 7) lifecycleStage = 'engaged';
  else if (daysSinceActive > 30) lifecycleStage = 'dormant';
  else if (eventStats[0].total > 0) lifecycleStage = 'active';

  return {
    id: base.id,
    username: base.username,
    firstName: base.first_name,
    email: base.email,
    telegram: base.telegram,
    isPnptvFam: !!base.is_pnptv_fam,
    isWhalePig: !!base.is_whale_pig,
    famSince: base.pnptv_fam_since ? new Date(base.pnptv_fam_since).toISOString() : null,
    welcomeSeenAt: base.pnptv_fam_welcome_seen_at ? new Date(base.pnptv_fam_welcome_seen_at).toISOString() : null,
    benefitsSeenAt: base.pnptv_fam_benefits_seen_at ? new Date(base.pnptv_fam_benefits_seen_at).toISOString() : null,
    feedLayout: base.pnptv_fam_feed_layout || { mode: 'fam', shortcuts: [] },
    lastActive: base.last_active ? new Date(base.last_active).toISOString() : null,
    createdAt: base.created_at ? new Date(base.created_at).toISOString() : null,
    lifecycleStage,
    events: {
      total: eventStats[0].total,
      last7d: eventStats[0].last_7d,
      lastEventAt: eventStats[0].last_event_at,
    },
    credits: {
      count: creditStats[0].credits,
      centsTotal: creditStats[0].cents,
      cents30d: creditStats[0].cents_30d,
    },
    topCreatorsSupported: topCreators.map(r => ({
      creatorId: r.creator_id,
      username: r.username,
      firstName: r.first_name,
      photoUrl: r.photo_url,
      credits: r.credits,
      cents: r.cents,
    })),
    upsellFunnel: {
      views: funnel[0].views,
      clicks: funnel[0].clicks,
      gifted: funnel[0].gifted,
    },
    recentEvents,
  };
}

/**
 * Simple segment counts for admin dashboard cards.
 */
async function getSegments() {
  const { rows } = await getPool().query(
    `WITH fam AS (
       SELECT u.id,
              u.last_active,
              (SELECT COUNT(*) FROM pnptv_fam_events e WHERE e.user_id = u.id) AS event_count,
              (SELECT COALESCE(SUM(credit_cents), 0) FROM pnptv_fam_content_credits c WHERE c.fam_user_id = u.id) AS cents_credited
         FROM users u WHERE u.is_pnptv_fam = TRUE AND u.is_active = TRUE
     )
     SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE event_count = 0)::int                                    AS never_engaged,
       COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days'
                          AND event_count >= 20)::int                                  AS engaged,
       COUNT(*) FILTER (WHERE last_active <= NOW() - INTERVAL '30 days')::int          AS dormant,
       COUNT(*) FILTER (WHERE cents_credited > 5000)::int                              AS heavy_consumers
       FROM fam`
  );
  return rows[0] || { total: 0, never_engaged: 0, engaged: 0, dormant: 0, heavy_consumers: 0 };
}

/**
 * List all fam members with lifecycle summary for the admin table.
 */
async function listMembersSummary() {
  const { rows } = await getPool().query(
    `SELECT u.id, u.username, u.first_name, u.photo_file_id, u.email, u.last_active,
            u.pnptv_fam_since, u.pnptv_fam_welcome_seen_at, u.pnptv_fam_benefits_seen_at,
            (SELECT COUNT(*) FROM pnptv_fam_events e WHERE e.user_id = u.id)::int AS event_count,
            (SELECT COALESCE(SUM(credit_cents),0) FROM pnptv_fam_content_credits c WHERE c.fam_user_id = u.id)::int AS cents_credited
       FROM users u
      WHERE u.is_pnptv_fam = TRUE
      ORDER BY u.pnptv_fam_since ASC NULLS LAST`
  );
  return rows;
}

module.exports = {
  logEvent,
  logContentCredit,
  getMemberProfile,
  getSegments,
  listMembersSummary,
  CREDIT_RATES_CENTS,
};
