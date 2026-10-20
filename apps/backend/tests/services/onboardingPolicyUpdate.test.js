'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { query } = require('../../config/postgres');
const svc = require('../../services/onboardingService');

const BEFORE = '2026-09-01T00:00:00Z';
const AFTER = '2026-10-21T00:00:00Z';

describe('onboardingService.getPolicyUpdateStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks members who accepted before the update', async () => {
    query.mockResolvedValueOnce({ rows: [{ terms_accepted: true, terms_accepted_at: BEFORE, privacy_accepted_at: BEFORE }] });
    expect((await svc.getPolicyUpdateStatus('u1')).needsUpdate).toBe(true);
  });

  it('asks members who never accepted the privacy policy', async () => {
    query.mockResolvedValueOnce({ rows: [{ terms_accepted: true, terms_accepted_at: AFTER, privacy_accepted_at: null }] });
    expect((await svc.getPolicyUpdateStatus('u1')).needsUpdate).toBe(true);
  });

  it('skips members who already accepted the current versions', async () => {
    query.mockResolvedValueOnce({ rows: [{ terms_accepted: true, terms_accepted_at: AFTER, privacy_accepted_at: AFTER }] });
    expect((await svc.getPolicyUpdateStatus('u1')).needsUpdate).toBe(false);
  });

  it('leaves users still in onboarding to the wizard', async () => {
    query.mockResolvedValueOnce({ rows: [{ terms_accepted: false, terms_accepted_at: null, privacy_accepted_at: null }] });
    expect((await svc.getPolicyUpdateStatus('u1')).needsUpdate).toBe(false);
  });

  it('records both acceptances with the current versions', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    await svc.acceptPolicyUpdate('u1', '1.2.3.4');
    expect(query.mock.calls[0][1]).toEqual(['u1', '1.2.3.4', svc.TERMS_VERSION, svc.PRIVACY_VERSION]);
  });
});
