const ModerationModel = require('../models/moderationModel');
const { query } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const ANTI_LEAKAGE_MUTE_TTL_SECONDS = 24 * 60 * 60; // 24h — the strike-2 mute duration
const ANTI_LEAKAGE_STRIKE_WINDOW_DAYS = 30;         // rolling window for strike escalation
const ANTI_LEAKAGE_MUTE_KEY = (userId) => `antileakage:mute:${userId}`;

// Most severe first: the strike is recorded under the worst category matched.
const STRIKE_CATEGORY_SEVERITY = [
  'scam',
  'paid_meetup',
  'off_platform_services',
  'off_platform_competitor',
  'off_platform_payment',
];

class WarningService {
  static async addWarning({ userId, adminId, groupId, reason }) {
    try {
      const res = await ModerationModel.addWarning(userId, adminId || 'system', groupId, reason);
      const count = res?.warningCount || res?.totalWarnings || 1;
      return {
        warningCount: count,
        totalWarnings: count,
        shouldMute: count >= 3,
      };
    } catch (err) {
      logger.error('WarningService.addWarning error:', err);
      return { warningCount: 1, totalWarnings: 1, shouldMute: false };
    }
  }

  static async getMuteStatus(userId, groupId) {
    return { isMuted: false };
  }

  static async recordAction(actionData) {
    return true;
  }

  static async clearWarnings(userId, groupId, adminId) {
    try {
      return await ModerationModel.clearWarnings(userId, groupId, adminId);
    } catch (err) {
      return false;
    }
  }

  static async getUserWarnings(userId, groupId) {
    try {
      return await ModerationModel.getUserWarnings(userId, groupId);
    } catch (err) {
      return [];
    }
  }

  // ── Anti-leakage strike ladder (restored: lost in 0aabb70e on 2026-09-07,
  // after which every call site threw "not a function") ──────────────────
  //
  //   Regular user:  strike 1 → warn
  //                  strike 2 → 24h mute (DMs + chat)
  //                  strike 3+ → ban if ANTI_LEAKAGE_AUTO_BAN=true, else hold for review
  //   Creator:       strikes 1–2 → warn; 3+ → hold for review (never auto-mute/ban:
  //                  creators lose income if silenced, so a human decides)
  //
  // Never throws: callers fire-and-forget it on the request path.

  /**
   * @param {object} p
   * @param {string} p.userId
   * @param {string} p.sourceType   'bio' | 'dm' | 'mainstage_chat' | 'hangout_chat' | 'chat_room' | 'post' | ...
   * @param {string} [p.sourceRef]
   * @param {string} [p.evidenceText]
   * @param {Array<{category:string,term:string}>} p.matchedTerms
   * @param {string} [p.issuedBy='system']
   * @returns {Promise<{strikeNumber:number, action:string, strikeId:number|null, isCreator:boolean}>}
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
      const userRes = await query(
        'SELECT id, username, creator_status, role FROM users WHERE id = $1 LIMIT 1',
        [uid],
        { cache: false }
      );
      if (userRes.rows.length === 0) {
        logger.warn('logAntiLeakageStrike: user not found', { userId: uid });
        return { strikeNumber: 0, action: 'strip_only', strikeId: null, isCreator: false };
      }
      const user = userRes.rows[0];
      const isCreator = !!user.creator_status
        && user.creator_status !== 'none'
        && user.creator_status !== 'inactive';

      const cats = new Set((matchedTerms || []).map((t) => t.category));
      const category = STRIKE_CATEGORY_SEVERITY.find((c) => cats.has(c)) || 'off_platform_payment';

      const windowRes = await query(
        `SELECT COUNT(*)::int AS n
           FROM anti_leakage_strikes
          WHERE user_id = $1
            AND cleared = false
            AND created_at > NOW() - ($2::int * INTERVAL '1 day')`,
        [uid, ANTI_LEAKAGE_STRIKE_WINDOW_DAYS],
        { cache: false }
      );
      const strikeNumber = (windowRes.rows[0]?.n || 0) + 1;

      // ANTI_LEAKAGE_AUTO_BAN gates strike-3 auto-bans so regex false positives
      // can't wipe accounts; default is hold-for-review.
      const autoBanEnabled = String(process.env.ANTI_LEAKAGE_AUTO_BAN || '').toLowerCase() === 'true';
      let action;
      if (isCreator) {
        action = strikeNumber >= 3 ? 'hold_for_review' : 'warn';
      } else if (strikeNumber >= 3) {
        action = autoBanEnabled ? 'ban' : 'hold_for_review';
      } else {
        action = strikeNumber === 2 ? 'mute_24h' : 'warn';
      }
      // 'hold_for_review' is stored as 'strip_only' (the DB check constraint's value).
      const actionForDb = action === 'hold_for_review' ? 'strip_only' : action;

      const evidence = (evidenceText || '').slice(0, 500);
      const termsJson = JSON.stringify(
        (matchedTerms || []).slice(0, 20).map((t) => ({
          category: String(t.category || ''),
          term: String(t.term || '').slice(0, 120),
        }))
      );

      const insertRes = await query(
        `INSERT INTO anti_leakage_strikes
           (user_id, strike_number, category, source_type, source_ref,
            evidence_text, matched_terms, action_taken, issued_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING id`,
        [uid, strikeNumber, category, sourceType, sourceRef, evidence, termsJson, actionForDb, String(issuedBy)]
      );
      const strikeId = insertRes.rows[0]?.id || null;

      if (action === 'mute_24h') {
        try {
          const redis = getRedis();
          if (redis) await redis.setex(ANTI_LEAKAGE_MUTE_KEY(uid), ANTI_LEAKAGE_MUTE_TTL_SECONDS, '1');
        } catch (e) {
          logger.error('logAntiLeakageStrike: mute set failed', { userId: uid, error: e.message });
        }
      } else if (action === 'ban') {
        try {
          const PlatformBanService = require('./platformBanService');
          await PlatformBanService.ban({
            userId: uid,
            reason: `Anti-leakage: ${strikeNumber} strikes in ${ANTI_LEAKAGE_STRIKE_WINDOW_DAYS}d (category: ${category}, source: ${sourceType})`,
            evidence: { type: 'anti_leakage_auto_ban', strikeId, matchedTerms: (matchedTerms || []).slice(0, 20), sourceType, sourceRef },
            bannedBy: 'system',
          });
        } catch (e) {
          logger.error('logAntiLeakageStrike: auto-ban failed', { userId: uid, error: e.message });
        }
      }

      // Fire-and-forget so a slow Slack or queue never stalls the caller.
      try {
        const slackOps = require('./slackOpsService');
        if (typeof slackOps.notifyLeakageDetected === 'function') {
          Promise.resolve(slackOps.notifyLeakageDetected({
            userId: uid,
            username: user.username || null,
            sourceType,
            category,
            matchedTerms: (matchedTerms || []).slice(0, 10),
            evidenceText: evidence,
            strikeNumber,
            action,
            isCreator,
          })).catch((e) => logger.warn('logAntiLeakageStrike: slack alert failed', { userId: uid, error: e.message }));
        }
      } catch (e) {
        logger.warn('logAntiLeakageStrike: slack alert failed', { userId: uid, error: e.message });
      }

      logger.info('anti-leakage strike logged', { userId: uid, strikeNumber, action, category, sourceType, isCreator, strikeId });
      return { strikeNumber, action, strikeId, isCreator };
    } catch (e) {
      logger.error('logAntiLeakageStrike: unexpected error', { userId: uid, sourceType, error: e.message });
      return { strikeNumber: 0, action: 'strip_only', strikeId: null, isCreator: false };
    }
  }

  /** True while the user is under a strike-2 24h mute. Fails open on Redis errors. */
  static async isAntiLeakageMuted(userId) {
    try {
      const redis = getRedis();
      if (!redis) return false;
      return !!(await redis.get(ANTI_LEAKAGE_MUTE_KEY(String(userId))));
    } catch (e) {
      logger.warn('isAntiLeakageMuted: redis error', { userId, error: e.message });
      return false;
    }
  }

  /** Active (uncleared) strikes in the rolling window. */
  static async getActiveAntiLeakageStrikeCount(userId, windowDays = ANTI_LEAKAGE_STRIKE_WINDOW_DAYS) {
    try {
      const res = await query(
        `SELECT COUNT(*)::int AS n
           FROM anti_leakage_strikes
          WHERE user_id = $1
            AND cleared = false
            AND created_at > NOW() - ($2::int * INTERVAL '1 day')`,
        [String(userId), windowDays],
        { cache: false }
      );
      return res.rows[0]?.n || 0;
    } catch (e) {
      logger.warn('getActiveAntiLeakageStrikeCount: db error', { userId, error: e.message });
      return 0;
    }
  }
}

module.exports = WarningService;
