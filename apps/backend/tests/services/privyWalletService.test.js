'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/sendSystemDM', () => jest.fn().mockResolvedValue(undefined), { virtual: true });
jest.mock('../../services/payoutSplitService', () => ({ provisionCreatorWallet: jest.fn() }));

const { query } = require('../../config/postgres');
const { provisionCreatorWallet } = require('../../services/payoutSplitService');
const svc = require('../../services/privyWalletService');

describe('privyWalletService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_OPS_ADMIN_CHANNEL;
  });

  // ── configurePaymentMethod ─────────────────────────────────────────────────
  describe('configurePaymentMethod', () => {
    it('rejects an unsupported method before touching the DB', async () => {
      await expect(svc.configurePaymentMethod('user-1', 'bank_transfer'))
        .rejects.toMatchObject({ code: 'UNSUPPORTED_PAYMENT_METHOD' });
      expect(query).not.toHaveBeenCalled();
    });

    it('throws USER_NOT_FOUND for a missing user, distinct from already-configured', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(svc.configurePaymentMethod('ghost'))
        .rejects.toMatchObject({ code: 'USER_NOT_FOUND', status: 404 });
    });

    it('rejects a user who is not an active creator (NOT_ELIGIBLE) — the core security fix', async () => {
      query.mockResolvedValueOnce({
        rows: [{ creator_status: 'pending', wallet_address: '0xabc', has_pnptv_payout_configured: false }],
      });
      await expect(svc.configurePaymentMethod('regular-user'))
        .rejects.toMatchObject({ code: 'NOT_ELIGIBLE', status: 403 });
      // Only the SELECT ran — no UPDATE, no flag flipped for a non-creator.
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('rejects an active creator with no linked wallet yet (NO_WALLET)', async () => {
      query.mockResolvedValueOnce({
        rows: [{ creator_status: 'active', wallet_address: null, has_pnptv_payout_configured: false }],
      });
      await expect(svc.configurePaymentMethod('creator-no-wallet'))
        .rejects.toMatchObject({ code: 'NO_WALLET', status: 409 });
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — returns alreadyConfigured without a second write', async () => {
      query.mockResolvedValueOnce({
        rows: [{ creator_status: 'active', wallet_address: '0xabc', has_pnptv_payout_configured: true }],
      });
      const result = await svc.configurePaymentMethod('already-done');
      expect(result).toEqual({ configured: false, alreadyConfigured: true, method: 'pnptv_treasury' });
      expect(query).toHaveBeenCalledTimes(1); // SELECT only, no UPDATE
    });

    it('configures an eligible active creator with a wallet', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ creator_status: 'active', wallet_address: '0xabc', has_pnptv_payout_configured: false }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE

      const result = await svc.configurePaymentMethod('eligible-creator');
      expect(result).toEqual({ configured: true, alreadyConfigured: false, method: 'pnptv_treasury' });
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).toMatch(/UPDATE users SET has_pnptv_payout_configured = TRUE/);
    });
  });

  // ── ensureCreatorWallet ─────────────────────────────────────────────────────
  describe('ensureCreatorWallet', () => {
    it('swallows NOT_ELIGIBLE from configurePaymentMethod and reports payoutConfigured=false', async () => {
      provisionCreatorWallet.mockResolvedValue({ provisioned: false, address: null, reason: 'no_privy_id_yet' });
      // configurePaymentMethod's own DB call: user is not an active creator
      // (or, more realistically here, has no wallet yet either way).
      query.mockResolvedValueOnce({ rows: [{ creator_status: 'pending', wallet_address: null, has_pnptv_payout_configured: false }] });

      const result = await svc.ensureCreatorWallet('deferred-user');
      expect(result).toEqual({ provisioned: false, address: null, payoutConfigured: false });
    });

    it('swallows NO_WALLET (provisioning deferred, still no wallet_address in DB)', async () => {
      provisionCreatorWallet.mockResolvedValue({ provisioned: false, address: null, reason: 'no_privy_id_yet' });
      query.mockResolvedValueOnce({ rows: [{ creator_status: 'active', wallet_address: null, has_pnptv_payout_configured: false }] });

      const result = await svc.ensureCreatorWallet('active-no-wallet-yet');
      expect(result).toEqual({ provisioned: false, address: null, payoutConfigured: false });
    });

    it('rethrows unexpected errors from configurePaymentMethod (not NOT_ELIGIBLE/NO_WALLET)', async () => {
      provisionCreatorWallet.mockResolvedValue({ provisioned: false, address: '0xabc' });
      query.mockRejectedValueOnce(new Error('db exploded'));

      await expect(svc.ensureCreatorWallet('user-x')).rejects.toThrow('db exploded');
    });

    it('provisions the wallet and configures payout for a freshly-approved creator', async () => {
      provisionCreatorWallet.mockResolvedValue({ provisioned: true, address: '0xnewwallet' });
      query
        .mockResolvedValueOnce({ rows: [{ creator_status: 'active', wallet_address: '0xnewwallet', has_pnptv_payout_configured: false }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE

      const result = await svc.ensureCreatorWallet('new-creator');
      expect(result).toEqual({ provisioned: true, address: '0xnewwallet', payoutConfigured: true });
    });
  });

  // ── validateSingleWallet ─────────────────────────────────────────────────────
  describe('validateSingleWallet', () => {
    it('rejects an empty address', async () => {
      await expect(svc.validateSingleWallet('', 'user-1')).rejects.toMatchObject({ code: 'ADDRESS_REQUIRED' });
    });

    it('rejects a malformed address', async () => {
      await expect(svc.validateSingleWallet('not-an-address', 'user-1')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    });

    it('rejects (case-insensitively) an address already claimed by a different user', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'other-user' }] });
      const addr = '0xABCDEF0000000000000000000000000000000001';
      await expect(svc.validateSingleWallet(addr, 'user-1'))
        .rejects.toMatchObject({ code: 'MULTIPLE_WALLETS_NOT_ALLOWED', otherUserId: 'other-user' });
      // Comparison must be lowercase.
      expect(query.mock.calls[0][1][0]).toBe(addr.toLowerCase());
    });

    it('passes for an unclaimed address', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(svc.validateSingleWallet('0x1234567890123456789012345678901234567890', 'user-1')).resolves.toBe(true);
    });
  });

  // ── getCreatorPayoutConfig ─────────────────────────────────────────────────
  describe('getCreatorPayoutConfig', () => {
    it('returns null for a missing user', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await svc.getCreatorPayoutConfig('ghost')).toBeNull();
    });

    it('shapes the response and derives method from the configured flag', async () => {
      query.mockResolvedValueOnce({
        rows: [{ wallet_address: '0xabc', has_pnptv_payout_configured: true, creator_status: 'active' }],
      });
      expect(await svc.getCreatorPayoutConfig('creator-1')).toEqual({
        walletAddress: '0xabc', hasPnptvPayoutConfigured: true, creatorStatus: 'active', method: 'pnptv_treasury',
      });
    });
  });
});
