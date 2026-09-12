'use strict';

/**
 * Crystal Creator Replay Shows Service
 *
 * Crystal Creators can upload pre-recorded MP4s and stream them into the
 * Main Stage LiveKit room (`main-stage-prime`) as if live, using a
 * URL_INPUT ingress. Tips still route to the real creator via performer_id.
 *
 * Feature gate: Redis key `feature:crystal_replay_shows` must be truthy.
 *
 * Redis keys used:
 *   mainstage:replay:active:<creatorUserId>  — JSON session blob, 8h TTL
 *   mainstage:replay:changed                 — pub/sub channel for getState() cache invalidation
 *   mainstage:replay:ingress:<creatorUserId> — LiveKit ingressId, 8h TTL
 */

const { getPool } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');
const { IngressClient, IngressInput } = require('livekit-server-sdk');

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOM_NAME          = 'main-stage-prime';
const REPLAY_TTL_S       = 8 * 3600; // 8h safety TTL on Redis keys
const FEATURE_FLAG_KEY   = 'feature:crystal_replay_shows';
const CHANGED_CHANNEL    = 'mainstage:replay:changed';

// Exponential backoff for ingress creation failures
const MIN_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const MAX_ATTEMPTS   = 5;

// ── LiveKit client factory ────────────────────────────────────────────────────

function getLiveKitConfig() {
  return {
    livekitHost: process.env.LIVEKIT_WS_URL?.replace(/^wss?:\/\//, 'https://') || 'https://livekit.pnptv.app',
    apiKey:      process.env.LIVEKIT_API_KEY,
    apiSecret:   process.env.LIVEKIT_API_SECRET,
  };
}

function getIngressClient() {
  const { livekitHost, apiKey, apiSecret } = getLiveKitConfig();
  return new IngressClient(livekitHost, apiKey, apiSecret);
}

// ── Feature flag ──────────────────────────────────────────────────────────────

async function isFeatureEnabled() {
  try {
    const redis = getRedis();
    const val = await redis.get(FEATURE_FLAG_KEY);
    return val === '1' || val === 'true' || val === 'on';
  } catch (err) {
    logger.warn('[CrystalReplay] feature flag check failed (Redis unavailable) — defaulting to OFF', { error: err.message });
    return false;
  }
}

// ── Crystal active check ──────────────────────────────────────────────────────

/**
 * Returns true if the user has an active Crystal Creator subscription.
 * Mirrors the query in crystalServiceService.js getViewerAudience().
 */
async function isCrystalActive(userId) {
  // Delegado al punto único de decisión (crystalEntitlementService): resuelve
  // desde el libro crystal_grants y aplica el periodo de gracia. Antes esto
  // leía users.crystal_creator_active_until por su cuenta, que es lo que
  // permitía que un beneficio dijera sí y otro no para la misma persona.
  try {
    const entitlement = require('./crystalEntitlementService');
    return await entitlement.hasBenefit(userId, 'replay_shows');
  } catch (err) {
    // Fail-closed: ante un fallo no se regala un beneficio de pago.
    logger.error('[CrystalReplay] isCrystalActive delegación falló', { userId, error: err.message });
    return false;
  }
}

// ── Show management ───────────────────────────────────────────────────────────

/**
 * Returns all active shows for a creator, ordered by newest first.
 */
async function listMyShows(creatorUserId) {
  const { rows } = await getPool().query(
    `SELECT id, creator_user_id, title, r2_key, source_url, thumbnail_url,
            duration_seconds, is_active, hide_badge, created_at, updated_at
       FROM crystal_replay_shows
      WHERE creator_user_id = $1::text
        AND is_active = true
      ORDER BY created_at DESC`,
    [String(creatorUserId)]
  );
  return rows;
}

/**
 * Creates a new replay show record.
 * Returns the created row including its generated UUID.
 */
async function createShow({ creatorUserId, title, sourceUrl, r2Key = null, thumbnailUrl = null, durationSeconds = null, hideBadge = false }) {
  if (!title || !title.trim()) {
    const err = new Error('Title is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (!sourceUrl || !sourceUrl.trim()) {
    const err = new Error('sourceUrl is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  // Enforce https:// prefix — LiveKit ingress requires an accessible HTTPS URL.
  if (!/^https:\/\//i.test(sourceUrl.trim())) {
    const err = new Error('sourceUrl must begin with https://');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const { rows } = await getPool().query(
    `INSERT INTO crystal_replay_shows
       (creator_user_id, title, source_url, r2_key, thumbnail_url, duration_seconds, hide_badge)
     VALUES ($1::text, $2, $3, $4, $5, $6, $7)
     RETURNING id, creator_user_id, title, r2_key, source_url, thumbnail_url,
               duration_seconds, is_active, hide_badge, created_at, updated_at`,
    [
      String(creatorUserId),
      title.trim(),
      sourceUrl.trim(),
      r2Key || null,
      thumbnailUrl || null,
      durationSeconds ? parseInt(durationSeconds, 10) : null,
      !!hideBadge,
    ]
  );
  return rows[0];
}

/**
 * Soft-deletes a show (sets is_active = false). Ownership check enforced.
 * Throws with code 'NOT_FOUND' if show doesn't exist or belongs to another creator.
 */
async function deleteShow(showId, creatorUserId) {
  const { rowCount } = await getPool().query(
    `UPDATE crystal_replay_shows
        SET is_active = false, updated_at = NOW()
      WHERE id = $1
        AND creator_user_id = $2::text
        AND is_active = true`,
    [showId, String(creatorUserId)]
  );
  if (rowCount === 0) {
    const err = new Error('Show not found or already deleted');
    err.code = 'NOT_FOUND';
    throw err;
  }
}

// ── LiveKit ingress helpers ───────────────────────────────────────────────────

/**
 * Delete any existing replay ingress for this creator from the LiveKit room.
 * Also cleans up the Redis ingress tracking key.
 */
async function _deleteExistingReplayIngress(creatorUserId) {
  const redis   = getRedis();
  const client  = getIngressClient();
  const identity = `replay-${creatorUserId}`;

  try {
    const list = await client.listIngress({ roomName: ROOM_NAME });
    for (const ing of list) {
      if (ing.participantIdentity !== identity) continue;
      try {
        await client.deleteIngress(ing.ingressId);
        logger.info('[CrystalReplay] deleted existing ingress', { ingressId: ing.ingressId, creatorUserId });
      } catch (delErr) {
        logger.warn('[CrystalReplay] failed to delete ingress', { ingressId: ing.ingressId, error: delErr.message });
      }
    }
  } catch (listErr) {
    logger.warn('[CrystalReplay] listIngress failed during cleanup', { error: listErr.message });
  }

  await redis.del(`mainstage:replay:ingress:${creatorUserId}`);
}

/**
 * Create a URL_INPUT ingress for the given creator+show.
 * Retries with exponential backoff (5s → 5min, max 5 attempts).
 * Returns the LiveKit IngressInfo object.
 */
async function _createLiveKitIngressForReplay(creatorUserId, show, displayName) {
  const client   = getIngressClient();
  const redis    = getRedis();
  const identity = `replay-${creatorUserId}`;
  const name     = `crystal-replay-${creatorUserId}-${Date.now()}`;

  let attempt   = 0;
  let backoffMs = MIN_BACKOFF_MS;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      // Delete stale ingresses before creating so there's no overlap.
      await _deleteExistingReplayIngress(creatorUserId);

      const ingress = await client.createIngress(IngressInput.URL_INPUT, {
        name,
        roomName:            ROOM_NAME,
        participantIdentity: identity,
        participantName:     displayName || 'Encore Show',
        url:                 show.source_url,
        participantMetadata: JSON.stringify({
          replay:          true,
          hide_badge:      !!show.hide_badge,
          creator_user_id: String(creatorUserId),
          show_id:         show.id,
          show_title:      show.title,
        }),
      });

      // Persist ingressId in Redis so stopReplay can find it without a DB round-trip.
      await redis.set(
        `mainstage:replay:ingress:${creatorUserId}`,
        ingress.ingressId,
        'EX',
        REPLAY_TTL_S
      );

      logger.info('[CrystalReplay] URL ingress created', {
        ingressId: ingress.ingressId,
        creatorUserId,
        showId: show.id,
        attempt,
      });
      return ingress;
    } catch (err) {
      logger.warn('[CrystalReplay] ingress create failed', {
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        error: err.message,
        backoffMs,
        creatorUserId,
      });
      if (attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  }
}

/**
 * Delete the LiveKit ingress for a creator's active replay.
 */
async function _deleteLiveKitIngress(creatorUserId) {
  try {
    await _deleteExistingReplayIngress(creatorUserId);
  } catch (err) {
    // Log but never let ingress cleanup crash the stop flow.
    logger.error('[CrystalReplay] ingress cleanup error during stop', { creatorUserId, error: err.message });
  }
}

// ── Redis replay state pub/sub ────────────────────────────────────────────────

/**
 * Publish a replay state change so mainStageService.getState() cache can invalidate.
 * Also writes/removes the per-creator active session blob in Redis.
 */
async function _publishReplayChange(creatorUserId, sessionData = null) {
  const redis = getRedis();
  const activeKey = `mainstage:replay:active:${creatorUserId}`;
  try {
    if (sessionData) {
      await redis.set(activeKey, JSON.stringify(sessionData), 'EX', REPLAY_TTL_S);
    } else {
      await redis.del(activeKey);
    }
    await redis.publish(CHANGED_CHANNEL, JSON.stringify({ creatorUserId, active: !!sessionData }));
  } catch (err) {
    // Non-fatal — state enrichment will fall back gracefully.
    logger.warn('[CrystalReplay] failed to publish replay change', { creatorUserId, error: err.message });
  }
}

// ── Session management ────────────────────────────────────────────────────────

/**
 * Start a replay session for a creator.
 *
 * Checks:
 *   1. Feature flag is ON.
 *   2. Creator's crystal subscription is active.
 *   3. No other active session exists (unique index enforces at DB level, but we
 *      check first to return a clear error message instead of a constraint violation).
 *   4. The show exists and is active.
 *
 * Returns: { sessionId, participantIdentity }
 */
async function startReplay(creatorUserId, showId) {
  // 1. Feature flag
  const enabled = await isFeatureEnabled();
  if (!enabled) {
    const err = new Error('Crystal Replay Shows feature is not yet available.');
    err.code = 'FEATURE_DISABLED';
    throw err;
  }

  // 2. Crystal active
  const crystalOk = await isCrystalActive(creatorUserId);
  if (!crystalOk) {
    const err = new Error('An active Crystal Creator subscription is required.');
    err.code = 'CRYSTAL_ONLY';
    throw err;
  }

  // 3. No existing active session
  const { rows: activeSessions } = await getPool().query(
    `SELECT id FROM crystal_replay_sessions
      WHERE creator_user_id = $1::text
        AND status IN ('starting', 'live')
      LIMIT 1`,
    [String(creatorUserId)]
  );
  if (activeSessions.length > 0) {
    const err = new Error('You already have an active replay session. Stop it before starting a new one.');
    err.code = 'SESSION_ALREADY_ACTIVE';
    throw err;
  }

  // 4. Load the show
  const { rows: showRows } = await getPool().query(
    `SELECT id, creator_user_id, title, source_url, r2_key, thumbnail_url, duration_seconds, hide_badge
       FROM crystal_replay_shows
      WHERE id = $1
        AND creator_user_id = $2::text
        AND is_active = true
      LIMIT 1`,
    [showId, String(creatorUserId)]
  );
  if (!showRows.length) {
    const err = new Error('Show not found or does not belong to you.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const show = showRows[0];

  // Fetch creator display name for the LiveKit participant.
  const { rows: userRows } = await getPool().query(
    `SELECT username, first_name, last_name FROM users WHERE id = $1::text LIMIT 1`,
    [String(creatorUserId)]
  );
  const userRow    = userRows[0] || {};
  const displayName = userRow.first_name
    ? `${userRow.first_name}${userRow.last_name ? ' ' + userRow.last_name : ''}`
    : userRow.username || 'Encore Show';

  const identity = `replay-${creatorUserId}`;

  // Create the ingress (with retries).
  const ingress = await _createLiveKitIngressForReplay(creatorUserId, show, displayName);

  // Insert session row as 'live' (ingress is already created).
  const { rows: sessionRows } = await getPool().query(
    `INSERT INTO crystal_replay_sessions
       (creator_user_id, show_id, participant_identity, livekit_ingress_id, status)
     VALUES ($1::text, $2, $3, $4, 'live')
     RETURNING id, creator_user_id, show_id, participant_identity, livekit_ingress_id, status, started_at`,
    [String(creatorUserId), show.id, identity, ingress.ingressId]
  );
  const session = sessionRows[0];

  // Publish Redis notification for getState() enrichment.
  await _publishReplayChange(creatorUserId, {
    sessionId:           session.id,
    creatorUserId:       String(creatorUserId),
    showId:              show.id,
    showTitle:           show.title,
    participantIdentity: identity,
    livekitIngressId:    ingress.ingressId,
    status:              'live',
    startedAt:           session.started_at,
  });

  logger.info('[CrystalReplay] session started', {
    sessionId:        session.id,
    creatorUserId,
    showId:           show.id,
    ingressId:        ingress.ingressId,
    participantIdentity: identity,
  });

  return { sessionId: session.id, participantIdentity: identity };
}

/**
 * Stop the active replay session for a creator.
 * Idempotent — safe to call even if no session is active.
 */
async function stopReplay(creatorUserId, endedReason = 'manual') {
  // Find the active session.
  const { rows } = await getPool().query(
    `SELECT id, livekit_ingress_id FROM crystal_replay_sessions
      WHERE creator_user_id = $1::text
        AND status IN ('starting', 'live')
      LIMIT 1`,
    [String(creatorUserId)]
  );

  if (!rows.length) {
    logger.info('[CrystalReplay] stopReplay: no active session found', { creatorUserId });
    return null;
  }

  const session = rows[0];

  // Delete the LiveKit ingress.
  await _deleteLiveKitIngress(creatorUserId);

  // Mark session ended.
  await getPool().query(
    `UPDATE crystal_replay_sessions
        SET status = 'stopped', ended_at = NOW(), ended_reason = $2
      WHERE id = $1`,
    [session.id, endedReason]
  );

  // Remove Redis active key + publish change.
  await _publishReplayChange(creatorUserId, null);

  logger.info('[CrystalReplay] session stopped', {
    sessionId:     session.id,
    creatorUserId,
    endedReason,
  });

  return session.id;
}

/**
 * Get the active session for a creator (for UI polling), or null if none.
 */
async function getActiveSession(creatorUserId) {
  const { rows } = await getPool().query(
    `SELECT s.id, s.creator_user_id, s.show_id, s.participant_identity,
            s.livekit_ingress_id, s.status, s.started_at, s.tip_total_cents,
            sh.title AS show_title, sh.thumbnail_url, sh.duration_seconds
       FROM crystal_replay_sessions s
       JOIN crystal_replay_shows sh ON sh.id = s.show_id
      WHERE s.creator_user_id = $1::text
        AND s.status IN ('starting', 'live')
      LIMIT 1`,
    [String(creatorUserId)]
  );
  return rows[0] || null;
}

/**
 * Admin: kill all active replay sessions (e.g. during Main Stage emergency).
 */
async function killAll() {
  const { rows } = await getPool().query(
    `SELECT id, creator_user_id FROM crystal_replay_sessions
      WHERE status IN ('starting', 'live')`
  );

  if (!rows.length) {
    logger.info('[CrystalReplay] killAll: no active sessions');
    return { stopped: 0 };
  }

  let stopped = 0;
  for (const session of rows) {
    try {
      await stopReplay(session.creator_user_id, 'admin_kill_all');
      stopped++;
    } catch (err) {
      logger.error('[CrystalReplay] killAll: error stopping session', {
        sessionId:     session.id,
        creatorUserId: session.creator_user_id,
        error:         err.message,
      });
    }
  }

  logger.info('[CrystalReplay] killAll complete', { stopped, total: rows.length });
  return { stopped, total: rows.length };
}

/**
 * Called from the LiveKit webhook handler when an `ingress_ended` event arrives.
 * Matches the ingress ID to an active session and marks it stopped.
 */
async function handleLiveKitWebhookEvent(event) {
  const ingressId = event.ingressInfo?.ingressId || event.ingress?.ingressId;
  if (!ingressId) return;

  try {
    const { rows } = await getPool().query(
      `SELECT id, creator_user_id FROM crystal_replay_sessions
        WHERE livekit_ingress_id = $1
          AND status IN ('starting', 'live')
        LIMIT 1`,
      [ingressId]
    );

    if (!rows.length) {
      // Not a replay ingress — nothing to do.
      return;
    }

    const session = rows[0];
    logger.info('[CrystalReplay] ingress_ended webhook: stopping session', {
      sessionId:     session.id,
      creatorUserId: session.creator_user_id,
      ingressId,
    });

    // Delete ingress tracking key (ingress is already gone — LiveKit told us).
    const redis = getRedis();
    await redis.del(`mainstage:replay:ingress:${session.creator_user_id}`);

    // Mark ended.
    await getPool().query(
      `UPDATE crystal_replay_sessions
          SET status = 'stopped', ended_at = NOW(), ended_reason = 'ingress_ended'
        WHERE id = $1`,
      [session.id]
    );

    // Remove Redis active key + publish.
    await _publishReplayChange(session.creator_user_id, null);
  } catch (err) {
    logger.error('[CrystalReplay] handleLiveKitWebhookEvent error', { ingressId, error: err.message });
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  isCrystalActive,
  isFeatureEnabled,
  listMyShows,
  createShow,
  deleteShow,
  startReplay,
  stopReplay,
  getActiveSession,
  killAll,
  handleLiveKitWebhookEvent,
  CHANGED_CHANNEL,
};
