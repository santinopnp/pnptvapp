const ModerationModel = require('../models/moderationModel');
const logger = require('../utils/logger');

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
}

module.exports = WarningService;
