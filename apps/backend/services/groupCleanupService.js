const logger = require('../utils/logger');

class GroupCleanupService {
  constructor(_bot) {}
  initialize() {}
  static async cleanup() { return true; }
  static async runScheduledCleanup() { return true; }
}

module.exports = GroupCleanupService;
