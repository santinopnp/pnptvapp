const Redis = require('ioredis');
const { Queue } = require('bullmq');
const logger = require('../utils/logger');

const BULL_PREFIX = 'pnpapp:bull';

const mockQueue = {
  name: 'default',
  add: async () => ({ id: 'mock-job' }),
  process: () => {},
  on: () => {},
  getJobs: async () => [],
  clean: async () => [],
};

/**
 * Create a fresh ioredis connection suitable for BullMQ Queue/Worker/QueueEvents.
 * Must be called once per Queue and once per Worker — never share connections.
 */
function makeBullConnection() {
  const cfg = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 20) return null;
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

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

let _subscribeRetargetQueue = null;
function getSubscribeRetargetQueue() {
  if (!_subscribeRetargetQueue) {
    _subscribeRetargetQueue = new Queue('subscribe-retarget', {
      connection: makeBullConnection(),
      prefix: BULL_PREFIX,
    });
  }
  return _subscribeRetargetQueue;
}

// Lazy getter so callers can do: const { subscribeRetargetQueue } = require('./queueService')
// and the Queue is only created when first accessed (not at module load).
const subscribeRetargetQueue = new Proxy({}, {
  get(_, prop) { return getSubscribeRetargetQueue()[prop]; },
});

module.exports = {
  makeBullConnection,
  DEFAULT_JOB_OPTIONS,
  subscribeRetargetQueue,
  initializeQueues: async () => ({}),
  getAllQueues: () => [],
  getQueue: () => mockQueue,
  addJob: async () => ({ id: 'mock-job' }),
};
