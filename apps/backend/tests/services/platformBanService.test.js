'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { query } = require('../../config/postgres');
const PlatformBanService = require('../../services/platformBanService');

const { normalizeEmail } = PlatformBanService;

describe('platformBanService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('normalizeEmail', () => {
    it('folds gmail dots, +tags and googlemail.com into one inbox', () => {
      expect(normalizeEmail('John.Doe+pnp@GoogleMail.com')).toBe('johndoe@gmail.com');
      expect(normalizeEmail(' j.o.h.n.doe@gmail.com ')).toBe('johndoe@gmail.com');
    });

    it('drops +tags but keeps dots for other providers', () => {
      expect(normalizeEmail('first.last+x@outlook.com')).toBe('first.last@outlook.com');
    });

    it('returns null for non-emails', () => {
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail('no-at-sign')).toBeNull();
      expect(normalizeEmail('@gmail.com')).toBeNull();
      expect(normalizeEmail('+tag@gmail.com')).toBeNull();
    });
  });

  describe('isBanned', () => {
    it('returns the platform_bans row with its id (no duplicate user_id column)', async () => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ban-1', user_id: 'u1', telegram_id: '42', reason: 'x' }] });
      const ban = await PlatformBanService.isBanned({ telegramId: '42' });
      expect(ban).toMatchObject({ id: 'ban-1', user_id: 'u1', telegram_id: '42', group_id: 'global' });
      expect(query.mock.calls[1][0]).toMatch(/x_id = ANY/);
    });

    it('catches an email alias of a banned inbox', async () => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ban-2', user_id: 'u9', reason: 'scam' }] });
      const ban = await PlatformBanService.isBanned({ userId: 'u2', email: 'john.doe+2@gmail.com' });
      expect(ban).toMatchObject({ id: 'ban-2', matched_by: 'email_alias' });
      expect(query.mock.calls[2][1]).toEqual(['johndoe@gmail.com']);
    });

    it('skips the alias lookup when there is no email', async () => {
      query.mockResolvedValue({ rows: [] });
      expect(await PlatformBanService.isBanned({ userId: 'u2' })).toBeNull();
      expect(query).toHaveBeenCalledTimes(2);
    });
  });

  describe('ban / recordBanCase', () => {
    it('mirrors the ban into platform_bans with identity vectors and observed IPs as evidence', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ user_id: '42', group_id: 'global' }] }) // banned_users
        .mockResolvedValueOnce({ rows: [] })                                       // existing case
        .mockResolvedValueOnce({ rows: [{
          id: '42', username: 'bad', email: 'bad@gmail.com', telegram: '42',
          pnptv_id: 'p-uuid', x_id: null, atproto_did: null,
          terms_accepted_ip: '::ffff:5.5.5.5', content_disclaimer_accepted_ip: null, privacy_accepted_ip: null,
        }] })
        .mockResolvedValueOnce({ rows: [{ ip_address: '1.1.1.1' }, { ip_address: '5.5.5.5' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'ban-new' }] });

      await PlatformBanService.ban({
        userId: '42', reason: 'reused code', bannedBy: 'system:activation', evidence: { code: 'ABC' },
      });

      const [sql, params] = query.mock.calls[4];
      expect(sql).toMatch(/INSERT INTO platform_bans/);
      expect(sql).not.toMatch(/known_ips/);
      expect(params.slice(0, 5)).toEqual(['42', '42', 'p-uuid', 'bad@gmail.com', 'bad']);
      expect(JSON.parse(params[8])).toEqual({ code: 'ABC', observed_ips: ['1.1.1.1', '5.5.5.5'] });
      expect(params[9]).toBe('system:activation');
    });

    it('does not create a second case when one is already active', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ user_id: '42' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'ban-old' }] });
      await PlatformBanService.ban({ userId: '42', reason: 'again' });
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('still returns the ban when recording the case fails', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ user_id: '42', group_id: 'global' }] })
        .mockRejectedValueOnce(new Error('db down'));
      const res = await PlatformBanService.ban({ userId: '42' });
      expect(res).toMatchObject({ user_id: '42' });
    });
  });
});
