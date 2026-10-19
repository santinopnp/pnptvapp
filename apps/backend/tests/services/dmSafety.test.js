'use strict';

const mockStore = {};
const mockRedis = {
  incr: jest.fn(async (k) => (mockStore[k] = (mockStore[k] || 0) + 1)),
  decr: jest.fn(async (k) => (mockStore[k] -= 1)),
  expire: jest.fn(async () => 1),
  ttl: jest.fn(async () => 1200),
  get: jest.fn(async () => null),
  set: jest.fn(async () => 'OK'),
};

jest.mock('../../config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../config/postgres', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/platformBanService', () => ({ isBanned: jest.fn(async () => null) }));
jest.mock('../../services/slackOpsService', () => ({ notifyDmThreat: jest.fn(async () => {}) }));
jest.mock('../../services/notificationEmitter', () => ({ emit: jest.fn(async () => {}) }));
jest.mock('../../bot/utils/helpers', () => ({ resolveUserId: async (id) => id }));
jest.mock('../../services/entitlementAccessService', () => ({ isSuperGod: () => false }));

const { query } = require('../../config/postgres');
const MessageRateLimiter = require('../../services/messageRateLimiter');
const DmService = require('../../services/dmService');
const PlatformBanService = require('../../services/platformBanService');
const slackOps = require('../../services/slackOpsService');

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  query.mockImplementation(async () => ({ rows: [] }));
  PlatformBanService.isBanned.mockImplementation(async () => null);
  mockRedis.get.mockImplementation(async () => null);
});

describe('MessageRateLimiter.checkLimit', () => {
  it('allows 30 DMs per pair, then blocks without counting the rejected send', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await MessageRateLimiter.checkLimit('a', 'b')).allowed).toBe(true);
    }
    expect(await MessageRateLimiter.checkLimit('a', 'b')).toEqual({ allowed: false, retryAfter: 1200 });
    await new Promise((r) => setImmediate(r));
    expect(mockStore['dm:rl:pair:a:b']).toBe(30);
    expect((await MessageRateLimiter.checkLimit('a', 'c')).allowed).toBe(true);
  });

  it('enforces the 150/hour global limit across recipients', async () => {
    for (let i = 0; i < 150; i++) {
      expect((await MessageRateLimiter.checkLimit('g', `r${i}`)).allowed).toBe(true);
    }
    expect((await MessageRateLimiter.checkLimit('g', 'another')).allowed).toBe(false);
  });

  it('exempts admins', async () => {
    mockStore['dm:rl:pair:a:b'] = 999;
    expect((await MessageRateLimiter.checkLimit('a', 'b', { isAdmin: true })).allowed).toBe(true);
  });

  it('fails open when Redis errors', async () => {
    mockRedis.incr.mockRejectedValueOnce(new Error('down'));
    expect((await MessageRateLimiter.checkLimit('a', 'z')).allowed).toBe(true);
  });
});

describe('DmService.sendMessage safety gates', () => {
  it('rejects banned senders', async () => {
    PlatformBanService.isBanned.mockResolvedValueOnce({ user_id: 'x' });
    await expect(DmService.sendMessage('x', 'y', { content: 'hi' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_BANNED' });
  });

  it('blocks threatening messages before insert and alerts Slack', async () => {
    await expect(DmService.sendMessage('s', 'r', { content: 'I will blackmail you' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'THREAT_DETECTED' });
    await new Promise((r) => setTimeout(r, 20));
    expect(slackOps.notifyDmThreat).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 's', recipientId: 'r', matchedPatterns: ['blackmail'] })
    );
    expect(query.mock.calls.some(([sql]) => /INSERT INTO direct_messages/.test(sql))).toBe(false);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    mockStore['dm:rl:pair:s2:r2'] = 30;
    await expect(DmService.sendMessage('s2', 'r2', { content: 'hello' }))
      .rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });
});
