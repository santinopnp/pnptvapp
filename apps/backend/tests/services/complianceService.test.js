'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { query } = require('../../config/postgres');
const svc = require('../../services/complianceService');

const VALID = {
  kind: 'ncii',
  name: 'Jane Doe',
  email: 'jane@example.com',
  contentUrls: ['https://pnptv.app/social/post/1'],
  signature: 'Jane Doe',
  goodFaith: true,
};

describe('complianceService deadlines', () => {
  it('gives intimate-image requests 48 hours', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    expect(svc.dueAtFor('ncii', now).toISOString()).toBe('2026-10-22T10:00:00.000Z');
  });

  it('gives complaints 7 business days, skipping weekends', () => {
    // Tue 20 Oct + 7 business days = Thu 29 Oct
    const now = new Date('2026-10-20T10:00:00Z');
    expect(svc.dueAtFor('complaint', now).toISOString()).toBe('2026-10-29T10:00:00.000Z');
  });

  it('counts business days from a Friday over the weekend', () => {
    expect(svc.addBusinessDays(new Date('2026-10-23T09:00:00Z'), 1).toISOString()).toBe('2026-10-26T09:00:00.000Z');
  });
});

describe('complianceService.createRemovalRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores a valid intimate-image request', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1', due_at: '2026-10-22T10:00:00Z' }] });
    const res = await svc.createRemovalRequest(VALID, { ip: '1.1.1.1' });
    expect(res).toMatchObject({ ok: true, id: 'r1' });
    const params = query.mock.calls[0][1];
    expect(params[0]).toBe('ncii');
    expect(params[4]).toEqual(['https://pnptv.app/social/post/1']);
  });

  it('requires the good-faith statement for intimate-image requests', async () => {
    expect(await svc.createRemovalRequest({ ...VALID, goodFaith: false })).toEqual({ error: 'good_faith_statement_required' });
    expect(query).not.toHaveBeenCalled();
  });

  it('does not require the good-faith statement for complaints', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r2', due_at: '2026-10-29T10:00:00Z' }] });
    const res = await svc.createRemovalRequest({ ...VALID, kind: 'complaint', goodFaith: false });
    expect(res.ok).toBe(true);
  });

  it.each([
    [{ kind: 'other' }, 'invalid_kind'],
    [{ name: '' }, 'name_required'],
    [{ email: 'nope' }, 'valid_email_required'],
    [{ contentUrls: [] }, 'content_urls_required'],
    [{ signature: ' ' }, 'signature_required'],
  ])('rejects %o', async (patch, error) => {
    expect(await svc.createRemovalRequest({ ...VALID, ...patch })).toEqual({ error });
  });

  it('accepts newline-separated URLs as a string', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r3', due_at: '2026-10-22T10:00:00Z' }] });
    await svc.createRemovalRequest({ ...VALID, contentUrls: 'https://a.test/1\nhttps://a.test/2' });
    expect(query.mock.calls[0][1][4]).toEqual(['https://a.test/1', 'https://a.test/2']);
  });
});

describe('complianceService NCMEC + legal holds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires a CyberTip number to mark a case reported', async () => {
    await expect(svc.updateNcmecCase('c1', 'admin', { status: 'reported' })).rejects.toMatchObject({ status: 400 });
  });

  it('marks a case reported with 1-year preservation', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'c1', status: 'reported' }] });
    await svc.updateNcmecCase('c1', 'admin', { status: 'reported', cybertipReportId: '123456' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/preserve_until/);
    expect(params[5]).toBe(365);
  });

  it('opens a case without throwing even if the insert fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.openNcmecCase({ id: 9, reported_user_id: 'u1' })).resolves.toBeUndefined();
  });

  it('reports 2257 and NCMEC holds', async () => {
    query.mockResolvedValueOnce({ rows: [{ has_2257: true, has_ncmec: true }] });
    expect(await svc.getLegalHolds('u1')).toEqual(['2257_records', 'ncmec_evidence']);
  });

  it('reports no hold for an ordinary member', async () => {
    query.mockResolvedValueOnce({ rows: [{ has_2257: false, has_ncmec: false }] });
    expect(await svc.getLegalHolds('u1')).toEqual([]);
  });
});
