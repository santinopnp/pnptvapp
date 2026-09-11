'use strict';

/**
 * MembershipCleanupService
 *
 * Runs daily at midnight (via cron.js) and on-demand from the admin panel.
 *
 * runFullCleanup():
 *   1. Marks expired user_entitlements rows as is_consumed=true
 *   2. Calls EntitlementAccessService.recomputeUserTier() for each affected user
 *      so users.tier and subscription_status stay in sync with entitlement state
 *
 * syncAllMembershipStatuses():
 *   Lighter scan — finds users whose tier doesn't match their live entitlement
 *   state and recomputes them. Runs twice daily (06:00 + 18:00 UTC) as a
 *   belt-and-suspenders pass after payment webhooks or clock skew.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

// Loaded lazily so the module can be required before the bot boots.
let _entitlementAccessService = null;
function getEAS() {
  if (!_entitlementAccessService) {
    _entitlementAccessService = require('./entitlementAccessService');
  }
  return _entitlementAccessService;
}

class MembershipCleanupService {
  // Called from bot.js after the bot instance is ready (no-op — kept for API compat).
  static initialize(_bot) { /* intentionally empty */ }

  /**
   * Expire consumed entitlements and downgrade tiers.
   * Returns { statusUpdates: { processed, downgraded, errors }, channelKicks: { kicked: 0 } }
   */
  static async runFullCleanup() {
    const startedAt = Date.now();
    logger.info('MembershipCleanupService.runFullCleanup: starting');

    let processed = 0;
    let downgraded = 0;
    let errors = 0;

    try {
      // Step 1: mark all expired (non-lifetime) entitlements as consumed.
      // A 5-minute grace period avoids racing with payment webhooks.
      const { rows: expired } = await query(`
        UPDATE user_entitlements
           SET is_consumed = true, updated_at = NOW()
         WHERE is_lifetime = false
           AND is_consumed  = false
           AND expires_at IS NOT NULL
           AND expires_at < NOW() - INTERVAL '5 minutes'
         RETURNING user_id
      `);

      processed = expired.length;

      if (processed === 0) {
        logger.info('MembershipCleanupService.runFullCleanup: no expired entitlements found');
        return { statusUpdates: { processed: 0, downgraded: 0, errors: 0 }, channelKicks: { kicked: 0 } };
      }

      logger.info(`MembershipCleanupService.runFullCleanup: expired ${processed} entitlements, recomputing tiers`);

      // Step 2: recompute tier for each affected unique user.
      const EAS = getEAS();
      const uniqueUserIds = [...new Set(expired.map((r) => r.user_id))];

      for (const userId of uniqueUserIds) {
        try {
          const newTier = await EAS.recomputeUserTier(userId);
          if (newTier === 'free') downgraded++;
        } catch (err) {
          errors++;
          logger.warn('MembershipCleanupService.runFullCleanup: recompute failed', { userId, err: err.message });
        }
      }
    } catch (err) {
      logger.error('MembershipCleanupService.runFullCleanup: fatal error', { err: err.message });
      errors++;
    }

    const durationMs = Date.now() - startedAt;
    logger.info('MembershipCleanupService.runFullCleanup: done', { processed, downgraded, errors, durationMs });

    return {
      statusUpdates: { processed, downgraded, errors },
      channelKicks: { kicked: 0 }, // Telegram channel kicks removed 2026-09-04
    };
  }

  /**
   * Reconcile tier display for all users whose tier doesn't match their
   * live entitlement state. Lighter than runFullCleanup (no expiry writes).
   */
  static async syncAllMembershipStatuses() {
    const startedAt = Date.now();
    logger.info('MembershipCleanupService.syncAllMembershipStatuses: starting');

    let synced = 0;
    let errors = 0;

    try {
      // Find users whose tier is out of sync with their entitlements.
      // Case A: tier=PRIME/member but no active entitlement (over-privileged)
      // Case B: tier=free but has an active entitlement (under-privileged)
      const { rows: drifted } = await query(`
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.tier NOT IN ('banned', 'admin', 'superadmin', 'creator', 'model')
          AND (
            -- over-privileged: tier > entitlement
            (u.tier IN ('PRIME', 'member')
              AND NOT EXISTS (
                SELECT 1 FROM user_entitlements ue
                WHERE ue.user_id = u.id::text
                  AND ue.add_on_id IN ('prime', 'pnp-member')
                  AND ue.is_consumed = false
                  AND (ue.is_lifetime = true OR (ue.expires_at IS NOT NULL AND ue.expires_at > NOW()))
              )
            )
            OR
            -- under-privileged: entitlement > tier
            (u.tier = 'free'
              AND EXISTS (
                SELECT 1 FROM user_entitlements ue
                WHERE ue.user_id = u.id::text
                  AND ue.add_on_id IN ('prime', 'pnp-member')
                  AND ue.is_consumed = false
                  AND (ue.is_lifetime = true OR (ue.expires_at IS NOT NULL AND ue.expires_at > NOW()))
              )
            )
          )
        LIMIT 500
      `);

      if (drifted.length > 0) {
        logger.info(`MembershipCleanupService.syncAllMembershipStatuses: found ${drifted.length} drifted users`);
        const EAS = getEAS();
        for (const { id } of drifted) {
          try {
            await EAS.recomputeUserTier(id);
            synced++;
          } catch (err) {
            errors++;
            logger.warn('MembershipCleanupService.syncAllMembershipStatuses: recompute failed', { userId: id, err: err.message });
          }
        }
      }
    } catch (err) {
      logger.error('MembershipCleanupService.syncAllMembershipStatuses: fatal error', { err: err.message });
      errors++;
    }

    const durationMs = Date.now() - startedAt;
    logger.info('MembershipCleanupService.syncAllMembershipStatuses: done', { synced, errors, durationMs });
    return { synced, errors };
  }

  // Admin dashboard compat — returns lightweight churn analysis.
  static async getChurnAnalysis() {
    try {
      const { rows } = await query(`
        SELECT
          COUNT(*)::int FILTER (WHERE tier IN ('PRIME','member')) AS active_prime,
          COUNT(*)::int FILTER (WHERE subscription_status = 'churned') AS churned_total,
          COUNT(*)::int FILTER (
            WHERE is_consumed = false AND is_lifetime = false
              AND expires_at IS NOT NULL AND expires_at > NOW()
          ) AS active_entitlements
        FROM users u
        LEFT JOIN user_entitlements ue ON ue.user_id = u.id::text
          AND ue.add_on_id IN ('prime','pnp-member')
      `);
      return rows[0] || {};
    } catch (err) {
      logger.warn('MembershipCleanupService.getChurnAnalysis: failed', { err: err.message });
      return {};
    }
  }
}

module.exports = MembershipCleanupService;
