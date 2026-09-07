const logger = require('../utils/logger');

class SlaMonitor {
  static async checkSLA() { return true; }
  static async start() {}
  static async stop() {}
}

module.exports = SlaMonitor;
