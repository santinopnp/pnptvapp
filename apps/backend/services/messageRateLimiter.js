'use strict';

const logger = require('../utils/logger');

// Per sender→recipient pair: 30 DMs per hour
const PAIR_LIMIT = 30;
const PAIR_WINDOW_SEC = 3600;

// Per sender global: 150 DMs per hour across all recipients
const GLOBAL_LIMIT = 150;
const GLOBAL_WINDOW_SEC = 3600;

class MessageRateLimiter {
  static async initialize() {
    logger.info('MessageRateLimiter initialized');
    return true;
  }

  static async start() {}
  static async stop() {}

  /**
   * Check and increment DM rate limit counters.
   * Fails open (allowed:true) if Redis is unavailable.
   * @param {string} senderId
   * @param {string} recipientId
   * @param {{ isAdmin?: boolean }} opts
   * @returns {Promise<{ allowed: boolean, retryAfter?: number }>}
   */
  static async checkLimit(senderId, recipientId, opts = {}) {
    if (opts.isAdmin) return { allowed: true };
    try {
      const { getRedis } = require('../config/redis');
      const redis = getRedis();
      if (!redis) return { allowed: true };

      const pairKey = `dm:rl:pair:${senderId}:${recipientId}`;
      const globalKey = `dm:rl:global:${senderId}`;

      const [pairCount, globalCount] = await Promise.all([
        redis.incr(pairKey),
        redis.incr(globalKey),
      ]);

      if (pairCount === 1) redis.expire(pairKey, PAIR_WINDOW_SEC).catch(() => {});
      if (globalCount === 1) redis.expire(globalKey, GLOBAL_WINDOW_SEC).catch(() => {});

      const overKey = pairCount > PAIR_LIMIT ? pairKey : (globalCount > GLOBAL_LIMIT ? globalKey : null);
      if (overKey) {
        // Rejected sends don't count against the window
        redis.decr(pairKey).catch(() => {});
        redis.decr(globalKey).catch(() => {});
        const ttl = await redis.ttl(overKey).catch(() => -1);
        return { allowed: false, retryAfter: ttl > 0 ? ttl : PAIR_WINDOW_SEC };
      }

      return { allowed: true };
    } catch (err) {
      logger.warn('MessageRateLimiter.checkLimit error (fail-open)', { error: err.message });
      return { allowed: true };
    }
  }

  static async isRateLimited(userId) { return false; }
}

module.exports = MessageRateLimiter;
