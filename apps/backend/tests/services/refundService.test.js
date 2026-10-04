'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/sendSystemDM', () => jest.fn().mockResolvedValue(undefined), { virtual: true });
jest.mock('../../services/payoutSplitService', () => ({
  provisionCreatorWallet: jest.fn(),
  sendTreasuryLeg: jest.fn(),
}), { virtual: true });

const { query } = require('../../config/postgres');
const { provisionCreatorWallet, sendTreasuryLeg } = require('../../services/payoutSplitService');
const svc = require('../../services/refundService');

// Real viem crypto (no mocking) — genuinely signs and recovers, so the
// signature-verification tests exercise the actual algorithm, not a stub
// that could lie about matching. Keys are freshly generated per test run
// (never funded, never reused) — only their offline sign/recover behavior
// matters here.
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const userAccount = privateKeyToAccount(generatePrivateKey());

describe('refundService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_OPS_ADMIN_CHANNEL;
  });

  // ── requestRefund ────────────────────────────────────────────────────────
  describe('requestRefund', () => {
    it('requires paymentId and userId', async () => {
      await expect(svc.requestRefund({ userId: 'u1' })).rejects.toMatchObject({ code: 'MISSING_PAYMENT_ID' });
      await expect(svc.requestRefund({ paymentId: 1 })).rejects.toMatchObject({ code: 'MISSING_USER_ID' });
    });

    it('rejects a payment that does not exist or is not owned by the caller', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(svc.requestRefund({ paymentId: 1, userId: 'u1' }))
        .rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND', status: 404 });
    });

    it('rejects an unconfirmed payment', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, amount_usd: '10.00', status: 'pending' }] });
      await expect(svc.requestRefund({ paymentId: 1, userId: 'u1' }))
        .rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIRMED' });
    });

    it('rejects when a refund row already exists (including a past denial)', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, amount_usd: '10.00', status: 'confirmed' }] })
        .mockResolvedValueOnce({ rows: [{ id: 99 }], rowCount: 1 });
      await expect(svc.requestRefund({ paymentId: 1, userId: 'u1' }))
        .rejects.toMatchObject({ code: 'REFUND_ALREADY_EXISTS', status: 409 });
    });

    it('translates a 23505 unique-violation on INSERT into REFUND_ALREADY_EXISTS (the real concurrency backstop)', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, amount_usd: '10.00', status: 'confirmed' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // dup check passes (race window)
        .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

      await expect(svc.requestRefund({ paymentId: 1, userId: 'u1' }))
        .rejects.toMatchObject({ code: 'REFUND_ALREADY_EXISTS', status: 409 });
    });

    it('rethrows a non-23505 INSERT error unchanged', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, amount_usd: '10.00', status: 'confirmed' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockRejectedValueOnce(new Error('connection reset'));

      await expect(svc.requestRefund({ paymentId: 1, userId: 'u1' })).rejects.toThrow('connection reset');
    });

    it('creates a pending refund for a confirmed, owned, not-yet-refunded payment', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, amount_usd: '25.00', status: 'confirmed' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: 5, payment_id: 1, user_id: 'u1', amount_usd: '25.00', status: 'pending' }] });

      const refund = await svc.requestRefund({ paymentId: 1, userId: 'u1', reason: 'wrong plan' });
      expect(refund).toMatchObject({ id: 5, status: 'pending' });
    });
  });

  // ── getRefund ────────────────────────────────────────────────────────────
  describe('getRefund', () => {
    it('returns null for a missing refund', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await svc.getRefund(1, { userId: 'u1' })).toBeNull();
    });

    it('forbids a non-owner, non-admin caller', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'owner' }] });
      await expect(svc.getRefund(1, { userId: 'someone-else' })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    });

    it('allows an admin to read any refund', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'owner' }] });
      await expect(svc.getRefund(1, { userId: 'admin', isAdmin: true })).resolves.toMatchObject({ id: 1 });
    });
  });

  // ── approveRefund ────────────────────────────────────────────────────────
  describe('approveRefund', () => {
    it('rejects a refund that is not pending (atomic claim failed)', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // claim UPDATE matched 0 rows
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // it exists, just not pending
      await expect(svc.approveRefund(1)).rejects.toMatchObject({ code: 'REFUND_NOT_PENDING', status: 409 });
    });

    it('reports REFUND_NOT_FOUND when the row genuinely does not exist', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [] });
      await expect(svc.approveRefund(999)).rejects.toMatchObject({ code: 'REFUND_NOT_FOUND', status: 404 });
    });

    it('releases the claim back to pending if the recipient has no wallet and no privy_id', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'u1', amount_usd: '10.00', status: 'approving' }] }) // claim
        .mockResolvedValueOnce({ rows: [{ wallet_address: null, privy_id: null }] }) // user lookup
        .mockResolvedValueOnce({ rows: [] }); // release back to pending

      await expect(svc.approveRefund(1)).rejects.toMatchObject({ code: 'NO_WALLET_NO_PRIVY' });
      expect(query.mock.calls[2][0]).toMatch(/SET status = 'pending'/);
      expect(sendTreasuryLeg).not.toHaveBeenCalled();
    });

    it('provisions a wallet via Privy when the user has a privy_id but no wallet yet', async () => {
      provisionCreatorWallet.mockResolvedValueOnce({ address: '0xprovisioned' });
      sendTreasuryLeg.mockResolvedValueOnce('0xtxhash');
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'u1', amount_usd: '10.00', status: 'approving' }] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: null, privy_id: 'privy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved', to_address: '0xprovisioned', tx_hash: '0xtxhash' }] });

      const result = await svc.approveRefund(1);
      expect(provisionCreatorWallet).toHaveBeenCalledWith('u1');
      expect(sendTreasuryLeg).toHaveBeenCalledWith({ paymentId: '1', purpose: 'refund', to: '0xprovisioned', usd: 10 });
      expect(result.status).toBe('approved');
    });

    it('releases the claim back to pending when sendTreasuryLeg exhausts its retries (nothing sent)', async () => {
      sendTreasuryLeg.mockRejectedValueOnce(Object.assign(new Error('all attempts failed'), { code: 'PAYOUT_LEG_FAILED' }));
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'u1', amount_usd: '10.00', status: 'approving' }] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: '0xexisting', privy_id: null }] })
        .mockResolvedValueOnce({ rows: [] }); // release back to pending

      await expect(svc.approveRefund(1)).rejects.toMatchObject({ code: 'PAYOUT_LEG_FAILED' });
      expect(query.mock.calls[2][0]).toMatch(/SET status = 'pending'/);
    });

    it('CRITICAL: never reverts to pending once USDC has actually been sent, even if the DB write fails 3x', async () => {
      sendTreasuryLeg.mockResolvedValueOnce('0xrealtxhash');
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'u1', amount_usd: '10.00', status: 'approving' }] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: '0xexisting', privy_id: null }] })
        .mockRejectedValueOnce(new Error('db down')) // approved-UPDATE attempt 1
        .mockRejectedValueOnce(new Error('db down')) // attempt 2
        .mockRejectedValueOnce(new Error('db down')); // attempt 3

      await expect(svc.approveRefund(1)).rejects.toMatchObject({ code: 'PAID_BUT_UNRECORDED', txHash: '0xrealtxhash' });

      // Every one of the 3 retried queries must be the 'approved' UPDATE —
      // NONE of them may be a revert-to-pending. A single 'pending' write
      // here would let a retry send the same refund a second time.
      const postSendCalls = query.mock.calls.slice(2);
      expect(postSendCalls).toHaveLength(3);
      for (const call of postSendCalls) {
        expect(call[0]).toMatch(/SET status = 'approved'/);
        expect(call[0]).not.toMatch(/pending/);
      }
    });

    it('succeeds and returns the approved row on the happy path', async () => {
      sendTreasuryLeg.mockResolvedValueOnce('0xgoodhash');
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'u1', amount_usd: '42.50', status: 'approving' }] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: '0xexisting', privy_id: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved', to_address: '0xexisting', tx_hash: '0xgoodhash' }] });

      const result = await svc.approveRefund(1, { reviewedBy: 'admin-1', notes: 'looks legit' });
      expect(result).toMatchObject({ status: 'approved', tx_hash: '0xgoodhash' });
      expect(sendTreasuryLeg).toHaveBeenCalledWith({ paymentId: '1', purpose: 'refund', to: '0xexisting', usd: 42.5 });
    });
  });

  // ── denyRefund ───────────────────────────────────────────────────────────
  describe('denyRefund', () => {
    it('is guarded on status=pending — a concurrent approve wins the race cleanly', async () => {
      query.mockResolvedValueOnce({ rows: [] }); // guarded UPDATE matched nothing
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      await expect(svc.denyRefund(1, 'not eligible')).rejects.toMatchObject({ code: 'REFUND_NOT_PENDING' });
    });

    it('denies and sets a signature deadline in the future', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'u1', status: 'denied', signature_deadline_at: new Date(Date.now() + 1000).toISOString() }],
      });
      const result = await svc.denyRefund(1, 'fraud suspected', 'admin-1');
      expect(result.status).toBe('denied');
      const deadlineArg = query.mock.calls[0][1][3];
      expect(deadlineArg.getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ── recordRefundDenialSignature ─────────────────────────────────────────
  describe('recordRefundDenialSignature', () => {
    it('requires a signature', async () => {
      await expect(svc.recordRefundDenialSignature(1, '')).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('rejects if the refund is not in denied state', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] });
      await expect(svc.recordRefundDenialSignature(1, '0xsig')).rejects.toMatchObject({ code: 'REFUND_NOT_DENIED' });
    });

    it('is idempotent — returns the row unchanged if already signed', async () => {
      const refund = { id: 1, status: 'denied', refund_denial_signed: true };
      query.mockResolvedValueOnce({ rows: [refund] });
      const result = await svc.recordRefundDenialSignature(1, '0xsig');
      expect(result).toBe(refund);
      expect(query).toHaveBeenCalledTimes(1); // no wallet lookup, no update
    });

    it('rejects when the user has no linked wallet to verify against', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'u1', status: 'denied', refund_denial_signed: false }] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: null }] });
      await expect(svc.recordRefundDenialSignature(1, '0xsig')).rejects.toMatchObject({ code: 'NO_WALLET' });
    });

    it('verifies a REAL signature end-to-end (genuine ECDSA sign + recover, no mocking) and accepts it', async () => {
      const refund = {
        id: 42, payment_id: 7, user_id: 'u1', status: 'denied',
        refund_denial_signed: false, signature_deadline_at: null,
      };
      const message = svc.getDenialMessage(refund);
      const signature = await userAccount.signMessage({ message });

      query
        .mockResolvedValueOnce({ rows: [refund] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: userAccount.address }] })
        .mockResolvedValueOnce({ rows: [{ ...refund, refund_denial_signed: true, signature_hash: 'deadbeef' }] });

      const result = await svc.recordRefundDenialSignature(42, signature);
      expect(result.refund_denial_signed).toBe(true);
    });

    it('rejects a signature from the WRONG wallet — the actual security boundary of this feature', async () => {
      const refund = { id: 42, payment_id: 7, user_id: 'u1', status: 'denied', refund_denial_signed: false };
      const message = svc.getDenialMessage(refund);
      const attackerAccount = privateKeyToAccount(generatePrivateKey());
      const wrongSignature = await attackerAccount.signMessage({ message });

      query
        .mockResolvedValueOnce({ rows: [refund] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: userAccount.address }] }); // legit owner's address on file

      await expect(svc.recordRefundDenialSignature(42, wrongSignature)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('rejects a well-formed but garbage signature', async () => {
      const refund = { id: 42, payment_id: 7, user_id: 'u1', status: 'denied', refund_denial_signed: false };
      query
        .mockResolvedValueOnce({ rows: [refund] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: userAccount.address }] });

      await expect(svc.recordRefundDenialSignature(42, '0x' + 'ab'.repeat(65))).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('rejects a valid signature submitted after the deadline', async () => {
      const refund = {
        id: 42, payment_id: 7, user_id: 'u1', status: 'denied',
        refund_denial_signed: false, signature_deadline_at: new Date(Date.now() - 1000).toISOString(), // already past
      };
      const message = svc.getDenialMessage(refund);
      const signature = await userAccount.signMessage({ message });

      query
        .mockResolvedValueOnce({ rows: [refund] })
        .mockResolvedValueOnce({ rows: [{ wallet_address: userAccount.address }] });

      await expect(svc.recordRefundDenialSignature(42, signature)).rejects.toMatchObject({ code: 'SIGNATURE_EXPIRED', status: 410 });
    });
  });
});
