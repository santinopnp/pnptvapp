'use strict';

const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');

const CHECK_INTERVAL = 60 * 60 * 1000;
const STALE_HOURS = 48;

class DashOrderExpiryScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.runChecks();
    this.interval = setInterval(() => this.runChecks(), CHECK_INTERVAL);
    logger.info('[dashOrderExpiry] Scheduler started (1h interval, 48h staleness)');
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.isRunning = false;
  }

  async runChecks() {
    try {
      const result = await query(
        `UPDATE dash_subscription_orders
            SET status = 'expired',
                notes  = COALESCE(notes, '') || ' auto_expired_${STALE_HOURS}h'
          WHERE status = 'pending'
            AND created_at < NOW() - INTERVAL '${STALE_HOURS} hours'
          RETURNING id`
      );
      if (result.rowCount > 0) {
        logger.warn('[dashOrderExpiry] Auto-expired stale pending orders', {
          count: result.rowCount,
        });
      }
    } catch (err) {
      logger.error('[dashOrderExpiry] runChecks error', { error: err.message });
    }
  }
}

module.exports = DashOrderExpiryScheduler;
