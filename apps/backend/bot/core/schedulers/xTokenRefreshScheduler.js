'use strict';

const db = require('../../../utils/db');
const logger = require('../../../utils/logger');
const { refreshAccountTokens } = require('../../../services/xPostService');

// Refresh tokens 30 minutes before they expire
const REFRESH_BUFFER_MS = 30 * 60 * 1000;
// Check every 10 minutes
const CHECK_INTERVAL = 10 * 60 * 1000;

const MAX_CONSECUTIVE_FAILURES = 5;

class XTokenRefreshScheduler {
  constructor(bot = null) {
    this.interval = null;
    this.isRunning = false;
    this.isProcessing = false;
    this.bot = bot;
    this.failureCounts = new Map();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.interval = setInterval(() => this.checkTokens(), CHECK_INTERVAL);
    // Run first check after 60s (let other schedulers start first)
    setTimeout(() => this.checkTokens(), 60 * 1000);
    logger.info('X token refresh scheduler started (10min interval)');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
    }
  }

  async checkTokens() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find active accounts whose tokens expire within the buffer window
      const { rows: accounts } = await db.query(`
        SELECT account_id, handle, encrypted_access_token, encrypted_refresh_token, token_expires_at
        FROM x_accounts
        WHERE is_active = TRUE
          AND token_expires_at IS NOT NULL
          AND token_expires_at <= NOW() + INTERVAL '30 minutes'
          AND token_expires_at > NOW()
      `);

      if (!accounts.length) return;

      logger.info(`Proactively refreshing ${accounts.length} expiring X tokens`);

      for (const account of accounts) {
        try {
          await refreshAccountTokens(account);
          this.failureCounts.delete(account.account_id);
          logger.info('Proactive X token refresh succeeded', {
            handle: account.handle,
            accountId: account.account_id,
          });
        } catch (err) {
          const nextCount = (this.failureCounts.get(account.account_id) || 0) + 1;
          this.failureCounts.set(account.account_id, nextCount);
          if (nextCount >= MAX_CONSECUTIVE_FAILURES) {
            try {
              await db.query(
                'UPDATE x_accounts SET is_active = FALSE, updated_at = NOW() WHERE account_id = $1',
                [account.account_id]
              );
              this.failureCounts.delete(account.account_id);
              logger.warn('X account auto-deactivated after consecutive refresh failures — owner must reconnect', {
                handle: account.handle,
                accountId: account.account_id,
                failures: nextCount,
              });
            } catch (dbErr) {
              logger.error('Failed to auto-deactivate X account after refresh failures', {
                handle: account.handle,
                accountId: account.account_id,
                error: dbErr.message,
              });
            }
          } else {
            logger.warn('Proactive X token refresh failed', {
              handle: account.handle,
              accountId: account.account_id,
              consecutiveFailures: nextCount,
              error: err.message,
            });
          }
        }
      }
    } catch (err) {
      logger.error('X token refresh scheduler error:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = XTokenRefreshScheduler;
