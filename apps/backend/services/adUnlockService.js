'use strict';

/**
 * adUnlockService
 *
 * Manages temporary entitlements granted after a rewarded video ad completes.
 * Grindr-style: free-tier user watches a 30-second ad, gets +30 min of Main
 * Stage / 1 video watch / etc. Basic + PRIME are exempt (they never see ads).
 *
 * Feature flag: `ads:enabled` in Redis. When "0" or missing, all grantUnlock
 * calls no-op and hasActiveUnlock returns false. Turn off in seconds if
 * malvertising or bad UX appears.
 *
 * Rate limit: max ALLOWED_GRANTS_PER_DAY unlocks per user × surface × day.
 * Enforced with Redis counters keyed by day so the reset is automatic at
 * UTC midnight — no cron needed.
 */

const { query } = require('../config/postgres');
const { cache, getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const KEY_ENABLED = 'ads:enabled';
const ALLOWED_GRANTS_PER_DAY = 3;

// Allowlist of surface IDs — reject anything not in this set so a compromised
// or malformed callback can't create fake unlock types.
const ALLOWED_SURFACES = new Set([
  'mainstage_extend',
  'prime_video_single',
  'nearby_premium',
  'dm_extra',
]);

// Default TTL by surface, in seconds. Client can't override — server-authoritative.
const SURFACE_TTL_SEC = {
  mainstage_extend:   30 * 60,      // +30 min Main Stage
  prime_video_single: 60 * 60,      // 60 min to start watching (single video, one time)
  nearby_premium:     60 * 60,      // 60 min extended Nearby
  dm_extra:           24 * 60 * 60, // 24h of +5 DMs
};

async function isFeatureEnabled() {
  try {
    const v = await cache.get(KEY_ENABLED);
    return String(v || '0') === '1';
  } catch (err) {
    logger.warn('[adUnlock] isFeatureEnabled read failed', { err: err.message });
    return false; // fail-closed on Redis outage — never accidentally serve ads
  }
}

async function setFeatureEnabled(enabled) {
  await cache.set(KEY_ENABLED, enabled ? '1' : '0');
}

/**
 * Server-side check whether the user's tier is eligible to see ads.
 * PRIME + admin + banned never see ads. Free + member (basic) both do —
 * see getTierAdLevel for granularity (member gets minimal only).
 */
function isTierEligibleForAds(userTier, userRole) {
  if (userRole === 'admin' || userRole === 'superadmin') return false;
  const tier = String(userTier || '').toLowerCase();
  if (tier === 'prime') return false;
  if (tier === 'banned') return false;
  return true;
}

/**
 * Returns the ad "level" a user is entitled to see:
 *   'full'    — all slots (free, anonymous)
 *   'minimal' — only passive sticky footer (member/basic — they pay something)
 *   'none'    — no ads (prime, admin, banned)
 */
function getTierAdLevel(userTier, userRole) {
  if (userRole === 'admin' || userRole === 'superadmin') return 'none';
  const tier = String(userTier || '').toLowerCase();
  if (tier === 'prime' || tier === 'banned') return 'none';
  if (tier === 'member') return 'minimal';
  return 'full';
}

function isValidSurface(surface) {
  return typeof surface === 'string' && ALLOWED_SURFACES.has(surface);
}

function _rateLimitKey(userId, surface) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `ad_rate:${userId}:${surface}:${today}`;
}

/**
 * Returns { count, remaining, capReached } for today's grants on this surface.
 * count = how many unlocks used today; remaining = ALLOWED_GRANTS_PER_DAY - count.
 */
async function getRateLimitStatus(userId, surface) {
  try {
    const redis = getRedis();
    const raw = await redis.get(_rateLimitKey(userId, surface));
    const count = parseInt(raw || '0', 10);
    const remaining = Math.max(0, ALLOWED_GRANTS_PER_DAY - count);
    return { count, remaining, capReached: remaining === 0, capPerDay: ALLOWED_GRANTS_PER_DAY };
  } catch (err) {
    logger.warn('[adUnlock] rate limit read failed', { err: err.message });
    return { count: 0, remaining: 0, capReached: true, capPerDay: ALLOWED_GRANTS_PER_DAY };
  }
}

/**
 * Grants a temporary unlock. Idempotent on (adNetwork, adTxnId) via DB
 * UNIQUE constraint — a replayed webhook returns the existing row.
 *
 * Rejects when:
 *   - Feature flag off
 *   - Surface not in allowlist
 *   - User tier ineligible (paying users)
 *   - Rate limit hit for today
 *   - adTxnId already used
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.surface
 * @param {string} opts.adNetwork  e.g. 'trafficjunky'
 * @param {string} opts.adTxnId    Network-provided unique transaction id
 * @param {string} opts.userTier
 * @param {string} opts.userRole
 * @param {object} [opts.meta]     Optional extra data (network zone id, etc.)
 * @returns {Promise<{ok:boolean, reason?:string, unlockId?:number, expiresAt?:string}>}
 */
async function grantUnlock(opts) {
  const { userId, surface, adNetwork, adTxnId, userTier, userRole, meta = {} } = opts || {};

  if (!await isFeatureEnabled()) return { ok: false, reason: 'ads_disabled' };
  if (!userId) return { ok: false, reason: 'user_required' };
  if (!isValidSurface(surface)) return { ok: false, reason: 'invalid_surface' };
  if (!adNetwork || !adTxnId) return { ok: false, reason: 'ad_txn_required' };
  if (!isTierEligibleForAds(userTier, userRole)) return { ok: false, reason: 'tier_ineligible' };

  // Rate limit — atomic INCR + EXPIRE so counter resets at 24h from FIRST grant
  // of the day. Using UTC-day key means all users reset together at 00:00 UTC.
  const redis = getRedis();
  const rateKey = _rateLimitKey(userId, surface);
  let newCount;
  try {
    newCount = await redis.incr(rateKey);
    if (newCount === 1) await redis.expire(rateKey, 25 * 3600); // 25h TTL just in case of clock skew
  } catch (err) {
    logger.warn('[adUnlock] rate limit incr failed', { err: err.message });
    return { ok: false, reason: 'rate_limit_backend_down' };
  }
  if (newCount > ALLOWED_GRANTS_PER_DAY) {
    // Roll back the increment so a client that catches this doesn't count it.
    // Idempotent replay by network is fine — same result.
    try { await redis.decr(rateKey); } catch (_) {}
    return { ok: false, reason: 'rate_limit_exceeded' };
  }

  const ttlSec = SURFACE_TTL_SEC[surface];
  const expiresAt = new Date(Date.now() + ttlSec * 1000);

  try {
    const { rows } = await query(
      `INSERT INTO ad_unlocks
         (user_id, surface, ad_network, ad_txn_id, expires_at, meta)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (ad_network, ad_txn_id) DO UPDATE
         SET meta = ad_unlocks.meta  -- no-op update so RETURNING works on replay
       RETURNING id, expires_at, (xmax = 0) AS inserted`,
      [String(userId), surface, adNetwork, adTxnId, expiresAt.toISOString(), JSON.stringify(meta)]
    );
    const row = rows[0];
    if (!row.inserted) {
      // Replay: revert the rate limit increment we just made
      try { await redis.decr(rateKey); } catch (_) {}
      logger.info('[adUnlock] replay of existing txn — no-op', { adNetwork, adTxnId });
    } else {
      logger.info('[adUnlock] granted', {
        userId, surface, adNetwork, unlockId: row.id, expiresAt: row.expires_at,
      });
    }
    return { ok: true, unlockId: row.id, expiresAt: row.expires_at };
  } catch (err) {
    // Roll back rate limit on DB failure
    try { await redis.decr(rateKey); } catch (_) {}
    logger.error('[adUnlock] insert failed', { err: err.message });
    return { ok: false, reason: 'db_insert_failed' };
  }
}

/**
 * Returns true iff the user has an unexpired unlock for this surface.
 * Basic + PRIME always return TRUE (they bypass — this makes it safe for
 * feature code to just call hasActiveUnlock without a separate tier check).
 */
async function hasActiveUnlock(userId, surface, userTier, userRole) {
  if (!isValidSurface(surface)) return false;
  // Paying users bypass — always have access.
  if (!isTierEligibleForAds(userTier, userRole)) return true;
  if (!await isFeatureEnabled()) return false;

  const { rows } = await query(
    `SELECT expires_at FROM ad_unlocks
      WHERE user_id = $1::text AND surface = $2 AND expires_at > NOW()
      ORDER BY expires_at DESC LIMIT 1`,
    [String(userId), surface]
  );
  return rows.length > 0;
}

/**
 * Returns the most recent active unlock's expires_at, or null.
 * Used by the client to render "X min remaining" countdowns.
 */
async function getActiveUnlockExpiresAt(userId, surface) {
  if (!isValidSurface(surface)) return null;
  const { rows } = await query(
    `SELECT expires_at FROM ad_unlocks
      WHERE user_id = $1::text AND surface = $2 AND expires_at > NOW()
      ORDER BY expires_at DESC LIMIT 1`,
    [String(userId), surface]
  );
  return rows.length ? rows[0].expires_at : null;
}

module.exports = {
  isFeatureEnabled,
  setFeatureEnabled,
  isTierEligibleForAds,
  getTierAdLevel,
  isValidSurface,
  getRateLimitStatus,
  grantUnlock,
  hasActiveUnlock,
  getActiveUnlockExpiresAt,
  ALLOWED_SURFACES: [...ALLOWED_SURFACES],
  ALLOWED_GRANTS_PER_DAY,
  SURFACE_TTL_SEC,
};
