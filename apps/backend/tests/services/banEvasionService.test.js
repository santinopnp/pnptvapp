'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { query } = require('../../config/postgres');
const svc = require('../../services/banEvasionService');

const USER = {
  id: '222', username: 'newguy', email: 'johndoe+pnp@gmail.com', telegram: '222',
  pnptv_id: null, x_id: null, terms_accepted_ip: '7.7.7.7',
  content_disclaimer_accepted_ip: null, privacy_accepted_ip: null,
};

describe('banEvasionService.findBanLinks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null for an unknown user', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await svc.findBanLinks('nope')).toBeNull();
  });

  it('links by email alias and shared IP, dropping shared-network IPs', async () => {
    query
      .mockResolvedValueOnce({ rows: [USER] })
      .mockResolvedValueOnce({ rows: [{ ip_address: '1.1.1.1' }, { ip_address: '9.9.9.9' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 'b1', user_id: '111', username: 'badguy', reason: 'scam', banned_at: 't',
          identity_match: false, email_match: true, shared_ips: ['1.1.1.1'] },
        { id: 'b2', user_id: '555', username: 'other', reason: 'spam', banned_at: 't',
          identity_match: false, email_match: false, shared_ips: ['9.9.9.9'] },
      ] })
      .mockResolvedValueOnce({ rows: [{ ip_address: '9.9.9.9' }] }); // 9.9.9.9 is a busy NAT

    const res = await svc.findBanLinks('222');

    const [, params] = query.mock.calls[2];
    expect(params[2]).toBe('johndoe@gmail.com');
    expect(params[3].sort()).toEqual(['1.1.1.1', '7.7.7.7', '9.9.9.9']);

    expect(res.links).toHaveLength(1);
    expect(res.links[0]).toMatchObject({ banId: 'b1', bannedUsername: 'badguy', weight: 3 });
    expect(res.links[0].matches.map(m => m.type)).toEqual(['email_alias', 'shared_ip']);
  });

  it('weights an IP-only link lower than an identity or email link', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ ...USER, email: null }] })
      .mockResolvedValueOnce({ rows: [{ ip_address: '1.1.1.1' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 'b1', user_id: '111', username: 'badguy', reason: 'scam', banned_at: 't',
          identity_match: false, email_match: false, shared_ips: ['1.1.1.1'] },
      ] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await svc.findBanLinks('222');
    expect(res.links[0].weight).toBe(svc.MATCH_WEIGHTS.shared_ip);
    expect(query.mock.calls[2][1][2]).toBeNull();
  });
});

describe('banEvasionService.findCandidateUserIds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the window and shared-network cap', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: '222' }, { user_id: '333' }] });
    expect(await svc.findCandidateUserIds({ windowDays: 14 })).toEqual(['222', '333']);
    expect(query.mock.calls[0][1]).toEqual(['14', svc.SHARED_IP_MAX_USERS]);
  });

  it('returns an empty list instead of failing the nightly scan', async () => {
    query.mockRejectedValueOnce(new Error('timeout'));
    expect(await svc.findCandidateUserIds()).toEqual([]);
  });
});
