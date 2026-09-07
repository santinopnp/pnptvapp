'use strict';

/**
 * mainStageGateService
 *
 * Time-window gating for the Main Stage free-tier teaser. Basic/PRIME members
 * are NOT gated — this only affects users who otherwise have zero access.
 *
 * Redis config (all keys prefixed by the shared cache client):
 *   mainstage:gate:enabled    "1" | "0"   (default: "0" — gate OFF)
 *   Ambas claves se escriben SIN caducidad: son configuracion, no cache.
 *   mainstage:gate:windows    JSON array of { start_utc: "HH:MM", duration_min: N }
 *                             default: [{start:"03:00",dur:60}, {start:"15:00",dur:60}]
 *
 * Two daily windows exactly 12h apart cover Americas + Asia prime time and
 * match the "1h available, 12h cooldown" product requirement.
 */

const { cache, getRedis } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Escribe sin caducidad. cache.set aplica siempre un TTL (REDIS_TTL, 300 s por
 * defecto), y esto es configuracion, no cache: si expira, la puerta se cierra
 * sola y nadie se entera. Se serializa igual que cache.set para que cache.get
 * siga leyendo estas claves sin cambios.
 */
async function setPersistente(key, value) {
  await getRedis().set(key, JSON.stringify(value));
}

const KEY_ENABLED = 'mainstage:gate:enabled';
const KEY_WINDOWS = 'mainstage:gate:windows';

const DEFAULT_WINDOWS = [
  { start_utc: '03:00', duration_min: 60 },
  { start_utc: '15:00', duration_min: 60 },
];

async function isEnabled() {
  try {
    const v = await cache.get(KEY_ENABLED);
    return String(v || '0') === '1';
  } catch (err) {
    logger.warn('[mainStageGate] isEnabled read failed', { err: err.message });
    return false; // fail-open — never accidentally deny access on Redis outage
  }
}

async function setEnabled(enabled) {
  await setPersistente(KEY_ENABLED, enabled ? '1' : '0');
}

async function getWindows() {
  try {
    const raw = await cache.get(KEY_WINDOWS);
    if (!raw) return DEFAULT_WINDOWS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WINDOWS;
    return parsed.filter(w =>
      w && typeof w.start_utc === 'string' && /^\d{2}:\d{2}$/.test(w.start_utc)
        && Number.isFinite(w.duration_min) && w.duration_min > 0 && w.duration_min <= 24 * 60
    );
  } catch (err) {
    logger.warn('[mainStageGate] getWindows parse failed, using defaults', { err: err.message });
    return DEFAULT_WINDOWS;
  }
}

async function setWindows(windows) {
  if (!Array.isArray(windows)) throw new Error('windows must be array');
  await setPersistente(KEY_WINDOWS, JSON.stringify(windows));
}

// Turn "HH:MM" into today's UTC epoch ms.
function utcAt(hhmm, refDate) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(refDate);
  d.setUTCHours(h, m, 0, 0);
  return d.getTime();
}

/**
 * Given the configured windows, computes the state right now.
 * Returns { isOpen, currentCloseAt, nextOpenAt } where the timestamps are
 * epoch ms (UTC). currentCloseAt is null when closed; nextOpenAt is null
 * when open (compute from currentCloseAt + windows if needed).
 */
async function getState() {
  const enabled = await isEnabled();
  const windows = await getWindows();
  const now = Date.now();

  // Materialize windows for today AND tomorrow so we can look ahead across
  // midnight boundaries.
  const today = new Date(now);
  const tomorrow = new Date(now + 24 * 60 * 60 * 1000);
  const materialized = [];
  for (const w of windows) {
    for (const day of [today, tomorrow]) {
      const openAt = utcAt(w.start_utc, day);
      const closeAt = openAt + w.duration_min * 60 * 1000;
      materialized.push({ openAt, closeAt });
    }
  }
  materialized.sort((a, b) => a.openAt - b.openAt);

  // Find current window (openAt <= now < closeAt)
  const current = materialized.find(m => m.openAt <= now && now < m.closeAt);
  if (current) {
    const next = materialized.find(m => m.openAt > now);
    return {
      enabled, windows,
      isOpen: true,
      currentCloseAt: current.closeAt,
      nextOpenAt: next ? next.openAt : null,
    };
  }

  const next = materialized.find(m => m.openAt > now);
  return {
    enabled, windows,
    isOpen: false,
    currentCloseAt: null,
    nextOpenAt: next ? next.openAt : null,
  };
}

/**
 * Returns true iff a free-tier user is allowed to watch right now.
 * When the gate is disabled, free-tier users are blocked (no change from
 * current behavior). When enabled + inside a window, they're allowed.
 */
async function isOpenForFreeTier() {
  const state = await getState();
  return state.enabled && state.isOpen;
}

/**
 * Compute the LiveKit token TTL for a free-tier viewer — clamps to the
 * remaining window duration so a token issued at :59 doesn't leak 2h of
 * access past the window close.
 * Falls back to 5 min if we can't compute (should never happen).
 */
async function freeViewerTokenTtlSec() {
  const state = await getState();
  if (!state.isOpen || !state.currentCloseAt) return 300;
  const remainingMs = state.currentCloseAt - Date.now();
  if (remainingMs <= 0) return 60; // last-second grace
  return Math.min(3600, Math.floor(remainingMs / 1000));
}

module.exports = {
  isEnabled,
  setEnabled,
  getWindows,
  setWindows,
  getState,
  isOpenForFreeTier,
  freeViewerTokenTtlSec,
  DEFAULT_WINDOWS,
};
