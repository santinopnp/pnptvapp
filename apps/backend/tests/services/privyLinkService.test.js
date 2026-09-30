'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/sendSystemDM', () => jest.fn().mockResolvedValue(undefined), { virtual: true });
jest.mock('../../services/privyWalletService', () => ({
  validateSingleWallet: jest.fn().mockResolvedValue(true),
  ensureCreatorWallet: jest.fn().mockResolvedValue({}),
}));

const mockVerifyAuthToken = jest.fn();
const mockGetUserById = jest.fn();
jest.mock('@privy-io/server-auth', () => ({
  PrivyClient: jest.fn().mockImplementation(() => ({
    verifyAuthToken: mockVerifyAuthToken,
    getUserById: mockGetUserById,
  })),
}), { virtual: true });

const mockReadContract = jest.fn();
jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return { ...actual, createPublicClient: jest.fn(() => ({ readContract: mockReadContract })) };
});

const { query } = require('../../config/postgres');
const { validateSingleWallet, ensureCreatorWallet } = require('../../services/privyWalletService');
const svc = require('../../services/privyLinkService');

const flush = () => new Promise((r) => setImmediate(r));

describe('privyLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRIVY_APP_ID = 'app-id';
    process.env.PRIVY_APP_SECRET = 'app-secret';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    mockReadContract.mockResolvedValue(0n); // old wallet empty by default
    validateSingleWallet.mockResolvedValue(true);
    ensureCreatorWallet.mockResolvedValue({});
    // Fire-and-forget "is this user an active creator" query at the end of
    // verifyAndLink — default to "no" unless a test overrides it.
    query.mockImplementation(async (sql) => {
      if (sql.includes("creator_status = 'active'")) return { rowCount: 0, rows: [] };
      return { rows: [] };
    });
  });

  afterEach(() => {
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;
  });

  // ── extractWalletAddress ──────────────────────────────────────────────────
  describe('extractWalletAddress', () => {
    it('returns null for no user / no linkedAccounts', () => {
      expect(svc.extractWalletAddress(null)).toBeNull();
      expect(svc.extractWalletAddress({})).toBeNull();
    });

    it('returns the lowercased embedded (Privy) wallet address', () => {
      const user = { linkedAccounts: [{ type: 'wallet', walletClientType: 'privy', address: '0xABC123' }] };
      expect(svc.extractWalletAddress(user)).toBe('0xabc123');
    });

    it('IGNORES an external wallet — the actual security boundary for "no imported wallets"', () => {
      const user = { linkedAccounts: [{ type: 'wallet', walletClientType: 'metamask', address: '0xDEADBEEF' }] };
      expect(svc.extractWalletAddress(user)).toBeNull();
    });

    it('prefers the embedded wallet when both embedded and external are linked', () => {
      const user = {
        linkedAccounts: [
          { type: 'wallet', walletClientType: 'metamask', address: '0xexternal' },
          { type: 'wallet', walletClientType: 'privy', address: '0xembedded' },
        ],
      };
      expect(svc.extractWalletAddress(user)).toBe('0xembedded');
    });
  });

  // ── verifyAndLink ─────────────────────────────────────────────────────────
  describe('verifyAndLink', () => {
    it('requires pnptvUserId and privyToken', async () => {
      await expect(svc.verifyAndLink({ privyToken: 't' })).rejects.toThrow('pnptvUserId required');
      await expect(svc.verifyAndLink({ pnptvUserId: 'u1' })).rejects.toThrow('privyToken required');
    });

    it('throws invalid_privy_token when the SDK rejects the token', async () => {
      mockVerifyAuthToken.mockRejectedValueOnce(new Error('expired'));
      await expect(svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 'bad' }))
        .rejects.toThrow('invalid_privy_token');
    });

    it('throws invalid_privy_token when claims carry no userId', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({});
      await expect(svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 't' }))
        .rejects.toThrow('invalid_privy_token');
    });

    it('rejects with privy_id_already_linked when another pnptv user already owns this privy_id', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({ linkedAccounts: [] });
      query.mockImplementationOnce(async () => ({ rowCount: 1, rows: [{ id: 'other-user' }] })); // collision check

      await expect(svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 't' }))
        .rejects.toMatchObject({ message: 'privy_id_already_linked', otherUserId: 'other-user' });
    });

    it('propagates MULTIPLE_WALLETS_NOT_ALLOWED from validateSingleWallet when the new address is already claimed', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({
        linkedAccounts: [{ type: 'wallet', walletClientType: 'privy', address: '0xnew' }],
      });
      query
        .mockImplementationOnce(async () => ({ rowCount: 0, rows: [] })) // collision check
        .mockImplementationOnce(async () => ({ rows: [{ old_privy_id: null, old_wallet_address: null }] })); // prior state

      validateSingleWallet.mockRejectedValueOnce(Object.assign(new Error('taken'), { code: 'MULTIPLE_WALLETS_NOT_ALLOWED' }));

      await expect(svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 't' }))
        .rejects.toMatchObject({ code: 'MULTIPLE_WALLETS_NOT_ALLOWED' });
      expect(validateSingleWallet).toHaveBeenCalledWith('0xnew', 'u1');
    });

    it('on a first-time link (no prior wallet), writes privy_id + wallet_address and resets payout config', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({
        linkedAccounts: [{ type: 'wallet', walletClientType: 'privy', address: '0xNEWWALLET' }],
      });
      query
        .mockImplementationOnce(async () => ({ rowCount: 0, rows: [] })) // collision check
        .mockImplementationOnce(async () => ({ rows: [{ old_privy_id: null, old_wallet_address: null }] })); // prior state (no old wallet)

      const result = await svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 't' });
      expect(result).toEqual({ privyId: 'privy-1', walletAddress: '0xnewwallet' });

      const updateCall = query.mock.calls.find((c) => c[0].includes('UPDATE users') && c[0].includes('has_pnptv_payout_configured'));
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual(['privy-1', '0xnewwallet', null, 'u1', false]); // isFundedException=false
    });

    it('rotating to a new wallet with a FUNDED old wallet keeps both alive and sets wallet_lock_reason', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({
        linkedAccounts: [{ type: 'wallet', walletClientType: 'privy', address: '0xNEWWALLET' }],
      });
      query
        .mockImplementationOnce(async () => ({ rowCount: 0, rows: [] })) // collision check
        .mockImplementationOnce(async () => ({ rows: [{ old_privy_id: 'privy-1', old_wallet_address: '0xOLDWALLET' }] }));
      mockReadContract.mockResolvedValueOnce(5_000_000n); // 5.00 USDC still on the old wallet (6 decimals)

      await svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 't' });

      const updateCall = query.mock.calls.find((c) => c[0].includes('UPDATE users') && c[0].includes('has_pnptv_payout_configured'));
      expect(updateCall[1]).toEqual(['privy-1', '0xnewwallet', '0xoldwallet', 'u1', true]); // isFundedException=true

      const auditCall = query.mock.calls.find((c) => c[0].includes('INSERT INTO wallet_changes'));
      expect(auditCall[1]).toEqual(['u1', '0xoldwallet', '0xnewwallet', 'privy-1', 'privy-1', 'privy-link-funded-exception']);
    });

    it('does not treat re-linking the SAME address as a wallet change (no audit row, no payout-config reset)', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({
        linkedAccounts: [{ type: 'wallet', walletClientType: 'privy', address: '0xSAME' }],
      });
      query
        .mockImplementationOnce(async () => ({ rowCount: 0, rows: [] })) // collision check
        .mockImplementationOnce(async () => ({ rows: [{ old_privy_id: 'privy-1', old_wallet_address: '0xsame' }] }));

      await svc.verifyAndLink({ pnptvUserId: 'u1', privyToken: 't' });

      const auditCall = query.mock.calls.find((c) => c[0].includes('INSERT INTO wallet_changes'));
      expect(auditCall).toBeUndefined();
      const resetCall = query.mock.calls.find((c) => c[0].includes('has_pnptv_payout_configured'));
      expect(resetCall).toBeUndefined(); // the non-change UPDATE branch doesn't touch that column
    });

    it('fires ensureCreatorWallet (fire-and-forget) when the linked user is an active creator', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({ linkedAccounts: [] });
      query.mockImplementation(async (sql) => {
        if (sql.includes("creator_status = 'active'")) return { rowCount: 1, rows: [{}] };
        if (sql.includes('FROM users WHERE privy_id')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM users WHERE id')) return { rows: [{ old_privy_id: null, old_wallet_address: null }] };
        return { rows: [] };
      });

      await svc.verifyAndLink({ pnptvUserId: 'active-creator', privyToken: 't' });
      await flush();

      expect(ensureCreatorWallet).toHaveBeenCalledWith('active-creator');
    });

    it('does NOT fire ensureCreatorWallet for a non-active user', async () => {
      mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'privy-1' });
      mockGetUserById.mockResolvedValueOnce({ linkedAccounts: [] });
      // default beforeEach mock already returns rowCount:0 for the active-creator check

      await svc.verifyAndLink({ pnptvUserId: 'regular-user', privyToken: 't' });
      await flush();

      expect(ensureCreatorWallet).not.toHaveBeenCalled();
    });
  });

  // ── listWalletAddresses / listWalletAddressesRaw ────────────────────────
  describe('listWalletAddresses', () => {
    it('returns lowercased wallet addresses from linkedAccounts', async () => {
      mockGetUserById.mockResolvedValueOnce({
        linkedAccounts: [{ type: 'wallet', address: '0xABC' }, { type: 'email' }],
      });
      expect(await svc.listWalletAddresses('privy-1')).toEqual(['0xabc']);
    });

    it('swallows errors and returns an empty array', async () => {
      mockGetUserById.mockRejectedValueOnce(new Error('privy down'));
      expect(await svc.listWalletAddresses('privy-1')).toEqual([]);
    });

    it('listWalletAddressesRaw rethrows instead of swallowing', async () => {
      mockGetUserById.mockRejectedValueOnce(new Error('privy down'));
      await expect(svc.listWalletAddressesRaw('privy-1')).rejects.toThrow('privy down');
    });
  });
});
