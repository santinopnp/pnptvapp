'use strict';

const { query } = require('../config/postgres');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

// Strip null bytes that Postgres JSON rejects (\x00 is invalid in json/jsonb columns)
function stripNullBytes(s) {
  return typeof s === 'string' ? s.replace(/\x00/g, '') : s;
}
function stripNullBytesDeep(obj) {
  if (typeof obj === 'string') return obj.replace(/\x00/g, '');
  if (Array.isArray(obj)) return obj.map(stripNullBytesDeep);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = stripNullBytesDeep(obj[k]);
    return out;
  }
  return obj;
}

function toJsonbParam(value) {
  try {
    const cleaned = stripNullBytesDeep(value ?? {});
    return JSON.stringify(cleaned, (_key, val) => {
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'function' || typeof val === 'symbol' || typeof val === 'undefined') return null;
      return val;
    }) || '{}';
  } catch (err) {
    logger.warn('NotificationEmitter: metadata serialization failed, using empty object', { error: err.message });
    return '{}';
  }
}

// Mapping from notification type to the user preference key
const TYPE_TO_PREF = {
  like: 'likes',
  reply: 'replies',
  dm: 'dms',
  group_message: 'group_messages',
  group_join: 'group_joins',
  wof_winner: 'wof',
  payment: 'payments',
  announcement: 'announcements',
  system: 'announcements',
  follow: 'follows',
  hangout_call: 'hangout_calls',
  hangout_creator_joined: 'hangout_calls',
  group_join_request: 'social',
  group_request_accepted: 'social',
  reaction_post: 'reactions',
  reaction_chat: 'reactions',
  mention_post: 'mentions',
  mention_chat: 'mentions',
};

// TTL constants (seconds)
const NOTIF_PREFS_TTL = 300;  // 5 minutes
const UNREAD_COUNT_TTL = 300; // 5 minutes

// Maximum number of recipients for a single emitToMany call.
const MAX_FANOUT = 500;

// Types that should NOT trigger a bot DM.
// group_message fires per hangout chat message × per offline member; a busy
// hangout with hundreds of offline members instantly saturates Telegram's
// bot-wide 30 msg/sec limit and cascades 429s onto payments/follows/DMs.
// Web push + in-app + socket cover the channel already.
const SKIP_BOT_TYPES = new Set(['group_message']);

// Notification types that originate from a specific user action toward another user.
// These must be suppressed when a block relationship exists between actor and target.
const USER_TO_USER_TYPES = new Set(['follow', 'like', 'reply', 'dm', 'hangout_call', 'hangout_creator_joined', 'group_join', 'reaction_post', 'reaction_chat', 'mention_post', 'mention_chat']);

// Allowed values per chk_notifications_category PostgreSQL constraint
const VALID_CATEGORIES = new Set(['social', 'messaging', 'hangouts', 'commerce', 'system', 'announcements']);

// Redis key for caching block check results (short TTL — blocks can be added/removed)
const BLOCK_CHECK_TTL = 60; // 1 minute

/**
 * Returns true if a block relationship exists between actorId and targetUserId
 * in either direction. Results are cached in Redis for BLOCK_CHECK_TTL seconds.
 */
async function isBlockedBetween(actorId, targetUserId) {
  const cacheKey = `notif:block_check:${actorId}:${targetUserId}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached !== null) return cached === true || cached === 'true';
  } catch (_) { /* non-fatal */ }

  try {
    const { rowCount } = await query(
      `SELECT 1 FROM blocked_users
       WHERE (user_id = $1 AND blocked_user_id = $2)
          OR (user_id = $2 AND blocked_user_id = $1)
       LIMIT 1`,
      [actorId, targetUserId]
    );
    const blocked = rowCount > 0;
    cache.set(cacheKey, blocked, BLOCK_CHECK_TTL).catch(() => {});
    return blocked;
  } catch (err) {
    logger.warn('NotificationEmitter: block check query failed', { actorId, targetUserId, error: err.message });
    // Fail open — do not suppress notifications when the DB check itself errors
    return false;
  }
}

let _io = null;

function prefKey(userId) {
  return `user:${userId}:notif_prefs`;
}

function unreadKey(userId) {
  return `notif:unread:${userId}`;
}

async function getPrefs(userId) {
  const cached = await cache.get(prefKey(userId));
  if (cached !== null) return cached;

  const { rows } = await query(
    'SELECT notification_preferences FROM users WHERE id = $1',
    [userId]
  );
  const prefs = rows[0]?.notification_preferences || {};
  await cache.set(prefKey(userId), prefs, NOTIF_PREFS_TTL);
  return prefs;
}

async function invalidatePrefsCache(userId) {
  await cache.del(prefKey(userId));
}

async function invalidateUnreadCache(userId) {
  await cache.del(unreadKey(userId));
}

/**
 * Check if a specific channel is enabled for a notification type.
 * Handles both legacy boolean format and new per-channel object format.
 */
function isChannelEnabled(prefVal, channel, defaultVal = true) {
  if (prefVal === undefined || prefVal === null) return defaultVal;
  if (typeof prefVal === 'boolean') return prefVal;
  if (typeof prefVal === 'object') {
    return prefVal[channel] !== undefined ? prefVal[channel] !== false : defaultVal;
  }
  return defaultVal;
}

/**
 * Build a deep-link URL for push/bot notifications.
 */
function buildNotificationUrl(type, entityType, entityId) {
  switch (type) {
    case 'follow':
      return entityId ? `/profile/${entityId}` : '/';
    case 'like':
    case 'reply':
    case 'reaction_post':
    case 'mention_post':
      return entityId ? `/social/post/${entityId}` : '/social';
    case 'reaction_chat':
    case 'mention_chat':
    case 'group_message':
    case 'group_join':
    case 'group_join_request':
    case 'group_request_accepted':
    case 'hangout_call':
    case 'hangout_creator_joined':
      return entityId ? `/chat/${entityId}` : '/chat';
    case 'dm':
      return entityId ? `/dm/${entityId}` : '/dm';
    case 'wof_winner':
      return '/social';
    case 'payment':
      return '/subscribe';
    case 'live_stream_started':
      return entityId ? `/live/${entityId}` : '/live';
    default:
      return '/';
  }
}

/**
 * Build a human-readable push title for a notification type.
 * Uses the actor name (from the DB row) when available.
 */
function buildPushTitle(type, row) {
  const actor = row.actor_first_name || row.actor_username || '';
  switch (type) {
    case 'follow':        return 'New Follower';
    case 'like':          return actor ? `${actor} liked your post` : 'New Like';
    case 'reply':         return actor ? `${actor} commented` : 'New Comment';
    case 'dm':            return actor ? `${actor} sent a message` : 'New Message';
    case 'group_message': return 'New Group Message';
    case 'group_join':    return 'New Group Member';
    case 'hangout_call':  return 'Hangout Call Started';
    case 'hangout_creator_joined': return 'Creator Joined Call';
    case 'reaction_post': return actor ? `${actor} reacted` : 'New Reaction';
    case 'reaction_chat': return actor ? `${actor} reacted` : 'New Reaction';
    case 'mention_post':  return actor ? `${actor} mentioned you` : 'You were mentioned';
    case 'mention_chat':  return actor ? `${actor} mentioned you` : 'You were mentioned';
    case 'payment':       return 'Payment Confirmed';
    case 'wof_winner':    return 'Wall of Fame';
    case 'creator_activated':      return 'Creator Account Activated!';
    case 'creator_approved':       return 'Creator Approved!';
    case 'creator_rejected':       return 'Creator Application';
    case 'creator_new_subscriber': return 'New Subscriber';
    case 'creator_subscriber_left': return 'Subscriber Left';
    case 'creator_strike':         return 'Content Strike';
    case 'creator_suspended':      return 'Creator Status';
    case 'announcement':  return 'PNPtv Announcement';
    case 'system':        return 'PNPtv';
    default:              return 'PNPtv';
  }
}

/**
 * Build a descriptive push body for a notification type.
 * Falls back to the generic notification message.
 */
function buildPushBody(type, row) {
  const actor = row.actor_first_name || row.actor_username || 'Someone';
  const msg = row.message;
  switch (type) {
    case 'follow':        return `@${row.actor_username || actor} just followed you`;
    case 'like':          return msg || `${actor} liked your post`;
    case 'reply':         return msg || `${actor} commented on your post`;
    case 'dm':            return msg || `${actor} sent you a message`;
    case 'group_message': return msg || `New message in group`;
    case 'group_join':    return msg || `${actor} joined your group`;
    case 'mention_post':  return msg || `${actor} mentioned you in a post`;
    case 'mention_chat':  return msg || `${actor} mentioned you in chat`;
    default:              return msg || 'Tap to view';
  }
}

/**
 * Unified Notification Emitter — singleton.
 * Call setIO(io) once from bot.js after Socket.IO is created.
 */
const NotificationEmitter = {
  setIO(io) {
    _io = io;
    logger.info('NotificationEmitter: Socket.IO reference set');
  },

  invalidatePrefsCache,
  invalidateUnreadCache,

  /**
   * Emit a single notification.
   *
   * Wave 1: Attempts to enqueue via BullMQ as the primary path.
   * Falls back to the existing sync logic (_emitSync) if BullMQ is unavailable.
   */
  async emit(payload) {
    try {
      const { notificationsQueue, DEFAULT_JOB_OPTIONS } = require('./queueService');
      if (notificationsQueue) {
        await notificationsQueue.add('in-app', payload, { ...DEFAULT_JOB_OPTIONS });
        return;
      }
    } catch (_) {
      // BullMQ not ready — fall through to sync path
    }
    return this._emitSync(payload);
  },

  /**
   * Direct (synchronous) notification path — used as BullMQ fallback and by
   * the 'in-app' BullMQ worker processor when running inside the queue.
   *
   * Flow: check prefs → insert to DB → emit Socket.IO → fire-and-forget push + bot DM
   */
  async _emitSync({
    type,
    category = 'social',
    priority = 'normal',
    actorId = null,
    targetUserId,
    entityType = null,
    entityId = null,
    message,
    metadata = {},
  }) {
    try {
      if (!targetUserId || !type || !message) return;

      // No self-notifications
      if (actorId && String(actorId) === String(targetUserId)) return;

      // ── Block gate — silently drop user-to-user notifications when a block exists ──
      if (actorId && USER_TO_USER_TYPES.has(type)) {
        const blocked = await isBlockedBetween(actorId, targetUserId);
        if (blocked) return;
      }

      // ── Preference check (Redis-cached, 5 min TTL) ──
      const prefKey2 = TYPE_TO_PREF[type];
      let prefVal;

      if (prefKey2) {
        const prefs = await getPrefs(targetUserId);
        prefVal = prefs[prefKey2];

        // Legacy: boolean false = skip entirely
        if (prefVal === false) return;

        // New format: inApp:false = skip DB insert + all channels
        if (typeof prefVal === 'object' && prefVal !== null && prefVal.inApp === false) return;
      }

      // ── DB insert (combined INSERT + actor lookup in single CTE) ──
      // The notifications table has two partial unique indexes:
      //   uq_notif_dedup_with_actor  — WHERE actor_id IS NOT NULL
      //   uq_notif_dedup_system      — WHERE actor_id IS NULL
      // ON CONFLICT must reference the correct one based on whether actor_id is set.
      const hasActor = actorId != null;
      const conflictClause = hasActor
        ? 'ON CONFLICT (type, actor_id, target_user_id, entity_type, entity_id) WHERE actor_id IS NOT NULL'
        : 'ON CONFLICT (type, target_user_id, entity_type, entity_id) WHERE actor_id IS NULL';

      const safeCategory = VALID_CATEGORIES.has(category) ? category : 'system';

      const { rows: resultRows } = await query(
        `WITH upserted AS (
           INSERT INTO notifications
             (type, category, priority, actor_id, target_user_id, entity_type, entity_id, message, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
           ${conflictClause}
           DO UPDATE SET
             is_read    = FALSE,
             created_at = NOW(),
             message    = EXCLUDED.message,
             metadata   = EXCLUDED.metadata,
             priority   = EXCLUDED.priority
           RETURNING
             id, type, category, priority, actor_id, target_user_id,
             entity_type, entity_id, message, metadata, is_read, created_at
         ),
         actor_info AS (
           SELECT id, username, first_name, photo_file_id
           FROM   users
           WHERE  id = $4
         )
         SELECT
           u.id, u.type, u.category, u.priority, u.actor_id, u.target_user_id,
           u.entity_type, u.entity_id, u.message, u.metadata, u.is_read, u.created_at,
           a.username AS actor_username, a.first_name AS actor_first_name,
           a.photo_file_id AS actor_photo_url
         FROM   upserted u
         LEFT JOIN actor_info a ON TRUE`,
        [type, safeCategory, priority, actorId, targetUserId, entityType, entityId, stripNullBytes(message), toJsonbParam(metadata)]
      );

      const row = resultRows[0];
      if (!row) return;

      // Invalidate unread count cache
      invalidateUnreadCache(targetUserId).catch(() => {});

      // ── Socket.IO (in-app, real-time) ──
      if (_io) {
        const rawPhoto = row.actor_photo_url;
        const photoUrl = (typeof rawPhoto === 'string' &&
          (rawPhoto.startsWith('/') || /^https?:\/\//i.test(rawPhoto)))
          ? rawPhoto : null;

        const actor = row.actor_username || row.actor_first_name
          ? {
              id: row.actor_id,
              username: row.actor_username,
              firstName: row.actor_first_name,
              photoUrl,
            }
          : null;

        _io.to(`user:${targetUserId}`).emit('notification:new', {
          id: row.id,
          type: row.type,
          category: row.category,
          priority: row.priority,
          entityType: row.entity_type,
          entityId: row.entity_id,
          message: row.message,
          metadata: row.metadata,
          isRead: false,
          createdAt: row.created_at,
          actor,
        });
      }

      // ── Multi-channel delivery (fire-and-forget) ──
      this._deliverExtraChannels(targetUserId, row, type, prefVal, entityType, entityId).catch(() => {});

    } catch (err) {
      logger.error('NotificationEmitter.emit error', { type, targetUserId, error: err.message });
    }
  },

  /**
   * Deliver to push + bot channels (fire-and-forget).
   * @private
   */
  async _deliverExtraChannels(targetUserId, row, type, prefVal, entityType, entityId) {
    const NotificationThrottleService = require('./notificationThrottleService');

    // Resolve the actor's photo to an app-relative or absolute URL. The
    // photo_file_id column also stores raw Telegram file_ids for legacy
    // rows — filter those out (they aren't valid image URLs for either
    // web-push or a public Telegram sendPhoto call).
    const rawPhoto = row.actor_photo_url;
    const actorPhotoUrl = (typeof rawPhoto === 'string' &&
      (rawPhoto.startsWith('/') || /^https?:\/\//i.test(rawPhoto)))
      ? rawPhoto : null;

    // ── Web Push (opt-out: enabled by default) ──
    if (isChannelEnabled(prefVal, 'push', true)) {
      try {
        const canPush = await NotificationThrottleService.canSendPush(targetUserId);
        if (canPush) {
          const PushNotificationService = require('./pushNotificationService');
          const meta = (typeof row.metadata === 'object' && row.metadata) || {};
          const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
          const absoluteActorPhoto = actorPhotoUrl
            ? (actorPhotoUrl.startsWith('/') ? `${appUrl}${actorPhotoUrl}` : actorPhotoUrl)
            : null;
          await PushNotificationService.sendToUser(targetUserId, {
            title: meta.pushTitle || buildPushTitle(type, row),
            body: meta.pushBody || buildPushBody(type, row),
            url: meta.url || buildNotificationUrl(type, entityType, entityId),
            tag: meta.pushTag || `${type}-${entityId || 'general'}`,
            // Actor avatar as the small icon + optional large image banner.
            // meta.icon/image override lets specific emitters use custom art
            // (e.g. live-stream cards use the branded snapshot).
            ...(absoluteActorPhoto ? { icon: meta.icon || absoluteActorPhoto } : (meta.icon ? { icon: meta.icon } : {})),
            ...(meta.image ? { image: meta.image } : (absoluteActorPhoto ? { image: absoluteActorPhoto } : {})),
          });
        }
      } catch (err) {
        logger.warn('NotificationEmitter: push delivery error', { targetUserId, type, error: err.message });
      }
    }

    // ── Telegram Bot DM (enabled by default for all types) ──
    if (!SKIP_BOT_TYPES.has(type) && isChannelEnabled(prefVal, 'bot', true)) {
      try {
        const canBot = await NotificationThrottleService.canSendBot(targetUserId);
        if (canBot) {
          const { sendNotificationViaTelegram } = require('./notificationBotDelivery');
          await sendNotificationViaTelegram(targetUserId, {
            type,
            message: row.message,
            entityType,
            entityId,
            actorPhotoUrl,
          });
        }
      } catch (err) {
        logger.warn('NotificationEmitter: bot delivery error', { targetUserId, type, error: err.message });
      }
    }
  },

  /**
   * Emit the same notification to many users.
   * Capped at MAX_FANOUT recipients.
   */
  async emitToMany(targetUserIds, opts) {
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) return;

    const recipients = targetUserIds.slice(0, MAX_FANOUT);
    if (targetUserIds.length > MAX_FANOUT) {
      logger.warn('NotificationEmitter.emitToMany: recipient list capped', {
        type: opts.type,
        requested: targetUserIds.length,
        capped: MAX_FANOUT,
      });
    }

    // Process in chunks to avoid exhausting the DB connection pool (max 30 connections).
    // Firing all 500 concurrently causes 5s+ query pile-ups and pool timeouts.
    const CHUNK = 10;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      await Promise.allSettled(
        recipients.slice(i, i + CHUNK).map((uid) => this.emit({ ...opts, targetUserId: uid }))
      );
    }
  },
};

module.exports = NotificationEmitter;
