const { query } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');
const MODERATION_CONFIG = require('../config/moderationConfig');

const ANTI_LEAKAGE_MUTE_TTL_SECONDS = 24 * 60 * 60; // 24h — the strike-2 mute duration
const ANTI_LEAKAGE_STRIKE_WINDOW_DAYS = 30;         // rolling window for strike escalation
const ANTI_LEAKAGE_MUTE_KEY = (userId) => `antileakage:mute:${userId}`;

/**
 * Warning Service - Manages user warnings and moderation history
 */
class WarningService {
  /**
   * Add a warning to a user
   * @param {Object} params - Warning parameters
   * @param {string} params.userId - User ID
   * @param {string} params.adminId - Admin ID who issued warning
   * @param {string} params.reason - Reason for warning
   * @param {string} params.groupId - Group ID
   * @returns {Promise<Object>} Warning details with action taken
   */
  static async addWarning({ userId, adminId, reason, groupId }) {
    try {
      // Insert warning into database
      await query(
        `INSERT INTO warnings (user_id, admin_id, reason, group_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId.toString(), adminId.toString(), reason, groupId.toString()]
      );

      // Get active warning count SCOPED to this group. Previously the count
      // aggregated across all groups so a user could be banned everywhere for
      // strikes earned somewhere else.
      const warningCount = await this.getActiveWarningCount(userId, groupId);

      // Determine action based on warning count
      const action = MODERATION_CONFIG.WARNING_SYSTEM.ACTIONS[warningCount] ||
                     MODERATION_CONFIG.WARNING_SYSTEM.ACTIONS[3];

      logger.info('Warning added', { userId, adminId, reason, warningCount, action: action.type });

      return {
        warningCount,
        action,
        isMaxWarnings: warningCount >= MODERATION_CONFIG.WARNING_SYSTEM.MAX_WARNINGS,
      };
    } catch (error) {
      logger.error('Error adding warning:', error);
      throw error;
    }
  }

  /**
   * Get active warning count for a user in a specific group.
   * Scoped by groupId to prevent cross-group aggregation. If groupId is omitted,
   * falls back to global count (legacy behavior, discouraged).
   * @param {string} userId - User ID
   * @param {string} [groupId] - Group ID (Telegram chat ID as string)
   * @returns {Promise<number>} Number of active warnings
   */
  static async getActiveWarningCount(userId, groupId) {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - MODERATION_CONFIG.WARNING_SYSTEM.WARNING_EXPIRY_DAYS);

      const params = [userId.toString(), expiryDate];
      let sql = `SELECT COUNT(*) as count
                 FROM warnings
                 WHERE user_id = $1
                   AND created_at > $2
                   AND cleared = false`;
      if (groupId != null) {
        params.push(groupId.toString());
        sql += ' AND group_id = $3';
      }

      const result = await query(sql, params);
      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      logger.error('Error getting warning count:', error);
      return 0;
    }
  }

  /**
   * Get all warnings for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of warnings
   */
  static async getUserWarnings(userId) {
    try {
      const result = await query(
        `SELECT w.*, u.username as admin_username
         FROM warnings w
         LEFT JOIN users u ON w.admin_id = u.id
         WHERE w.user_id = $1
         ORDER BY w.created_at DESC
         LIMIT 10`,
        [userId.toString()]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting user warnings:', error);
      return [];
    }
  }

  /**
   * Clear all warnings for a user
   * @param {string} userId - User ID
   * @param {string} adminId - Admin ID who cleared warnings
   * @returns {Promise<number>} Number of warnings cleared
   */
  static async clearWarnings(userId, adminId) {
    try {
      const result = await query(
        `UPDATE warnings
         SET cleared = true, cleared_by = $2, cleared_at = NOW()
         WHERE user_id = $1 AND cleared = false`,
        [userId.toString(), adminId.toString()]
      );

      logger.info('Warnings cleared', { userId, adminId, count: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Error clearing warnings:', error);
      throw error;
    }
  }

  /**
   * Record a moderation action
   * @param {Object} params - Action parameters
   * @returns {Promise<void>}
   */
  static async recordAction({ userId, adminId, action, reason, duration, groupId }) {
    try {
      // Calculate expires_at from duration (duration is in milliseconds)
      const expiresAt = duration ? new Date(Date.now() + duration) : null;

      await query(
        `INSERT INTO moderation_actions (user_id, moderator_id, action_type, reason, expires_at, group_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [userId.toString(), adminId.toString(), action, reason, expiresAt, groupId.toString()]
      );

      logger.info('Moderation action recorded', { userId, adminId, action, reason });
    } catch (error) {
      logger.error('Error recording moderation action:', error);
    }
  }

  /**
   * Check if user is muted
   * @param {string} userId - User ID
   * @param {string} groupId - Group ID
   * @returns {Promise<Object|null>} Mute info or null
   */
  static async getMuteStatus(userId, groupId) {
    try {
      const result = await query(
        `SELECT * FROM moderation_actions
         WHERE user_id = $1
         AND group_id = $2
         AND action_type = 'mute'
         AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId.toString(), groupId.toString()]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const mute = result.rows[0];
      const expiresAt = new Date(mute.expires_at);
      const duration = expiresAt.getTime() - new Date(mute.created_at).getTime();

      return {
        isMuted: true,
        reason: mute.reason,
        expiresAt,
        duration,
      };
    } catch (error) {
      logger.error('Error checking mute status:', error);
      return null;
    }
  }

  /**
   * Unmute a user
   * @param {string} userId - User ID
   * @param {string} adminId - Admin ID
   * @param {string} groupId - Group ID
   * @returns {Promise<boolean>} Success status
   */
  static async unmute(userId, adminId, groupId) {
    try {
      // Set expires_at to NOW() to expire the mute immediately
      await query(
        `UPDATE moderation_actions
         SET expires_at = NOW(), updated_at = NOW()
         WHERE user_id = $1
         AND group_id = $2
         AND action_type = 'mute'
         AND expires_at > NOW()`,
        [userId.toString(), groupId.toString()]
      );

      await this.recordAction({
        userId,
        adminId,
        action: 'unmute',
        reason: 'Unmuted by admin',
        duration: null,
        groupId,
      });

      logger.info('User unmuted', { userId, adminId, groupId });
      return true;
    } catch (error) {
      logger.error('Error unmuting user:', error);
      return false;
    }
  }

  /**
   * Record an anti-leakage detection as a strike + apply the escalation
   * ladder. Idempotent-ish: the same content submitted twice will produce
   * two rows (intentional — the user is retrying the violation).
   *
   * Enforcement ladder:
   *   Regular user:  strike 1 → warn (no side effect)
   *                  strike 2 → mute_24h  (Redis TTL — checked by hooks)
   *                  strike 3+ → ban      (PlatformBanService.ban)
   *   Creator user:  strike 1 → warn + Slack ping to #ext-<handle> equiv
   *                  strike 2 → warn (elevated) + Slack ping — NO auto-mute
   *                             (creators lose income if silenced; require human)
   *                  strike 3+ → hold_for_review (Slack CRITICAL, no auto-ban)
   *                             Sprint 2 will add automatic payout hold here.
   *
   * @param {object} p
   * @param {string} p.userId
   * @param {string} p.sourceType       — 'bio' | 'dm' | 'mainstage_chat' | 'hangout_chat' | 'post' | 'channel_description' | 'display_name' | 'username'
   * @param {string} [p.sourceRef]      — optional pointer (e.g. hangout group id)
   * @param {string} [p.evidenceText]   — raw offending content (truncated to 500 chars)
   * @param {Array<{category:string,term:string}>} p.matchedTerms — from err.terms
   * @param {string} [p.issuedBy='system']
   * @returns {Promise<{strikeNumber:number, action:string, strikeId:number, isCreator:boolean}>}
   */
  static async logAntiLeakageStrike({
    userId,
    sourceType,
    sourceRef = null,
    evidenceText = '',
    matchedTerms = [],
    issuedBy = 'system',
  }) {
    const uid = String(userId);
    try {
      // 1. Look up user (creator?, tier, username for Slack alert)
      const userRes = await query(
        `SELECT id, username, creator_status, tier, role
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [uid]
      );
      if (userRes.rows.length === 0) {
        logger.warn('logAntiLeakageStrike: user not found', { userId: uid });
        return { strikeNumber: 0, action: 'strip_only', strikeId: null, isCreator: false };
      }
      const user = userRes.rows[0];
      const isCreator = !!user.creator_status
        && user.creator_status !== 'none'
        && user.creator_status !== 'inactive';

      // 2. Category = worst-severity match from terms (competitor > payment)
      const cats = new Set(matchedTerms.map((t) => t.category));
      const category = cats.has('off_platform_competitor')
        ? 'off_platform_competitor'
        : 'off_platform_payment';

      // 3. Count active strikes in rolling window
      const windowRes = await query(
        `SELECT COUNT(*)::int AS n
           FROM anti_leakage_strikes
          WHERE user_id = $1
            AND cleared = false
            AND created_at > NOW() - ($2 || ' days')::interval`,
        [uid, String(ANTI_LEAKAGE_STRIKE_WINDOW_DAYS)]
      );
      const priorStrikes = windowRes.rows[0]?.n || 0;
      const strikeNumber = priorStrikes + 1;

      // 4. Determine action
      // Safety flag: ANTI_LEAKAGE_AUTO_BAN gates the auto-ban on strike 3 for
      // regular users. Default OFF so a fresh deployment doesn't wipe accounts
      // on regex false positives — the first few weeks should run in
      // "warn + mute + hold-for-review" mode while ops tunes the patterns.
      // Flip to 'true' after ~2 weeks of clean Slack review data.
      const autoBanEnabled = String(process.env.ANTI_LEAKAGE_AUTO_BAN || '').toLowerCase() === 'true';
      let action;
      if (isCreator) {
        if (strikeNumber >= 3) action = 'hold_for_review'; // NEVER auto-ban a creator
        else action = 'warn'; // strikes 1 & 2 both just warn — human loop for creators
      } else {
        if (strikeNumber >= 3) action = autoBanEnabled ? 'ban' : 'hold_for_review';
        else if (strikeNumber === 2) action = 'mute_24h';
        else action = 'warn';
      }

      // Map action to the DB check-constraint values (anti_leakage_strikes_action_check).
      // 'hold_for_review' is not in the constraint (creators never get an auto-mute/ban),
      // so we persist it as 'strip_only' — the actual review lives in Slack + admin queue.
      const actionForDb = action === 'hold_for_review' ? 'strip_only' : action;

      // 5. Truncate evidence + normalize terms
      const evidence = (evidenceText || '').slice(0, 500);
      const termsJson = JSON.stringify(
        (matchedTerms || []).slice(0, 20).map((t) => ({
          category: String(t.category || ''),
          term: String(t.term || '').slice(0, 120),
        }))
      );

      // 6. Insert strike row
      const insertRes = await query(
        `INSERT INTO anti_leakage_strikes
           (user_id, strike_number, category, source_type, source_ref,
            evidence_text, matched_terms, action_taken, issued_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING id`,
        [uid, strikeNumber, category, sourceType, sourceRef, evidence, termsJson, actionForDb, String(issuedBy)]
      );
      const strikeId = insertRes.rows[0]?.id || null;

      // 7. Apply side effects
      if (action === 'mute_24h') {
        try {
          const redis = await getRedis();
          if (redis) {
            await redis.setex(ANTI_LEAKAGE_MUTE_KEY(uid), ANTI_LEAKAGE_MUTE_TTL_SECONDS, '1');
          }
        } catch (e) {
          logger.error('logAntiLeakageStrike: mute set failed', { userId: uid, error: e.message });
        }
      } else if (action === 'ban') {
        try {
          const PlatformBanService = require('./platformBanService');
          await PlatformBanService.ban({
            userId: uid,
            reason: `Anti-leakage: 3 strikes in ${ANTI_LEAKAGE_STRIKE_WINDOW_DAYS}d (category: ${category}, source: ${sourceType})`,
            evidence: {
              type: 'anti_leakage_auto_ban',
              strikeId,
              matchedTerms: matchedTerms.slice(0, 20),
              sourceType,
              sourceRef,
            },
            bannedBy: 'system',
            notify: true,
          });
        } catch (e) {
          logger.error('logAntiLeakageStrike: auto-ban failed', { userId: uid, error: e.message });
        }
      }
      // 'hold_for_review' and 'warn' have no side effect beyond the Slack alert below.

      // 8. Fire Slack alert (best-effort; do not throw)
      try {
        const slackOps = require('./slackOpsService');
        if (typeof slackOps.notifyLeakageDetected === 'function') {
          await slackOps.notifyLeakageDetected({
            userId: uid,
            username: user.username || null,
            sourceType,
            category,
            matchedTerms: matchedTerms.slice(0, 10),
            evidenceText: evidence,
            strikeNumber,
            action,
            isCreator,
          });
        }
      } catch (e) {
        logger.warn('logAntiLeakageStrike: slack alert failed', { userId: uid, error: e.message });
      }

      logger.info('anti-leakage strike logged', {
        userId: uid, strikeNumber, action, category, sourceType, isCreator, strikeId,
      });

      return { strikeNumber, action, strikeId, isCreator };
    } catch (e) {
      logger.error('logAntiLeakageStrike: unexpected error', {
        userId: uid, sourceType, error: e.message, stack: e.stack,
      });
      return { strikeNumber: 0, action: 'strip_only', strikeId: null, isCreator: false };
    }
  }

  /**
   * True if the user is currently under a 24h anti-leakage mute.
   * Hooks (DM send, chat send) should call this and reject with a
   * user-facing "You are temporarily muted for policy violations" error.
   */
  static async isAntiLeakageMuted(userId) {
    try {
      const redis = await getRedis();
      if (!redis) return false;
      const v = await redis.get(ANTI_LEAKAGE_MUTE_KEY(String(userId)));
      return !!v;
    } catch (e) {
      logger.warn('isAntiLeakageMuted: redis error', { userId, error: e.message });
      return false;
    }
  }

  /**
   * Active (uncleared) strike count in the rolling window. Used by
   * admin UI and (Sprint 2) creator payout gate.
   */
  static async getActiveAntiLeakageStrikeCount(userId, windowDays = ANTI_LEAKAGE_STRIKE_WINDOW_DAYS) {
    try {
      const res = await query(
        `SELECT COUNT(*)::int AS n
           FROM anti_leakage_strikes
          WHERE user_id = $1
            AND cleared = false
            AND created_at > NOW() - ($2 || ' days')::interval`,
        [String(userId), String(windowDays)]
      );
      return res.rows[0]?.n || 0;
    } catch (e) {
      logger.warn('getActiveAntiLeakageStrikeCount: db error', { userId, error: e.message });
      return 0;
    }
  }

  /**
   * Initialize database tables (run once on setup)
   */
  static async initializeTables() {
    try {
      // Create warnings table
      await query(`
        CREATE TABLE IF NOT EXISTS warnings (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          admin_id VARCHAR(255) NOT NULL,
          reason TEXT,
          group_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          cleared BOOLEAN DEFAULT false,
          cleared_by VARCHAR(255),
          cleared_at TIMESTAMP
        )
      `);

      // Create moderation_actions table
      await query(`
        CREATE TABLE IF NOT EXISTS moderation_actions (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL,
          group_id BIGINT,
          action_type VARCHAR(50) NOT NULL,
          reason TEXT,
          moderator_id BIGINT,
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await query(`CREATE INDEX IF NOT EXISTS idx_warnings_user_id ON warnings(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_warnings_created_at ON warnings(created_at)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_moderation_actions_user_id ON moderation_actions(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_moderation_actions_group_id ON moderation_actions(group_id)`);

      logger.info('Moderation database tables initialized');
    } catch (error) {
      logger.error('Error initializing moderation tables:', error);
      throw error;
    }
  }
}

module.exports = WarningService;
