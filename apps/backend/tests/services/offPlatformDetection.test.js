'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../config/redis', () => ({ getRedis: jest.fn() }));
jest.mock('../../models/moderationModel', () => ({}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/slackOpsService', () => ({ notifyLeakageDetected: jest.fn() }));
jest.mock('../../services/platformBanService', () => ({ ban: jest.fn() }));

const { query } = require('../../config/postgres');
const { getRedis } = require('../../config/redis');
const PlatformBanService = require('../../services/platformBanService');
const filter = require('../../services/contentModerationFilter');
const WarningService = require('../../services/warningService');
const { checkOutgoingText } = require('../../services/antiLeakageGuard');
const { scoreHits } = require('../../services/policyScanService');

const blockedCategory = (text) => filter.findForbiddenTerms(text).map((h) => h.category);

describe('off-platform detector: catches', () => {
  it.each([
    ['send it to my v e n m o', 'off_platform_payment'],
    ['my c.a.s.h a.p.p is $carlosxx', 'off_platform_payment'],
    ['v3nm0 me', 'off_platform_payment'],
    ['ｖｅｎｍｏ', 'off_platform_payment'],
    ['cаshаpp me', 'off_platform_payment'],
    ['ven​mo', 'off_platform_payment'],
    ['paypal.me/juan', 'off_platform_payment'],
    ['consignación a bancolombia cuenta de ahorros 123', 'off_platform_payment'],
    ['pay me directly and skip the app fees', 'off_platform_services'],
    ['cheaper if you pay outside the app', 'off_platform_services'],
    ['fuera de la app te sale más barato', 'off_platform_services'],
    ['200 roses for an hour', 'paid_meetup'],
    ['incall only, $150/hr', 'paid_meetup'],
    ['send me a steam gift card to unlock', 'scam'],
    ['there is a $20 verification fee', 'scam'],
    ['tell me your login code', 'scam'],
    ['visit pnptv-login.com to verify', 'scam'],
    ['sub to my 0nly f4ns', 'off_platform_competitor'],
  ])('%s', (text, category) => {
    expect(blockedCategory(text)).toContain(category);
  });
});

describe('off-platform detector: leaves ordinary messages alone', () => {
  it.each([
    'hey handsome, how was your weekend?',
    'I paid with the in-app wallet',
    'that gazelle documentary was wild',
    'can you tip me in the app?',
    'the rose emoji 🌹 is cute',
    'we had $50 drinks per person',
    'apple pie later?',
    'check pnptv.app/live tonight',
    'my rate of replies is slow lol',
    'I can host tonight',
    'escorted my friend home',
  ])('%s', (text) => {
    expect(filter.scanText(text)).toEqual([]);
  });
});

describe('off-platform detector: flag-only signals', () => {
  it.each([
    ['call me +1 (305) 555-1234', 'contact_sharing'],
    ['email me juan@gmail.com', 'contact_sharing'],
    ['add me on snap: juanito', 'contact_sharing'],
    ['look https://randomsite.biz/x', 'external_link'],
    ['vendo packs', 'content_sales'],
    ['PNPtv support here, verify now', 'staff_impersonation'],
  ])('%s', (text, category) => {
    const hits = filter.scanText(text);
    expect(hits).toEqual(expect.arrayContaining([expect.objectContaining({ category, tier: 'flag' })]));
    expect(filter.findForbiddenTerms(text)).toEqual([]);
  });

  it('does not flag links to PNPtv or allied socials', () => {
    expect(filter.scanText('see https://pnptv.app/u/x and https://instagram.com/x')).toEqual([]);
  });
});

describe('policy scan scoring', () => {
  it('weights creators double', () => {
    const hits = [{ category: 'off_platform_payment', tier: 'block' }];
    expect(scoreHits(hits, true)).toBe(2 * scoreHits(hits, false));
  });
});

describe('restored strike ladder', () => {
  const redis = { setex: jest.fn(), get: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    getRedis.mockReturnValue(redis);
    delete process.env.ANTI_LEAKAGE_AUTO_BAN;
  });

  const strike = (priorStrikes, creatorStatus = null) => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', username: 'u', creator_status: creatorStatus, role: 'user' }] })
      .mockResolvedValueOnce({ rows: [{ n: priorStrikes }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });
    return WarningService.logAntiLeakageStrike({
      userId: 'u1', sourceType: 'dm', evidenceText: 'venmo me',
      matchedTerms: [{ category: 'off_platform_payment', term: 'venmo' }],
    });
  };

  it('warns on the first strike', async () => {
    expect((await strike(0)).action).toBe('warn');
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('mutes for 24h on the second strike', async () => {
    expect((await strike(1)).action).toBe('mute_24h');
    expect(redis.setex).toHaveBeenCalledWith('antileakage:mute:u1', 86400, '1');
  });

  it('holds the third strike for review unless auto-ban is enabled', async () => {
    expect((await strike(2)).action).toBe('hold_for_review');
    expect(PlatformBanService.ban).not.toHaveBeenCalled();
  });

  it('never mutes or bans a creator', async () => {
    expect((await strike(1, 'active')).action).toBe('warn');
    expect((await strike(5, 'active')).action).toBe('hold_for_review');
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('records the most severe category', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', creator_status: null, role: 'user' }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await WarningService.logAntiLeakageStrike({
      userId: 'u1', sourceType: 'dm',
      matchedTerms: [{ category: 'off_platform_payment', term: 'venmo' }, { category: 'scam', term: 'gift card' }],
    });
    expect(query.mock.calls[2][1][2]).toBe('scam');
  });

  it('never throws, even if the database is down', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(WarningService.logAntiLeakageStrike({ userId: 'u1', sourceType: 'dm' })).resolves.toMatchObject({ strikeId: null });
  });
});

describe('real-time guard', () => {
  const redis = { setex: jest.fn(), get: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    getRedis.mockReturnValue(redis);
    redis.get.mockResolvedValue(null);
  });

  it('lets ordinary messages through', async () => {
    expect(await checkOutgoingText({ userId: 'u1', text: 'hey, see you tonight', sourceType: 'dm' })).toEqual({ ok: true });
  });

  it('blocks off-app payment and logs a strike', async () => {
    const res = await checkOutgoingText({ userId: 'u1', text: 'just zelle me', sourceType: 'dm' });
    expect(res).toMatchObject({ ok: false, status: 400, body: { code: 'LEAKAGE_DETECTED' } });
    await new Promise((r) => setImmediate(r));
    expect(query).toHaveBeenCalled();
  });

  it('refuses a muted sender', async () => {
    redis.get.mockResolvedValue('1');
    expect(await checkOutgoingText({ userId: 'u1', text: 'hi', sourceType: 'dm' })).toMatchObject({ ok: false, status: 403 });
  });

  it('exempts admins', async () => {
    expect(await checkOutgoingText({ userId: 'a1', text: 'cashapp', sourceType: 'dm', isAdmin: true })).toEqual({ ok: true });
  });
});
