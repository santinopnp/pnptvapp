const logger = require('../utils/logger');

module.exports = {
  initializeAsyncBroadcastQueue: async () => {
    logger.info('Broadcast queue initialized');
  },
};
