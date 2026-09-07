const logger = require('../utils/logger');

class GroupCleanupService {
  static async cleanup() { return true; }
  static async runScheduledCleanup() { return true; }
}

module.exports = GroupCleanupService;
