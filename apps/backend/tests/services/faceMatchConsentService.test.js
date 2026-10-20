'use strict';

const mockClient = { query: jest.fn(), release: jest.fn() };
jest.mock('../../config/postgres', () => ({
  query: jest.fn(),
  getPool: () => ({ connect: jest.fn().mockResolvedValue(mockClient) }),
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { query } = require('../../config/postgres');
const svc = require('../../services/faceMatchConsentService');
const {
  requireFaceMatchConsent,
  requireFaceMatchConsentForVisualMedia,
} = require('../../bot/api/middleware/requireFaceMatchConsent');

const CURRENT = svc.FACE_MATCH_CONSENT_VERSION;

function mockRes() {
  const res = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => { res.headersSent = true; return res; });
  return res;
}

describe('faceMatchConsentService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('has no consent by default', async () => {
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: false, face_match_consent_version: null }] });
    expect(await svc.hasConsent('u1')).toBe(false);
  });

  it('treats consent to an older version as no consent', async () => {
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: true, face_match_consent_version: '2020-01-01' }] });
    expect(await svc.hasConsent('u1')).toBe(false);
  });

  it('accepts consent to the current version', async () => {
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: true, face_match_consent_version: CURRENT }] });
    expect(await svc.hasConsent('u1')).toBe(true);
  });

  it('records a grant with an audit event in one transaction', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [{
      face_match_consent: true, face_match_consented_at: 't', face_match_consent_version: CURRENT,
    }] });

    const status = await svc.grant('u1', { ip: '1.2.3.4', userAgent: 'ua' });

    const sql = mockClient.query.mock.calls.map(([q]) => q);
    expect(sql[0]).toBe('BEGIN');
    expect(mockClient.query.mock.calls[1][1]).toEqual(['u1', true, CURRENT]);
    expect(sql[2]).toMatch(/INSERT INTO face_match_consent_events/);
    expect(mockClient.query.mock.calls[2][1]).toEqual(['u1', 'grant', CURRENT, '1.2.3.4', 'ua']);
    expect(sql[3]).toBe('COMMIT');
    expect(status.consented).toBe(true);
  });

  it('records a withdrawal', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: false, face_match_consent_version: CURRENT }] });

    const status = await svc.withdraw('u1', {});

    expect(mockClient.query.mock.calls[1][1]).toEqual(['u1', false, CURRENT]);
    expect(mockClient.query.mock.calls[2][1][1]).toBe('withdraw');
    expect(status.consented).toBe(false);
  });

  it('rolls back and 404s for an unknown user', async () => {
    mockClient.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0 });
    await expect(svc.grant('nope', {})).rejects.toMatchObject({ status: 404 });
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('requireFaceMatchConsent middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks uploads without consent', async () => {
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: false }] });
    const res = mockRes();
    const next = jest.fn();

    await requireFaceMatchConsent({ session: { user: { id: 'u1' } }, path: '/x' }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('FACE_MATCH_CONSENT_REQUIRED');
  });

  it('allows uploads with consent', async () => {
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: true, face_match_consent_version: CURRENT }] });
    const next = jest.fn();
    await requireFaceMatchConsent({ session: { user: { id: 'u1' } } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('fails closed when the lookup errors', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    const res = mockRes();
    await requireFaceMatchConsent({ session: { user: { id: 'u1' } } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('lets voice notes through without consent', async () => {
    const next = jest.fn();
    const req = { session: { user: { id: 'u1' } }, file: { mimetype: 'audio/webm' } };
    await requireFaceMatchConsentForVisualMedia(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('blocks chat images without consent', async () => {
    query.mockResolvedValueOnce({ rows: [{ face_match_consent: false }] });
    const res = mockRes();
    const next = jest.fn();
    const req = { session: { user: { id: 'u1' } }, file: { mimetype: 'image/jpeg' } };

    await requireFaceMatchConsentForVisualMedia(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
