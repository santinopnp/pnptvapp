const logger = require('../utils/logger');

class MessageRateLimiter {
  static async initialize() {
    logger.info('MessageRateLimiter initialized');
    return true;
  }
  static async start() {}
  static async stop() {}
  static async checkLimit(userId, chatId) { return { allowed: true }; }
  static async isRateLimited(userId) { return false; }
}

module.exports = MessageRateLimiter;
