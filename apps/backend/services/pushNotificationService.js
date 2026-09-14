/**
 * PushNotificationService
 * Sends Web Push notifications via the `web-push` npm package.
 *
 * The `web-push` package is optional. If it is not installed the service
 * degrades gracefully: all send methods log a warning and return 0.
 *
 * Required env vars when web-push IS installed:
 *   VAPID_PUBLIC_KEY   — base64url-encoded VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded VAPID private key
 *   VAPID_SUBJECT      — mailto: or https: URI identifying the sender
 */

'use strict';

const logger = require('../utils/logger');
const { query } = require('../config/postgres');

/** Attempt to load web-push; if missing, webpush stays null. */
let webpush = null;
try {
  webpush = require('web-push');
} catch (_err) {
  logger.warn(
    '[PushNotificationService] web-push package not found. ' +
    'Push notifications are disabled. Install it with: npm install web-push'
  );
}

// In-memory consecutive timeout counter — resets on successful send or restart.
// Subscriptions that time out 5+ times in a row are pruned as permanently stale.
const _timeoutFailures = new Map();
const TIMEOUT_PRUNE_THRESHOLD = 5;

class PushNotificationService {
  /**
   * Call once at application startup to configure VAPID credentials.
   * Silently skips if web-push is not available.
   */
  static initialize() {
    if (!webpush) return;

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@pnptv.app';

    if (!publicKey || !privateKey) {
      logger.warn('[PushNotificationService] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set. Push disabled.');
      webpush = null;
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    PushNotificationService._initialized = true;
    logger.info('[PushNotificationService] VAPID details configured successfully.');
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Has VAPID been configured on the web-push singleton?
   * One-off broadcast scripts that don't go through the full bot startup
   * must call initialize() themselves; without it every send returns false
   * silently. Internal helper used by sendToUsers/sendToTier/sendToAll to
   * fail loudly instead of swallowing 0 deliveries.
   */
  static _ensureInitialized() {
    if (!webpush) return;
    // web-push exposes the configured details internally — read them via
    // the same code path setVapidDetails uses. We can't introspect directly,
    // but we cache a flag on the class.
    if (!PushNotificationService._initialized) {
      logger.warn(
        '[PushNotificationService] sendNotification called before initialize() — auto-initializing now. ' +
        'Long-lived processes should call PushNotificationService.initialize() at startup.'
      );
      PushNotificationService.initialize();
      PushNotificationService._initialized = true;
    }
  }

  /**
   * Build the web-push payload object.
   *
   * Canonical payload shape all callsites must use:
   *   title:  string  (≤50 chars)
   *   body:   string  (≤120 chars)
   *   url:    string  (relative path starting with /)
   *   tag:    string  (REQUIRED — collapses duplicate notifications in browser)
   *   icon:   string  (defaults to /app-icon-192.png)
   *   image?: string  (optional large banner — creator avatar, live snapshot;
   *                    supported by Chrome/Edge, ignored by Safari)
   *
   * @param {{ title: string, body: string, url?: string, icon?: string, image?: string, tag: string }} opts
   * @returns {string} JSON string
   */
  static _buildPayload({ title, body, url, icon, image, tag }) {
    const payload = {
      title: title || 'PNPtv!',
      body: body || '',
      url: url || '/',
      icon: icon || '/app-icon-192.png',
      badge: '/badge-diamond.png',
    };
    // The Web Push spec's `image` field displays a large banner under the
    // body — a good spot for the actor's avatar / a live-snapshot card.
    // Chrome/Edge honor it; Safari ignores it (falls back to icon only).
    if (image) payload.image = image;
    if (tag) payload.tag = tag;
    return JSON.stringify(payload);
  }

  /**
   * Check a single user's push opt-in status and quiet hours.
   * Used by sendToUser where a batch query would be overkill.
   *
   * @param {string} userId
   * @param {string} notifType  e.g. 'new_message', 'live_stream'
   * @returns {Promise<boolean>} true = send, false = skip
   */
  static async _isUserOptedIn(userId, notifType) {
    try {
      const result = await query(
        'SELECT notification_preferences FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length === 0) return false;

      const prefs = result.rows[0].notification_preferences;
      if (!prefs) return true;

      if (prefs[notifType]?.push === false) return false;

      if (prefs.quiet_hours?.enabled === true) {
        const [startHour] = (prefs.quiet_hours.start || '00:00').split(':').map(Number);
        const [endHour] = (prefs.quiet_hours.end || '00:00').split(':').map(Number);
        const currentHour = new Date().getUTCHours();

        // Handles both same-day (09–17) and midnight-wrap (22–06) windows
        const inQuiet = startHour <= endHour
          ? currentHour >= startHour && currentHour <= endHour
          : currentHour >= startHour || currentHour <= endHour;

        if (inQuiet) return false;
      }

      return true;
    } catch (err) {
      // On error, allow the send — a preference lookup failure should not
      // silently drop legitimate notifications
      logger.warn('[PushNotificationService] _isUserOptedIn error, defaulting to opted-in', {
        userId,
        notifType,
        error: err.message,
      });
      return true;
    }
  }

  /**
   * Filter a list of user IDs down to those who have not opted out of
   * `notifType` push notifications and are not currently in quiet hours.
   * Single batch query — use for all multi-user send paths.
   *
   * @param {string[]} userIds
   * @param {string} notifType
   * @returns {Promise<string[]>} filtered user IDs
   */
  static async _filterOptedInUsers(userIds, notifType) {
    if (!userIds.length) return [];
    try {
      const result = await query(
        `SELECT id FROM users
          WHERE id = ANY($1::text[])
            AND (
              notification_preferences IS NULL
              OR notification_preferences->($2::text)->>'push' IS DISTINCT FROM 'false'
            )
            AND (
              notification_preferences->'quiet_hours'->>'enabled' != 'true'
              OR NOT (
                CASE
                  WHEN SPLIT_PART(notification_preferences->'quiet_hours'->>'start', ':', 1)::int
                       <= SPLIT_PART(notification_preferences->'quiet_hours'->>'end', ':', 1)::int
                  THEN EXTRACT(HOUR FROM NOW()) BETWEEN
                         SPLIT_PART(notification_preferences->'quiet_hours'->>'start', ':', 1)::int
                       AND SPLIT_PART(notification_preferences->'quiet_hours'->>'end', ':', 1)::int
                  ELSE EXTRACT(HOUR FROM NOW()) >= SPLIT_PART(notification_preferences->'quiet_hours'->>'start', ':', 1)::int
                    OR EXTRACT(HOUR FROM NOW()) <= SPLIT_PART(notification_preferences->'quiet_hours'->>'end', ':', 1)::int
                END
              )
            )`,
        [userIds, notifType]
      );
      return result.rows.map(r => r.id);
    } catch (err) {
      // On error allow everyone through — same rationale as _isUserOptedIn
      logger.warn('[PushNotificationService] _filterOptedInUsers error, skipping filter', {
        notifType,
        error: err.message,
      });
      return userIds;
    }
  }

  /**
   * Send a push notification to a single subscription row.
   * Removes the subscription from the DB if the endpoint has expired (410).
   *
   * @param {{ id: bigint|string, endpoint: string, auth: string, p256dh: string }} sub
   * @param {string} payloadJson
   * @returns {Promise<boolean>} true if sent successfully, false otherwise
   */
  static async _sendToSubscription(sub, payloadJson) {
    if (!webpush) return false;

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        auth: sub.auth,
        p256dh: sub.p256dh,
      },
    };

    try {
      // 8s wall-clock cap per push. Without this, a slow FCM/Apple gateway
      // response can hang the surrounding Promise.all batch indefinitely
      // (web-push has no internal timeout). One stuck endpoint should not
      // block delivery to the rest of the audience.
      await Promise.race([
        webpush.sendNotification(pushSubscription, payloadJson, { TTL: 86400 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('push send timeout'), { statusCode: 408 })), 8_000)
        ),
      ]);
      _timeoutFailures.delete(String(sub.id)); // reset on success
      return true;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription has expired or is invalid — remove it
        logger.info('[PushNotificationService] Removing expired subscription', { id: sub.id });
        _timeoutFailures.delete(String(sub.id));
        await this.removeSubscription(sub.id);
      } else if (err.statusCode === 408) {
        const key = String(sub.id);
        const count = (_timeoutFailures.get(key) || 0) + 1;
        if (count >= TIMEOUT_PRUNE_THRESHOLD) {
          logger.info('[PushNotificationService] Pruning subscription after repeated timeouts', { id: sub.id, count });
          _timeoutFailures.delete(key);
          await this.removeSubscription(sub.id);
        } else {
          _timeoutFailures.set(key, count);
          logger.warn(`push send timeout`, { id: String(sub.id), status: 408 });
        }
      } else if (err.statusCode === 429) {
        // Push service rate-limiting this endpoint — track failures and prune if persistent
        const key = String(sub.id);
        const count = (_timeoutFailures.get(key) || 0) + 1;
        if (count >= TIMEOUT_PRUNE_THRESHOLD) {
          logger.info('[PushNotificationService] Pruning subscription after repeated 429s', { id: sub.id, count });
          _timeoutFailures.delete(key);
          await this.removeSubscription(sub.id);
        } else {
          _timeoutFailures.set(key, count);
          logger.warn('[PushNotificationService] Push rate-limited (429)', { id: sub.id, attempt: count });
        }
      } else {
        logger.warn('[PushNotificationService] Failed to send to subscription', {
          id: sub.id,
          status: err.statusCode,
          message: err.message,
        });
      }
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Public send methods
  // ---------------------------------------------------------------------------

  /**
   * Send a push notification to all subscriptions of a specific user.
   *
   * @param {string} userId
   * @param {{ title: string, body: string, url?: string, icon?: string, tag: string }} opts
   * @param {{ notifType?: string }} [options]
   * @returns {Promise<number>} Number of successful deliveries
   */
  static async sendToUser(userId, opts, options = {}) {
    if (!webpush) return 0;
    PushNotificationService._ensureInitialized();

    try {
      if (options.notifType) {
        const optedIn = await this._isUserOptedIn(userId, options.notifType);
        if (!optedIn) return 0;
      }

      const result = await query(
        'SELECT id, endpoint, auth, p256dh FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) return 0;

      const payloadJson = this._buildPayload(opts);
      const results = await Promise.all(
        result.rows.map(sub => this._sendToSubscription(sub, payloadJson))
      );

      return results.filter(Boolean).length;
    } catch (error) {
      logger.error('[PushNotificationService] sendToUser error', { userId, error: error.message });
      return 0;
    }
  }

  /**
   * Send a push notification to every subscription in the database.
   *
   * @param {{ title: string, body: string, url?: string, icon?: string, tag: string }} opts
   * @param {{ notifType?: string }} [options]
   * @returns {Promise<number>} Number of successful deliveries
   */
  static async sendToAll(opts, options = {}) {
    if (!webpush) return 0;
    PushNotificationService._ensureInitialized();

    try {
      const notifType = options.notifType;
      const prefFilter = notifType
        ? `AND (
              u.notification_preferences IS NULL
              OR u.notification_preferences->${`'${notifType}'`}->>'push' IS DISTINCT FROM 'false'
            )
            AND (
              u.notification_preferences->'quiet_hours'->>'enabled' != 'true'
              OR NOT (
                CASE
                  WHEN (u.notification_preferences->'quiet_hours'->>'start')::int
                       <= (u.notification_preferences->'quiet_hours'->>'end')::int
                  THEN EXTRACT(HOUR FROM NOW()) BETWEEN
                         (u.notification_preferences->'quiet_hours'->>'start')::int
                       AND (u.notification_preferences->'quiet_hours'->>'end')::int
                  ELSE EXTRACT(HOUR FROM NOW()) >= (u.notification_preferences->'quiet_hours'->>'start')::int
                    OR EXTRACT(HOUR FROM NOW()) <= (u.notification_preferences->'quiet_hours'->>'end')::int
                END
              )
            )`
        : '';

      const result = await query(
        `SELECT ps.id, ps.endpoint, ps.auth, ps.p256dh
           FROM push_subscriptions ps
           JOIN users u ON u.id = ps.user_id
          WHERE u.deleted_at IS NULL
            AND u.tier != 'banned'
            ${prefFilter}`
      );

      if (result.rows.length === 0) return 0;

      const payloadJson = this._buildPayload(opts);
      let sent = 0;

      // Send in batches of 50 to avoid overwhelming the event loop
      const batchSize = 50;
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(sub => this._sendToSubscription(sub, payloadJson))
        );
        sent += batchResults.filter(Boolean).length;
      }

      logger.info('[PushNotificationService] sendToAll complete', { total: result.rows.length, sent });
      return sent;
    } catch (error) {
      logger.error('[PushNotificationService] sendToAll error', { error: error.message });
      return 0;
    }
  }

  /**
   * Send a push notification to all subscribers with a matching entitlement.
   * `tier` maps to an add_on_id in user_entitlements — the authoritative access table.
   *
   * @param {string} tier  add_on_id value, e.g. 'prime', 'member'
   * @param {{ title: string, body: string, url?: string, icon?: string, tag: string }} opts
   * @param {{ notifType?: string }} [options]
   * @returns {Promise<number>} Number of successful deliveries
   */
  static async sendToTier(tier, opts, options = {}) {
    if (!webpush) return 0;
    PushNotificationService._ensureInitialized();

    try {
      const notifType = options.notifType;
      const prefFilter = notifType
        ? `AND (
              u.notification_preferences IS NULL
              OR u.notification_preferences->${`'${notifType}'`}->>'push' IS DISTINCT FROM 'false'
            )
            AND (
              u.notification_preferences->'quiet_hours'->>'enabled' != 'true'
              OR NOT (
                CASE
                  WHEN (u.notification_preferences->'quiet_hours'->>'start')::int
                       <= (u.notification_preferences->'quiet_hours'->>'end')::int
                  THEN EXTRACT(HOUR FROM NOW()) BETWEEN
                         (u.notification_preferences->'quiet_hours'->>'start')::int
                       AND (u.notification_preferences->'quiet_hours'->>'end')::int
                  ELSE EXTRACT(HOUR FROM NOW()) >= (u.notification_preferences->'quiet_hours'->>'start')::int
                    OR EXTRACT(HOUR FROM NOW()) <= (u.notification_preferences->'quiet_hours'->>'end')::int
                END
              )
            )`
        : '';

      // user_entitlements is the authoritative access table — users.tier is a
      // display/admin field that may drift; never gate sends on it alone.
      // Fallback to users.tier join preserved below as a comment for reference:
      //   JOIN users u ON u.id = ps.user_id WHERE LOWER(u.tier) = LOWER($1)
      const result = await query(
        `SELECT ps.id, ps.endpoint, ps.auth, ps.p256dh
           FROM push_subscriptions ps
           JOIN user_entitlements ue ON ue.user_id = ps.user_id
           JOIN users u ON u.id = ps.user_id
          WHERE ue.add_on_id = $1
            AND (ue.expires_at IS NULL OR ue.expires_at > NOW())
            AND ue.is_consumed = false
            AND u.deleted_at IS NULL
            AND u.tier != 'banned'
            ${prefFilter}`,
        [tier]
      );

      if (result.rows.length === 0) return 0;

      const payloadJson = this._buildPayload(opts);
      let sent = 0;

      const batchSize = 50;
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(sub => this._sendToSubscription(sub, payloadJson))
        );
        sent += batchResults.filter(Boolean).length;
      }

      logger.info('[PushNotificationService] sendToTier complete', { tier, total: result.rows.length, sent });
      return sent;
    } catch (error) {
      logger.error('[PushNotificationService] sendToTier error', { tier, error: error.message });
      return 0;
    }
  }

  /**
   * Send a push notification to a specific list of user IDs.
   *
   * @param {string[]} userIds
   * @param {{ title: string, body: string, url?: string, icon?: string, tag: string }} opts
   * @param {{ notifType?: string }} [options]
   * @returns {Promise<number>} Number of successful deliveries
   */
  static async sendToUsers(userIds, opts, options = {}) {
    if (!webpush || !Array.isArray(userIds) || userIds.length === 0) return 0;
    PushNotificationService._ensureInitialized();

    try {
      const targetIds = options.notifType
        ? await this._filterOptedInUsers(userIds, options.notifType)
        : userIds;

      if (targetIds.length === 0) return 0;

      // Use ANY($1::text[]) for safe parameterized array query
      const result = await query(
        `SELECT id, endpoint, auth, p256dh
           FROM push_subscriptions
          WHERE user_id = ANY($1::text[])`,
        [targetIds]
      );

      if (result.rows.length === 0) return 0;

      const payloadJson = this._buildPayload(opts);
      let sent = 0;

      const batchSize = 50;
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(sub => this._sendToSubscription(sub, payloadJson))
        );
        sent += batchResults.filter(Boolean).length;
      }

      logger.info('[PushNotificationService] sendToUsers complete', { userCount: userIds.length, sent });
      return sent;
    } catch (error) {
      logger.error('[PushNotificationService] sendToUsers error', { error: error.message });
      return 0;
    }
  }

  /**
   * Send a push notification to all active/eligible creators with push subscriptions.
   *
   * @param {{ title: string, body: string, url?: string, icon?: string, tag: string }} opts
   * @param {{ notifType?: string }} [options]
   * @returns {Promise<number>} Number of successful deliveries
   */
  static async sendToCreators(opts, options = {}) {
    if (!webpush) return 0;
    PushNotificationService._ensureInitialized();

    try {
      const notifType = options.notifType;
      const prefFilter = notifType
        ? `AND (
              u.notification_preferences IS NULL
              OR u.notification_preferences->${`'${notifType}'`}->>'push' IS DISTINCT FROM 'false'
            )
            AND (
              u.notification_preferences->'quiet_hours'->>'enabled' != 'true'
              OR NOT (
                CASE
                  WHEN (u.notification_preferences->'quiet_hours'->>'start')::int
                       <= (u.notification_preferences->'quiet_hours'->>'end')::int
                  THEN EXTRACT(HOUR FROM NOW()) BETWEEN
                         (u.notification_preferences->'quiet_hours'->>'start')::int
                       AND (u.notification_preferences->'quiet_hours'->>'end')::int
                  ELSE EXTRACT(HOUR FROM NOW()) >= (u.notification_preferences->'quiet_hours'->>'start')::int
                    OR EXTRACT(HOUR FROM NOW()) <= (u.notification_preferences->'quiet_hours'->>'end')::int
                END
              )
            )`
        : '';

      const result = await query(
        `SELECT ps.id, ps.endpoint, ps.auth, ps.p256dh
           FROM push_subscriptions ps
           JOIN users u ON u.id = ps.user_id
          WHERE u.creator_status IN ('active', 'eligible')
            AND u.deleted_at IS NULL
            AND u.tier != 'banned'
            ${prefFilter}`
      );

      if (result.rows.length === 0) return 0;

      const payloadJson = this._buildPayload(opts);
      let sent = 0;

      const batchSize = 50;
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(sub => this._sendToSubscription(sub, payloadJson))
        );
        sent += batchResults.filter(Boolean).length;
      }

      logger.info('[PushNotificationService] sendToCreators complete', { total: result.rows.length, sent });
      return sent;
    } catch (error) {
      logger.error('[PushNotificationService] sendToCreators error', { error: error.message });
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Subscription cleanup
  // ---------------------------------------------------------------------------

  /**
   * Remove a push subscription by its primary key.
   *
   * @param {bigint|string|number} id
   * @returns {Promise<void>}
   */
  static async removeSubscription(id) {
    try {
      await query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
    } catch (error) {
      logger.error('[PushNotificationService] removeSubscription error', { id, error: error.message });
    }
  }
}

module.exports = PushNotificationService;
