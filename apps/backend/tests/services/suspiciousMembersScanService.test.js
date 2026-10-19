'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../config/redis', () => ({ cache: { get: jest.fn(), setNX: jest.fn() } }), { virtual: true });
jest.mock('node-cron', () => ({ schedule: jest.fn() }), { virtual: true });
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/banEvasionService', () => ({
  findBanLinks: jest.fn(),
  findCandidateUserIds: jest.fn(),
}));

const { query } = require('../../config/postgres');
const banEvasionService = require('../../services/banEvasionService');
const svc = require('../../services/suspiciousMembersScanService');

function mockQuietUser(tier = 'free') {
  query.mockImplementation(async (sql) => {
    if (/FROM users WHERE id = \$1/.test(sql)) {
      return { rows: [{ id: '222', username: 'newguy', tier, creator_status: null, role: 'user' }] };
    }
    return { rows: [{}] };
  });
}

const LINK = {
  banId: 'b1', bannedUsername: 'badguy', reason: 'Intentó activar código ya utilizado',
  matches: [{ type: 'email_alias', detail: 'same inbox under another email alias' }], weight: 3,
};

describe('suspiciousMembersScanService — linked_to_banned signal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('flags a user linked to a banned case', async () => {
    mockQuietUser();
    banEvasionService.findBanLinks.mockResolvedValueOnce({ user: { id: '222' }, links: [LINK] });
    const res = await svc.scanUser('222');
    expect(res.score).toBe(3);
    expect(res.signals).toEqual([expect.objectContaining({ key: 'linked_to_banned', weight: 3 })]);
    expect(res.signals[0].detail).toMatch(/@badguy/);
  });

  it('adds nothing when there are no links or the user is already banned', async () => {
    mockQuietUser();
    banEvasionService.findBanLinks.mockResolvedValueOnce({ user: { id: '222' }, links: [] });
    expect((await svc.scanUser('222')).signals).toEqual([]);

    mockQuietUser('banned');
    banEvasionService.findBanLinks.mockResolvedValueOnce({ user: { id: '222' }, links: [LINK] });
    expect((await svc.scanUser('222')).signals).toEqual([]);
  });

  it('keeps scanning when the ban-link check fails', async () => {
    mockQuietUser();
    banEvasionService.findBanLinks.mockRejectedValueOnce(new Error('db'));
    expect((await svc.scanUser('222')).score).toBe(0);
  });

  it('adds evasion candidates to the nightly shortlist', async () => {
    query.mockImplementation(async (sql) => {
      if (/WITH candidates AS/.test(sql)) return { rows: [{ user_id: '111' }] };
      if (/FROM users WHERE id = \$1/.test(sql)) return { rows: [{ id: 'x', tier: 'free' }] };
      return { rows: [{}] };
    });
    banEvasionService.findCandidateUserIds.mockResolvedValueOnce(['111', '222']);
    banEvasionService.findBanLinks.mockResolvedValue({ links: [] });
    const res = await svc.runDailyScan({ dryRun: true });
    expect(res.candidates).toBe(2);
  });
});
