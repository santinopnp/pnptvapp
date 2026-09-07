'use strict';

const logger = require('../utils/logger');

class OrphanedMediaCleanup {
  static async start() {
    logger.info('[OrphanedMediaCleanup] Worker started');
  }

  static async stop() {
    logger.info('[OrphanedMediaCleanup] Worker stopped');
  }

  static async cleanup() {
    return { cleaned: 0 };
  }
}

module.exports = OrphanedMediaCleanup;
