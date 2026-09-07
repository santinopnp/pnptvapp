'use strict';

const logger = require('../utils/logger');

class Prime247Broadcaster {
  static async start() {
    logger.info('[Prime247Broadcaster] Worker started');
  }

  static async stop() {
    logger.info('[Prime247Broadcaster] Worker stopped');
  }
}

module.exports = Prime247Broadcaster;
