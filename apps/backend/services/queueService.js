'use strict';

/**
 * queueService.js — BullMQ queue registry for PNPtv!
 *
 * 7 queues (per plan spec):
 *   payment-fulfillment, notifications, ai-tasks, broadcast-emails,
 *   compliance-checks, media-processing, cron-jobs
 *
 * All BullMQ keys use prefix `pnpapp:bull` — never collide with existing
 * `pnpapp:*` application cache keys.
 *
 * BullMQ requires dedicated ioredis connections with:
 *   maxRetriesPerRequest: null  (blocks forever on BLMOVE)
 *   enableReadyCheck: false     (don't hold connect until INFO replies)
 * These must NEVER be shared with the app's redisClient from config/redis.js.
 *
 * Legacy API shims (addJob, startWorkers, closeAll, enqueueEmail, _makeSlackShim)
 * are kept so existing call-sites don't need changes.
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

// ─── Redis connection factory ────────────────────────────────────────────────
/**
 * Create a fresh ioredis connection suitable for BullMQ Queue/Worker/QueueEvents.
 * Must be called once per Queue and once per Worker — do not share connections.
 */
function makeBullConnection() {
  const cfg = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: parseInt(process.env.REDIS_DB || '0', 10),
    // Hard requirements for BullMQ
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 20) return null; // give up after ~2 min to avoid zombie connections
      return Math.min(times * 250, 5000);
    },
    enableOfflineQueue: true,
    keepAlive: 30000,
  };
  if (process.env.REDIS_PASSWORD) cfg.password = process.env.REDIS_PASSWORD;

  const conn = new Redis(cfg);
  conn.on('error', (err) =>
    logger.error('[BullMQ] Redis connection error', { error: err.message })
  );
  return conn;
}

// ─── Default job options ─────────────────────────────────────────────────────
const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 500, age: 7 * 24 * 3600 },
  removeOnFail: false, // keep failed jobs forever — visible in Bull Board DLQ view
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 },
};

// Legacy alias used by old code
const DEFAULT_JOB_OPTS = DEFAULT_JOB_OPTIONS;

// ─── Queue definitions ───────────────────────────────────────────────────────
// Each queue gets per-queue attempt/backoff defaults baked in.
const QUEUE_CONFIGS = [
  { name: 'payment-fulfillment', attempts: 5, backoff: { type: 'exponential', delay: 30000 } },
  { name: 'notifications',       attempts: 4, backoff: { type: 'exponential', delay: 10000 } },
  { name: 'ai-tasks',            attempts: 3, backoff: { type: 'fixed',       delay: 60000 } },
  { name: 'broadcast-emails',    attempts: 3, backoff: { type: 'fixed',       delay: 120000 } },
  { name: 'compliance-checks',   attempts: 3, backoff: { type: 'exponential', delay: 60000 } },
  { name: 'media-processing',    attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  { name: 'cron-jobs',           attempts: 2, backoff: { type: 'fixed',       delay: 30000 } },
];

const BULL_PREFIX = 'pnpapp:bull';

// Singleton queue instances keyed by name
const _queues = new Map();

// ─── getQueue ────────────────────────────────────────────────────────────────
/**
 * Get (or lazily create) a named Queue instance.
 * @param {string} name
 * @returns {import('bullmq').Queue}
 */
function getQueue(name) {
  if (_queues.has(name)) return _queues.get(name);

  const config = QUEUE_CONFIGS.find((c) => c.name === name);
  if (!config) throw new Error(`[BullMQ] Unknown queue name: "${name}"`);

  const q = new Queue(name, {
    connection: makeBullConnection(),
    prefix: BULL_PREFIX,
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: config.attempts,
      backoff: config.backoff,
    },
  });

  q.on('error', (err) =>
    logger.warn(`[BullMQ] Queue "${name}" error`, { error: err.message })
  );

  _queues.set(name, q);
  return q;
}

// ─── getAllQueues ────────────────────────────────────────────────────────────
/**
 * Returns all Queue instances that have been created.
 * Used by Bull Board to register adapters.
 */
function getAllQueues() {
  return Array.from(_queues.values());
}

// ─── initializeQueues ────────────────────────────────────────────────────────
/**
 * Eagerly create all queue instances and register all repeatable cron jobs.
 * Safe to call multiple times — BullMQ de-duplicates repeatable jobs by jobId.
 */
async function initializeQueues() {
  // Eagerly create all queue instances so Bull Board can discover all 7
  for (const config of QUEUE_CONFIGS) {
    getQueue(config.name);
  }

  const complianceQueue = getQueue('compliance-checks');
  const cronQueue = getQueue('cron-jobs');

  // ── Wave 5: Repeatable cron jobs ──────────────────────────────────────────
  // Each has a stable jobId so BullMQ de-duplicates on every restart.
  // Expressions match the original node-cron schedules in scripts/cron.js.

  // 2257 enforcement — daily at 09:00 UTC
  await complianceQueue.add('2257-enforcement', {}, {
    repeat: { pattern: '0 9 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-2257-enforcement',
  });

  // Content-compliance deadline enforcement — daily at 09:05 UTC
  await complianceQueue.add('content-compliance-enforce', {}, {
    repeat: { pattern: '5 9 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-content-compliance-enforce',
  });

  // Membership cleanup — daily at midnight
  await cronQueue.add('membership-cleanup', {}, {
    repeat: { pattern: '0 0 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-membership-cleanup',
  });

  // Membership status sync — twice daily at 06:00 and 18:00
  await cronQueue.add('membership-sync', {}, {
    repeat: { pattern: '0 6,18 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-membership-sync',
  });

  // Abandoned payment cleanup — every 2 hours
  await cronQueue.add('payment-cleanup', {}, {
    repeat: { pattern: '0 */2 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-payment-cleanup',
  });

  // Call booking expiry — every hour at :30
  await cronQueue.add('call-booking-expire', {}, {
    repeat: { pattern: '30 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-call-booking-expire',
  });

  // Dash/BTCPay reconciliation — every 10 min
  await cronQueue.add('btcpay-reconcile', {}, {
    repeat: { pattern: '*/10 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-btcpay-reconcile',
  });

  // NOWPayments reconciler — every 15 min
  await cronQueue.add('nowpayments-reconcile', {}, {
    repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-nowpayments-reconcile',
  });

  // Lifetime100 abandoned-cart rescue — 7/22/37/52 of each hour
  await cronQueue.add('lifetime100-rescue', {}, {
    repeat: { pattern: '7,22,37,52 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-lifetime100-rescue',
  });

  // Meru lifetime100 reconciliation — 7/22/37/52 of each hour
  await cronQueue.add('meru-reconcile', {}, {
    repeat: { pattern: '7,22,37,52 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-meru-reconcile',
  });

  // Meru token-activation reconciliation — 9/24/39/54 of each hour
  await cronQueue.add('meru-token-reconcile', {}, {
    repeat: { pattern: '9,24,39,54 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-meru-token-reconcile',
  });

  // Video leak detector — every hour at :17
  await cronQueue.add('video-leak-detector', {}, {
    repeat: { pattern: '17 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-video-leak-detector',
  });

  // Channel video sweeper (older stuck rows) — hourly at :47
  await cronQueue.add('channel-video-sweep', {}, {
    repeat: { pattern: '47 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-channel-video-sweep',
  });

  // Video fetch log retention — daily at 03:13 UTC
  await cronQueue.add('video-log-cleanup', {}, {
    repeat: { pattern: '13 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-video-log-cleanup',
  });

  // Featured Model of the Day promo (X + Telegram) — daily at 15:00 UTC
  // (10am ET / 12pm Bogota, peak-lunch engagement window).
  await cronQueue.add('featured-creator-promo', {}, {
    repeat: { pattern: '0 15 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-featured-creator-promo',
  });

  // BTCPay webhook probe — daily at 06:30 UTC
  await cronQueue.add('btcpay-webhook-probe', {}, {
    repeat: { pattern: '30 6 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-btcpay-webhook-probe',
  });

  // Performer eligibility enforcement runs from scripts/cron.js (node-cron) —
  // do not schedule here to avoid duplicate execution.

  // Media cleanup — daily at 03:00 UTC
  await cronQueue.add('media-cleanup', {}, {
    repeat: { pattern: '0 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-media-cleanup',
  });

  // Crystal Creator pass sweep — daily at 04:00 UTC; marks expired rows +
  // clears users.crystal_creator_active_until when past due.
  await cronQueue.add('crystal-pass-sweep', {}, {
    repeat: { pattern: '0 4 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-crystal-pass-sweep',
  });

  // Crystal Creator renewal reminder — daily at 15:00 UTC (10:00 Bogotá,
  // solid morning slot for the LATAM cohort). T-3 days before expires_at.
  await cronQueue.add('crystal-renewal-reminder', {}, {
    repeat: { pattern: '0 15 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-crystal-renewal-reminder',
  });

  // Crystal Services overdue-delivery sweep — daily at 14:00 UTC. Alerts
  // creators + Slack when a custom_content booking is past its expires_at.
  await cronQueue.add('crystal-services-overdue', {}, {
    repeat: { pattern: '0 14 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-crystal-services-overdue',
  });

  // Creator eligibility batch — daily at 03:10 UTC
  await cronQueue.add('creator-eligibility', {}, {
    repeat: { pattern: '10 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-eligibility',
  });

  // Creator subscription expiry — every 6 hours
  await cronQueue.add('creator-sub-expiry', {}, {
    repeat: { pattern: '0 */6 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-sub-expiry',
  });

  // Creator subscription renewal — daily at 09:00 UTC
  await cronQueue.add('creator-renewal', {}, {
    repeat: { pattern: '0 9 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-renewal',
  });

  // Held-sub refund sweep — daily at 09:30 UTC. Refunds Ru$h to subscribers
  // whose creator never met the 4-min content-compliance threshold within
  // CREATOR_HELD_REFUND_AFTER_DAYS (default 30) days of payment.
  await cronQueue.add('creator-held-refund', {}, {
    repeat: { pattern: '30 9 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-held-refund',
  });

  // Channel/hangout subscription renewal — daily at 09:15 UTC
  await cronQueue.add('channel-hangout-renewal', {}, {
    repeat: { pattern: '15 9 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-channel-hangout-renewal',
  });

  // Monthly creator payouts — 1st of month at 00:00 UTC
  await cronQueue.add('creator-payout-monthly', {}, {
    repeat: { pattern: '0 0 1 * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-payout-monthly',
  });

  // Creator payout readiness reminder — 28th at 18:00 UTC
  await cronQueue.add('creator-payout-remind', {}, {
    repeat: { pattern: '0 18 28 * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-payout-remind',
  });

  // Weekly payout preview to Slack #ops-payments — Sundays 10:00 America/Bogota (= 15:00 UTC)
  await cronQueue.add('creator-weekly-preview', {}, {
    repeat: { pattern: '0 15 * * 0', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-weekly-preview',
  });

  // Weekly payout proposal — Mondays 09:00 America/Bogota (= 14:00 UTC)
  await cronQueue.add('creator-weekly-proposal', {}, {
    repeat: { pattern: '0 14 * * 1', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-weekly-proposal',
  });

  // Weekly approval deadline — Mondays 16:00 America/Bogota (= 21:00 UTC)
  await cronQueue.add('creator-weekly-deadline', {}, {
    repeat: { pattern: '0 21 * * 1', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-weekly-deadline',
  });

  // Reconcile stuck in_payout earnings — daily at 03:00 UTC
  await cronQueue.add('reconcile-stuck-payouts', {}, {
    repeat: { pattern: '0 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-reconcile-stuck-payouts',
  });

  // Creator earnings maturation — hourly
  await cronQueue.add('earnings-maturation', {}, {
    repeat: { pattern: '0 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-earnings-maturation',
  });

  // Notification cleanup — daily at 03:20 UTC
  await cronQueue.add('notification-cleanup', {}, {
    repeat: { pattern: '20 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-notification-cleanup',
  });

  // Subscription expiry email reminders — daily at 10:00 UTC
  await cronQueue.add('sub-expiry-email', {}, {
    repeat: { pattern: '0 10 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-sub-expiry-email',
  });

  // Re-engagement emails — weekly Monday at 11:00 UTC
  await cronQueue.add('sub-reengagement', {}, {
    repeat: { pattern: '0 11 * * 1', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-sub-reengagement',
  });

  // Notification digest — daily at 10:00 UTC
  await cronQueue.add('notification-digest', {}, {
    repeat: { pattern: '0 10 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-notification-digest',
  });

  // Cristina wellness tip — 10:00 UTC
  await cronQueue.add('cristina-wellness', {}, {
    repeat: { pattern: '0 10 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-cristina-wellness',
  });

  // Cristina feature tutorial #1 — 14:00 UTC
  await cronQueue.add('cristina-tutorial1', {}, {
    repeat: { pattern: '0 14 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-cristina-tutorial1',
  });

  // Cristina PRIME promo — 18:00 UTC
  await cronQueue.add('cristina-promo', {}, {
    repeat: { pattern: '0 18 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-cristina-promo',
  });

  // Cristina feature tutorial #2 — 22:00 UTC
  await cronQueue.add('cristina-tutorial2', {}, {
    repeat: { pattern: '0 22 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-cristina-tutorial2',
  });

  // VOD recording retention — daily at 03:35 UTC
  await cronQueue.add('recording-expiry', {}, {
    repeat: { pattern: '35 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-recording-expiry',
  });

  // Live-stream dead-man sweep — every 5 min
  await cronQueue.add('live-stream-sweep', {}, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-live-stream-sweep',
  });

  // Channel video stuck-processing cleanup — hourly at :45
  await cronQueue.add('channel-video-stuck', {}, {
    repeat: { pattern: '45 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-channel-video-stuck',
  });

  // Channel post_count reconciliation — nightly at 03:17 UTC
  await cronQueue.add('channel-post-count-reconcile', {}, {
    repeat: { pattern: '17 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-channel-post-count-reconcile',
  });

  // Auto-complete past-end bookings — every 15 min
  await cronQueue.add('booking-auto-complete', {}, {
    repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-booking-auto-complete',
  });

  // Meru reservation cleanup — every 5 min
  await cronQueue.add('meru-reservation-cleanup', {}, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-meru-reservation-cleanup',
  });

  // user_access_logs retention — daily at 03:50 UTC
  await cronQueue.add('access-logs-retention', {}, {
    repeat: { pattern: '50 3 * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-access-logs-retention',
  });

  // Pending call notifications — every 5 min
  await cronQueue.add('call-notifications', {}, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-call-notifications',
  });

  // Auto-end overdue call sessions — every 5 min
  await cronQueue.add('call-overdue-end', {}, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-call-overdue-end',
  });

  // Detect no-shows — every 15 min
  await cronQueue.add('call-no-shows', {}, {
    repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-call-no-shows',
  });

  // Weekly log retention — Sundays at 03:17 UTC
  await cronQueue.add('weekly-log-retention', {}, {
    repeat: { pattern: '17 3 * * 0', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-weekly-log-retention',
  });

  // Auto-reply email polling — every 5 min
  await cronQueue.add('auto-reply-poll', {}, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-auto-reply-poll',
  });

  // Creator availability expiry notification — every 2 min
  await cronQueue.add('creator-avail-expiry-notify', {}, {
    repeat: { pattern: '*/2 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-creator-avail-expiry-notify',
  });

  // Restreamer stream health monitor — every 2 min
  await cronQueue.add('stream-health-monitor', {}, {
    repeat: { pattern: '*/2 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-stream-health-monitor',
  });

  // Slack availability poller — every 5 min
  await cronQueue.add('slack-avail-poll', {}, {
    repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-slack-avail-poll',
  });

  // Crypto on-chain payment: expire stale pending intents — every 15 min
  await cronQueue.add('crypto-expire', {}, {
    repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-crypto-expire',
  });

  // Crypto on-chain payment: alert on stuck intents — every 10 min
  await cronQueue.add('crypto-alert-stuck', {}, {
    repeat: { pattern: '*/10 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-crypto-alert-stuck',
  });

  // Crypto on-chain payment: retry grant for rows stuck in grant_failed —
  // every 15 min. Recovers users whose on-chain payment landed but whose
  // entitlement grant threw a transient error on the original webhook.
  await cronQueue.add('crypto-reconcile-grant-failed', {}, {
    repeat: { pattern: '*/15 * * * *', tz: 'UTC' },
    attempts: 2, removeOnFail: false,
    jobId: 'cron-crypto-reconcile-grant-failed',
  });

  logger.info('[BullMQ] Queues initialized and repeatable jobs registered');
}

// ─── closeQueues ─────────────────────────────────────────────────────────────
async function closeQueues() {
  try {
    await Promise.allSettled(
      Array.from(_queues.values()).map((q) => q.close())
    );
    logger.info('[BullMQ] All queues closed');
  } catch (err) {
    logger.error('[BullMQ] Error closing queues', { error: err.message });
  }
}

// ─── Legacy API shims ────────────────────────────────────────────────────────
// Kept for backward compatibility with existing call-sites.

/**
 * Legacy: add a job using queue name aliases from old code.
 * Maps 'notifications' → 'notifications', 'payments' → 'payment-fulfillment', etc.
 */
const _LEGACY_NAME_MAP = {
  notifications: 'notifications',
  payments: 'payment-fulfillment',
  ai: 'ai-tasks',
  media: 'media-processing',
  broadcast: 'broadcast-emails',
};

async function addJob(queueName, jobName, data, opts = {}) {
  const resolvedName = _LEGACY_NAME_MAP[queueName] || queueName;
  try {
    const q = getQueue(resolvedName);
    const job = await q.add(jobName, data, { ...DEFAULT_JOB_OPTIONS, ...opts });
    logger.debug(`[BullMQ] queued job "${jobName}" (id=${job.id}) on "${resolvedName}"`);
    return job;
  } catch (err) {
    logger.warn(`[BullMQ] addJob failed for "${jobName}" on "${resolvedName}": ${err.message}`);
    return null;
  }
}

// ─── Notifications worker processor ─────────────────────────────────────────
// Handles: slack_ops, slack_creator, slack_live, slack_support, email
async function _processNotification(job) {
  const { type, fn, args } = job.data;
  switch (type) {
    case 'slack_ops': {
      // Require the module directly (bypassing the queued wrapper) to avoid loops
      const mod = require('./slackOpsService');
      const direct = mod[`_direct_${fn}`] || mod[fn];
      if (typeof direct !== 'function') throw new Error(`slackOpsService.${fn} is not a function`);
      await direct(...(args || []));
      break;
    }
    case 'slack_creator': {
      const mod = require('./slackCreatorNotifyService');
      const direct = mod[`_direct_${fn}`] || mod[fn];
      if (typeof direct !== 'function') throw new Error(`slackCreatorNotifyService.${fn} is not a function`);
      await direct(...(args || []));
      break;
    }
    case 'slack_live': {
      const mod = require('./slackLiveService');
      const direct = mod[`_direct_${fn}`] || mod[fn];
      if (typeof direct !== 'function') throw new Error(`slackLiveService.${fn} is not a function`);
      await direct(...(args || []));
      break;
    }
    case 'slack_support': {
      const mod = require('./slackSupportService');
      // escalateToSlack is the queued wrapper; call the original directly
      const direct = mod[`_direct_${fn}`] || mod[fn];
      if (typeof direct !== 'function') throw new Error(`slackSupportService.${fn} is not a function`);
      await direct(...(args || []));
      break;
    }
    case 'email': {
      const emailService = require('./emailservice');
      await emailService.send(args[0]);
      break;
    }
    default:
      logger.warn(`[BullMQ] notifications processor: unknown type "${type}"`);
  }
}

const { Worker } = require('bullmq');
const _workers = new Map();

/** Register all queue processors. Call once after Redis is ready. */
function startWorkers() {
  try {
    if (_workers.has('notifications')) {
      logger.info('[BullMQ] Workers already started');
      return;
    }
    const worker = new Worker('notifications', _processNotification, {
      connection: makeBullConnection(),
      concurrency: 5,
      prefix: BULL_PREFIX,
    });
    worker.on('completed', (job) =>
      logger.debug(`[BullMQ] job "${job.name}" (id=${job.id}) completed`)
    );
    worker.on('failed', (job, err) =>
      logger.warn(`[BullMQ] job "${job?.name}" failed: ${err.message}`)
    );
    worker.on('error', (err) =>
      logger.warn('[BullMQ] worker error: ' + err.message)
    );
    _workers.set('notifications', worker);
    logger.info('[BullMQ] Workers started: notifications');
  } catch (err) {
    logger.warn('[BullMQ] startWorkers failed: ' + err.message);
  }
}

/** Legacy: closeAll closes queues and workers. */
async function closeAll() {
  try {
    await Promise.allSettled(
      Array.from(_workers.values()).map((w) => w.close())
    );
    _workers.clear();
  } catch (_) {}
  await closeQueues();
}

/**
 * Enqueue an email via the notifications queue.
 * Falls back to direct send if queue unavailable.
 */
async function enqueueEmail(opts) {
  const job = await addJob('notifications', 'email.send', {
    type: 'email',
    fn: 'send',
    args: [opts],
  });
  if (!job) {
    try {
      const emailService = require('./emailservice');
      await emailService.send(opts);
    } catch (e) {
      logger.warn('[BullMQ] enqueueEmail fallback failed: ' + e.message);
    }
  }
}

function _makeSlackShim(serviceType, fnName) {
  return async function (...args) {
    const job = await addJob('notifications', `${serviceType}.${fnName}`, {
      type: serviceType,
      fn: fnName,
      args,
    });
    if (!job) {
      try {
        let svc;
        if (serviceType === 'slack_ops') svc = require('./slackOpsService');
        else if (serviceType === 'slack_creator') svc = require('./slackCreatorNotifyService');
        else if (serviceType === 'slack_live') svc = require('./slackLiveService');
        else if (serviceType === 'slack_support') svc = require('./slackSupportService');
        if (svc && typeof svc[fnName] === 'function') await svc[fnName](...args);
      } catch (_) {}
    }
  };
}

// ─── Module exports ──────────────────────────────────────────────────────────
module.exports = {
  // Core API (new)
  makeBullConnection,
  getQueue,
  getAllQueues,
  initializeQueues,
  closeQueues,
  DEFAULT_JOB_OPTIONS,

  // Named queue getters (lazy — safe to destructure before initializeQueues())
  get paymentQueue()      { return getQueue('payment-fulfillment'); },
  get notificationsQueue(){ return getQueue('notifications'); },
  get aiQueue()           { return getQueue('ai-tasks'); },
  get broadcastQueue()    { return getQueue('broadcast-emails'); },
  get complianceQueue()   { return getQueue('compliance-checks'); },
  get mediaQueue()        { return getQueue('media-processing'); },
  get cronQueue()         { return getQueue('cron-jobs'); },

  // Legacy API shims (backward compat)
  addJob,
  startWorkers,
  closeAll,
  enqueueEmail,
  _makeSlackShim,
  DEFAULT_JOB_OPTS,
};
