const logger = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
    this.metrics = new Map();
  }

  start(label) {
    this.timers.set(label, Date.now());
  }

  end(label, metadata = {}) {
    const startTime = this.timers.get(label);
    if (!startTime) return 0;
    const duration = Date.now() - startTime;
    this.timers.delete(label);

    const current = this.metrics.get(label) || { count: 0, totalDuration: 0, maxDuration: 0 };
    current.count += 1;
    current.totalDuration += duration;
    current.maxDuration = Math.max(current.maxDuration, duration);
    current.lastDuration = duration;
    this.metrics.set(label, current);

    if (duration > 1000) {
      logger.warn(`[performance] ${label} took ${duration}ms`, metadata);
    }
    return duration;
  }

  logSummary() {
    logger.info('[performance] Performance summary:');
    for (const [label, data] of this.metrics.entries()) {
      const avg = Math.round(data.totalDuration / data.count);
      logger.info(`  ${label}: calls=${data.count}, avg=${avg}ms, max=${data.maxDuration}ms`);
    }
  }

  getMetrics() {
    const result = {};
    for (const [label, data] of this.metrics.entries()) {
      result[label] = {
        ...data,
        avgDuration: Math.round(data.totalDuration / (data.count || 1))
      };
    }
    return result;
  }

  reset() {
    this.timers.clear();
    this.metrics.clear();
  }
}

module.exports = new PerformanceMonitor();
