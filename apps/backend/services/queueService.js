const logger = require('../utils/logger');

const mockQueue = {
  name: 'default',
  add: async () => ({ id: 'mock-job' }),
  process: () => {},
  on: () => {},
  getJobs: async () => [],
  clean: async () => [],
};

module.exports = {
  initializeQueues: async () => ({}),
  getAllQueues: () => [],
  getQueue: () => mockQueue,
  addJob: async () => ({ id: 'mock-job' }),
};
