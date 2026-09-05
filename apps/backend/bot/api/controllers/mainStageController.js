'use strict';

/**
 * Main Stage Controller
 *
 * REST endpoints for the 24/7 Main Stage LiveKit room.
 * All admin writes are audit-logged and rate-limited at the route level.
 */

const crypto            = require('crypto');
const logger            = require('../../../utils/logger');
const { asyncHandler }  = require('../middleware/errorHandler');
const { getPool }       = require('../../../config/postgres');
const { getRedis }      = require('../../../config/redis');
const mainStageService  = require('../../../services/mainStageService');
const { kickFromMainStageRoom } = mainStageService;
const livekitService    = require('../../../services/livekitService');
const mainStageConsentService = require('../../../services/mainStageConsentService');
const EntitlementAccessService = require('../../../services/entitlementAccessService');
const mainStageGateService = require('../../../services/mainStageGateService');
const adUnlockService      = require('../../../services/adUnlockService');
// RoomServiceClient is accessed via livekitService.getRoomClient() — no local import needed.

// ── Media source allowlist / SSRF guard ───────────────────────────────────────

/**
 * RFC1918 / loopback CIDR blocks that must never be reached via the media src.
 * Checked after URL parse so no bypass via URL-encoding or redirects.
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
];
// Blocks 10.x, 172.16-31.x, 192.168.x — only needed for numeric IPs.
// Hostnames that resolve to RFC1918 are not blocked here (DNS rebinding is a
// separate concern gated by the infra; this stops obvious direct hits).
const BLOCKED_CIDR_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;

// Only Directus CMS assets are valid media sources. Prevents an admin (or
// a compromised admin account) from broadcasting arbitrary third-party URLs
// to all room viewers.
const ALLOWED_MEDIA_DOMAINS = new Set(['cms.pnptv.app', 'cdn.pnptv.app', 'pnptv.app']);

function validateMediaSrc(src) {
  if (!src) return null; // null / undefined = no src, allowed

  // Same-origin relative URLs like /uploads/... are always safe — they
  // resolve to pnptv.app itself and can't SSRF anywhere else.
  if (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//')) {
    if (/[`$;&|><\n\r\t\\]/.test(src)) return 'Disallowed characters in URL';
    return null;
  }

  let parsed;
  try {
    parsed = new URL(src);
  } catch {
    return 'Invalid URL: cannot be parsed';
  }

  // Only https allowed for media — no file://, rtmp://, etc.
  if (parsed.protocol !== 'https:') {
    return `Disallowed protocol: ${parsed.protocol} — only https: is permitted`;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return `Blocked hostname: ${hostname}`;
  }
  if (BLOCKED_CIDR_RE.test(hostname)) {
    return `Blocked RFC1918/link-local address: ${hostname}`;
  }

  if (!ALLOWED_MEDIA_DOMAINS.has(hostname)) {
    return `Domain not in allowlist: ${hostname}. Only cms.pnptv.app and cdn.pnptv.app are permitted.`;
  }

  // Reject shell metacharacters that could escape ffmpeg arg handling (defence in depth)
  // spawnFfmpeg already uses spawn() not shell=true, but belt-and-suspenders.
  if (/[`$;&|><\n\r\t\\]/.test(src)) {
    return 'Disallowed characters in URL';
  }

  return null; // OK
}

const ROOM_NAME   = mainStageService.ROOM_NAME;
const MAX_CAMMERS = mainStageService.MAX_CAMMERS;

// ── LiveKit RoomServiceClient — use the singleton from livekitService ─────────
// livekitService already exports a lazy singleton getRoomClient(); do not
// instantiate a second RoomServiceClient here (Fix 5 — eliminates duplicate).

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch user row needed for token generation.
 * authenticateUser only populates req.user.id.
 */
async function fetchUserRow(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, first_name, username, role, tier
     FROM users
     WHERE id = $1::varchar
     LIMIT 1`,
    [String(userId)]
  );
  return rows[0] || null;
}

function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}

// ── State cache (2-second in-memory cache for the public /state endpoint) ─────

let _stateCache      = null;
let _stateCacheUntil = 0;

async function getCachedState() {
  if (_stateCache && Date.now() < _stateCacheUntil) return _stateCache;
  _stateCache      = await mainStageService.getState();
  _stateCacheUntil = Date.now() + 2000;
  return _stateCache;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * GET /api/main-stage/join-check
 * Auth required. Returns the current consent state needed before a member can join.
 */
const getJoinCheck = asyncHandler(async (req, res) => {
  const latestConsent = await mainStageConsentService.getLatestConsentForUser(req.user.id);
  return res.json({
    success: true,
    ...mainStageConsentService.buildJoinCheck(latestConsent),
  });
});

/**
 * POST /api/main-stage/accept-consents
 * Auth required. Records the caller's latest Main Stage consent.
 */
const acceptConsents = asyncHandler(async (req, res) => {
  const { acceptTerms, acceptPrivacy, ageConfirmed } = req.body || {};
  if (acceptTerms !== true || acceptPrivacy !== true || ageConfirmed !== true) {
    return res.status(400).json({
      success: false,
      error: 'terms, privacy, and age confirmation are required',
      code: 'MAIN_STAGE_CONSENT_REQUIRED',
    });
  }

  await mainStageConsentService.recordUserConsent({
    userId: req.user.id,
    ageConfirmed: true,
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.get('user-agent') || null,
  });

  const latestConsent = await mainStageConsentService.getLatestConsentForUser(req.user.id);
  return res.json({
    success: true,
    ...mainStageConsentService.buildJoinCheck(latestConsent),
  });
});

/**
 * POST /api/main-stage/token
 * Auth required. Returns a LiveKit token for the main-stage-prime room.
 */
const token = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const userRow = await fetchUserRow(userId);
  if (!userRow) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const latestConsent = await mainStageConsentService.getLatestConsentForUser(userId);
  const joinCheck = mainStageConsentService.buildJoinCheck(latestConsent);
  if (!joinCheck.canJoin) {
    return res.status(403).json({
      success: false,
      error: 'Main Stage consent is required before joining',
      code: 'MAIN_STAGE_CONSENT_REQUIRED',
      ...joinCheck,
    });
  }

  const displayName = userRow.first_name || userRow.username || `user_${userId}`;
  const adminUser = isAdminRole(userRow.role);
  const role = adminUser ? 'admin' : 'member';

  // Kicked-set check — admins bypass
  if (!adminUser) {
    try {
      const redis = getRedis();
      const isKicked = await redis.get(`mainstage:kicked:${String(userId)}`);
      if (isKicked) {
        return res.status(403).json({
          success: false,
          error: 'You have been removed from Main Stage.',
          code: 'MAIN_STAGE_KICKED',
        });
      }
    } catch (redisErr) {
      logger.error('[MainStage] token: Redis unavailable (kicked-set check)', { error: redisErr.message });
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable.',
        code: 'SESSION_BACKEND_UNAVAILABLE',
      });
    }
  }

  // Tier detection — non-blocking. Any consented, non-kicked user can join.
  // newcomer → free registered account (no active membership)
  // member   → active pnp-member entitlement
  // prime    → member + PRIME tier column (extended session + spotlight priority)
  // admin    → admin/superadmin role
  let hasMembership = false;
  if (!adminUser) {
    try {
      hasMembership = await EntitlementAccessService.hasEntitlement(String(userId), 'pnp-member');
    } catch (entErr) {
      logger.error('[MainStage] token: entitlement check failed', { error: entErr.message });
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable.',
        code: 'SESSION_BACKEND_UNAVAILABLE',
      });
    }
  }
  const hasPrime = hasMembership && userRow.tier === 'PRIME';
  const participantTier = adminUser ? 'admin' : hasPrime ? 'prime' : hasMembership ? 'member' : 'newcomer';

  // Newcomers: cam on, no mic, 60-min session then 40-min cooldown.
  // Members: cam + mic, 4-hour sessions.
  // Prime / Admin: cam + mic, 12-hour tokens (no session cap).
  const canScreenShare    = participantTier !== 'newcomer';
  const canPublishAudio   = participantTier !== 'newcomer';

  const NEWCOMER_SESSION_S  = 3600;               // 60 min cam window
  const NEWCOMER_COOLDOWN_S = 2400;               // 40 min cooldown
  const NEWCOMER_WINDOW_S   = NEWCOMER_SESSION_S + NEWCOMER_COOLDOWN_S; // 100 min Redis TTL

  let tokenTtlSeconds = participantTier === 'newcomer'
    ? NEWCOMER_SESSION_S
    : participantTier === 'member'
      ? 4 * 3600
      : 12 * 3600; // prime / admin

  let sessionStartedAt   = null;
  let sessionLimitSeconds = null;

  if (participantTier === 'newcomer') {
    try {
      const SESSION_KEY = `mainstage:session:start:${String(userId)}`;
      const redis = getRedis();
      const startRaw = await redis.get(SESSION_KEY);

      if (startRaw === null) {
        const nowMs = Date.now();
        await redis.set(SESSION_KEY, String(nowMs), 'EX', NEWCOMER_WINDOW_S);
        sessionStartedAt    = nowMs;
        sessionLimitSeconds = NEWCOMER_SESSION_S;
        tokenTtlSeconds     = NEWCOMER_SESSION_S;
      } else {
        const startMs  = parseInt(startRaw, 10);
        const elapsedS = Math.floor((Date.now() - startMs) / 1000);

        if (elapsedS < NEWCOMER_SESSION_S) {
          sessionStartedAt    = startMs;
          sessionLimitSeconds = NEWCOMER_SESSION_S;
          tokenTtlSeconds     = Math.max(60, NEWCOMER_SESSION_S - elapsedS);
        } else {
          const cooldownRemainingS = Math.max(0, NEWCOMER_WINDOW_S - elapsedS);
          return res.status(429).json({
            success: false,
            error: 'Your 1-hour preview has ended. Take a 40-minute break, or become a Member to stay on cam.',
            code: 'FREE_USER_COOLDOWN',
            cooldownSeconds: cooldownRemainingS,
          });
        }
      }
    } catch (redisErr) {
      logger.error('[MainStage] token: Redis unavailable (session tracking)', { error: redisErr.message });
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable.',
        code: 'SESSION_BACKEND_UNAVAILABLE',
      });
    }
  }

  // Admins bypass the cap (addCammerForce skips cap but still deduplicates).
  let addResult;
  try {
    addResult = adminUser
      ? await mainStageService.addCammerForce(String(userId))
      : await mainStageService.addCammer(String(userId));
  } catch (addErr) {
    logger.error('[MainStage] token: addCammer failed', { error: addErr.message });
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable.',
      code: 'SESSION_BACKEND_UNAVAILABLE',
    });
  }

  if (addResult === 'full') {
    return res.status(429).json({
      success: false,
      error: `Main Stage is full (max ${MAX_CAMMERS})`,
      code: 'CAMMER_CAP_REACHED',
    });
  }

  const isModerator = role === 'admin';

  const lkToken = await livekitService.generateToken(
    ROOM_NAME,
    String(userId),
    displayName,
    isModerator,
    {
      canPublishVideo:  true,
      canPublishAudio,
      ttlSeconds:       tokenTtlSeconds,
    }
  );

  logger.info('[MainStage] token issued', {
    userId,
    participantTier,
    tokenTtlSeconds,
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.get('user-agent') || null,
  });

  const responseBody = {
    success:          true,
    token:            lkToken,
    livekitUrl:       livekitService.LIVEKIT_WS_URL,
    roomName:         ROOM_NAME,
    role,
    displayName,
    canScreenShare,
    participantTier,
  };

  if (sessionStartedAt !== null) {
    responseBody.sessionStartedAt    = sessionStartedAt;
    responseBody.sessionLimitSeconds = sessionLimitSeconds;
  }

  return res.json(responseBody);
});

/**
 * GET /api/main-stage/state
 * Public. Cached 2s.
 * Strip media.src for unauthenticated callers — Prime Video URLs are behind
 * a paywall and must not be exposed without a valid session.
 */
const getState = asyncHandler(async (req, res) => {
  const state = await getCachedState();
  const safeState = req.session?.user
    ? state
    : { ...state, media: { ...state.media, src: null } };
  return res.json({ success: true, state: safeState });
});

/**
 * Common response for admin actions blocked by PNPtv! Mode lock.
 * Frontend uses code=PNPTV_MODE_LOCKED to hide/disable the control.
 */
function respondPnptvModeLocked(res, op) {
  return res.status(423).json({
    success: false,
    error: `Main Stage is in PNPtv! Mode — ${op} is locked while a founder is live.`,
    code: 'PNPTV_MODE_LOCKED',
  });
}

/**
 * POST /api/main-stage/mode
 * Admin only. Body: { mode }
 */
const setMode = asyncHandler(async (req, res) => {
  const { mode } = req.body || {};
  if (!mode) {
    return res.status(400).json({ success: false, error: 'mode is required' });
  }

  try {
    await mainStageService.setMode(mode);
  } catch (err) {
    if (err.code === 'PNPTV_MODE_LOCKED') return respondPnptvModeLocked(res, 'mode');
    throw err;
  }
  await mainStageService.logAdminAction(req.user.id, 'set_mode', { mode });

  logger.info('[MainStage] mode set by admin', { userId: req.user.id, mode });
  return res.json({ success: true, mode });
});

/**
 * POST /api/main-stage/media
 * Admin only. Body: { kind, src, playing, volume }
 */
const setMedia = asyncHandler(async (req, res) => {
  const { kind, src, playing, volume, adminLocked } = req.body || {};

  // Validate media src before accepting it — prevents SSRF and ffmpeg arg injection
  if (src !== undefined && src !== null) {
    const srcError = validateMediaSrc(src);
    if (srcError) {
      return res.status(400).json({ success: false, error: srcError });
    }
  }

  await mainStageService.setMedia({ kind, src, playing, volume, adminLocked });
  await mainStageService.logAdminAction(req.user.id, 'set_media', { kind, src, playing, volume, adminLocked });

  // Notify media broadcaster to reload source / toggle playback
  try {
    const broadcaster = require('../../../../workers/mainStageMediaBroadcaster');
    if (src !== undefined)     await broadcaster.updateSource(src);
    if (playing !== undefined) await broadcaster.setPlaying(Boolean(playing));
  } catch (err) {
    logger.warn('[MainStage] broadcaster notify failed', { error: err.message });
  }

  logger.info('[MainStage] media updated by admin', { userId: req.user.id, kind, playing });
  return res.json({ success: true });
});

/**
 * POST /api/main-stage/autoplay
 * Admin only. Body: { enabled: boolean }
 *
 * Toggles the server-side music/video auto-rotation. When disabled, the
 * rotation timer is a no-op until re-enabled. Persists in Redis so the
 * choice survives bot restarts.
 */
const setAutoplay = asyncHandler(async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled (boolean) is required' });
  }

  await mainStageService.setAutoplay(enabled);
  await mainStageService.logAdminAction(req.user.id, 'set_autoplay', { enabled });

  logger.info('[MainStage] autoplay toggled by admin', { userId: req.user.id, enabled });
  return res.json({ success: true, enabled });
});

/**
 * POST /api/main-stage/volume
 * Admin only. Body: { cams?: number, media?: number }
 */
const setVolume = asyncHandler(async (req, res) => {
  const { cams, media } = req.body || {};

  if (cams  !== undefined) await mainStageService.setCamsVolume(cams);
  if (media !== undefined) await mainStageService.setMediaVolume(media);

  await mainStageService.logAdminAction(req.user.id, 'set_volume', { cams, media });
  return res.json({ success: true });
});

/**
 * POST /api/main-stage/spotlight
 * Admin only. Body: { cammer }
 */
const setSpotlight = asyncHandler(async (req, res) => {
  const { cammer } = req.body || {};
  if (!cammer || typeof cammer !== 'string' || cammer.length > 255) {
    return res.status(400).json({ success: false, error: 'cammer identity is required and must be ≤255 chars' });
  }

  // Reject identities not currently in the cammer queue. Without this, an admin
  // can pin spotlight to a ghost identity that will never publish, producing a
  // permanently broken stage until someone manually clears Redis.
  const state = await mainStageService.getState();
  if (!state.spotlight.queue.includes(String(cammer))) {
    return res.status(400).json({ success: false, error: 'identity is not in the cammer queue' });
  }

  try {
    await mainStageService.setSpotlight(String(cammer));
  } catch (err) {
    if (err.code === 'PNPTV_MODE_LOCKED') return respondPnptvModeLocked(res, 'spotlight');
    throw err;
  }
  await mainStageService.logAdminAction(req.user.id, 'set_spotlight', { cammer });

  return res.json({ success: true, spotlight: cammer });
});

/**
 * POST /api/main-stage/moderate
 * Admin only. Body: { action: 'skip'|'mute'|'kick', identity }
 */
const moderate = asyncHandler(async (req, res) => {
  const { action, identity } = req.body || {};

  if (!action || !identity) {
    return res.status(400).json({ success: false, error: 'action and identity are required' });
  }
  if (!['skip', 'mute', 'unmute', 'kick'].includes(action)) {
    return res.status(400).json({ success: false, error: 'action must be skip, mute, unmute, or kick' });
  }
  if (typeof identity !== 'string' || identity.length > 255) {
    return res.status(400).json({ success: false, error: 'identity must be a string ≤255 chars' });
  }

  const roomClient = livekitService.getRoomClient();

  switch (action) {
    case 'skip': {
      // Remove from spotlight and advance to next
      await mainStageService.removeCammer(String(identity));
      await mainStageService.logAdminAction(req.user.id, 'moderate_skip', { identity });
      break;
    }
    case 'mute': {
      try {
        const participant = await roomClient.getParticipant(ROOM_NAME, String(identity));
        const tracks = (participant && participant.tracks) ? participant.tracks : [];
        // Mute any currently-published audio tracks. Even if there are none
        // (e.g. mic already off) we still need to revoke canPublishAudio so
        // the user can't simply unmute or re-publish a fresh audio track —
        // the per-track mute is just a UX shortcut, the permission revoke
        // below is the real enforcement.
        let mutedCount = 0;
        for (const track of tracks) {
          try {
            await roomClient.mutePublishedTrack(ROOM_NAME, String(identity), track.sid, true);
            mutedCount++;
          } catch (trackErr) {
            logger.warn('[MainStage] mutePublishedTrack failed for track', {
              error: trackErr.message, identity, trackSid: track.sid,
            });
          }
        }
        // Revoke canPublishAudio so the user cannot re-unmute or re-publish
        // a new audio track. Keep video + screen-share + subscribe intact so
        // mute is strictly an audio-only sanction (kick is a separate action).
        try {
          await roomClient.updateParticipant(ROOM_NAME, String(identity), undefined, {
            canPublish: true,
            canPublishVideo: true,
            canPublishAudio: false,
            canSubscribe: true,
          });
        } catch (permErr) {
          logger.warn('[MainStage] mute: updateParticipant (revoke audio) failed', {
            error: permErr.message, identity,
          });
        }
        await mainStageService.logAdminAction(req.user.id, 'moderate_mute', { identity, mutedCount });
        logger.info('[MainStage] moderation action', { userId: req.user.id, action, identity, mutedCount });
        return res.json({ success: true, action, identity, mutedTrackCount: mutedCount });
      } catch (err) {
        logger.error('[MainStage] mute: getParticipant failed', { error: err.message, identity });
        return res.status(500).json({ success: false, error: err.message });
      }
    }
    case 'unmute': {
      // Inverse of mute: restore canPublishAudio so the user can unmute /
      // republish a new audio track. We do NOT auto-unmute existing tracks —
      // user must explicitly toggle their mic on, matching native LiveKit UX.
      try {
        await roomClient.updateParticipant(ROOM_NAME, String(identity), undefined, {
          canPublish: true,
          canPublishVideo: true,
          canPublishAudio: true,
          canSubscribe: true,
        });
        await mainStageService.logAdminAction(req.user.id, 'moderate_unmute', { identity });
        logger.info('[MainStage] moderation action', { userId: req.user.id, action, identity });
        return res.json({ success: true, action, identity });
      } catch (err) {
        logger.error('[MainStage] unmute: updateParticipant failed', { error: err.message, identity });
        return res.status(500).json({ success: false, error: err.message });
      }
    }
    case 'kick': {
      try {
        // Revoke publish rights so the existing token cannot be used to reconnect.
        await roomClient.updateParticipant(ROOM_NAME, String(identity), undefined, {
          canPublish: false, canPublishAudio: false, canPublishVideo: false,
          canPublishData: false, canSubscribe: false,
        });
      } catch (err) {
        logger.warn('[MainStage] kick: updateParticipant failed', { error: err.message, identity });
      }
      try {
        await roomClient.removeParticipant(ROOM_NAME, String(identity));
      } catch (err) {
        logger.warn('[MainStage] removeParticipant failed', { error: err.message, identity });
      }
      await mainStageService.removeCammer(String(identity));
      // Write the kicked-set key so the token endpoint blocks immediate rejoin.
      // 24h TTL — admin can clear via redis-cli DEL mainstage:kicked:<identity>.
      try {
        const redis = getRedis();
        await redis.set(`mainstage:kicked:${String(identity)}`, '1', 'EX', 86400);
      } catch (redisErr) {
        logger.error('[MainStage] kick: failed to write kicked-set key', { error: redisErr.message, identity });
      }
      // MS-CRIT-01: Force all of this user's sockets out of the mainstage room
      // so they cannot continue to chat/react until the kicked-set key clears.
      await kickFromMainStageRoom(String(identity)).catch((sockErr) => {
        logger.warn('[MainStage] kick: kickFromMainStageRoom partial failure', { error: sockErr.message, identity });
      });
      await mainStageService.logAdminAction(req.user.id, 'moderate_kick', { identity });
      break;
    }
    default:
      break;
  }

  logger.info('[MainStage] moderation action', { userId: req.user.id, action, identity });
  return res.json({ success: true, action, identity });
});

/**
 * POST /api/main-stage/shuffle
 * Admin only. Reshuffles the participant queue and advances spotlight.
 */
const shuffle = asyncHandler(async (req, res) => {
  try {
    await mainStageService.shuffleCammers();
  } catch (err) {
    if (err.code === 'PNPTV_MODE_LOCKED') return respondPnptvModeLocked(res, 'shuffle');
    throw err;
  }
  await mainStageService.logAdminAction(req.user.id, 'shuffle_cammers');
  return res.json({ success: true });
});

/**
 * GET /api/main-stage/viewer-token
 * Session auth + pnp-member entitlement required (gated at route level).
 * Issues a subscribe-only LiveKit token for passive viewers.
 * Rate-limited at the route level by IP (5/min).
 */
const viewerToken = asyncHandler(async (req, res) => {
  const viewerId = `viewer_${crypto.randomBytes(6).toString('hex')}`;
  const lkToken = await livekitService.generateToken(
    ROOM_NAME,
    viewerId,
    'Viewer',
    false,
    { canPublishVideo: false, canPublishAudio: false, canPublishData: false, ttlSeconds: 2 * 3600 }
  );
  logger.info('[MainStage] viewer token issued', { ip: req.ip });
  return res.json({
    success: true,
    token: lkToken,
    livekitUrl: livekitService.LIVEKIT_WS_URL,
    roomName: ROOM_NAME,
    identity: viewerId,
  });
});

/**
 * GET /api/main-stage/free-viewer-token
 * Session-auth only. Issues a short-TTL Main Stage viewer token to free-tier
 * users. Two paths:
 *
 * 1. Ad-unlock bypass (checked first): user has an active rewarded-ad unlock
 *    for 'mainstage_extend'. Token TTL is clamped to the unlock expiry so it
 *    can't outlive the 30-min ad grant. Returns { viaAdUnlock: true,
 *    unlockExpiresAt }.
 *
 * 2. Gate window: falls through to the existing mainStageGateService check.
 *    Returns 403 MAIN_STAGE_GATED when the gate is disabled or outside a
 *    window so the frontend can render a countdown + upgrade CTA.
 *
 * If an ad-unlock is < 5 min from expiry we still issue the token — a short
 * session is better than an abrupt 403 mid-watch.
 */
const freeViewerToken = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  // ── Path 1: ad-unlock bypass ────────────────────────────────────────────
  try {
    const adUnlockExpiresAt = await adUnlockService.getActiveUnlockExpiresAt(
      userId,
      'mainstage_extend',
    );
    if (adUnlockExpiresAt) {
      const expiresMs   = new Date(adUnlockExpiresAt).getTime();
      const remainingMs = expiresMs - Date.now();
      // Even < 5 min remaining is worth a token (better UX than instant 403).
      const ttlSeconds  = Math.max(30, Math.floor(remainingMs / 1000));
      const viewerId    = `free_${crypto.randomBytes(6).toString('hex')}`;
      const lkToken     = await livekitService.generateToken(
        ROOM_NAME,
        viewerId,
        'Viewer (Free)',
        false,
        { canPublishVideo: false, canPublishAudio: false, canPublishData: false, ttlSeconds },
      );
      logger.info('[MainStage] free-viewer token issued via ad-unlock', {
        ip: req.ip, userId, ttlSeconds, unlockExpiresAt: adUnlockExpiresAt,
      });
      return res.json({
        success:         true,
        token:           lkToken,
        livekitUrl:      livekitService.LIVEKIT_WS_URL,
        roomName:        ROOM_NAME,
        identity:        viewerId,
        viaAdUnlock:     true,
        unlockExpiresAt: new Date(adUnlockExpiresAt).toISOString(),
      });
    }
  } catch (adErr) {
    // Non-fatal — if adUnlockService is down, fall through to gate check so
    // the gate window still works normally.
    logger.warn('[MainStage] free-viewer-token: adUnlockService check failed', {
      error: adErr.message, userId,
    });
  }

  // ── Path 2: scheduled gate window ───────────────────────────────────────
  const gateState = await mainStageGateService.getState();
  if (!gateState.enabled || !gateState.isOpen) {
    return res.status(403).json({
      success: false,
      code: 'MAIN_STAGE_GATED',
      error: gateState.enabled ? 'Main Stage is closed right now.' : 'Free-tier access is disabled.',
      gateState: {
        enabled: gateState.enabled,
        isOpen: gateState.isOpen,
        nextOpenAt: gateState.nextOpenAt,
        currentCloseAt: gateState.currentCloseAt,
        windows: gateState.windows,
      },
    });
  }

  const ttlSeconds = await mainStageGateService.freeViewerTokenTtlSec();
  const viewerId   = `free_${crypto.randomBytes(6).toString('hex')}`;
  const lkToken    = await livekitService.generateToken(
    ROOM_NAME,
    viewerId,
    'Viewer (Free)',
    false,
    { canPublishVideo: false, canPublishAudio: false, canPublishData: false, ttlSeconds },
  );
  logger.info('[MainStage] free-viewer token issued via gate window', {
    ip: req.ip, userId, ttlSeconds, closeAt: gateState.currentCloseAt,
  });
  return res.json({
    success:     true,
    token:       lkToken,
    livekitUrl:  livekitService.LIVEKIT_WS_URL,
    roomName:    ROOM_NAME,
    identity:    viewerId,
    viaAdUnlock: false,
    gateState:   {
      isOpen:         true,
      currentCloseAt: gateState.currentCloseAt,
      nextOpenAt:     gateState.nextOpenAt,
    },
  });
});

/**
 * GET /api/main-stage/gate-state
 * Public read. Returns whether the gate is enabled, whether it's currently
 * open, and the next/current window boundaries. Used by the free-tier UI
 * to render a countdown even without a token.
 */
const gateStatePublic = asyncHandler(async (_req, res) => {
  const state = await mainStageGateService.getState();
  return res.json({
    success: true,
    gateState: {
      enabled: state.enabled,
      isOpen: state.isOpen,
      currentCloseAt: state.currentCloseAt,
      nextOpenAt: state.nextOpenAt,
      windows: state.windows,
    },
  });
});

/**
 * POST /api/main-stage/gate-config   (admin only, wired at route level)
 * Body: { enabled?: boolean, windows?: [{start_utc, duration_min}] }
 */
const setGateConfig = asyncHandler(async (req, res) => {
  const { enabled, windows } = req.body || {};
  if (typeof enabled === 'boolean') await mainStageGateService.setEnabled(enabled);
  if (Array.isArray(windows)) {
    // Validate each entry — refuse malformed input outright so the admin sees
    // an error instead of silently falling back to defaults on read.
    for (const w of windows) {
      if (!w || typeof w.start_utc !== 'string' || !/^\d{2}:\d{2}$/.test(w.start_utc)) {
        return res.status(400).json({ success: false, error: 'window.start_utc must be HH:MM' });
      }
      if (!Number.isFinite(w.duration_min) || w.duration_min <= 0 || w.duration_min > 24 * 60) {
        return res.status(400).json({ success: false, error: 'window.duration_min must be 1..1440' });
      }
    }
    await mainStageGateService.setWindows(windows);
  }
  const state = await mainStageGateService.getState();
  logger.info('[MainStage] gate config updated', {
    adminId: req.user?.id, enabled: state.enabled, windows: state.windows,
  });
  return res.json({ success: true, gateState: state });
});

/**
 * POST /api/main-stage/vote-skip
 * Auth required. Member/Prime/Admin only. Records a skip vote for the
 * currently playing video. When the threshold is reached advanceVideo()
 * fires automatically.
 */
const voteSkip = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const userRow = await fetchUserRow(userId);
  if (!userRow) return res.status(404).json({ success: false, error: 'User not found' });

  const adminUser    = isAdminRole(userRow.role);
  const hasMembership = adminUser || await EntitlementAccessService.hasEntitlement(String(userId), 'pnp-member');
  if (!hasMembership) {
    return res.status(403).json({ success: false, error: 'Membership required to vote.', code: 'MEMBERSHIP_REQUIRED' });
  }

  const state = await mainStageService.getState();
  const src   = state?.media?.src;
  if (!src) {
    return res.status(400).json({ success: false, error: 'No video is currently playing.', code: 'NO_VIDEO_PLAYING' });
  }

  const result = await mainStageService.voteSkip(String(userId), src);

  if (!result.triggered) {
    mainStageService.broadcastSkipVoteUpdate(src, result.count, result.threshold);
  }

  logger.info('[MainStage] vote-skip', { userId, count: result.count, threshold: result.threshold, triggered: result.triggered });
  return res.json({ success: true, ...result });
});

/**
 * POST /api/main-stage/play-next
 * Auth required. PRIME (1 per 5 min rate limit) or Admin (unlimited).
 * Immediately advances to the next least-recently-played video.
 */
const playNext = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const userRow  = await fetchUserRow(userId);
  if (!userRow) return res.status(404).json({ success: false, error: 'User not found' });

  const adminUser = isAdminRole(userRow.role);

  if (!adminUser) {
    let hasMembership = false;
    try {
      hasMembership = await EntitlementAccessService.hasEntitlement(String(userId), 'pnp-member');
    } catch (entErr) {
      logger.error('[MainStage] play-next: entitlement check failed', { error: entErr.message });
      return res.status(503).json({ success: false, error: 'Service temporarily unavailable.', code: 'SESSION_BACKEND_UNAVAILABLE' });
    }
    const hasPrime = hasMembership && userRow.tier === 'PRIME';
    if (!hasPrime) {
      return res.status(403).json({ success: false, error: 'PRIME membership required to skip videos.', code: 'PRIME_REQUIRED' });
    }

    // Rate limit: 1 play-next per 5 minutes per PRIME user
    try {
      const redis    = getRedis();
      const RATE_KEY = `mainstage:play-next-rate:${String(userId)}`;
      const existing = await redis.get(RATE_KEY);
      if (existing) {
        const ttl = await redis.ttl(RATE_KEY);
        return res.status(429).json({
          success: false,
          error: 'You can skip once every 5 minutes.',
          code: 'PLAY_NEXT_RATE_LIMITED',
          cooldownSeconds: ttl > 0 ? ttl : 300,
        });
      }
      await redis.set(RATE_KEY, '1', 'EX', 300);
    } catch (redisErr) {
      logger.error('[MainStage] play-next: Redis error', { error: redisErr.message });
      return res.status(503).json({ success: false, error: 'Service temporarily unavailable.', code: 'SESSION_BACKEND_UNAVAILABLE' });
    }
  }

  const advanced = await mainStageService.advanceVideo();
  if (!advanced) {
    return res.status(503).json({ success: false, error: 'No videos available.', code: 'NO_VIDEOS_AVAILABLE' });
  }

  logger.info('[MainStage] play-next triggered', { userId, adminUser });
  return res.json({ success: true });
});

// ── Pinned announcement ──────────────────────────────────────────────────────
// Publicly readable so late-joiners on any surface can show it; write/clear
// are admin-only and enforced at the route level.
const getPin = asyncHandler(async (_req, res) => {
  const pin = await mainStageService.getPinnedAnnouncement();
  return res.json({ success: true, pin });
});

const setPin = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const ttlSeconds = req.body?.ttlSeconds ? parseInt(req.body.ttlSeconds, 10) : undefined;
  const senderName = typeof req.body?.sender === 'string' && req.body.sender.trim()
    ? req.body.sender.trim().slice(0, 60)
    : 'PNPtv Admin';
  const clean = text.replace(/<[^>]*>/g, '').trim();
  if (!clean) {
    return res.status(400).json({ success: false, error: 'text required' });
  }
  const pin = await mainStageService.setPinnedAnnouncement({
    text: clean,
    sender: senderName,
    ttlSeconds,
  });
  await mainStageService.logAdminAction(userId, 'pin_set', { pinId: pin.id, ttlSeconds: ttlSeconds ?? null });
  logger.info('[MainStage] pinned announcement set', { userId, pinId: pin.id });
  return res.json({ success: true, pin });
});

const clearPin = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  await mainStageService.clearPinnedAnnouncement();
  await mainStageService.logAdminAction(userId, 'pin_clear', null);
  logger.info('[MainStage] pinned announcement cleared', { userId });
  return res.json({ success: true });
});

module.exports = {
  token,
  viewerToken,
  freeViewerToken,
  gateStatePublic,
  setGateConfig,
  getState,
  getJoinCheck,
  acceptConsents,
  setMode,
  setMedia,
  setAutoplay,
  setVolume,
  setSpotlight,
  moderate,
  shuffle,
  voteSkip,
  playNext,
  getPin,
  setPin,
  clearPin,
};
