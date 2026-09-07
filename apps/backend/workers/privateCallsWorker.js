'use strict';

const logger = require('../utils/logger');

class PrivateCallsWorker {
  constructor(bot) {
    this.bot = bot;
  }

  async start() {
    logger.info('[PrivateCallsWorker] Worker started');
  }

  async stop() {
    logger.info('[PrivateCallsWorker] Worker stopped');
  }
}

module.exports = {
  initializeWorker: (bot) => new PrivateCallsWorker(bot),
  PrivateCallsWorker
};
