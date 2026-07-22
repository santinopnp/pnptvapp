'use strict';

/**
 * Going-Live Broadcast Service
 *
 * When a creator starts a stream, fan-out a Telegram DM (and push notification
 * if web-push is configured) to every follower who has not opted out.
 *
 * Dedup key: pnp:live:announced:{creatorId}:{YYYY-MM-DD}  TTL 6 h
 * Opt-out:   notification_preferences JSONB key "going_live" -> { bot: bool, push: bool }
 *            Default is opted-in on both channels.
 *
 * Fan-out cap: 5 000 followers per call (batch window 50 ms between DMs).
 */

const logger = require('../utils/logger');
const { query } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const { Markup } = require('telegraf');

const FOLLOWER_CAP       = 5_000;
const DM_RATE_DELAY_MS   = 50;          // 50 ms between Telegram DMs
const DEDUP_TTL_SECONDS  = 6 * 60 * 60; // 6 hours

/**
 * Build the YYYY-MM-DD string for the dedup key (UTC date).
 */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check (and atomically set) the per-creator dedup key in Redis.
 * Returns true  → already announced for this session, skip.
 * Returns false → first announcement; key is now set.
 *
 * LIVE-H-03: Key is now session-scoped using streamId so the dedup is per stream
 * session, not per calendar day. Falls back to date-granular key when no streamId
 * is supplied (e.g. from the manual broadcast endpoint).
 *
 * @param {string|number} creatorId
 * @param {string|null} [streamId]  — session identifier (timestamp or UUID)
 * @returns {Promise<boolean>}
 */
async function isAlreadyAnnounced(creatorId, streamId) {
  const redis = getRedis();
  const suffix = streamId ? streamId : todayUtc();
  const key = `pnp:live:announced:${creatorId}:${suffix}`;
  // NX = set only if not exists; returns 1 on success, null if key already existed
  const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
  return result === null; // null → key existed → already announced
}

/**
 * Load the creator's display name from the DB.
 *
 * @param {string|number} creatorId
 * @returns {Promise<string>}
 */
async function resolveCreatorName(creatorId) {
  try {
    const { rows } = await query(
      `SELECT COALESCE(first_name, username, 'A creator') AS name FROM users WHERE id = $1 LIMIT 1`,
      [String(creatorId)]
    );
    return rows[0]?.name ?? 'A creator';
  } catch {
    return 'A creator';
  }
}

/**
 * Load up to FOLLOWER_CAP followers for a creator.
 * Only includes users who:
 *   - have a Telegram ID linked (telegram IS NOT NULL)
 *   - have not opted out of going_live bot DMs
 *     (notification_preferences->>'going_live' is null OR bot channel is true)
 *
 * @param {string|number} creatorId
 * @returns {Promise<Array<{ telegram: string, id: string, push_opted_in: boolean }>>}
 */
async function loadFollowers(creatorId) {
  // going_live->bot defaults to true when the key is absent; we exclude rows
  // where the stored value explicitly sets bot to false.
  const { rows } = await query(
    `SELECT
       u.id,
       u.telegram,
       COALESCE(
         (u.notification_preferences->'going_live'->>'bot')::boolean,
         true
       ) AS bot_opted_in,
       COALESCE(
         (u.notification_preferences->'going_live'->>'push')::boolean,
         true
       ) AS push_opted_in
     FROM user_follows uf
     JOIN users u ON u.id = uf.follower_id
     WHERE uf.following_id = $1
       AND u.telegram IS NOT NULL
       AND COALESCE(
             (u.notification_preferences->'going_live'->>'bot')::boolean,
             true
           ) = true
     LIMIT $2`,
    [String(creatorId), FOLLOWER_CAP]
  );
  return rows;
}

/**
 * Load followers who have push opted in (separate query, no telegram requirement).
 *
 * @param {string|number} creatorId
 * @returns {Promise<Array<{ id: string }>>}
 */
async function loadPushFollowers(creatorId) {
  const { rows } = await query(
    `SELECT u.id
     FROM user_follows uf
     JOIN users u ON u.id = uf.follower_id
     WHERE uf.following_id = $1
       AND u.deleted_at IS NULL
       AND COALESCE(u.tier, 'free') != 'banned'
       AND COALESCE(
             (u.notification_preferences->'going_live'->>'push')::boolean,
             true
           ) = true
     LIMIT $2`,
    [String(creatorId), FOLLOWER_CAP]
  );
  return rows;
}

/**
 * Fan-out Telegram DMs to followers.
 *
 * @param {import('telegraf').Telegraf} bot
 * @param {Array<{ telegram: string, id: string }>} followers
 * @param {string} creatorName
 * @param {string} channelRef  — Restreamer channel slug, e.g. 'pnptv-frank'
 * @param {string|null} [customMessage]  — Optional override message (plain text, no MD escaping needed from caller)
 */
async function sendTelegramDMs(bot, followers, creatorName, channelRef, customMessage) {
  const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
  const watchPath = channelRef ? `/live/${encodeURIComponent(channelRef)}` : '/live';
  const watchUrl  = `${appUrl}${watchPath}`;

  // Escape for MarkdownV2
  const safeName = creatorName.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
  let message;
  if (customMessage) {
    const safeCustom = customMessage.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
    message = safeCustom;
  } else {
    message =
      `🔴 *${safeName} is live now on PNPtv\\!*\n\n` +
      `Watch before the room fills up\\.`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('Watch Now', watchUrl)],
  ]);

  let sent = 0;
  for (const follower of followers) {
    try {
      await bot.telegram.sendMessage(follower.telegram, message, {
        parse_mode: 'MarkdownV2',
        ...keyboard,
      });
      sent++;
    } catch (err) {
      if (err.code === 403) {
        logger.warn('goingLiveBroadcast: follower blocked bot', { telegram: follower.telegram });
      } else if (err.code === 400 && err.description?.includes('chat not found')) {
        logger.warn('goingLiveBroadcast: chat not found', { telegram: follower.telegram });
      } else {
        logger.warn('goingLiveBroadcast: DM failed', { telegram: follower.telegram, code: err.code, msg: err.message });
      }
    }
    await new Promise((r) => setTimeout(r, DM_RATE_DELAY_MS));
  }

  return sent;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * Post the "going live" announcement to every linked Telegram group with
 * the same format used in the in-app social feed and the DM: a branded
 * stream snapshot as the header image, a caption with the creator name +
 * PNPtv tagline, and an inline "Watch Now" button.
 *
 * Falls back to a text-only send with link preview if the snapshot fetch
 * fails (Restreamer down, channel offline for a moment, etc.).
 *
 * Dedup key `live:group:notif:{chatId}:{creatorId}` with 1h TTL prevents
 * spamming a group if the creator toggles live off/on quickly.
 *
 * @param {import('telegraf').Telegraf} bot
 * @param {string|number} creatorId
 * @param {string} channelRef
 * @param {string} creatorName
 * @param {string|null} [customMessage]
 * @returns {Promise<number>} count of groups notified
 */
async function notifyLinkedGroups(bot, creatorId, channelRef, creatorName, customMessage) {
  if (!bot) return 0;
  const groupManagerService = require('./groupManagerService');
  const ogService = require('./ogService');
  const redis = getRedis();

  const groups = await groupManagerService.getLinkedGroups().catch(() => []);
  if (!groups || groups.length === 0) return 0;

  const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
  const watchUrl = channelRef ? `${appUrl}/live/${encodeURIComponent(channelRef)}` : appUrl;

  // Build the branded snapshot once and reuse across every group in this run.
  let snapshotBuf = null;
  try {
    snapshotBuf = await ogService.fetchAndBrandStreamSnapshot(channelRef, creatorName);
  } catch (err) {
    logger.warn('goingLiveBroadcast: snapshot fetch failed — text-only fallback', {
      creatorId, channelRef, error: err.message,
    });
  }

  const safeName = escHtml(creatorName || 'A creator');
  const tagline = 'Real Models. Real Clouds. 🌫️';
  const caption = customMessage
    ? `🔴 <b>${safeName} is LIVE!</b>\n\n${escHtml(String(customMessage).slice(0, 400))}\n\n${tagline}\n\n👉 ${escHtml(watchUrl)}`
    : `🔴 <b>${safeName} is LIVE on PNPtv!</b>\n${tagline}\n\n👉 ${escHtml(watchUrl)}`;

  const kb = Markup.inlineKeyboard([[Markup.button.url('▶️ Watch Now', watchUrl)]]);

  let sent = 0;
  for (const group of groups) {
    const chatId = group.telegram_chat_id;
    const dedupKey = `live:group:notif:${chatId}:${creatorId}`;
    if (redis && (await redis.get(dedupKey).catch(() => null))) continue;

    try {
      if (snapshotBuf) {
        await bot.telegram.sendPhoto(
          chatId,
          { source: snapshotBuf },
          { caption, parse_mode: 'HTML', ...kb },
        );
      } else {
        await bot.telegram.sendMessage(
          chatId,
          caption,
          { parse_mode: 'HTML', disable_web_page_preview: false, ...kb },
        );
      }
      sent++;
      if (redis) await redis.set(dedupKey, '1', 'EX', 3600).catch(() => {});
    } catch (err) {
      logger.warn('goingLiveBroadcast: group notify failed', {
        chatId, creatorId, error: err?.response?.description || err.message,
      });
    }
  }
  return sent;
}

/**
 * Email blast to every app member with a real email address.
 * Silently no-ops if emailService is unavailable.
 * Dedup is inherited from the parent broadcastGoingLive 6h Redis key.
 *
 * @param {string|number} creatorId
 * @param {string} creatorName
 * @param {string} channelRef
 * @param {string|null} customMessage
 */
async function sendMemberEmailBlast(creatorId, creatorName, channelRef, customMessage) {
  let emailService;
  try {
    emailService = require('./emailservice');
  } catch {
    return 0;
  }

  const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
  const watchUrl = channelRef
    ? `${appUrl}/live/${encodeURIComponent(channelRef)}`
    : `${appUrl}/live`;

  const { rows: members } = await query(
    `SELECT email, first_name, username, language
     FROM users
     WHERE email IS NOT NULL
       AND email NOT LIKE '%telegram.pnptv.app'
       AND email != ''
       AND is_deleted IS NOT TRUE
       AND COALESCE(tier, 'free') != 'banned'
     ORDER BY id`
  );
  if (members.length === 0) return 0;

  const bodyEn = customMessage
    ? `${customMessage}\n\n👉 ${watchUrl}`
    : `${creatorName} is streaming LIVE right now on PNPtv! Don't miss it.\n\n👉 ${watchUrl}`;
  const bodyEs = customMessage
    ? `${customMessage}\n\n👉 ${watchUrl}`
    : `¡${creatorName} está EN VIVO ahora mismo en PNPtv! No te lo pierdas.\n\n👉 ${watchUrl}`;

  const result = await emailService.sendBroadcastEmails(members, {
    subjectEn:   `🔴 ${creatorName} is LIVE on PNPtv! Watch now`,
    subjectEs:   `🔴 ${creatorName} está EN VIVO en PNPtv! Míralo ahora`,
    preheaderEn: 'Stream is live — join before the room fills up.',
    preheaderEs: 'La transmisión está en vivo — únete antes de que se llene.',
    messageEn:   bodyEn,
    messageEs:   bodyEs,
    buttons: [{ text: 'Watch Now', textEs: 'Ver Ahora', url: watchUrl, primary: true }],
  }).catch((err) => {
    logger.warn('goingLiveBroadcast: email blast error', { creatorId, error: err.message });
    return { sent: 0, failed: 0 };
  });

  logger.info('goingLiveBroadcast: email blast complete', {
    creatorId, channelRef, sent: result.sent, failed: result.failed,
  });
  return result.sent;
}

/**
 * Announce a live creator to the Main Stage room and record them as
 * currently-live so any client (existing or joining later) can render a
 * "creators live now" surface. Non-blocking; silently no-ops if socket.io
 * is not initialized (e.g. bootstrap path). Redis entry TTL is 4h — a
 * typical stream is well under this, and the poller re-records on every
 * offline→running transition anyway.
 *
 * @param {string|number} creatorId
 * @param {string} creatorName
 * @param {string} channelRef
 */
async function notifyMainStage(creatorId, creatorName, channelRef) {
  try {
    const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
    const watchUrl = channelRef ? `${appUrl}/live/${encodeURIComponent(channelRef)}` : appUrl;
    const payload = {
      creatorId: String(creatorId),
      creatorName,
      channelRef,
      watchUrl,
      startedAt: Date.now(),
    };

    // Persist so late-joining clients can fetch via GET /api/mainstage/live-creators (future).
    const redis = getRedis();
    if (redis) {
      await redis.set(
        `mainstage:live:${creatorId}`,
        JSON.stringify(payload),
        'EX',
        4 * 60 * 60,
      ).catch(() => {});
    }

    // Fire the socket event to everyone currently connected to Main Stage.
    let socketSingleton;
    try { socketSingleton = require('./socketSingleton'); } catch { return; }
    const io = socketSingleton.getIO?.() || socketSingleton.get?.();
    if (io) io.to('mainstage').emit('mainstage:creator-live', payload);
  } catch (err) {
    logger.warn('goingLiveBroadcast: notifyMainStage error', { creatorId, error: err.message });
  }
}

/**
 * Fan-out web-push notifications to opted-in followers.
 * Silently no-ops if PushNotificationService is unavailable.
 *
 * @param {Array<{ id: string }>} followers
 * @param {string} creatorName
 * @param {string} channelRef
 */
async function sendPushNotifications(followers, creatorName, channelRef) {
  let PushNotificationService;
  try {
    PushNotificationService = require('./pushNotificationService');
  } catch {
    return 0;
  }

  const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
  const watchPath = channelRef ? `/live/${encodeURIComponent(channelRef)}` : '/live';
  const watchUrl  = `${appUrl}${watchPath}`;

  const followerIds = followers.map(f => f.id);
  if (followerIds.length === 0) return 0;

  // Single batched query for all follower subscriptions instead of N per-user queries.
  const sent = await PushNotificationService.sendToUsers(followerIds, {
    title: `${creatorName} is live!`,
    body:  'Watch now before the room fills up.',
    url:   watchUrl,
    tag:   `going-live-${channelRef}`,
  }).catch(() => 0);
  return sent;
}

/**
 * Main entry point — call this immediately after emitting 'stream:started'.
 * Fire-and-forget: caller uses setImmediate to not block the socket response.
 *
 * @param {import('telegraf').Telegraf} bot
 * @param {string|number} creatorId
 * @param {string} channelRef
 * @param {{ message?: string }} [opts]  — Optional overrides
 * @param {string|null} [streamId]  — Session-scoped dedup identifier (LIVE-H-03)
 * @returns {Promise<{ dispatched: number, skippedDedup: boolean }>}
 */
async function broadcastGoingLive(bot, creatorId, channelRef, opts = {}, streamId = null) {
  try {
    const alreadyAnnounced = await isAlreadyAnnounced(creatorId, streamId);
    if (alreadyAnnounced) {
      logger.info('goingLiveBroadcast: skipped (dedup)', { creatorId, channelRef });
      return { dispatched: 0, skippedDedup: true };
    }

    const [creatorName, dmFollowers, pushFollowers] = await Promise.all([
      resolveCreatorName(creatorId),
      loadFollowers(creatorId),
      loadPushFollowers(creatorId),
    ]);

    const customMessage = opts?.message || null;

    // ── Fire-and-forget channels (always fire, regardless of follower count) ──

    // 1. Feed post from @pnptv + X cross-post with branded snapshot card
    setImmediate(() => {
      const cristinaFeedService = require('./cristinaFeedService');
      cristinaFeedService.announceLiveStream(creatorId, creatorName, channelRef).catch((err) => {
        logger.warn('goingLiveBroadcast: announceLiveStream error', { creatorId, error: err.message });
      });
    });

    // 2. Linked Telegram groups — photo + caption + Watch Now button
    setImmediate(() => {
      notifyLinkedGroups(bot, creatorId, channelRef, creatorName, customMessage).catch((err) => {
        logger.warn('goingLiveBroadcast: notifyLinkedGroups error', { creatorId, error: err.message });
      });
    });

    // 3. Email blast — all app members with real emails
    setImmediate(() => {
      sendMemberEmailBlast(creatorId, creatorName, channelRef, customMessage).catch((err) => {
        logger.warn('goingLiveBroadcast: emailBlast error', { creatorId, error: err.message });
      });
    });

    // 4. Main Stage announcement — socket event + Redis-recorded live entry
    setImmediate(() => {
      notifyMainStage(creatorId, creatorName, channelRef).catch((err) => {
        logger.warn('goingLiveBroadcast: notifyMainStage error', { creatorId, error: err.message });
      });
    });

    // ── Follower-targeted channels ────────────────────────────────────────────

    if (dmFollowers.length === 0 && pushFollowers.length === 0) {
      logger.info('goingLiveBroadcast: no opted-in followers — feed+X+groups+email dispatched', { creatorId });
      return { dispatched: 0, skippedDedup: false };
    }

    // 4. Telegram DM to opted-in followers
    // 5. Web-push to opted-in followers (deep link → /live/{channelRef})
    const [dmSent, pushSent] = await Promise.all([
      bot ? sendTelegramDMs(bot, dmFollowers, creatorName, channelRef, customMessage) : Promise.resolve(0),
      sendPushNotifications(pushFollowers, creatorName, channelRef),
    ]);

    logger.info('goingLiveBroadcast: fan-out complete', {
      creatorId,
      channelRef,
      dmFollowers: dmFollowers.length,
      pushFollowers: pushFollowers.length,
      dmSent,
      pushSent,
    });

    return { dispatched: dmSent + pushSent, skippedDedup: false };
  } catch (err) {
    logger.error('goingLiveBroadcast: error', { creatorId, channelRef, error: err.message });
    return { dispatched: 0, skippedDedup: false };
  }
}

// ── Auto go-live detection poller ────────────────────────────────────────────
//
// Every 30s we ask Restreamer for its process list and diff each channel's
// `state.exec === 'running'` against the previous value cached in Redis. On
// any offline → running transition we resolve the creator via
// users.live_channel and fire broadcastGoingLive() — same code path as the
// manual "Broadcast Now" button, so the 6h dedup + opt-out preferences +
// Main Stage fanout all apply identically.
//
// Restreamer outage: listProcesses() throws a restreamerUnavailable error —
// we log at debug and no-op. No state churn (last-state keys aren't touched)
// so the next successful tick will still see the correct transition.
//
// Env kill-switch: PNP_DISABLE_GOLIVE_POLLER=1 keeps the poller from starting.

const POLLER_INTERVAL_MS = 30 * 1000;
const LAST_STATE_TTL_S = 24 * 60 * 60;
const LAST_STATE_KEY = (ref) => `live:last-state:${ref}`;

let pollerHandle = null;
let pollerBusy = false;

function sanitizeChannelRef(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[a-z0-9._-]{1,64}$/i.test(trimmed)) return null;
  return trimmed;
}

async function pollTick(bot) {
  if (pollerBusy) return;
  pollerBusy = true;
  try {
    const restreamerService = require('./restreamerService');
    let processes;
    try {
      processes = await restreamerService.listProcesses();
    } catch (err) {
      // Transient — Restreamer offline or reloading. Do not touch last-state.
      logger.debug('goLivePoller: Restreamer unavailable', { error: err.message });
      return;
    }
    if (!Array.isArray(processes) || processes.length === 0) return;

    const redis = getRedis();
    if (!redis) return;

    for (const p of processes) {
      const refId = sanitizeChannelRef(p.reference || p.id);
      if (!refId) continue;
      const isLive = p.state?.exec === 'running';
      const lastRaw = await redis.get(LAST_STATE_KEY(refId)).catch(() => null);
      const wasLive = lastRaw === '1';

      if (isLive && !wasLive) {
        try {
          const { rows } = await query(
            `SELECT id
               FROM users
              WHERE live_channel = $1
                AND is_deleted = FALSE
                AND creator_status = 'active'
                AND creator_locked = FALSE
                AND (
                  identity_verified = TRUE
                  OR (identity_verification_required_by IS NOT NULL
                      AND identity_verification_required_by > NOW())
                )
              LIMIT 1`,
            [refId]
          );
          if (rows[0]?.id) {
            const streamId = `auto-${Date.now()}`;
            // Fire and forget — the internal dedup key still guards against
            // duplicate broadcasts if a manual trigger happened in the same 6h.
            broadcastGoingLive(bot, rows[0].id, refId, {}, streamId).catch((err) => {
              logger.warn('goLivePoller: broadcastGoingLive threw', { refId, error: err.message });
            });
            logger.info('goLivePoller: transition detected', { channelRef: refId, creatorId: rows[0].id });
          }
        } catch (dbErr) {
          logger.warn('goLivePoller: creator lookup failed', { refId, error: dbErr.message });
        }
      }

      await redis.set(LAST_STATE_KEY(refId), isLive ? '1' : '0', 'EX', LAST_STATE_TTL_S).catch(() => {});
    }
  } catch (err) {
    logger.error('goLivePoller: tick error', { error: err.message });
  } finally {
    pollerBusy = false;
  }
}

/**
 * Start the auto go-live poller. Idempotent — repeat calls are ignored.
 * Called once from bot.js during scheduler bootstrap.
 *
 * @param {import('telegraf').Telegraf} bot
 */
function startGoLivePoller(bot) {
  if (process.env.PNP_DISABLE_GOLIVE_POLLER === '1') {
    logger.info('goLivePoller: disabled via PNP_DISABLE_GOLIVE_POLLER=1');
    return;
  }
  if (pollerHandle) return;
  // First tick seeds the last-state cache; second tick onward detects transitions.
  // We intentionally skip broadcasting on the very first tick after startup so
  // a service restart doesn't re-fire every currently-running stream.
  (async () => {
    try {
      const restreamerService = require('./restreamerService');
      const processes = await restreamerService.listProcesses();
      const redis = getRedis();
      if (redis && Array.isArray(processes)) {
        for (const p of processes) {
          const refId = sanitizeChannelRef(p.reference || p.id);
          if (!refId) continue;
          const isLive = p.state?.exec === 'running';
          await redis.set(LAST_STATE_KEY(refId), isLive ? '1' : '0', 'EX', LAST_STATE_TTL_S).catch(() => {});
        }
      }
    } catch (err) {
      logger.debug('goLivePoller: seed skipped', { error: err.message });
    }
    pollerHandle = setInterval(() => pollTick(bot), POLLER_INTERVAL_MS);
    logger.info('goLivePoller: started (30s interval)');
  })();
}

function stopGoLivePoller() {
  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
    logger.info('goLivePoller: stopped');
  }
}

module.exports = { broadcastGoingLive, notifyLinkedGroups, startGoLivePoller, stopGoLivePoller };
