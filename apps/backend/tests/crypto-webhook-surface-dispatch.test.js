'use strict';

/**
 * Regression test for the 2026-09-04 incident where a $180 USDC call
 * booking landed on-chain but never fulfilled — cryptoPaymentService
 * always routed confirmed intents through grantEntitlementsForPlan,
 * which returns NO_PLAN_ADDONS for surface-based intents (call, rush,
 * tip, crystal_*, creator_sub, channel, hangout, donation), silently
 * dropping the fulfillment.
 *
 * Run with: cd apps/backend && npx jest tests/crypto-webhook-surface-dispatch.test.js
 */

process.env.SESSION_SECRET = 'test-session-secret-padding-padding-padding';
process.env.CRYPTO_RECEIVING_ADDRESS = '0xd74b4d6b535676dadbcbf4efd0572871de032cc8';
process.env.ALCHEMY_SIGNING_KEY = 'test-alchemy-key';

const mockQuery = jest.fn();
jest.mock('../config/postgres', () => ({
  query: (...args) => mockQuery(...args),
}));

jest.mock('../config/redis', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockVerifyAndFulfillUsdc = jest.fn();
jest.mock('../services/walletCheckoutService', () => ({
  verifyAndFulfillUsdc: (...args) => mockVerifyAndFulfillUsdc(...args),
}));

const mockGrantEntitlementsForPlan = jest.fn();
jest.mock('../services/paymentService', () => ({
  grantEntitlementsForPlan: (...args) => mockGrantEntitlementsForPlan(...args),
}));

const CryptoPaymentService = require('../services/cryptoPaymentService');

const TX_HASH = '0xa633b4518edd3c9ba675d4ec1eb7294f50e08864f0570296e45661739665f92d';
const FROM_ADDRESS = '0xabc0000000000000000000000000000000000001';
const RECEIVING_ADDRESS = '0xd74b4d6b535676dadbcbf4efd0572871de032cc8';

function usdcActivity(overrides = {}) {
  return {
    hash: TX_HASH,
    fromAddress: FROM_ADDRESS,
    toAddress: RECEIVING_ADDRESS,
    asset: 'USDC',
    value: 180,
    ...overrides,
  };
}

function callIntentRow(overrides = {}) {
  return {
    id: 288,
    user_id: '8261112227',
    plan_id: null,
    surface: 'call',
    entitlement_spec: { packageId: 17, creator_id: '8599671840' },
    expected_amount_native: '180.000000',
    amount_usd: '180.00',
    token: 'USDC',
    creator_id: null,
    scope_type: null,
    scope_id: null,
    ...overrides,
  };
}

function legacyPlanIntentRow(overrides = {}) {
  return {
    id: 99,
    user_id: 'user-abc',
    plan_id: 'prime_monthly',
    surface: null,
    entitlement_spec: {},
    expected_amount_native: '24.990000',
    amount_usd: '24.99',
    token: 'USDC',
    creator_id: null,
    scope_type: null,
    scope_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockVerifyAndFulfillUsdc.mockReset();
  mockGrantEntitlementsForPlan.mockReset();
});

describe('cryptoPaymentService._processActivity — surface dispatch', () => {
  test('surface=call intent delegates to walletCheckoutService, skips grantEntitlementsForPlan', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [callIntentRow()] });
    mockVerifyAndFulfillUsdc.mockResolvedValue({
      ok: true,
      intentId: 288,
      entitlementId: null,
      rushCredited: 0,
    });

    await CryptoPaymentService._processActivity(usdcActivity());

    expect(mockVerifyAndFulfillUsdc).toHaveBeenCalledTimes(1);
    expect(mockVerifyAndFulfillUsdc).toHaveBeenCalledWith({
      txHash: TX_HASH,
      fromAddress: FROM_ADDRESS.toLowerCase(),
      amountReceived: 180,
    });
    expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
  });

  test.each([
    ['rush',            { surface: 'rush',            plan_id: null }],
    ['tip',             { surface: 'tip',             plan_id: null }],
    ['crystal_self',    { surface: 'crystal_self',    plan_id: null }],
    ['crystal_service', { surface: 'crystal_service', plan_id: null }],
    ['creator_sub',     { surface: 'creator_sub',     plan_id: null }],
    ['channel',         { surface: 'channel',         plan_id: null }],
    ['hangout',         { surface: 'hangout',         plan_id: null }],
    ['donation',        { surface: 'donation',        plan_id: null }],
  ])('surface=%s intent also delegates to walletCheckoutService', async (_label, overrides) => {
    mockQuery.mockResolvedValueOnce({ rows: [callIntentRow(overrides)] });
    mockVerifyAndFulfillUsdc.mockResolvedValue({ ok: true, intentId: 288 });

    await CryptoPaymentService._processActivity(usdcActivity());

    expect(mockVerifyAndFulfillUsdc).toHaveBeenCalledTimes(1);
    expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
  });

  test('null plan_id + null surface still delegates (safety net)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [callIntentRow({ surface: null, plan_id: null })],
    });
    mockVerifyAndFulfillUsdc.mockResolvedValue({ ok: true, intentId: 288 });

    await CryptoPaymentService._processActivity(usdcActivity());

    expect(mockVerifyAndFulfillUsdc).toHaveBeenCalledTimes(1);
    expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
  });

  test('legacy plan intent (plan_id set, surface null) still uses grantEntitlementsForPlan', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [legacyPlanIntentRow()] })
      .mockResolvedValueOnce({ rowCount: 1 })   // confirmed flip
      .mockResolvedValueOnce({ rowCount: 1 });  // grant_result update
    mockGrantEntitlementsForPlan.mockResolvedValue({ granted: 1, errors: 0 });

    await CryptoPaymentService._processActivity(usdcActivity({ value: 24.99 }));

    expect(mockGrantEntitlementsForPlan).toHaveBeenCalledTimes(1);
    expect(mockGrantEntitlementsForPlan).toHaveBeenCalledWith(
      'user-abc',
      'prime_monthly',
      'crypto_base',
      expect.objectContaining({ provider: 'crypto_base', asset: 'USDC', txHash: TX_HASH }),
      'crypto_99'
    );
    expect(mockVerifyAndFulfillUsdc).not.toHaveBeenCalled();
  });

  test('delegate returning not-ok does not throw and does not fall through to legacy path', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [callIntentRow()] });
    mockVerifyAndFulfillUsdc.mockResolvedValue({ ok: false, reason: 'amount_mismatch' });

    await expect(CryptoPaymentService._processActivity(usdcActivity())).resolves.toBeUndefined();

    expect(mockVerifyAndFulfillUsdc).toHaveBeenCalledTimes(1);
    expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
  });

  test('wrong recipient address short-circuits before intent lookup', async () => {
    await CryptoPaymentService._processActivity(
      usdcActivity({ toAddress: '0x000000000000000000000000000000000000dead' })
    );
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockVerifyAndFulfillUsdc).not.toHaveBeenCalled();
    expect(mockGrantEntitlementsForPlan).not.toHaveBeenCalled();
  });
});
