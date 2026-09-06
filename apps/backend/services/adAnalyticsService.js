'use strict';

/**
 * adAnalyticsService
 *
 * Buffered writer for ad_events + query helpers for conversion cohort
 * analysis. In-memory queue flushes every 10 seconds or when 200 events
 * accumulate, whichever comes first. Losing a partial batch on crash is
 * acceptable — this is instrumentation, not ledger.
 *
 * Every insert goes through a single parameterized multi-row INSERT so
 * batching is a real perf win vs one-INSERT-per-event.
 */

const { query, getPool } = require('../config/postgres');
const logger = require('../utils/logger');

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER = 200;

const ALLOWED_EVENT_TYPES = new Set([
  'impression',
  'click',
  'dismiss',
  'upgrade_shown',
  'upgrade_click',
  'popunder_fired',
  'push_subscribed',
]);

let _buffer = [];
let _timer = null;
let _flushInFlight = false;

function _ensureTimer() {
  if (_timer) return;
  _timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_INTERVAL_MS);
  _timer.unref?.();
}

function recordEvent(evt) {
  if (!evt || !evt.slotId || !evt.eventType || !evt.sessionId) return;
  if (!ALLOWED_EVENT_TYPES.has(evt.eventType)) return;
  _buffer.push({
    userId: evt.userId || null,
    sessionId: String(evt.sessionId).slice(0, 64),
    slotId: String(evt.slotId).slice(0, 64),
    eventType: evt.eventType,
    metadata: evt.metadata && typeof evt.metadata === 'object' ? evt.metadata : {},
  });
  _ensureTimer();
  if (_buffer.length >= MAX_BUFFER) flush().catch(() => {});
}

async function flush() {
  if (_flushInFlight) return;
  if (!_buffer.length) return;
  _flushInFlight = true;
  const batch = _buffer;
  _buffer = [];
  try {
    const cols = ['user_id', 'session_id', 'slot_id', 'event_type', 'metadata'];
    const values = [];
    const placeholders = [];
    let i = 1;
    for (const e of batch) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}::jsonb)`);
      values.push(e.userId, e.sessionId, e.slotId, e.eventType, JSON.stringify(e.metadata));
    }
    const sql = `INSERT INTO ad_events (${cols.join(', ')}) VALUES ${placeholders.join(', ')}`;
    await query(sql, values);
  } catch (err) {
    logger.warn('[adAnalytics] flush failed — events dropped', { size: batch.length, err: err.message });
  } finally {
    _flushInFlight = false;
  }
}

/**
 * Sum of impressions the user has seen across all slots in the last N days.
 * Used by ad-intensity calculator + interstitial upgrade trigger (>20/session).
 */
async function getUserExposureDays(userId, days = 7) {
  if (!userId) return 0;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM ad_events
      WHERE user_id = $1
        AND event_type = 'impression'
        AND created_at > NOW() - ($2 || ' days')::interval`,
    [String(userId), String(days)]
  );
  return rows[0]?.n || 0;
}

/**
 * How many impressions the user has seen in this specific session.
 * Used by the interstitial upgrade trigger (show after 20 impressions/session).
 */
async function getSessionImpressions(sessionId) {
  if (!sessionId) return 0;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM ad_events
      WHERE session_id = $1
        AND event_type = 'impression'`,
    [String(sessionId)]
  );
  return rows[0]?.n || 0;
}

/**
 * Daily summary for the ops report: impressions per slot, click-through rate,
 * upgrade CTA effectiveness, unique users, new Prime subs correlated with ads.
 */
/**
 * Rollup impressions + upgrade CTR by A/B variant. Reads
 * ad_events.metadata->>'variant' — 'A' | 'B' | 'control' | null (rows
 * written before variant was tracked are aggregated as 'unknown').
 */
async function getVariantBreakdown(sinceHours = 24) {
  const { rows } = await query(
    `SELECT COALESCE(metadata->>'variant', 'unknown') AS variant,
            COUNT(*) FILTER (WHERE event_type='impression')    AS impressions,
            COUNT(*) FILTER (WHERE event_type='click')         AS clicks,
            COUNT(*) FILTER (WHERE event_type='upgrade_shown') AS upgrade_shown,
            COUNT(*) FILTER (WHERE event_type='upgrade_click') AS upgrade_click,
            COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS unique_users
       FROM ad_events
      WHERE created_at > NOW() - ($1 || ' hours')::interval
      GROUP BY 1
      ORDER BY impressions DESC`,
    [String(sinceHours)]
  );
  return rows;
}

/**
 * Hourly time-series of impressions for the sparkline. Buckets are UTC hours.
 * Returns [{bucket:'2026-09-06T04:00:00Z', impressions:N}, ...] oldest→newest.
 */
async function getImpressionsHourly(sinceHours = 24) {
  const { rows } = await query(
    `SELECT date_trunc('hour', created_at) AS bucket,
            COUNT(*)::int AS impressions
       FROM ad_events
      WHERE created_at > NOW() - ($1 || ' hours')::interval
        AND event_type = 'impression'
      GROUP BY 1
      ORDER BY 1 ASC`,
    [String(sinceHours)]
  );
  return rows;
}

async function getDailySummary(sinceHours = 24) {
  const params = [String(sinceHours)];
  const [slots, subs, uniqueUsers] = await Promise.all([
    query(
      `SELECT slot_id,
              COUNT(*) FILTER (WHERE event_type='impression')      AS impressions,
              COUNT(*) FILTER (WHERE event_type='click')           AS clicks,
              COUNT(*) FILTER (WHERE event_type='upgrade_shown')   AS upgrade_shown,
              COUNT(*) FILTER (WHERE event_type='upgrade_click')   AS upgrade_click,
              COUNT(*) FILTER (WHERE event_type='dismiss')         AS dismiss
         FROM ad_events
        WHERE created_at > NOW() - ($1 || ' hours')::interval
        GROUP BY slot_id
        ORDER BY impressions DESC`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS new_prime
         FROM user_entitlements
        WHERE granted_at > NOW() - ($1 || ' hours')::interval
          AND add_on_id = 'prime'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      params
    ).catch(() => ({ rows: [{ new_prime: 0 }] })),
    query(
      `SELECT COUNT(DISTINCT user_id)::int AS uniq
         FROM ad_events
        WHERE user_id IS NOT NULL
          AND created_at > NOW() - ($1 || ' hours')::interval`,
      params
    ),
  ]);

  return {
    sinceHours,
    slots: slots.rows,
    newPrimeSubs: subs.rows[0]?.new_prime || 0,
    uniqueUsersServedAds: uniqueUsers.rows[0]?.uniq || 0,
  };
}

/**
 * Cohort — of users who upgraded to Prime in the window, how many ad
 * impressions did each see in the 30 days before their upgrade? Rough
 * "ads → conversion" attribution signal.
 */
async function getConversionCohort(sinceHours = 24) {
  const { rows } = await query(
    `WITH new_subs AS (
       SELECT user_id, granted_at AS upgraded_at
         FROM user_entitlements
        WHERE granted_at > NOW() - ($1 || ' hours')::interval
          AND add_on_id = 'prime'
          AND (expires_at IS NULL OR expires_at > NOW())
     )
     SELECT ns.user_id,
            ns.upgraded_at,
            COUNT(ae.*)::int AS impressions_prior_30d,
            COUNT(ae.*) FILTER (WHERE ae.event_type='upgrade_click')::int AS upgrade_ctas_clicked
       FROM new_subs ns
       LEFT JOIN ad_events ae
              ON ae.user_id = ns.user_id
             AND ae.created_at BETWEEN ns.upgraded_at - INTERVAL '30 days' AND ns.upgraded_at
      GROUP BY ns.user_id, ns.upgraded_at
      ORDER BY ns.upgraded_at DESC`,
    [String(sinceHours)]
  );
  return rows;
}

module.exports = {
  recordEvent,
  flush,
  getUserExposureDays,
  getSessionImpressions,
  getDailySummary,
  getConversionCohort,
  getVariantBreakdown,
  getImpressionsHourly,
  ALLOWED_EVENT_TYPES,
};
