'use strict';

const logger = require('../utils/logger');

class MainStageMediaBroadcaster {
  static async start() {
    logger.info('[MainStageMediaBroadcaster] Worker started');
  }

  static async stop() {
    logger.info('[MainStageMediaBroadcaster] Worker stopped');
  }

  static async updateSource(src) {
    logger.info('[MainStageMediaBroadcaster] Updating media source', { src });
    return true;
  }

  static async setPlaying(playing) {
    logger.info('[MainStageMediaBroadcaster] Setting playback state', { playing });
    return true;
  }
}

module.exports = MainStageMediaBroadcaster;
