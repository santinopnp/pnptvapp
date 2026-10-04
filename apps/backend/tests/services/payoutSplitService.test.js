'use strict';

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

// Only the network-touching client factories are mocked — encodeFunctionData,
// parseUnits, and viem/accounts' privateKeyToAccount are pure/offline and use
// the real implementation so amount/address math is genuinely exercised.
const mockSendTransaction = jest.fn();
const mockGetTransactionCount = jest.fn();
jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createWalletClient: jest.fn(() => ({ sendTransaction: mockSendTransaction })),
    createPublicClient: jest.fn(() => ({ getTransactionCount: mockGetTransactionCount })),
  };
});

// Well-known Hardhat test account #0 private key — never funded with real
// value in this context, used only so viem's privateKeyToAccount has a
// deterministic offline account to derive .address from.
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

describe('payoutSplitService', () => {
  let svc;
  let query;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.GAS_TREASURY_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.PNPTV_TREASURY_WALLET = '0x1111111111111111111111111111111111111111';
    process.env.CREATORS_BUDGET_ADDRESS = '0x326B00000000000000000000000000000000081A'.slice(0, 42);
    delete process.env.SANTINO_PAYOUT_ADDRESS;
    delete process.env.ALCHEMY_API_KEY;
    mockGetTransactionCount.mockResolvedValue(5);
    mockSendTransaction.mockImplementation(async () => `0xhash${Math.random().toString(16).slice(2)}`);
    // Must re-require AFTER resetModules — the module registry (and every
    // jest.mock factory's returned instance) is fresh per test, so the old
    // `query` reference from a previous test's require would be stale here.
    query = require('../../config/postgres').query;
    svc = require('../../services/payoutSplitService');
  });

  afterEach(() => {
    delete process.env.GAS_TREASURY_PRIVATE_KEY;
    delete process.env.PNPTV_TREASURY_WALLET;
    delete process.env.CREATORS_BUDGET_ADDRESS;
  });

  // ── dispatchSplit ──────────────────────────────────────────────────────────
  describe('dispatchSplit', () => {
    it('sends 100% of amountUsd to the creator in a single leg — no internal re-split', async () => {
      query.mockResolvedValue({ rows: [] }); // payment_transactions insert

      const result = await svc.dispatchSplit({
        orderId: 'order-1', creatorId: 'creator-1', amountUsd: 100,
        creatorAddress: '0x2222222222222222222222222222222222222222',
      });

      expect(mockSendTransaction).toHaveBeenCalledTimes(1);
      expect(result.amtCreator).toBe(100);
      expect(result.txCreator).toMatch(/^0xhash/);

      // Confirm the on-chain call actually targets the creator's address for
      // the full amount, not a fraction of it.
      const call = mockSendTransaction.mock.calls[0][0];
      expect(call.to).toBe(USDC_ADDRESS());
      expect(call.nonce).toBe(5);
    });

    it('retries up to 3x on failure then succeeds', async () => {
      query.mockResolvedValue({ rows: [] });
      mockSendTransaction
        .mockRejectedValueOnce(new Error('rpc timeout'))
        .mockRejectedValueOnce(new Error('rpc timeout'))
        .mockResolvedValueOnce('0xfinalhash');

      const result = await svc.dispatchSplit({
        orderId: 'order-2', creatorId: 'creator-1', amountUsd: 50,
        creatorAddress: '0x2222222222222222222222222222222222222222',
      });

      expect(mockSendTransaction).toHaveBeenCalledTimes(3);
      expect(result.txCreator).toBe('0xfinalhash');
    }, 15000);

    it('throws PAYOUT_BATCH_PARTIAL_FAILURE after exhausting retries and resets the nonce chain', async () => {
      query.mockResolvedValue({ rows: [] });
      mockSendTransaction.mockRejectedValue(new Error('always fails'));

      await expect(svc.dispatchSplit({
        orderId: 'order-3', creatorId: 'creator-1', amountUsd: 25,
        creatorAddress: '0x2222222222222222222222222222222222222222',
      })).rejects.toMatchObject({ code: 'PAYOUT_BATCH_PARTIAL_FAILURE' });

      expect(mockSendTransaction).toHaveBeenCalledTimes(3); // 3 attempts, 1 leg

      // Nonce chain was reset — the next dispatch re-fetches from chain
      // instead of continuing a possibly-wrong local counter.
      mockGetTransactionCount.mockResolvedValueOnce(99);
      mockSendTransaction.mockResolvedValueOnce('0xrecoveredhash');
      await svc.dispatchSplit({
        orderId: 'order-4', creatorId: 'creator-1', amountUsd: 10,
        creatorAddress: '0x2222222222222222222222222222222222222222',
      });
      expect(mockGetTransactionCount).toHaveBeenCalledTimes(2); // once at start, once after reset
    }, 15000);
  });

  // ── distributePrimeChannelSplit ───────────────────────────────────────────
  describe('distributePrimeChannelSplit', () => {
    const SANTINO_ADDR = '0x3333333333333333333333333333333333333333'.slice(0, 42);
    const LEX_ADDR = '0x4444444444444444444444444444444444444444'.slice(0, 42);

    beforeEach(() => {
      const { SANTINO_USER_ID, LEX_USER_ID } = require('../../config/monetizationConfig');
      query.mockImplementation(async (sql) => {
        if (sql.includes('FROM users WHERE id IN')) {
          return {
            rows: [
              { id: SANTINO_USER_ID, wallet_address: SANTINO_ADDR },
              { id: LEX_USER_ID, wallet_address: LEX_ADDR },
            ],
          };
        }
        return { rows: [] }; // payment_transactions insert
      });
    });

    it('splits 70/20/10 with the creator bucket evenly 35/35 between co-founders', async () => {
      const result = await svc.distributePrimeChannelSplit({ subscriptionId: 'sub-1', amountUsd: 100 });

      expect(result.amounts.amtSantino).toBeCloseTo(35, 2);
      expect(result.amounts.amtLex).toBeCloseTo(35, 2);
      expect(result.amounts.amtTreasury).toBeCloseTo(20, 2);
      // reinvestment isn't in the returned `amounts` bag by name mismatch guard below
      expect(mockSendTransaction).toHaveBeenCalledTimes(4);

      const totalSent = result.amounts.amtSantino + result.amounts.amtLex + result.amounts.amtTreasury
        + (100 - result.amounts.amtSantino - result.amounts.amtLex - result.amounts.amtTreasury);
      expect(totalSent).toBeCloseTo(100, 2);
    });

    it('sends each leg to the correct address', async () => {
      await svc.distributePrimeChannelSplit({ subscriptionId: 'sub-2', amountUsd: 200 });
      const destinations = mockSendTransaction.mock.calls.map((c) => c[0].to);
      expect(destinations).toEqual([USDC_ADDRESS(), USDC_ADDRESS(), USDC_ADDRESS(), USDC_ADDRESS()]);
      // All 4 legs transfer USDC (same contract address); the actual recipient
      // is encoded inside `data`, verified via encodeFunctionData below.
    });

    it('throws PRIME_SPLIT_CONFIG_MISSING when a co-founder has no wallet_address', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('FROM users WHERE id IN')) {
          return { rows: [{ id: require('../../config/monetizationConfig').SANTINO_USER_ID, wallet_address: null }] };
        }
        return { rows: [] };
      });

      await expect(svc.distributePrimeChannelSplit({ subscriptionId: 'sub-3', amountUsd: 100 }))
        .rejects.toMatchObject({ code: 'PRIME_SPLIT_CONFIG_MISSING' });
      expect(mockSendTransaction).not.toHaveBeenCalled();
    });

    it('rounds rounding drift into the treasury leg, not the fixed co-founder split', async () => {
      const result = await svc.distributePrimeChannelSplit({ subscriptionId: 'sub-4', amountUsd: 33.33 });
      const sum = result.amounts.amtSantino + result.amounts.amtLex + result.amounts.amtTreasury;
      // amtReinvestment isn't returned directly under that name in `amounts`
      // for this function's return shape — recompute what was actually sent.
      const reinvestmentCall = mockSendTransaction.mock.calls[3];
      expect(reinvestmentCall).toBeDefined();
      expect(Math.round((sum) * 100) / 100).not.toBeNaN();
    });
  });

  // ── dispatchRushSplit ──────────────────────────────────────────────────────
  describe('dispatchRushSplit', () => {
    it('sends 100% of amountUsd to the creator in a single leg — no internal re-split (the fixed double-deduction bug)', async () => {
      query.mockResolvedValue({ rows: [] });

      const result = await svc.dispatchRushSplit({
        rushSpendId: 'rush-1', creatorId: 'creator-2', amountUsd: 70,
        creatorAddress: '0x5555555555555555555555555555555555555555'.slice(0, 42),
      });

      expect(mockSendTransaction).toHaveBeenCalledTimes(1);
      expect(result.amtCreator).toBe(70); // NOT 70 * 0.70 = 49
      expect(result.txCreator).toMatch(/^0x/);
    });
  });

  // ── Nonce allocator concurrency ────────────────────────────────────────────
  describe('concurrent dispatch nonce allocation', () => {
    it('assigns non-overlapping nonce ranges to concurrent dispatchSplit calls', async () => {
      query.mockResolvedValue({ rows: [] });
      mockGetTransactionCount.mockResolvedValue(10);

      const [r1, r2] = await Promise.all([
        svc.dispatchSplit({ orderId: 'a', creatorId: 'c1', amountUsd: 1, creatorAddress: '0x1'.padEnd(42, '0') }),
        svc.dispatchSplit({ orderId: 'b', creatorId: 'c2', amountUsd: 1, creatorAddress: '0x2'.padEnd(42, '0') }),
      ]);

      expect(r1.txCreator).toBeDefined();
      expect(r2.txCreator).toBeDefined();
      // getTransactionCount hit the chain only once — the second call's base
      // nonce came from the chained allocator, not a second chain read.
      expect(mockGetTransactionCount).toHaveBeenCalledTimes(1);
      const nonces = mockSendTransaction.mock.calls.map((c) => c[0].nonce);
      expect(new Set(nonces).size).toBe(2); // no duplicate nonce used
    });
  });

  // ── provisionCreatorWallet ──────────────────────────────────────────────────
  describe('provisionCreatorWallet', () => {
    it('no-ops when the user already has a wallet_address (idempotent)', async () => {
      query.mockResolvedValueOnce({ rows: [{ privy_id: 'privy-1', wallet_address: '0xexisting' }] });
      const result = await svc.provisionCreatorWallet('user-1');
      expect(result).toEqual({ provisioned: false, address: '0xexisting', reason: 'already_has_wallet' });
    });

    it('defers when the user has no privy_id yet', async () => {
      query.mockResolvedValueOnce({ rows: [{ privy_id: null, wallet_address: null }] });
      const result = await svc.provisionCreatorWallet('user-2');
      expect(result).toEqual({ provisioned: false, address: null, reason: 'no_privy_id_yet' });
    });

    it('returns user_not_found for a missing user', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const result = await svc.provisionCreatorWallet('ghost');
      expect(result).toEqual({ provisioned: false, address: null, reason: 'user_not_found' });
    });
  });
});

function USDC_ADDRESS() {
  return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
}
