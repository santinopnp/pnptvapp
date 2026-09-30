'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn() }));
jest.mock('../../config/redis', () => ({ cache: { get: jest.fn(), set: jest.fn() } }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const mockVerifyAndFulfillUsdc = jest.fn();
const mockFulfillGrantFailedSurface = jest.fn();
jest.mock('../../services/walletCheckoutService', () => ({
  verifyAndFulfillUsdc: mockVerifyAndFulfillUsdc,
  fulfillGrantFailedSurface: mockFulfillGrantFailedSurface,
}), { virtual: true });

const mockGrantEntitlementsForPlan = jest.fn();
jest.mock('../../services/paymentService', () => ({
  grantEntitlementsForPlan: mockGrantEntitlementsForPlan,
}), { virtual: true });

const mockFulfillChannelPassFromPayment = jest.fn();
jest.mock('../../services/channelPassService', () => ({
  fulfillChannelPassFromPayment: mockFulfillChannelPassFromPayment,
}), { virtual: true });

const mockBnsSend = jest.fn();
jest.mock('../../services/businessNotificationService', () => ({ send: mockBnsSend }), { virtual: true });

// RECEIVING_ADDRESS / ALCHEMY_SIGNING_KEY are captured into module-level
// `const`s at require time, so they must be set BEFORE the module is first
// required — setting them in beforeEach (after the module already loaded)
// would leave the module's captured values undefined.
process.env.CRYPTO_RECEIVING_ADDRESS = '0xReceiver0000000000000000000000000000001';
process.env.ALCHEMY_SIGNING_KEY = 'test-signing-key';

const { query } = require('../../config/postgres');
const { cache } = require('../../config/redis');
const svc = require('../../services/cryptoPaymentService');

describe('CryptoPaymentService', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) — clearAllMocks does NOT drain queued
    // mockResolvedValueOnce/mockRejectedValueOnce values from a prior test,
    // which was leaking mocked query() responses across tests.
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  // ── getEthUsdPrice ─────────────────────────────────────────────────────────
  describe('getEthUsdPrice', () => {
    it('returns the cached price without hitting the network', async () => {
      cache.get.mockResolvedValueOnce({ usd: 3200 });
      const price = await svc.getEthUsdPrice();
      expect(price).toBe(3200);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches, caches, and returns the price on a cache miss', async () => {
      cache.get.mockResolvedValueOnce(null);
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ethereum: { usd: 2900 } }) });
      const price = await svc.getEthUsdPrice();
      expect(price).toBe(2900);
      expect(cache.set).toHaveBeenCalledWith('crypto:eth-usd-price', { usd: 2900 }, 60);
    });

    it('returns null when the oracle response is not ok', async () => {
      cache.get.mockResolvedValueOnce(null);
      global.fetch.mockResolvedValueOnce({ ok: false });
      expect(await svc.getEthUsdPrice()).toBeNull();
    });

    it('returns null when the fetch throws', async () => {
      cache.get.mockResolvedValueOnce(null);
      global.fetch.mockRejectedValueOnce(new Error('network down'));
      expect(await svc.getEthUsdPrice()).toBeNull();
    });

    it('returns null for a malformed oracle payload', async () => {
      cache.get.mockResolvedValueOnce(null);
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      expect(await svc.getEthUsdPrice()).toBeNull();
    });
  });

  // ── createPaymentIntent — USDC-only enforcement ───────────────────────────
  describe('createPaymentIntent', () => {
    it('rejects any non-USDC token with TOKEN_NOT_PAYABLE, even ETH (kept payable historically but no longer sellable)', async () => {
      await expect(svc.createPaymentIntent({ userId: 'u1', planId: 'p1', amountUsd: 10, token: 'ETH' }))
        .rejects.toMatchObject({ code: 'TOKEN_NOT_PAYABLE' });
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      await expect(svc.createPaymentIntent({ userId: 'u1', planId: 'p1', amountUsd: 10, token: 'DOGE' }))
        .rejects.toMatchObject({ code: 'TOKEN_NOT_PAYABLE' });
    });

    it('creates a USDC intent with expected_amount_native equal to amountUsd (1:1, no oracle involved)', async () => {
      query.mockResolvedValueOnce({
        rows: [{ id: 'intent-1', token: 'USDC', expected_amount_native: '19.99', receiving_address: process.env.CRYPTO_RECEIVING_ADDRESS, expires_at: '2026-10-01T00:00:00Z' }],
      });

      const result = await svc.createPaymentIntent({ userId: 'u1', planId: 'p1', amountUsd: 19.99 });

      expect(result).toEqual({
        paymentId: 'intent-1',
        receivingAddress: process.env.CRYPTO_RECEIVING_ADDRESS,
        amountNative: 19.99,
        amountUsdc: 19.99,
        chain: 'base',
        token: 'USDC',
        contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        expiresAt: '2026-10-01T00:00:00Z',
      });
      // amount_usd is taken verbatim from the caller's arg (server-side plan
      // price, per the docstring) — not recomputed from any client input here.
      const insertArgs = query.mock.calls[0][1];
      expect(insertArgs[3]).toBe(19.99); // amount_usd
      expect(insertArgs[4]).toBe(19.99); // expected_amount_usdc
      expect(insertArgs[5]).toBe(19.99); // expected_amount_native
    });
  });

  // ── recordSubmittedTx ──────────────────────────────────────────────────────
  describe('recordSubmittedTx', () => {
    it('locks in the tx hash for a valid, owned, still-pending intent', async () => {
      query.mockResolvedValueOnce({ rowCount: 1 });
      await svc.recordSubmittedTx({ paymentId: 'p1', txHash: '0xabc', fromAddress: '0xFROM', userId: 'u1' });
      expect(query.mock.calls[0][1]).toEqual(['0xabc', '0xfrom', 'p1', 'u1']);
    });

    it('throws when no row matches (wrong owner, already submitted, expired, or not pending)', async () => {
      query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(svc.recordSubmittedTx({ paymentId: 'p1', txHash: '0xabc', fromAddress: '0xfrom', userId: 'attacker' }))
        .rejects.toThrow(/not found, expired, already-submitted, or not owned/);
    });
  });

  // ── verifyAlchemySignature ─────────────────────────────────────────────────
  describe('verifyAlchemySignature', () => {
    const crypto = require('crypto');
    function sign(body, key) {
      return crypto.createHmac('sha256', key).update(body, 'utf8').digest('hex');
    }

    it('accepts a valid HMAC signature', () => {
      const body = '{"event":{}}';
      const sig = sign(body, process.env.ALCHEMY_SIGNING_KEY);
      expect(svc.verifyAlchemySignature(body, sig)).toBe(true);
    });

    it('rejects a mismatched signature', () => {
      const body = '{"event":{}}';
      const wrongSig = sign(body, 'a-completely-different-key');
      expect(svc.verifyAlchemySignature(body, wrongSig)).toBe(false);
    });

    it('rejects when the signature header is missing', () => {
      expect(svc.verifyAlchemySignature('{}', undefined)).toBe(false);
    });

    it('rejects a non-hex signature header without throwing', () => {
      expect(svc.verifyAlchemySignature('{}', 'not-valid-hex!!')).toBe(false);
    });

    it('rejects a well-formed-hex but wrong-length signature without throwing', () => {
      expect(svc.verifyAlchemySignature('{}', 'ab')).toBe(false);
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────
  describe('getStatus', () => {
    it('returns the row for an owned intent', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'p1', status: 'pending' }] });
      expect(await svc.getStatus('p1', 'u1')).toEqual({ id: 'p1', status: 'pending' });
    });

    it('returns null when nothing matches', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await svc.getStatus('p1', 'u1')).toBeNull();
    });
  });

  // ── expireStale ────────────────────────────────────────────────────────────
  describe('expireStale', () => {
    it('runs the expiry sweep', async () => {
      query.mockResolvedValueOnce({ rowCount: 3 });
      await svc.expireStale();
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  // ── handleAlchemyWebhook / _processActivity ────────────────────────────────
  describe('handleAlchemyWebhook', () => {
    const RECEIVER = process.env.CRYPTO_RECEIVING_ADDRESS;

    function activity({ hash = '0xhash1', asset = 'USDC', value = '10', to = RECEIVER, from = '0xsender' } = {}) {
      return { hash, asset, value, toAddress: to, fromAddress: from };
    }

    it('ignores activity with no hash', async () => {
      const result = await svc.handleAlchemyWebhook({ event: { activity: [{ asset: 'USDC', toAddress: RECEIVER }] } });
      expect(result).toEqual({ hadError: false });
      expect(query).not.toHaveBeenCalled();
    });

    it('ignores an asset outside ALLOWED_TOKENS', async () => {
      await svc.handleAlchemyWebhook({ event: { activity: [activity({ asset: 'DOGE' })] } });
      expect(query).not.toHaveBeenCalled();
    });

    it('ignores a transfer not addressed to our receiving address', async () => {
      await svc.handleAlchemyWebhook({ event: { activity: [activity({ to: '0xSomeoneElse' })] } });
      expect(query).not.toHaveBeenCalled();
    });

    it('logs and no-ops when no intent matches the transfer', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const result = await svc.handleAlchemyWebhook({ event: { activity: [activity()] } });
      expect(result).toEqual({ hadError: false });
    });

    it('delegates USDC surface-based intents to walletCheckoutService and does not touch legacy grant path', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'pay-1', surface: 'tip', plan_id: null, expected_amount_native: '10' }] });
      mockVerifyAndFulfillUsdc.mockResolvedValueOnce({ ok: true, intentId: 'wc-1' });

      const result = await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });

      expect(result).toEqual({ hadError: false });
      expect(mockVerifyAndFulfillUsdc).toHaveBeenCalledWith({ txHash: '0xhash1', fromAddress: '0xsender', amountReceived: 10 });
      expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
      // No amount-mismatch / confirm UPDATE ran on checkout_intents for the delegated path.
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('surfaces an error and hadError=true when the walletCheckout delegate fails', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'pay-1', surface: 'tip', plan_id: null, expected_amount_native: '10' }] });
      mockVerifyAndFulfillUsdc.mockResolvedValueOnce({ ok: false, reason: 'no_matching_charge' });

      const result = await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });
      expect(result).toEqual({ hadError: true });
    });

    it('rejects (marks failed) a legacy plan intent when the received amount is outside tolerance', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-2', surface: null, plan_id: 'plan-A', expected_amount_native: '10.00' }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE ... status = 'failed'

      await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '0.01' })] } });

      const failCall = query.mock.calls[1];
      expect(failCall[0]).toMatch(/status = 'failed'/);
      expect(failCall[1][1]).toBe('pay-2');
    });

    it('is idempotent — a second confirm on an already-confirmed intent no-ops (rowCount 0)', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-3', surface: null, plan_id: 'plan-A', expected_amount_native: '10.00' }] })
        .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE ... status = 'confirmed' raced by another delivery

      await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });

      expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('fulfills a channel_pass plan_id via channelPassService instead of the legacy grant path', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-4', surface: null, plan_id: 'channel_pass:creator-9', expected_amount_native: '10.00', user_id: 'u1', amount_usd: '10.00' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // confirm UPDATE
        .mockResolvedValueOnce({ rows: [] }); // grant_result UPDATE
      mockFulfillChannelPassFromPayment.mockResolvedValueOnce({ granted: true });

      await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });

      expect(mockFulfillChannelPassFromPayment).toHaveBeenCalledWith({
        userId: 'u1', creatorId: 'creator-9', priceUsd: 10, sourceProvider: 'wallet_usdc', sourceRef: 'pay-4',
      });
      expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
    });

    it('grants entitlements for a legacy plan intent on successful confirm', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-5', surface: null, plan_id: 'plan-B', expected_amount_native: '10.00', user_id: 'u1' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // confirm UPDATE
        .mockResolvedValueOnce({ rows: [] }); // grant_result UPDATE
      mockGrantEntitlementsForPlan.mockResolvedValueOnce({ errors: 0, granted: 1 });

      await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });

      expect(mockGrantEntitlementsForPlan).toHaveBeenCalledWith('u1', 'plan-B', 'crypto_base', expect.objectContaining({ txHash: '0xhash1' }), 'crypto_pay-5');
    });

    it('marks grant_failed (not confirmed) when the grant call reports errors', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-6', surface: null, plan_id: 'plan-B', expected_amount_native: '10.00', user_id: 'u1' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // confirm UPDATE
        .mockResolvedValueOnce({ rows: [] }); // grant_failed UPDATE
      mockGrantEntitlementsForPlan.mockResolvedValueOnce({ errors: 1, granted: 0 });

      await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });

      const grantFailedCall = query.mock.calls[2];
      expect(grantFailedCall[0]).toMatch(/status = 'grant_failed'/);
    });

    it('marks grant_failed and reports hadError when grantEntitlementsForPlan throws (money already on-chain, must not silently drop)', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'pay-7', surface: null, plan_id: 'plan-B', expected_amount_native: '10.00', user_id: 'u1' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // confirm UPDATE
        .mockResolvedValueOnce({ rows: [] }); // grant_failed UPDATE
      mockGrantEntitlementsForPlan.mockRejectedValueOnce(new Error('db exploded'));

      const result = await svc.handleAlchemyWebhook({ event: { activity: [activity({ value: '10' })] } });

      expect(result).toEqual({ hadError: true });
      const grantFailedCall = query.mock.calls[2];
      expect(grantFailedCall[0]).toMatch(/status = 'grant_failed'/);
    });
  });

  // ── reconcileGrantFailed ───────────────────────────────────────────────────
  describe('reconcileGrantFailed', () => {
    it('returns zeroes when nothing is stuck', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      expect(await svc.reconcileGrantFailed()).toEqual({ attempted: 0, recovered: 0 });
    });

    it('retries a surface-based intent via walletCheckoutService and counts it recovered on success', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'r1', user_id: 'u1', surface: 'tip', plan_id: null }] });
      mockFulfillGrantFailedSurface.mockResolvedValueOnce({ ok: true });

      const result = await svc.reconcileGrantFailed();
      expect(result).toEqual({ attempted: 1, recovered: 1, stillFailed: 0 });
      expect(mockBnsSend).not.toHaveBeenCalled();
    });

    it('retries a legacy plan intent via grantEntitlementsForPlan and flips it back to confirmed', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'r2', user_id: 'u1', plan_id: 'plan-A', surface: null, token: 'USDC', expected_amount_native: '10' }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE status = confirmed
      mockGrantEntitlementsForPlan.mockResolvedValueOnce({ errors: 0 });

      const result = await svc.reconcileGrantFailed();
      expect(result.recovered).toBe(1);
      const updateCall = query.mock.calls[1];
      expect(updateCall[0]).toMatch(/status = 'confirmed'/);
      expect(updateCall[0]).toMatch(/WHERE id = \$2 AND status = 'grant_failed'/);
    });

    it('collects still-failing rows and sends a business alert without throwing', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'r3', user_id: 'u1', plan_id: 'plan-A', surface: null, token: 'USDC', expected_amount_native: '10' }] });
      mockGrantEntitlementsForPlan.mockRejectedValueOnce(new Error('still broken'));

      const result = await svc.reconcileGrantFailed();
      expect(result).toEqual({ attempted: 1, recovered: 0, stillFailed: 1 });
      expect(mockBnsSend).toHaveBeenCalledTimes(1);
      expect(mockBnsSend.mock.calls[0][0]).toContain('r3');
    });

    it('never throws even if businessNotificationService.send itself fails', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'r4', user_id: 'u1', plan_id: 'plan-A', surface: null, token: 'USDC', expected_amount_native: '10' }] });
      mockGrantEntitlementsForPlan.mockRejectedValueOnce(new Error('still broken'));
      mockBnsSend.mockRejectedValueOnce(new Error('slack down'));

      await expect(svc.reconcileGrantFailed()).resolves.toEqual({ attempted: 1, recovered: 0, stillFailed: 1 });
    });
  });

  // ── alertStuck ─────────────────────────────────────────────────────────────
  describe('alertStuck', () => {
    it('runs all three lookups without throwing when nothing is stuck', async () => {
      query
        .mockResolvedValueOnce({ rows: [] }) // freshStuck
        .mockResolvedValueOnce({ rows: [] }) // freshGrantFailed
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // agedGrantFailed
      await expect(svc.alertStuck()).resolves.toBeUndefined();
    });

    it('does not throw when rows are found in all three buckets', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'stuck-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'gf-1' }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] });
      await expect(svc.alertStuck()).resolves.toBeUndefined();
    });
  });
});
