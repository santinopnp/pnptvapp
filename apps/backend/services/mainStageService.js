'use strict';

/**
 * Main Stage Service
 *
 * Redis-backed state machine for the 24/7 Main Stage LiveKit room.
 * Manages mode (cinema / spotlight / grid3x3), media playback state, cammer
 * queue, and a distributed spotlight-rotation lock so multiple bot replicas
 * do not each run their own rotation timer simultaneously.
 *
 * Spotlight rotation is creator-priority: creators/performers rotate through
 * first (5-min hold each) with regulars filling the gaps when no creators
 * are on stage (90s hold each). Cinema↔Spotlight auto-flips: (1) Cinema →
 * Spotlight the moment a creator arrives when ≥2 humans are on stage,
 * (2) Spotlight → Cinema when human cammer count drops to 1.
 *
 * Socket.IO instance is injected via setIo() at boot time (called from
 * socketHandlers.js) to avoid a circular require with bot.js.
 */

const crypto      = require('crypto');
const axios       = require('axios');
const logger      = require('../utils/logger');
const { getRedis } = require('../config/redis');
const { getPool }  = require('../config/postgres');
const livekit     = require('./livekitService');

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOM_NAME            = 'main-stage-prime';
// Spotlight rotation cadence — differs by who's on stage:
//   - Regular cammer holds the spotlight for 90s
//   - Creator/performer holds the spotlight for 5 min
// The tick fires every 90s (the shorter cadence) but only advances when the
// per-cammer TTL stored in mainstage:spotlight:nextAt has elapsed.
const ROTATE_INTERVAL_REGULAR_MS  = 90_000;      // 90s for members
const ROTATE_INTERVAL_CREATOR_MS  = 5 * 60_000;  // 5 min for creators/performers
const ROTATE_INTERVAL_MS          = ROTATE_INTERVAL_REGULAR_MS; // legacy alias (used by stats + module export)
const AUTO_MEDIA_INTERVAL_MS = 10 * 60_000; // 10 min between auto-picked Prime Videos
const MEDIA_BOT_IDENTITY   = 'mainstage-media';
const LOCK_KEY             = 'mainstage:rotator:lock';
const LOCK_TTL_S           = 60;      // lock expires in 60s
const LOCK_RENEW_MS        = 20_000;  // renew every 20s
const MAX_CAMMERS          = 100;
const VALID_MODES          = new Set(['spotlight', 'cinema', 'grid3x3']);
// Legacy mode values that must be migrated once at boot. Any live Redis state
// still using these gets rewritten to the new equivalent on startRotation().
const LEGACY_MODE_MIGRATION = { theater: 'cinema', karaoke: 'cinema', equal: 'grid3x3' };
const VALID_MEDIA_KINDS    = new Set(['video', 'music', 'off']);

// mainstage:media is stored as a Redis Hash (HSET/HGETALL) so individual fields
// can be updated atomically without a read-modify-write race. String fields are
// stored as their JSON-stringified form so booleans, nulls, and numbers round-trip
// correctly when read back via HGETALL (which returns everything as strings).
const MEDIA_KEY            = 'mainstage:media';
const MODE_KEY             = 'mainstage:mode';
// Per-identity role cache — 'creator' | 'regular'. Populated on cammer join,
// pruned on leave. Read on every rotation tick so we can order the queue by
// creator-priority + set the correct spotlight interval without hitting PG.
const ROLES_KEY            = 'mainstage:cammer:roles';

// Default media state — merged with whatever is stored in the Hash.
const MEDIA_DEFAULTS = {
  kind:        'off',
  src:         null,
  title:       null,
  playing:     false,
  volume:      70,
  startedAt:   null,
  elapsedMs:   0,
  adminLocked: false,
  modeLocked:  false,
};

// Playlist sorted set: score = last_played ms timestamp (0 = never played).
// Members with lowest scores are picked first — fair round-robin across all videos.
const PLAYLIST_KEY     = 'mainstage:playlist';
// Skip-vote sets expire in 30 min. Key encodes the current src so votes
// automatically become stale when the video changes without explicit cleanup.
const SKIP_VOTES_TTL_S = 1800;

// Pinned admin announcement — one JSON blob late-joiners fetch on connect.
const PIN_KEY          = 'mainstage:pinned';
const PIN_MAX_LEN      = 500;
const PIN_MAX_TTL_S    = 7 * 24 * 3600;

// Directus endpoints for background Prime Video auto-rotation
const DIRECTUS_INTERNAL_URL = (process.env.DIRECTUS_INTERNAL_URL || 'http://directus:8055').replace(/\/$/, '');
const DIRECTUS_PUBLIC_URL   = (process.env.DIRECTUS_PUBLIC_URL   || 'https://cms.pnptv.app').replace(/\/$/, '');
// 24h TTL so an idle room doesn't silently reset to `mode: 'cinema'` after 5 min.
// Every write refreshes the TTL; the rotation tick effectively heartbeats it too.
const STATE_CACHE_TTL_S    = 86_400;

// PNPtv! Mode — spotlight-lock format for founders (Santino/Lex/Amadeus) and
// creators granted via users.pnptv_mode_expires_at. When engaged, mode is
// forced to 'spotlight' pinned on the holder + admin overrides throw 423.
const PNPTV_MODE_HOLDER_KEY      = 'mainstage:pnptvMode:holder';
const PNPTV_MODE_SESSION_ID_KEY  = 'mainstage:pnptvMode:sessionId';
const PNPTV_MODE_PREV_MODE_KEY   = 'mainstage:pnptvMode:prevMode';
const PNPTV_MODE_GRACE_UNTIL_KEY = 'mainstage:pnptvMode:graceUntil';
const PNPTV_MODE_STARTED_AT_KEY  = 'mainstage:pnptvMode:startedAt';
const PNPTV_MODE_GRACE_TICK_MS   = 15_000;
const { PNPTV_MODE_GRACE_SECONDS } = require('../config/monetizationConfig');
// Feature flag — default ON. Set PNPTV_MODE_ENABLED=false in .env to disable
// without rolling back code (kills detection + lock engagement completely).
const PNPTV_MODE_ENABLED = process.env.PNPTV_MODE_ENABLED !== 'false';

// ── Module-level io reference (injected via setIo) ───────────────────────────

let _io = null;

/**
 * Inject the Socket.IO server instance.
 * Called once at boot by socketHandlers.js after io is created.
 *
 * We also fire the legacy-mode migration here so EVERY replica prunes stale
 * theater/karaoke/equal values from Redis at startup — not just the one that
 * later wins the rotation lock. Otherwise a non-lock replica could serve a
 * mode the frontend can't render.
 */
function setIo(io) {
  _io = io;
  migrateLegacyModeIfNeeded().catch((err) => {
    logger.warn('[MainStage] setIo: legacy mode migration failed (non-fatal)', { error: err.message });
  });
}

/**
 * MS-CRIT-01: Force all sockets belonging to a given userId to leave the
 * 'mainstage' Socket.IO room immediately after a kick action.
 * This prevents the kicked user from continuing to receive or send chat/reactions
 * until their session fully reconnects (at which point the kicked-set key blocks re-entry).
 *
 * @param {string|number} userId
 */
async function kickFromMainStageRoom(userId) {
  if (!_io) return;
  try {
    const sockets = await _io.in('mainstage').fetchSockets();
    for (const sock of sockets) {
      if (sock.data && sock.data.user && String(sock.data.user.id) === String(userId)) {
        sock.emit('mainstage:error', {
          code: 'MAIN_STAGE_KICKED',
          message: 'You have been removed from Main Stage.',
        });
        sock.leave('mainstage');
      }
    }
  } catch (err) {
    // Non-fatal: the kicked-set Redis key still blocks the next reconnect.
    const log = require('../utils/logger');
    log.warn('[MainStage] kickFromMainStageRoom: failed to iterate sockets', { userId, error: err.message });
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function clampVolume(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

// Debounced state broadcast. Admin burst clicks (e.g. rapid volume slider
// tweaks) used to fire one broadcast per mutation. This coalesces anything
// within 200ms into a single emit to the whole mainstage room.
let _emitStateTimer = null;
async function emitState() {
  if (!_io) return;
  if (_emitStateTimer) return;
  _emitStateTimer = setTimeout(async () => {
    _emitStateTimer = null;
    try {
      const snapshot = await getState();
      _io.to('mainstage').emit('mainstage:state', snapshot);
    } catch (err) {
      logger.warn('[MainStage] emitState failed', { error: err.message });
    }
  }, 200);
}

// Viewer-count broadcast. Already-debounced via emitState above, but kept
// as a named entry so socketHandlers can stay semantic.
function notifyViewersChanged() {
  emitState().catch(() => {});
}

// ── Media hash helpers ────────────────────────────────────────────────────────

/**
 * Reconstruct the media JSON object the frontend expects from a Redis HGETALL.
 * Each field is stored JSON-stringified so booleans/nulls/numbers round-trip
 * correctly. Missing fields fall back to MEDIA_DEFAULTS.
 */
function decodeMediaHash(hash) {
  const out = { ...MEDIA_DEFAULTS };
  if (!hash || typeof hash !== 'object') return out;
  for (const [k, v] of Object.entries(hash)) {
    if (v === undefined) continue;
    try {
      out[k] = JSON.parse(v);
    } catch (_) {
      out[k] = v; // raw string fallback (defensive — shouldn't happen)
    }
  }
  return out;
}

/**
 * Encode a JS value as a JSON string suitable for HSET. Returns null for
 * undefined so the caller can skip writing it.
 */
function encodeMediaValue(v) {
  if (v === undefined) return null;
  return JSON.stringify(v);
}

/**
 * Build an HSET arg pair-array from an object of patches. Undefined values
 * are skipped. Returns null if no fields to write.
 */
function buildHsetArgs(patch) {
  const args = [];
  for (const [k, v] of Object.entries(patch)) {
    const enc = encodeMediaValue(v);
    if (enc !== null) args.push(k, enc);
  }
  return args.length ? args : null;
}

/**
 * One-shot legacy migration. If mainstage:media exists as a STRING (old JSON
 * blob layout), parse it, DEL, then HSET its fields. Idempotent: subsequent
 * runs see a hash and return immediately. Safe to call on every boot.
 */
async function migrateMediaKeyIfNeeded() {
  const redis = getRedis();
  let type;
  try {
    type = await redis.type(MEDIA_KEY);
  } catch (err) {
    logger.warn('[MainStage] migrateMediaKeyIfNeeded: TYPE failed', { error: err.message });
    return;
  }
  if (type !== 'string') return; // already hash or missing

  let raw;
  try {
    raw = await redis.get(MEDIA_KEY);
  } catch (_) {
    return;
  }
  let parsed = {};
  if (raw) { try { parsed = JSON.parse(raw); } catch (_) {} }

  // DEL + HSET in a MULTI so a concurrent setter can't observe an empty key.
  const args = buildHsetArgs({ ...MEDIA_DEFAULTS, ...parsed });
  try {
    const multi = redis.multi();
    multi.del(MEDIA_KEY);
    if (args) multi.hset(MEDIA_KEY, ...args);
    multi.expire(MEDIA_KEY, STATE_CACHE_TTL_S);
    await multi.exec();
    logger.info('[MainStage] migrated mainstage:media from string to hash', { fields: args ? args.length / 2 : 0 });
  } catch (err) {
    logger.warn('[MainStage] migrateMediaKeyIfNeeded: migration failed', { error: err.message });
  }
}

/**
 * Read the media state — handles both new hash layout and (defensively) the
 * legacy string layout, in case migration hasn't run yet on this replica.
 */
async function readMedia() {
  const redis = getRedis();
  let type;
  try {
    type = await redis.type(MEDIA_KEY);
  } catch (_) {
    return { ...MEDIA_DEFAULTS };
  }
  if (type === 'hash') {
    const hash = await redis.hgetall(MEDIA_KEY);
    return decodeMediaHash(hash);
  }
  if (type === 'string') {
    // Legacy path — parse and lazily kick off migration.
    const raw = await redis.get(MEDIA_KEY);
    let parsed = { ...MEDIA_DEFAULTS };
    if (raw) { try { parsed = { ...MEDIA_DEFAULTS, ...JSON.parse(raw) }; } catch (_) {} }
    migrateMediaKeyIfNeeded().catch(() => {});
    return parsed;
  }
  return { ...MEDIA_DEFAULTS };
}

/**
 * Write a partial media patch atomically — uses HSET with multiple fields in
 * a single command so concurrent writers each apply their own fields without
 * losing other writers' fields (no read-modify-write race).
 * Skips undefined values.
 */
async function patchMediaHash(patch) {
  const redis = getRedis();
  const args = buildHsetArgs(patch);
  if (!args) return;
  await redis.hset(MEDIA_KEY, ...args);
  await redis.expire(MEDIA_KEY, STATE_CACHE_TTL_S);
}

// ── State accessors ───────────────────────────────────────────────────────────

/**
 * Returns the full state snapshot.
 * @returns {Promise<{
 *   mode: string,
 *   spotlight: { cammer: string|null, nextAt: number|null, queue: string[] },
 *   media: { kind: string, src: string|null, playing: boolean, volume: number, startedAt: number|null },
 *   cams: { volume: number },
 *   counts: { participants: number, guests: number, cammers: number, viewers: number }
 * }>}
 */
async function getState() {
  const redis = getRedis();

  const [
    mode,
    spotlightCammer,
    spotlightNextAt,
    queue,
    media,
    camsVolRaw,
    autoplayRaw,
    pnptvHolder,
    pnptvSessionId,
    pnptvStartedAt,
    pnptvGraceUntil,
  ] = await Promise.all([
    redis.get('mainstage:mode'),
    redis.get('mainstage:spotlight:cammer'),
    redis.get('mainstage:spotlight:nextAt'),
    redis.lrange('mainstage:spotlight:queue', 0, -1),
    readMedia(),
    redis.get('mainstage:cams:volume'),
    redis.get('mainstage:autoplay:enabled'),
    redis.get(PNPTV_MODE_HOLDER_KEY),
    redis.get(PNPTV_MODE_SESSION_ID_KEY),
    redis.get(PNPTV_MODE_STARTED_AT_KEY),
    redis.get(PNPTV_MODE_GRACE_UNTIL_KEY),
  ]);

  return {
    mode:      mode || 'cinema',
    spotlight: {
      cammer: spotlightCammer || null,
      nextAt: spotlightNextAt ? parseInt(spotlightNextAt, 10) : null,
      queue,
    },
    media,
    cams: {
      volume: camsVolRaw !== null ? parseInt(camsVolRaw, 10) : 80,
    },
    // Server-side music/video auto-rotation. Defaults to enabled (legacy behavior).
    // When false, autoRotateMedia is a no-op — admin must pick media manually.
    autoplay_enabled: autoplayRaw === null ? true : autoplayRaw !== '0',
    pnptvMode: {
      locked:     !!pnptvHolder,
      holder:     pnptvHolder || null,
      sessionId:  pnptvSessionId || null,
      startedAt:  pnptvStartedAt ? parseInt(pnptvStartedAt, 10) : null,
      graceUntil: pnptvGraceUntil ? parseInt(pnptvGraceUntil, 10) : null,
    },
    counts: {
      participants: queue.length,
      guests: queue.filter((identity) => String(identity).startsWith('guest_')).length,
      cammers: queue.length,
      viewers: 0,
    },
  };
}

/**
 * Legacy no-op kept for compatibility while the room model has no viewer role.
 */
function countViewers(cammerCount) {
  return 0;
}

// ── Creator/performer role cache ─────────────────────────────────────────────

// A queue identity counts as "human cammer" only if it isn't the media bot or
// an anon/guest/viewer session. Only these can be creators/performers.
function isHumanCammerIdentity(identity) {
  const id = String(identity || '');
  if (!id) return false;
  if (id === MEDIA_BOT_IDENTITY) return false;
  if (id.startsWith('guest_') || id.startsWith('viewer_')) return false;
  return true;
}

/**
 * Look up whether a platform user ID has creator or performer role.
 * Returns 'creator' | 'regular'. Non-human identities always return 'regular'.
 */
async function fetchIdentityRole(identity) {
  if (!isHumanCammerIdentity(identity)) return 'regular';
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT 1
         FROM users u
         LEFT JOIN performers p
           ON p.user_id::text = u.id::text AND p.status = 'active'
        WHERE u.id::text = $1
          AND (u.role = 'creator' OR p.user_id IS NOT NULL)
        LIMIT 1`,
      [String(identity)]
    );
    return rows.length > 0 ? 'creator' : 'regular';
  } catch (err) {
    logger.warn('[MainStage] fetchIdentityRole failed', { identity, error: err.message });
    return 'regular';
  }
}

async function cacheIdentityRole(identity, role) {
  if (!isHumanCammerIdentity(identity)) return;
  const redis = getRedis();
  await redis.hset(ROLES_KEY, String(identity), role === 'creator' ? 'creator' : 'regular');
  await redis.expire(ROLES_KEY, STATE_CACHE_TTL_S);
}

async function forgetIdentityRole(identity) {
  const redis = getRedis();
  await redis.hdel(ROLES_KEY, String(identity)).catch(() => {});
}

async function readAllCammerRoles() {
  const redis = getRedis();
  const hash = await redis.hgetall(ROLES_KEY).catch(() => ({}));
  return hash || {};
}

async function countCreatorsInQueue() {
  const redis = getRedis();
  const queue = await redis.lrange('mainstage:spotlight:queue', 0, -1);
  const roles = await readAllCammerRoles();
  let n = 0;
  for (const id of queue) {
    if (id === MEDIA_BOT_IDENTITY) continue;
    if (roles[id] === 'creator') n += 1;
  }
  return n;
}

/**
 * Count human cammers in the queue (excludes media bot).
 */
async function countHumanCammers() {
  const redis = getRedis();
  const queue = await redis.lrange('mainstage:spotlight:queue', 0, -1);
  return queue.filter((id) => id !== MEDIA_BOT_IDENTITY).length;
}

/**
 * Evaluate the two auto-flip rules and apply if needed. Runs after every
 * add/remove of a cammer. Rules:
 *
 *   1. Cinema → Spotlight when a NEW creator arrives (creator count 0 → 1)
 *      AND there are ≥2 human cammers total. Fires on the edge only, so
 *      admin flipping back to Cinema is respected until all creators leave
 *      and a fresh one arrives.
 *
 *   2. Spotlight → Cinema when human cammer count drops to ≤1. Otherwise
 *      spotlight has nothing to rotate through.
 *
 * @param {'add'|'remove'} event   Which cammer-list mutation triggered this
 * @param {number} creatorsBefore  Creator count before the mutation
 * @param {number} creatorsAfter   Creator count after the mutation
 * @param {number} humansAfter     Human cammer count after the mutation
 */
// 5-second fence key — atomic `SET NX EX` guarantees only one concurrent
// caller can trigger a given auto-flip transition within the window. Prevents
// e.g. two simultaneous creator joins from both firing cinema→spotlight and
// re-flipping against an admin who manually returned to Cinema mid-race.
const AUTOFLIP_FENCE_TTL_S = 5;
const FENCE_KEY_CS = 'mainstage:autoflip:cinema-spotlight';
const FENCE_KEY_SC = 'mainstage:autoflip:spotlight-cinema';

async function acquireFlipFence(key) {
  const redis = getRedis();
  const result = await redis.set(key, '1', 'NX', 'EX', AUTOFLIP_FENCE_TTL_S).catch(() => null);
  return result === 'OK';
}

async function maybeAutoFlipMode(event, creatorsBefore, creatorsAfter, humansAfter) {
  const redis = getRedis();
  // PNPtv! Mode owns the layout — auto-flip must not fight the lock.
  if (await redis.get(PNPTV_MODE_HOLDER_KEY)) return;
  const currentMode = await redis.get(MODE_KEY);

  // Rule 1 — creator arrival edge
  if (event === 'add'
      && currentMode === 'cinema'
      && creatorsBefore === 0
      && creatorsAfter >= 1
      && humansAfter >= 2) {
    if (!(await acquireFlipFence(FENCE_KEY_CS))) {
      logger.debug('[MainStage] auto-flip cinema→spotlight fenced (recent trigger)');
      return;
    }
    logger.info('[MainStage] auto-flip cinema → spotlight (creator online)', { creatorsAfter, humansAfter });
    await setMode('spotlight');
    return;
  }

  // Rule 2 — spotlight starves with 1 cammer
  if (event === 'remove'
      && currentMode === 'spotlight'
      && humansAfter <= 1) {
    if (!(await acquireFlipFence(FENCE_KEY_SC))) {
      logger.debug('[MainStage] auto-flip spotlight→cinema fenced (recent trigger)');
      return;
    }
    logger.info('[MainStage] auto-flip spotlight → cinema (cammer count dropped)', { humansAfter });
    await setMode('cinema');
    return;
  }
}

// ── PNPtv! Mode — spotlight-lock streaming format ────────────────────────────
// When a user with users.pnptv_mode_expires_at > NOW() joins the Main Stage
// as a cammer, mode is forced to 'spotlight' pinned on them + admin overrides
// (setMode/setSpotlight/shuffle) throw 423 PNPTV_MODE_LOCKED until they leave.
// A grace period (PNPTV_MODE_GRACE_SECONDS) absorbs LiveKit reconnect blips.

/**
 * Is the given identity currently granted PNPtv! Mode?
 * Non-human identities (media bot, guests, viewers) always false.
 */
async function fetchPnptvModeGrant(identity) {
  if (!PNPTV_MODE_ENABLED) return false;
  if (!isHumanCammerIdentity(identity)) return false;
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT 1 FROM users
        WHERE id::text = $1
          AND pnptv_mode_expires_at IS NOT NULL
          AND pnptv_mode_expires_at > NOW()
        LIMIT 1`,
      [String(identity)]
    );
    return rows.length > 0;
  } catch (err) {
    logger.warn('[MainStage] fetchPnptvModeGrant failed', { identity, error: err.message });
    return false;
  }
}

async function isPnptvModeLocked() {
  const redis = getRedis();
  const holder = await redis.get(PNPTV_MODE_HOLDER_KEY);
  return !!holder;
}

async function getPnptvModeStatus() {
  const redis = getRedis();
  const [holder, sessionId, startedAt, graceUntil] = await Promise.all([
    redis.get(PNPTV_MODE_HOLDER_KEY),
    redis.get(PNPTV_MODE_SESSION_ID_KEY),
    redis.get(PNPTV_MODE_STARTED_AT_KEY),
    redis.get(PNPTV_MODE_GRACE_UNTIL_KEY),
  ]);
  return {
    locked:     !!holder,
    holder:     holder || null,
    sessionId:  sessionId || null,
    startedAt:  startedAt ? parseInt(startedAt, 10) : null,
    graceUntil: graceUntil ? parseInt(graceUntil, 10) : null,
  };
}

async function createPnptvModeSession(holderUserId) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO pnptv_mode_sessions (holder_user_id) VALUES ($1) RETURNING id`,
      [String(holderUserId)]
    );
    return rows[0] || null;
  } catch (err) {
    // uq_pnptv_mode_sessions_active_per_holder — a prior lock didn't close
    // its session row (bot crash mid-lock). Reuse the open session's id.
    if (err.code === '23505') {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id FROM pnptv_mode_sessions
            WHERE holder_user_id = $1 AND ended_at IS NULL
            ORDER BY started_at DESC LIMIT 1`,
          [String(holderUserId)]
        );
        return rows[0] || null;
      } catch (_) { return null; }
    }
    logger.warn('[MainStage] createPnptvModeSession failed', { holderUserId, error: err.message });
    return null;
  }
}

async function closePnptvModeSession(sessionId) {
  if (!sessionId) return;
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE pnptv_mode_sessions SET ended_at = NOW()
        WHERE id = $1 AND ended_at IS NULL`,
      [sessionId]
    );
  } catch (err) {
    logger.warn('[MainStage] closePnptvModeSession failed', { sessionId, error: err.message });
  }
}

/**
 * Engage the lock for a holder that just joined the cammer queue.
 * Returns { engaged, reconnected, alreadyLocked, sessionId }.
 * First-come wins: if another founder is already locked, this is a no-op.
 * Same-holder call clears any active grace period (reconnection path).
 */
async function engagePnptvModeLock(identity) {
  const redis = getRedis();
  const idStr = String(identity);

  const currentHolder = await redis.get(PNPTV_MODE_HOLDER_KEY);
  if (currentHolder === idStr) {
    // Reconnect during grace — clear grace, keep lock intact.
    await redis.del(PNPTV_MODE_GRACE_UNTIL_KEY);
    logger.info('[MainStage] PNPtv! Mode grace cleared — holder reconnected', { holder: idStr });
    if (_io) _io.to('mainstage').emit('mainstage:pnptvMode:reconnected', { holder: idStr });
    return { engaged: false, reconnected: true };
  }
  if (currentHolder) {
    logger.info('[MainStage] PNPtv! Mode already locked by another founder — skipping', {
      currentHolder, candidate: idStr,
    });
    return { engaged: false, alreadyLocked: true };
  }

  const prevMode = (await redis.get(MODE_KEY)) || 'cinema';
  const sessionRow = await createPnptvModeSession(idStr);
  const startedAt = Date.now();

  await Promise.all([
    redis.set(PNPTV_MODE_HOLDER_KEY, idStr, 'EX', STATE_CACHE_TTL_S),
    redis.set(PNPTV_MODE_SESSION_ID_KEY, sessionRow?.id || '', 'EX', STATE_CACHE_TTL_S),
    redis.set(PNPTV_MODE_STARTED_AT_KEY, String(startedAt), 'EX', STATE_CACHE_TTL_S),
    redis.set(PNPTV_MODE_PREV_MODE_KEY, prevMode, 'EX', STATE_CACHE_TTL_S),
    redis.del(PNPTV_MODE_GRACE_UNTIL_KEY),
  ]);

  // Direct redis writes — bypasses setMode/setSpotlight guards we install below.
  // Long-hold nextAt so the rotation tick won't try to advance the spotlight.
  await redis.set(MODE_KEY, 'spotlight', 'EX', STATE_CACHE_TTL_S);
  await redis.set('mainstage:spotlight:cammer', idStr, 'EX', STATE_CACHE_TTL_S);
  await redis.set('mainstage:spotlight:nextAt',
    String(startedAt + STATE_CACHE_TTL_S * 1000),
    'EX', STATE_CACHE_TTL_S);

  logger.info('[MainStage] PNPtv! Mode lock engaged', {
    holder: idStr, sessionId: sessionRow?.id, prevMode,
  });

  if (_io) _io.to('mainstage').emit('mainstage:pnptvMode:locked', {
    holder: idStr, sessionId: sessionRow?.id, startedAt,
  });

  await emitState();
  return { engaged: true, sessionId: sessionRow?.id };
}

/**
 * Start the grace timer for a holder that just left the cammer queue.
 * No-op if the identity isn't the current holder. Grace tick + rotation
 * tick both call checkPnptvModeGraceExpired to release the lock when it lapses.
 */
async function markPnptvModeGrace(identity) {
  const redis = getRedis();
  const currentHolder = await redis.get(PNPTV_MODE_HOLDER_KEY);
  if (currentHolder !== String(identity)) return;
  const graceUntil = Date.now() + PNPTV_MODE_GRACE_SECONDS * 1000;
  await redis.set(PNPTV_MODE_GRACE_UNTIL_KEY, String(graceUntil),
    'EX', PNPTV_MODE_GRACE_SECONDS + 30);
  logger.info('[MainStage] PNPtv! Mode grace started', {
    holder: identity, graceUntil, graceSeconds: PNPTV_MODE_GRACE_SECONDS,
  });
  if (_io) _io.to('mainstage').emit('mainstage:pnptvMode:grace',
    { holder: String(identity), graceUntil });
}

/**
 * Called on every rotation + grace tick. Idempotent — survives bot restarts.
 * Releases the lock only when: grace has lapsed AND holder is truly gone
 * from the cammer queue.
 */
async function checkPnptvModeGraceExpired() {
  const redis = getRedis();
  const [holder, graceUntilRaw] = await Promise.all([
    redis.get(PNPTV_MODE_HOLDER_KEY),
    redis.get(PNPTV_MODE_GRACE_UNTIL_KEY),
  ]);
  if (!holder) return;
  if (!graceUntilRaw) return;
  const graceUntil = parseInt(graceUntilRaw, 10);
  if (Date.now() < graceUntil) return;
  const queue = await redis.lrange('mainstage:spotlight:queue', 0, -1);
  if (queue.includes(holder)) {
    // Holder came back but grace key wasn't cleared for some reason — clean up.
    await redis.del(PNPTV_MODE_GRACE_UNTIL_KEY);
    logger.info('[MainStage] PNPtv! Mode grace cleared post-hoc — holder in queue', { holder });
    return;
  }
  await disengagePnptvModeLock('grace_expired');
}

async function disengagePnptvModeLock(reason = 'unknown') {
  const redis = getRedis();
  const [holder, sessionId, prevMode] = await Promise.all([
    redis.get(PNPTV_MODE_HOLDER_KEY),
    redis.get(PNPTV_MODE_SESSION_ID_KEY),
    redis.get(PNPTV_MODE_PREV_MODE_KEY),
  ]);
  if (!holder) return;

  await Promise.all([
    redis.del(PNPTV_MODE_HOLDER_KEY),
    redis.del(PNPTV_MODE_SESSION_ID_KEY),
    redis.del(PNPTV_MODE_STARTED_AT_KEY),
    redis.del(PNPTV_MODE_PREV_MODE_KEY),
    redis.del(PNPTV_MODE_GRACE_UNTIL_KEY),
  ]);

  await closePnptvModeSession(sessionId);

  const restoreMode = VALID_MODES.has(prevMode) ? prevMode : 'cinema';
  await redis.set(MODE_KEY, restoreMode, 'EX', STATE_CACHE_TTL_S);

  // Release the pinned spotlight so normal rotation resumes on next tick.
  const currentSpot = await redis.get('mainstage:spotlight:cammer');
  if (currentSpot === holder) {
    await redis.del('mainstage:spotlight:cammer');
    await redis.del('mainstage:spotlight:nextAt');
  }

  logger.info('[MainStage] PNPtv! Mode lock released', {
    holder, sessionId, restoreMode, reason,
  });

  if (_io) _io.to('mainstage').emit('mainstage:pnptvMode:unlocked',
    { restoreMode, reason });

  await emitState();
}

// Sentinel error the route layer converts to HTTP 423.
function pnptvModeLockedError(op) {
  const err = new Error(`Main Stage is in PNPtv! Mode — ${op} is locked`);
  err.code = 'PNPTV_MODE_LOCKED';
  err.status = 423;
  return err;
}

// ── Mode ──────────────────────────────────────────────────────────────────────

async function setMode(mode) {
  if (!VALID_MODES.has(mode)) throw new Error(`Invalid mode: ${mode}`);
  if (await isPnptvModeLocked()) throw pnptvModeLockedError('mode');
  const redis = getRedis();
  await redis.set('mainstage:mode', mode, 'EX', STATE_CACHE_TTL_S);
  logger.info('[MainStage] mode set', { mode });
  await emitState();
}

/**
 * One-shot: rewrite Redis state that still holds a legacy mode value
 * (theater/karaoke/equal) to its new equivalent. Idempotent — a no-op on
 * subsequent calls or once the key holds a valid new-enum value.
 * Called from startRotation() on boot.
 */
async function migrateLegacyModeIfNeeded() {
  const redis = getRedis();
  const raw = await redis.get(MODE_KEY).catch(() => null);
  if (!raw) return;
  const target = LEGACY_MODE_MIGRATION[raw];
  if (!target) return;
  await redis.set(MODE_KEY, target, 'EX', STATE_CACHE_TTL_S);
  logger.info('[MainStage] migrated legacy mode', { from: raw, to: target });
}

// ── Media ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   kind?: string,
 *   src?: string,
 *   title?: string,
 *   playing?: boolean,
 *   volume?: number,
 *   adminLocked?: boolean,   // explicit admin lock/unlock of auto-rotation
 *   _fromAutoRotate?: boolean // internal: true when called by autoRotateMedia
 * }} opts
 */
async function setMedia({ kind, src, title, playing, volume, adminLocked, _fromAutoRotate } = {}) {
  // Read-modify-write only for fields whose new value depends on the current
  // value (playing transitions, default-title reset). Independent fields
  // (kind, src, volume, adminLocked) are written via patchMediaHash so two
  // concurrent volume-only setters don't clobber each other.
  const current = await readMedia();

  const patch = {};

  if (kind !== undefined) {
    if (!VALID_MEDIA_KINDS.has(kind)) throw new Error(`Invalid media kind: ${kind}`);
    patch.kind = kind;
    // When the kind changes (or admin clears with kind='off'), reset the
    // title so stale metadata doesn't linger from the previous pick.
    if (title === undefined) patch.title = null;
  }
  if (src    !== undefined) patch.src    = src || null;
  if (title  !== undefined) patch.title  = title || null;
  if (volume !== undefined) patch.volume = clampVolume(volume);

  // Admin-lock semantics: any human call to setMedia (kind/src change) locks
  // auto-rotation so admin intent (including "silence") is respected. Only
  // autoRotateMedia itself bypasses the lock via _fromAutoRotate. An admin
  // can explicitly unlock by passing { adminLocked: false }.
  if (adminLocked !== undefined) {
    patch.adminLocked = Boolean(adminLocked);
  } else if (!_fromAutoRotate && (kind !== undefined || src !== undefined)) {
    patch.adminLocked = true;
  }

  if (playing !== undefined) {
    const wasPlaying = Boolean(current.playing);
    const nextPlaying = Boolean(playing);
    patch.playing = nextPlaying;
    if (nextPlaying && !wasPlaying) {
      // Resuming: shift startedAt back by accumulated elapsed time so
      // clients can seek to the correct position mid-video.
      patch.startedAt = Date.now() - (current.elapsedMs || 0);
      patch.elapsedMs = 0;
    } else if (!nextPlaying && wasPlaying) {
      // Pausing: record how far we got so resume can restore position.
      patch.elapsedMs = current.startedAt ? Date.now() - current.startedAt : (current.elapsedMs || 0);
      patch.startedAt = null;
    }
  }
  // Source change resets position tracking
  if (src !== undefined) {
    patch.startedAt = null;
    patch.elapsedMs = 0;
  }

  await patchMediaHash(patch);
  logger.info('[MainStage] media updated', {
    kind: patch.kind !== undefined ? patch.kind : current.kind,
    playing: patch.playing !== undefined ? patch.playing : current.playing,
  });
  await emitState();
}

async function setMediaVolume(v) {
  // Volume is an independent field — write only that key so we don't clobber
  // a concurrent kind/src/playing update from another admin.
  await patchMediaHash({ volume: clampVolume(v) });
  await emitState();
}

async function setCamsVolume(v) {
  const redis = getRedis();
  await redis.set('mainstage:cams:volume', clampVolume(v), 'EX', STATE_CACHE_TTL_S);
  await emitState();
}

// ── Cammer queue ──────────────────────────────────────────────────────────────

// Atomic add-if-under-cap. Returns:
//   'added'      - identity was pushed to the queue
//   'duplicate'  - identity already present (idempotent success)
//   'full'       - queue at cap, not added
// Implemented as a Lua script so the dedup + cap check + push run in a single
// Redis round-trip, eliminating the TOCTOU race that allowed concurrent token
// requests to all pass a stale cap check and collectively exceed MAX_CAMMERS.
//
// KEYS[1] = mainstage:spotlight:queue
// KEYS[2] = mainstage:spotlight:queue:timestamps
// ARGV[1] = identity
// ARGV[2] = cap
// ARGV[3] = now (ms since epoch as string)
const ADD_CAMMER_LUA = `
local key      = KEYS[1]
local tsKey    = KEYS[2]
local id       = ARGV[1]
local cap      = tonumber(ARGV[2])
local now      = ARGV[3]
local list = redis.call('LRANGE', key, 0, -1)
for i = 1, #list do
  if list[i] == id then return 'duplicate' end
end
if #list >= cap then return 'full' end
redis.call('RPUSH', key, id)
redis.call('HSET', tsKey, id, now)
return 'added'
`;

const QUEUE_TS_KEY = 'mainstage:spotlight:queue:timestamps';

// Like ADD_CAMMER_LUA but skips the cap check — admin bypass.
// KEYS[1] = mainstage:spotlight:queue
// KEYS[2] = mainstage:spotlight:queue:timestamps
// ARGV[1] = identity
// ARGV[2] = now (ms since epoch as string)
const ADD_CAMMER_FORCE_LUA = `
local key   = KEYS[1]
local tsKey = KEYS[2]
local id    = ARGV[1]
local now   = ARGV[2]
local list  = redis.call('LRANGE', key, 0, -1)
for i = 1, #list do
  if list[i] == id then return 'duplicate' end
end
redis.call('RPUSH', key, id)
redis.call('HSET', tsKey, id, now)
return 'added'
`;

async function addCammer(identity) {
  if (!identity) return 'invalid';
  const redis    = getRedis();
  const queueKey = 'mainstage:spotlight:queue';

  const creatorsBefore = await countCreatorsInQueue();

  const result = await redis.eval(
    ADD_CAMMER_LUA, 2, queueKey, QUEUE_TS_KEY,
    String(identity), String(MAX_CAMMERS), String(Date.now()),
  );

  if (result === 'duplicate') {
    logger.debug('[MainStage] addCammer: already in queue', { identity });
    return 'duplicate';
  }
  if (result === 'full') {
    logger.warn('[MainStage] addCammer: cammer cap reached', { cap: MAX_CAMMERS });
    return 'full';
  }

  await redis.expire(queueKey, STATE_CACHE_TTL_S);

  // Cache role for creator-priority spotlight ordering + auto-flip decisions.
  const role = await fetchIdentityRole(identity);
  await cacheIdentityRole(identity, role);

  // PNPtv! Mode: if this identity is granted, engage lock BEFORE the
  // fallback spotlight assignment below — engagement pins the spotlight
  // to this holder, so the subsequent `if (!current)` becomes a no-op.
  try {
    const hasGrant = await fetchPnptvModeGrant(identity);
    if (hasGrant) await engagePnptvModeLock(identity);
  } catch (err) {
    logger.warn('[MainStage] pnptvMode engage check failed (non-fatal)', { identity, error: err.message });
  }

  // If no spotlight yet, immediately set this cammer as spotlight.
  // Interval respects role — creators hold for 5 min, regulars for 90s.
  const current = await redis.get('mainstage:spotlight:cammer');
  if (!current) {
    const interval = role === 'creator' ? ROTATE_INTERVAL_CREATOR_MS : ROTATE_INTERVAL_REGULAR_MS;
    await redis.set('mainstage:spotlight:cammer', String(identity), 'EX', STATE_CACHE_TTL_S);
    const nextAt = Date.now() + interval;
    await redis.set('mainstage:spotlight:nextAt', String(nextAt), 'EX', STATE_CACHE_TTL_S);
  }

  logger.info('[MainStage] cammer added', { identity, role });

  // Best-effort stats upsert
  upsertCammerStats(identity).catch(() => {});

  // Fire-and-forget web push to pnp-member push-subscribers. De-duped for 15
  // min per cammer to survive disconnect/reconnect bounces without spamming.
  notifyCammerJoined(identity).catch((err) =>
    logger.warn('[MainStage] notifyCammerJoined failed', { identity, error: err.message })
  );

  // Fire mode auto-flip evaluation AFTER the cammer is in the queue + role cached.
  const creatorsAfter = await countCreatorsInQueue();
  const humansAfter = await countHumanCammers();
  await maybeAutoFlipMode('add', creatorsBefore, creatorsAfter, humansAfter);

  await emitState();
  return 'added';
}

/**
 * Push-notify pnp-member web-push subscribers when a new creator joins the
 * Main Stage as a cammer. Best-effort — swallows failures so a broken push
 * pipeline never blocks a cammer joining. Skipped for the media bot, guests,
 * and viewers. Respects a 15-minute Redis dedupe per userId.
 */
async function notifyCammerJoined(identity) {
  const idStr = String(identity);
  if (idStr === MEDIA_BOT_IDENTITY) return;
  if (idStr.startsWith('guest_') || idStr.startsWith('viewer_')) return;

  const redis = getRedis();
  const dedupeKey = `mainstage:notif:sent:${idStr}`;
  // SET NX EX — atomic dedupe. First join wins the 15-min window.
  const acquired = await redis.set(dedupeKey, '1', 'EX', 15 * 60, 'NX').catch(() => null);
  if (!acquired) {
    logger.debug('[MainStage] notifyCammerJoined skipped — deduped', { identity: idStr });
    return;
  }

  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `SELECT u.id, u.username, u.first_name,
            COALESCE(p.photo_url, u.photo_file_id) AS photo_url
       FROM users u
       LEFT JOIN performers p ON p.user_id::text = u.id::text AND p.status = 'active'
      WHERE u.id::text = $1
      LIMIT 1`,
    [idStr]
  );
  if (userRows.length === 0) return;
  const cammer = userRows[0];
  const displayName = cammer.first_name || cammer.username || 'A creator';

  // Audience — active pnp-member entitlement holders AND opted-in to web push.
  // The push_subscriptions join naturally excludes users without a browser sub.
  const { rows: audRows } = await pool.query(
    `SELECT DISTINCT ue.user_id
       FROM user_entitlements ue
       JOIN push_subscriptions ps ON ps.user_id = ue.user_id
      WHERE ue.add_on_id = 'pnp-member'
        AND (ue.is_lifetime = true OR ue.expires_at > NOW())
        AND ue.user_id::text <> $1`,
    [idStr]  // don't notify the cammer about themselves
  );
  const userIds = audRows.map((r) => String(r.user_id));
  if (userIds.length === 0) {
    logger.info('[MainStage] notifyCammerJoined: no audience', { identity: idStr });
    return;
  }

  const push = require('./pushNotificationService');
  const sent = await push.sendToUsers(userIds, {
    title: `🎤 ${displayName} is on Main Stage`,
    body: 'Tap to join the stream →',
    url: '/main-stage',
    icon: cammer.photo_url || '/Logo2-50.png',
  });
  logger.info('[MainStage] notifyCammerJoined delivered', {
    identity: idStr, audienceSize: userIds.length, sent,
  });
}

// Atomic shuffle-and-rotate-spotlight. Closes the race where a concurrent
// addCammer's Lua could slip in between a JS-side LRANGE and the DEL+RPUSH
// pipeline, wiping the new cammer. Everything now runs in a single EVAL.
//   KEYS[1]  = mainstage:spotlight:queue
//   KEYS[2]  = mainstage:spotlight:cammer
//   KEYS[3]  = mainstage:spotlight:nextAt
//   ARGV[1]  = nextAt (ms since epoch)
//   ARGV[2]  = STATE_CACHE_TTL_S
// Returns:    the new queue order (ARRAY) — client uses [1] as new spotlight
const SHUFFLE_LUA = `
local queueKey = KEYS[1]
local spotKey  = KEYS[2]
local nextKey  = KEYS[3]
local nextAt   = ARGV[1]
local ttl      = tonumber(ARGV[2])
local list = redis.call('LRANGE', queueKey, 0, -1)
if #list == 0 then return {} end
if #list > 1 then
  -- Seed from Redis TIME (sec+usec) so successive shuffles differ.
  local t = redis.call('TIME')
  math.randomseed(tonumber(t[1]) * 1000000 + tonumber(t[2]))
  for i = #list, 2, -1 do
    local j = math.random(i)
    list[i], list[j] = list[j], list[i]
  end
  redis.call('DEL', queueKey)
  redis.call('RPUSH', queueKey, unpack(list))
  redis.call('EXPIRE', queueKey, ttl)
end
redis.call('SET', spotKey, list[1], 'EX', ttl)
redis.call('SET', nextKey, nextAt, 'EX', ttl)
return list
`;

/**
 * Randomize the cammer queue order in-place and advance the spotlight to the
 * new head of the queue. Used by the client "shuffle" button to let any user
 * shake up the layout when the room gets stale. Atomic via Lua so concurrent
 * addCammer calls can't get their identity silently dropped.
 */
async function shuffleCammers() {
  if (await isPnptvModeLocked()) throw pnptvModeLockedError('shuffle');
  const redis   = getRedis();
  const nextAt  = Date.now() + ROTATE_INTERVAL_MS;
  const result = await redis.eval(
    SHUFFLE_LUA, 3,
    'mainstage:spotlight:queue',
    'mainstage:spotlight:cammer',
    'mainstage:spotlight:nextAt',
    String(nextAt),
    String(STATE_CACHE_TTL_S),
  );
  const newQueue = Array.isArray(result) ? result : [];
  if (newQueue.length === 0) return; // nothing to do, no emit needed
  logger.info('[MainStage] cammers shuffled', { count: newQueue.length, spotlight: newQueue[0] });
  await emitState();
}

// Force-add a cammer bypassing the cap check (used for admin users).
// Dedup check still applies — calling twice for the same identity is a no-op.
// Uses a Lua script for atomicity, eliminating the TOCTOU race in the old
// JS-side LRANGE + RPUSH pattern.
async function addCammerForce(identity) {
  if (!identity) return 'invalid';
  const redis    = getRedis();
  const queueKey = 'mainstage:spotlight:queue';

  const creatorsBefore = await countCreatorsInQueue();

  const result = await redis.eval(
    ADD_CAMMER_FORCE_LUA, 2, queueKey, QUEUE_TS_KEY,
    String(identity), String(Date.now()),
  );

  if (result === 'duplicate') {
    logger.debug('[MainStage] addCammerForce: already in queue', { identity });
    return 'duplicate';
  }

  await redis.expire(queueKey, STATE_CACHE_TTL_S);

  const role = await fetchIdentityRole(identity);
  await cacheIdentityRole(identity, role);

  // PNPtv! Mode: engage lock if this identity holds a grant (see addCammer).
  try {
    const hasGrant = await fetchPnptvModeGrant(identity);
    if (hasGrant) await engagePnptvModeLock(identity);
  } catch (err) {
    logger.warn('[MainStage] pnptvMode engage check failed (non-fatal, force path)', { identity, error: err.message });
  }

  const current = await redis.get('mainstage:spotlight:cammer');
  if (!current) {
    const interval = role === 'creator' ? ROTATE_INTERVAL_CREATOR_MS : ROTATE_INTERVAL_REGULAR_MS;
    await redis.set('mainstage:spotlight:cammer', String(identity), 'EX', STATE_CACHE_TTL_S);
    const nextAt = Date.now() + interval;
    await redis.set('mainstage:spotlight:nextAt', String(nextAt), 'EX', STATE_CACHE_TTL_S);
  }

  logger.info('[MainStage] admin cammer force-added', { identity, role });
  upsertCammerStats(identity).catch(() => {});
  notifyCammerJoined(identity).catch((err) =>
    logger.warn('[MainStage] notifyCammerJoined failed (force path)', { identity, error: err.message })
  );

  const creatorsAfter = await countCreatorsInQueue();
  const humansAfter = await countHumanCammers();
  await maybeAutoFlipMode('add', creatorsBefore, creatorsAfter, humansAfter);

  await emitState();
  return 'added';
}

async function removeCammer(identity) {
  if (!identity) return;
  const redis    = getRedis();
  const queueKey = 'mainstage:spotlight:queue';

  const creatorsBefore = await countCreatorsInQueue();

  // LREM returns the number of elements removed. Only proceed with queue
  // maintenance and logging when the identity was actually present, avoiding
  // spurious state broadcasts and misleading log entries when called for users
  // who were never in the cammer queue.
  const removed = await redis.lrem(queueKey, 0, String(identity));
  await redis.hdel(QUEUE_TS_KEY, String(identity));
  await forgetIdentityRole(identity);

  if (removed === 0) return; // identity was not in the queue — nothing to do

  // PNPtv! Mode: if the holder just disconnected, start the grace timer.
  // We do NOT release the lock immediately — LiveKit reconnect blips are
  // common. The grace tick releases it if they don't come back in time.
  try {
    await markPnptvModeGrace(identity);
  } catch (err) {
    logger.warn('[MainStage] pnptvMode grace mark failed (non-fatal)', { identity, error: err.message });
  }

  // If the removed cammer held the spotlight, advance to the next; otherwise
  // just refresh state. emitState is 200ms-debounced so any downstream flip
  // in maybeAutoFlipMode below coalesces with this into a single broadcast.
  //
  // Guard: don't advance while a pnptvMode grace is active — the holder
  // still owns the spotlight for the grace window.
  const current = await redis.get('mainstage:spotlight:cammer');
  const inGrace = await redis.get(PNPTV_MODE_GRACE_UNTIL_KEY);
  if (current === String(identity) && !inGrace) {
    await advanceSpotlight();
  } else {
    await emitState();
  }
  logger.info('[MainStage] cammer removed', { identity });

  const creatorsAfter = await countCreatorsInQueue();
  const humansAfter = await countHumanCammers();
  await maybeAutoFlipMode('remove', creatorsBefore, creatorsAfter, humansAfter);
}

async function setSpotlight(identity) {
  if (!identity) throw new Error('identity required');
  if (await isPnptvModeLocked()) throw pnptvModeLockedError('spotlight');
  const redis = getRedis();
  const roles = await readAllCammerRoles();
  const interval = roles[String(identity)] === 'creator'
    ? ROTATE_INTERVAL_CREATOR_MS
    : ROTATE_INTERVAL_REGULAR_MS;
  await redis.set('mainstage:spotlight:cammer', String(identity), 'EX', STATE_CACHE_TTL_S);
  const nextAt = Date.now() + interval;
  await redis.set('mainstage:spotlight:nextAt', String(nextAt), 'EX', STATE_CACHE_TTL_S);
  logger.info('[MainStage] spotlight set manually', { identity });
  await emitState();
}

/**
 * Advance the spotlight to the next cammer with creator priority.
 *
 * Ordering rule: creators/performers rotate through first (in queue order),
 * then regulars fill the gaps. Once all creators have had a turn we cycle
 * back to the first creator (never leaving the creator pool while it exists).
 * If no creators are in the queue we round-robin regulars.
 *
 * The nextAt timestamp is set based on the incoming spotlight's role — 5 min
 * for creators, 90s for regulars — so the rotation tick knows when to advance.
 */
async function advanceSpotlight() {
  const redis = getRedis();
  const queue = await redis.lrange('mainstage:spotlight:queue', 0, -1);

  if (queue.length === 0) {
    await redis.del('mainstage:spotlight:cammer');
    await redis.del('mainstage:spotlight:nextAt');
    await emitState();
    return;
  }

  const roles = await readAllCammerRoles();
  const humanQueue = queue.filter((id) => id !== MEDIA_BOT_IDENTITY);
  const creators = humanQueue.filter((id) => roles[id] === 'creator');
  const regulars = humanQueue.filter((id) => roles[id] !== 'creator');
  const priorityList = creators.length > 0 ? creators : regulars;
  if (priorityList.length === 0) {
    // Only the media bot is in the queue — nothing to spotlight.
    await redis.del('mainstage:spotlight:cammer');
    await redis.del('mainstage:spotlight:nextAt');
    await emitState();
    return;
  }

  const current = await redis.get('mainstage:spotlight:cammer');
  let nextId;
  const currentIdx = current ? priorityList.indexOf(current) : -1;
  if (currentIdx === -1) {
    nextId = priorityList[0];
  } else {
    nextId = priorityList[(currentIdx + 1) % priorityList.length];
  }

  const nextRole = roles[nextId] === 'creator' ? 'creator' : 'regular';
  const interval = nextRole === 'creator' ? ROTATE_INTERVAL_CREATOR_MS : ROTATE_INTERVAL_REGULAR_MS;
  const nextAt = Date.now() + interval;

  await redis.set('mainstage:spotlight:cammer', nextId, 'EX', STATE_CACHE_TTL_S);
  await redis.set('mainstage:spotlight:nextAt', String(nextAt), 'EX', STATE_CACHE_TTL_S);

  logger.info('[MainStage] spotlight advanced', { next: nextId, role: nextRole, intervalMs: interval });

  if (current && current !== nextId) {
    updateCammerSpotlightStats(current).catch(() => {});
  }

  await emitState();
}

// ── Prime Video auto-rotation ─────────────────────────────────────────────────

let _primeVideoCache = { items: [], fetchedAt: 0 };
const PRIME_CACHE_TTL_MS = 60 * 60 * 1000; // refetch Directus list hourly

async function fetchFeaturedPrimeVideos() {
  const now = Date.now();
  if (_primeVideoCache.items.length && now - _primeVideoCache.fetchedAt < PRIME_CACHE_TTL_MS) {
    return _primeVideoCache.items;
  }
  try {
    const resp = await axios.get(`${DIRECTUS_INTERNAL_URL}/items/prime_videos`, {
      params: {
        filter: JSON.stringify({
          status: { _eq: 'published' },
          video_file: { _nnull: true },
        }),
        fields: 'video_file,title',
        limit: 100,
      },
      timeout: 8_000,
    });
    const items = (resp.data?.data || [])
      .filter(v => v?.video_file)
      .map(v => ({ fileId: v.video_file, title: v.title || null }));
    _primeVideoCache = { items, fetchedAt: now };
    return items;
  } catch (err) {
    logger.warn('[MainStage] fetchFeaturedPrimeVideos failed', { error: err.message });
    return _primeVideoCache.items; // stale-ok
  }
}

// Directus file IDs are UUIDs. Guard against malformed records leaking
// arbitrary path segments into the URL we broadcast to every client.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * If no admin-picked media is currently playing and auto-rotation isn't
 * admin-locked, pick a random featured Prime Video from Directus and
 * broadcast it as the background.
 *
 * Respects admin intent in two ways:
 * 1. If state.media.kind !== 'off', we don't interrupt.
 * 2. If state.media.adminLocked === true, we skip even when kind === 'off'
 *    (admin explicitly chose silence).
 */
// ── Playlist helpers ───────────────────────────────────────────────────────────

function srcToSkipKey(src) {
  return `mainstage:skip-votes:${crypto.createHash('sha256').update(String(src)).digest('hex').slice(0, 12)}`;
}

async function seedPlaylist(items) {
  if (!items.length) return;
  const redis = getRedis();
  for (const item of items) {
    if (item.fileId && UUID_RE.test(item.fileId)) {
      await redis.zadd(PLAYLIST_KEY, 'NX', 0, item.fileId);
    }
  }
  await redis.expire(PLAYLIST_KEY, STATE_CACHE_TTL_S);
}

/**
 * Advance to the least-recently-played Prime Video (fair round-robin).
 * Skips the currently playing video unless it's the only one available.
 * Updates the sorted-set score so the same video isn't picked again immediately.
 */
async function advanceVideo() {
  const items = await fetchFeaturedPrimeVideos();
  if (!items.length) {
    logger.warn('[MainStage] advanceVideo: no prime videos available');
    return false;
  }

  const titleMap = {};
  for (const item of items) {
    if (item.fileId && UUID_RE.test(item.fileId)) titleMap[item.fileId] = item.title ?? null;
  }

  await seedPlaylist(items);

  const redis = getRedis();

  // Identify currently playing fileId from Redis media state
  let currentFileId = null;
  try {
    const m = await readMedia();
    if (m && m.src) {
      const match = String(m.src).match(/\/assets\/([0-9a-f-]{36})/i);
      if (match) currentFileId = match[1];
    }
  } catch (_) {}

  // Fetch entire playlist sorted by score ascending (lowest = oldest / never played)
  const all = await redis.zrange(PLAYLIST_KEY, 0, -1, 'WITHSCORES');
  const candidates = [];
  for (let i = 0; i < all.length; i += 2) {
    const fid = all[i];
    if (fid !== currentFileId && titleMap[fid] !== undefined) {
      candidates.push({ fileId: fid, score: parseFloat(all[i + 1]), title: titleMap[fid] });
    }
  }
  // If only one video exists, allow re-playing it
  if (!candidates.length) {
    for (let i = 0; i < all.length; i += 2) {
      const fid = all[i];
      if (titleMap[fid] !== undefined) {
        candidates.push({ fileId: fid, score: parseFloat(all[i + 1]), title: titleMap[fid] });
      }
    }
  }
  if (!candidates.length) return false;

  candidates.sort((a, b) => a.score - b.score);
  const pick = candidates[0];

  const publicSrc   = `${DIRECTUS_PUBLIC_URL}/assets/${pick.fileId}`;
  const internalSrc = `${DIRECTUS_INTERNAL_URL}/assets/${pick.fileId}`;

  // Mark as just-played so it goes to the back of the queue
  await redis.zadd(PLAYLIST_KEY, Date.now(), pick.fileId);
  await redis.expire(PLAYLIST_KEY, STATE_CACHE_TTL_S);

  // Force a media-compatible layout mode when auto-rotating video.
  const currentMode = await redis.get(MODE_KEY);
  if (currentMode !== 'cinema') {
    await setMode('cinema');
  }

  await setMedia({ kind: 'video', src: publicSrc, title: pick.title, playing: true, _fromAutoRotate: true });
  logger.info('[MainStage] advanceVideo', { fileId: pick.fileId, title: pick.title });

  try {
    const broadcaster = require('../workers/mainStageMediaBroadcaster');
    await broadcaster.updateSource(internalSrc);
    await broadcaster.setPlaying(true);
  } catch (bcErr) {
    logger.warn('[MainStage] advanceVideo: broadcaster sync failed (non-fatal)', { error: bcErr.message });
  }

  return true;
}

/**
 * Record a skip vote for the given user + current video src.
 * Returns { count, threshold, triggered } — triggered=true means the
 * threshold was met and advanceVideo() was already called.
 */
async function voteSkip(userId, src) {
  if (!src) return { count: 0, threshold: 3, triggered: false };
  const redis    = getRedis();
  const VOTE_KEY = srcToSkipKey(src);

  await redis.sadd(VOTE_KEY, String(userId));
  await redis.expire(VOTE_KEY, SKIP_VOTES_TTL_S);
  const count = await redis.scard(VOTE_KEY);

  const queue     = await redis.lrange('mainstage:spotlight:queue', 0, -1);
  const threshold = Math.max(3, Math.ceil(queue.length * 0.20));
  const triggered = count >= threshold;

  if (triggered) {
    await redis.del(VOTE_KEY);
    await advanceVideo();
  }

  return { count, threshold, triggered };
}

async function getSkipVotes(src) {
  if (!src) return { count: 0, threshold: 3 };
  const redis    = getRedis();
  const count    = await redis.scard(srcToSkipKey(src));
  const queue    = await redis.lrange('mainstage:spotlight:queue', 0, -1);
  const threshold = Math.max(3, Math.ceil(queue.length * 0.20));
  return { count: count || 0, threshold };
}

function broadcastSkipVoteUpdate(src, count, threshold) {
  if (!_io) return;
  _io.to('mainstage').emit('mainstage:skip-vote-update', { count, threshold });
}

// ── Auto-rotation (now delegates to advanceVideo) ─────────────────────────────

async function autoRotateMedia() {
  try {
    const redis = getRedis();

    // Admin-controlled auto-play toggle. When disabled, the rotation timer
    // still fires but is a no-op — the admin must pick media manually.
    const autoplayRaw = await redis.get('mainstage:autoplay:enabled');
    if (autoplayRaw === '0') return;

    const current = await readMedia();

    if (current.kind !== 'off') return;   // don't interrupt admin-set media
    if (current.adminLocked) return;      // admin chose silence explicitly

    await advanceVideo();
  } catch (err) {
    logger.error('[MainStage] autoRotateMedia error', { error: err.message });
  }
}

// ── Auto-play toggle ──────────────────────────────────────────────────────────

/**
 * Enable or disable server-side media auto-rotation. When disabled, the
 * rotation timer is a no-op until re-enabled. Persisted in Redis with no
 * TTL so the choice survives restarts. Broadcasts state to all clients.
 *
 * @param {boolean} enabled
 */
async function setAutoplay(enabled) {
  const redis = getRedis();
  await redis.set('mainstage:autoplay:enabled', enabled ? '1' : '0', 'EX', STATE_CACHE_TTL_S);
  logger.info('[MainStage] autoplay set', { enabled: Boolean(enabled) });
  await emitState();
}

/**
 * Prune queue entries whose identities are NOT connected to the LiveKit room.
 * This catches ghost cammers — users who were granted a cammer token but
 * whose socket died before the disconnect handler could run removeCammer
 * (e.g. socket closed before auth-binding). Without this sweep they squat
 * a MAX_CAMMERS slot until the 24h TTL expires.
 *
 * Runs on the same rotation tick as spotlight rotation (locked; one replica
 * only). Admin identities with isAdminRole are preserved even if not yet
 * published, in case they're slow to join.
 */
async function sweepGhostCammers() {
  try {
    const participants = await livekit.listParticipants(ROOM_NAME);
    if (!participants) return;

    const redis = getRedis();
    const queue = await redis.lrange('mainstage:spotlight:queue', 0, -1);

    // If LiveKit returned zero participants but our queue has entries, we do
    // NOT nuke the queue based on LiveKit alone — that's more likely a transient
    // LiveKit hiccup than all users disconnecting at once. However, if any
    // queue entry's join timestamp is older than 2× ROTATE_INTERVAL_MS we
    // trust they are truly gone and sweep anyway to prevent slot squatting.
    if (participants.length === 0) {
      if (queue.length === 0) return;

      const now = Date.now();
      const staleThresholdMs = 2 * ROTATE_INTERVAL_MS;
      const timestamps = await redis.hgetall(QUEUE_TS_KEY);
      const staleEntries = queue.filter(id => {
        if (id === MEDIA_BOT_IDENTITY) return false;
        const ts = timestamps && timestamps[id] ? parseInt(timestamps[id], 10) : null;
        if (ts === null) return false; // no timestamp = recently added without timestamp; be conservative
        return (now - ts) > staleThresholdMs;
      });

      if (staleEntries.length === 0) return; // LiveKit hiccup — preserve queue

      logger.warn(
        '[MainStage] sweepGhostCammers: LiveKit returned 0 participants but stale queue entries found — ' +
        'sweeping via timestamp fallback',
        { staleEntries, staleThresholdMs },
      );

      for (const id of staleEntries) {
        await redis.lrem('mainstage:spotlight:queue', 0, id);
        await redis.hdel(QUEUE_TS_KEY, id);
        logger.info('[MainStage] swept stale ghost cammer (0-participant fallback)', { identity: id });
      }

      const currentSpot = await redis.get('mainstage:spotlight:cammer');
      if (currentSpot && staleEntries.includes(currentSpot)) {
        await advanceSpotlight();
      } else {
        await emitState();
      }
      return;
    }

    // Build a lookup: identity -> canPublish permission. A queue entry is a
    // "ghost" if (a) the identity isn't connected to LiveKit at all, or
    // (b) the identity IS connected but with a viewer-only token (canPublish
    // false) — happens when a former cammer navigated away and their
    // useMainStage init re-minted a viewer token.
    const canPublishByIdentity = new Map();
    for (const p of participants) {
      canPublishByIdentity.set(p.identity, Boolean(p.permission?.canPublish));
    }

    const ghosts = queue.filter(id => {
      if (id === MEDIA_BOT_IDENTITY) return false;
      if (!canPublishByIdentity.has(id)) return true; // not in LiveKit
      if (canPublishByIdentity.get(id) === false) return true; // viewer-only
      return false;
    });
    if (ghosts.length === 0) return;

    for (const id of ghosts) {
      await redis.lrem('mainstage:spotlight:queue', 0, id);
      await redis.hdel(QUEUE_TS_KEY, id);
      logger.info('[MainStage] swept ghost cammer', { identity: id });
    }

    // If the spotlighted cammer was a ghost, advance to a live one
    const currentSpot = await redis.get('mainstage:spotlight:cammer');
    if (currentSpot && ghosts.includes(currentSpot)) {
      await advanceSpotlight();
    } else {
      await emitState();
    }
  } catch (err) {
    logger.warn('[MainStage] sweepGhostCammers error', { error: err.message });
  }
}

// ── Distributed rotation lock ─────────────────────────────────────────────────

let _rotationInterval    = null;
let _autoMediaInterval   = null;
let _lockRenewInterval   = null;
let _pnptvGraceInterval  = null;
let _lockToken           = null;

/**
 * Acquire the Redis lock and, if successful, start the local rotation interval.
 * Multiple bot replicas call this at boot; only one holds the lock at a time.
 */
async function startRotation() {
  _lockToken = `${process.pid}-${Date.now()}`;
  const redis = getRedis();

  // One-shot legacy migration — convert mainstage:media STRING → HASH if it
  // hasn't been done yet on this Redis. Safe to run on every replica boot;
  // becomes a no-op once the key is already a hash.
  try { await migrateMediaKeyIfNeeded(); } catch (_) { /* best-effort */ }

  // Prune retired mode values (theater/karaoke/equal) from Redis state so
  // frontends don't receive a mode they can't render. Idempotent.
  try { await migrateLegacyModeIfNeeded(); } catch (_) { /* best-effort */ }

  // PNPtv! Mode orphan recovery — a bot crash mid-lock leaves the holder key
  // in Redis with no live cammer. If found, seed grace as expired so the
  // next grace tick releases the lock cleanly.
  try {
    const orphanHolder = await redis.get(PNPTV_MODE_HOLDER_KEY);
    if (orphanHolder) {
      const queue = await redis.lrange('mainstage:spotlight:queue', 0, -1);
      if (!queue.includes(orphanHolder)) {
        const graceUntilRaw = await redis.get(PNPTV_MODE_GRACE_UNTIL_KEY);
        if (!graceUntilRaw) {
          await redis.set(PNPTV_MODE_GRACE_UNTIL_KEY, String(Date.now()), 'EX', 60);
          logger.info('[MainStage] pnptvMode orphan lock detected on boot — grace queued for immediate release', { holder: orphanHolder });
        }
      }
    }
  } catch (_) { /* best-effort */ }

  async function tryAcquire() {
    const result = await redis.set(LOCK_KEY, _lockToken, 'NX', 'EX', LOCK_TTL_S);
    if (result !== 'OK') {
      logger.debug('[MainStage] rotation lock not acquired — another instance holds it');
      // Retry after half a lock TTL
      setTimeout(tryAcquire, (LOCK_TTL_S / 2) * 1000);
      return;
    }

    logger.info('[MainStage] rotation lock acquired', { token: _lockToken });

    // Renew lock before it expires
    _lockRenewInterval = setInterval(async () => {
      try {
        const holder = await redis.get(LOCK_KEY);
        if (holder !== _lockToken) {
          // Lock was taken from us (e.g. crash + recovery); stop renewing
          clearInterval(_lockRenewInterval);
          clearInterval(_rotationInterval);
          if (_autoMediaInterval)  clearInterval(_autoMediaInterval);
          if (_pnptvGraceInterval) clearInterval(_pnptvGraceInterval);
          _lockRenewInterval  = null;
          _rotationInterval   = null;
          _autoMediaInterval  = null;
          _pnptvGraceInterval = null;
          logger.warn('[MainStage] rotation lock lost — stopping local rotation');
          return;
        }
        await redis.expire(LOCK_KEY, LOCK_TTL_S);
      } catch (err) {
        logger.error('[MainStage] lock renew error', { error: err.message });
      }
    }, LOCK_RENEW_MS);

    // Rotation tick — fires at the shorter (90s) cadence but only advances the
    // spotlight when the per-cammer nextAt timestamp has elapsed. This lets us
    // hold creators for 5 min without slowing regular rotation.
    _rotationInterval = setInterval(async () => {
      try {
        // Ghost-sweep first so the spotlight rotation operates on a clean queue
        await sweepGhostCammers();
        // Also check pnptvMode grace here (belt + suspenders — the dedicated
        // grace tick handles the sub-15s cadence; this covers the case where
        // that tick was somehow missed).
        await checkPnptvModeGraceExpired().catch(() => {});
        const mode = await redis.get('mainstage:mode');
        if (mode !== 'spotlight') return;
        const nextAtRaw = await redis.get('mainstage:spotlight:nextAt');
        const nextAt = nextAtRaw ? parseInt(nextAtRaw, 10) : 0;
        if (nextAt && Date.now() < nextAt) return; // still holding current cammer
        await advanceSpotlight();
      } catch (err) {
        logger.error('[MainStage] rotation tick error', { error: err.message });
      }
    }, ROTATE_INTERVAL_REGULAR_MS);

    // PNPtv! Mode grace tick — dedicated fast cadence so a 60s grace fires
    // within one tick of expiring, not up to 90s later.
    _pnptvGraceInterval = setInterval(async () => {
      try {
        await checkPnptvModeGraceExpired();
      } catch (err) {
        logger.warn('[MainStage] pnptvMode grace tick error', { error: err.message });
      }
    }, PNPTV_MODE_GRACE_TICK_MS);

    // Prime Video auto-rotation: fire once shortly after boot so the room
    // isn't silent on first load, then every AUTO_MEDIA_INTERVAL_MS.
    setTimeout(() => { autoRotateMedia().catch(() => {}); }, 15_000);
    _autoMediaInterval = setInterval(() => {
      autoRotateMedia().catch(() => {});
    }, AUTO_MEDIA_INTERVAL_MS);
  }

  await tryAcquire().catch(err =>
    logger.error('[MainStage] startRotation error', { error: err.message })
  );
}

async function stopRotation() {
  if (_lockRenewInterval)  { clearInterval(_lockRenewInterval);  _lockRenewInterval  = null; }
  if (_rotationInterval)   { clearInterval(_rotationInterval);   _rotationInterval   = null; }
  if (_autoMediaInterval)  { clearInterval(_autoMediaInterval);  _autoMediaInterval  = null; }
  if (_pnptvGraceInterval) { clearInterval(_pnptvGraceInterval); _pnptvGraceInterval = null; }

  if (_lockToken) {
    try {
      const redis  = getRedis();
      const holder = await redis.get(LOCK_KEY);
      if (holder === _lockToken) {
        await redis.del(LOCK_KEY);
        logger.info('[MainStage] rotation lock released');
      }
    } catch (err) {
      logger.warn('[MainStage] stopRotation: lock release failed', { error: err.message });
    }
    _lockToken = null;
  }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * Insert a row into mainstage_admin_log.
 * @param {string|number} userId
 * @param {string} action
 * @param {object} [payload]
 */
// ── Pinned announcement ──────────────────────────────────────────────────────
// Late-joiners to Main Stage miss ephemeral chat broadcasts. `getPinnedAnnouncement`
// returns whatever admin has set (null if none/expired). `setPinnedAnnouncement`
// stores it in Redis with a TTL and broadcasts the update to everyone in the
// 'mainstage' Socket.IO room. Also emitted to newly-connected sockets.
async function getPinnedAnnouncement() {
  try {
    const raw = await getRedis().get(PIN_KEY);
    if (!raw) return null;
    const pin = JSON.parse(raw);
    if (pin?.expiresAt && Date.now() > Number(pin.expiresAt)) {
      await getRedis().del(PIN_KEY).catch(() => {});
      return null;
    }
    return pin;
  } catch (err) {
    logger.warn('[MainStage] getPinnedAnnouncement failed', { error: err.message });
    return null;
  }
}

async function setPinnedAnnouncement({ text, sender, ttlSeconds } = {}) {
  const clean = String(text || '').replace(/<[^>]*>/g, '').trim().slice(0, PIN_MAX_LEN);
  if (!clean) throw new Error('Pin text is required');
  const ttl = Math.max(60, Math.min(PIN_MAX_TTL_S, parseInt(ttlSeconds, 10) || 86_400));
  const pin = {
    id: crypto.randomBytes(8).toString('hex'),
    text: clean,
    sender: String(sender || 'PNPtv'),
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl * 1000,
  };
  await getRedis().set(PIN_KEY, JSON.stringify(pin), 'EX', ttl);
  if (_io) _io.to('mainstage').emit('mainstage:chat-pinned', pin);
  return pin;
}

async function clearPinnedAnnouncement() {
  await getRedis().del(PIN_KEY).catch(() => {});
  if (_io) _io.to('mainstage').emit('mainstage:chat-pinned', null);
}

async function logAdminAction(userId, action, payload = null) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO mainstage_admin_log (user_id, action, payload)
       VALUES ($1::varchar, $2, $3)`,
      [userId ? String(userId) : null, String(action), payload ? JSON.stringify(payload) : null]
    );
  } catch (err) {
    logger.error('[MainStage] logAdminAction failed', { error: err.message, action });
  }
}

// ── Internal DB helpers ───────────────────────────────────────────────────────

async function upsertCammerStats(identity) {
  try {
    const identityStr = String(identity);
    const userId = (identityStr.startsWith('guest_') || identityStr.startsWith('viewer_'))
      ? null : identityStr;
    const pool = getPool();
    await pool.query(
      `INSERT INTO mainstage_cammer_stats (identity, user_id, last_seen_at)
       VALUES ($1, $2::text, NOW())
       ON CONFLICT (identity) DO UPDATE SET last_seen_at = NOW(), user_id = COALESCE(mainstage_cammer_stats.user_id, EXCLUDED.user_id)`,
      [identityStr, userId]
    );
  } catch (err) {
    logger.warn('[MainStage] upsertCammerStats failed', { error: err.message });
  }
}

async function updateCammerSpotlightStats(identity) {
  try {
    const identityStr = String(identity);
    const userId = (identityStr.startsWith('guest_') || identityStr.startsWith('viewer_'))
      ? null : identityStr;
    const pool = getPool();
    await pool.query(
      `INSERT INTO mainstage_cammer_stats (identity, user_id, last_spotlight_at, total_seconds)
       VALUES ($1, $2::text, NOW(), $3)
       ON CONFLICT (identity) DO UPDATE
         SET last_spotlight_at = NOW(),
             total_seconds = mainstage_cammer_stats.total_seconds + $3,
             user_id = COALESCE(mainstage_cammer_stats.user_id, EXCLUDED.user_id)`,
      [identityStr, userId, Math.floor(ROTATE_INTERVAL_MS / 1000)]
    );
  } catch (err) {
    logger.warn('[MainStage] updateCammerSpotlightStats failed', { error: err.message });
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  ROOM_NAME,
  ROTATE_INTERVAL_MS,
  MEDIA_BOT_IDENTITY,
  MAX_CAMMERS,
  setIo,
  kickFromMainStageRoom,
  getState,
  setMode,
  setMedia,
  setMediaVolume,
  setCamsVolume,
  addCammer,
  addCammerForce,
  removeCammer,
  shuffleCammers,
  setSpotlight,
  advanceSpotlight,
  startRotation,
  stopRotation,
  logAdminAction,
  notifyViewersChanged,
  autoRotateMedia,
  setAutoplay,
  advanceVideo,
  voteSkip,
  getSkipVotes,
  broadcastSkipVoteUpdate,
  getPinnedAnnouncement,
  setPinnedAnnouncement,
  clearPinnedAnnouncement,
  // PNPtv! Mode — spotlight-lock streaming format
  fetchPnptvModeGrant,
  isPnptvModeLocked,
  getPnptvModeStatus,
  engagePnptvModeLock,
  disengagePnptvModeLock,
  markPnptvModeGrace,
  checkPnptvModeGraceExpired,
};
