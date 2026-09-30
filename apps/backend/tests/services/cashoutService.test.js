'use strict';

jest.mock('../../config/postgres', () => ({ query: jest.fn(), getClient: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/payoutSplitService', () => ({ dispatchSplit: jest.fn() }));

const { query, getClient } = require('../../config/postgres');
const { dispatchSplit } = require('../../services/payoutSplitService');
const svc = require('../../services/cashoutService');

const ADDR = '0x1234567890123456789012345678901234567890';

// A fake transactional client — distinct from the module-level `query` mock,
// mirroring the real getClient()/BEGIN/COMMIT/ROLLBACK/release flow.
function makeClient() {
  return { query: jest.fn(), release: jest.fn() };
}

describe('cashoutService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MAX_CASHOUT_USD_PER_REQUEST;
    delete process.env.MAX_CASHOUT_USD_PER_DAY;
    delete process.env.MIN_CASHOUT_USD_PER_REQUEST;
  });

  // ── getCreatorBalance ──────────────────────────────────────────────────────
  describe('getCreatorBalance', () => {
    it('parses aggregated row into numeric balance fields', async () => {
      query.mockResolvedValueOnce({
        rows: [{
          holding_usd: '120.50', holding_count: '2',
          available_usd: '80.00', available_count: '1',
          earliest_available_at: '2026-09-01T00:00:00Z',
        }],
      });
      const result = await svc.getCreatorBalance('creator-1');
      expect(result).toEqual({
        holding_usd: 120.5, holding_count: 2,
        available_usd: 80, available_count: 1,
        earliest_available_at: '2026-09-01T00:00:00Z',
      });
    });

    it('defaults to zeros / null when nothing is holding or available', async () => {
      query.mockResolvedValueOnce({
        rows: [{ holding_usd: null, holding_count: null, available_usd: null, available_count: null, earliest_available_at: null }],
      });
      const result = await svc.getCreatorBalance('creator-2');
      expect(result).toEqual({
        holding_usd: 0, holding_count: 0, available_usd: 0, available_count: 0, earliest_available_at: null,
      });
    });
  });

  // ── requestCashout — pre-transaction validation ───────────────────────────
  describe('requestCashout — input validation', () => {
    it('requires creatorId', async () => {
      await expect(svc.requestCashout({ amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'MISSING_CREATOR_ID' });
    });

    it('rejects non-positive / non-numeric amountUsd', async () => {
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 0, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: '100', lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: -5, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    });

    it('rejects amountUsd over the per-request cap before touching the DB', async () => {
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 5001, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'AMOUNT_OVER_PER_REQUEST_CAP' });
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects an unsupported lane', async () => {
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'btc' }))
        .rejects.toMatchObject({ code: 'INVALID_LANE' });
      expect(query).not.toHaveBeenCalled();
    });

    it('throws NO_WALLET_CONFIGURED when the creator has no valid wallet address', async () => {
      query.mockResolvedValueOnce({ rows: [{ addr: null }] });
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'NO_WALLET_CONFIGURED' });
    });

    it('throws NO_WALLET_CONFIGURED for a malformed stored address', async () => {
      query.mockResolvedValueOnce({ rows: [{ addr: 'not-an-address' }] });
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'NO_WALLET_CONFIGURED' });
    });

    it('rejects amounts below the minimum cashout floor', async () => {
      query.mockResolvedValueOnce({ rows: [{ addr: ADDR }] });
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 10, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'BELOW_MINIMUM' });
    });

    it('blocks a request when an open order already exists', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ addr: ADDR }] }) // wallet lookup
        .mockResolvedValueOnce({ rows: [{ id: 'existing-order' }] }); // open order check
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'OPEN_ORDER_EXISTS' });
      expect(getClient).not.toHaveBeenCalled();
    });

    it('blocks a request that would push the rolling 24h total over the day cap', async () => {
      // Env-based caps are read once at module require time, so tests use the
      // default caps (MAX_CASHOUT_USD_PER_DAY=10000) rather than overriding
      // process.env after the module is already loaded.
      query
        .mockResolvedValueOnce({ rows: [{ addr: ADDR }] }) // wallet lookup
        .mockResolvedValueOnce({ rows: [] }) // no open order
        .mockResolvedValueOnce({ rows: [{ total: '9950' }] }); // day total so far
      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'AMOUNT_OVER_DAY_CAP' });
      expect(getClient).not.toHaveBeenCalled();
    });
  });

  // ── requestCashout — transactional locking + overshoot ────────────────────
  describe('requestCashout — earnings locking and overshoot', () => {
    function mockPreTxQueries({ dayTotal = '0' } = {}) {
      query
        .mockResolvedValueOnce({ rows: [{ addr: ADDR }] }) // wallet lookup
        .mockResolvedValueOnce({ rows: [] }) // no open order
        .mockResolvedValueOnce({ rows: [{ total: dayTotal }] }); // day total
    }

    it('throws INSUFFICIENT_BALANCE and rolls back when locked rows can never cover the request', async () => {
      mockPreTxQueries();
      const client = makeClient();
      getClient.mockResolvedValueOnce(client);
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('BEGIN')) return {};
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return { rows: [{ id: 'e1', amount_creator: '30' }] };
        }
        if (sql.includes('ROLLBACK')) return {};
        return { rows: [] };
      });

      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
      expect(dispatchSplit).not.toHaveBeenCalled();
    });

    it('overshoots to cover an indivisible earnings row, and dispatches/records the overshot `accumulated` total (not the requested amountUsd)', async () => {
      mockPreTxQueries();
      const client = makeClient();
      getClient.mockResolvedValueOnce(client);
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('BEGIN')) return {};
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          // Two $60 rows to cover a $100 request => $120 accumulated (overshoot).
          return { rows: [{ id: 'e1', amount_creator: '60' }, { id: 'e2', amount_creator: '60' }] };
        }
        if (sql.includes('INSERT INTO fiat_cashout_orders')) {
          return { rows: [{ id: 'order-1', amount_usd: 120 }] };
        }
        return { rows: [] }; // UPDATE creator_earnings, COMMIT
      });
      dispatchSplit.mockResolvedValueOnce({ txCreator: '0xhash1', amtCreator: 120 });

      const result = await svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' });

      // The order insert used the accumulated (overshot) total, not amountUsd.
      const insertCall = client.query.mock.calls.find((c) => c[0].includes('INSERT INTO fiat_cashout_orders'));
      expect(insertCall[1]).toEqual(['c1', 120, 'privy_wallet', JSON.stringify({ address: ADDR, chain: 'base', token: 'USDC' }), ['e1', 'e2']]);

      // Dispatch was called with `accumulated` (120), not the original amountUsd (100).
      expect(dispatchSplit).toHaveBeenCalledWith({
        orderId: 'order-1', creatorId: 'c1', amountUsd: 120, creatorAddress: ADDR,
      });

      expect(result.order.status).toBe('settled');
      expect(result.order.provider_ref).toBe('0xhash1');
      expect(client.release).toHaveBeenCalled();
    });

    it('rejects when the overshoot itself would breach the per-request cap, even though the original amountUsd did not', async () => {
      // Default MAX_CASHOUT_USD_PER_REQUEST=5000: request $4990 (under cap),
      // but the only available row is $5010 (over cap once locked).
      mockPreTxQueries();
      const client = makeClient();
      getClient.mockResolvedValueOnce(client);
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('BEGIN')) return {};
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return { rows: [{ id: 'e1', amount_creator: '5010' }] };
        }
        if (sql.includes('ROLLBACK')) return {};
        return { rows: [] };
      });

      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 4990, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'AMOUNT_OVER_PER_REQUEST_CAP' });
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(dispatchSplit).not.toHaveBeenCalled();
    });

    it('rejects when the overshoot itself would breach the day cap, even though the original amountUsd did not', async () => {
      // Default MAX_CASHOUT_USD_PER_DAY=10000: dayTotal=9900 + requested $90
      // = 9990 (under cap pre-check), but the only available row is $150,
      // pushing the day total to 10050 (over cap once locked).
      mockPreTxQueries({ dayTotal: '9900' });
      const client = makeClient();
      getClient.mockResolvedValueOnce(client);
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('BEGIN')) return {};
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return { rows: [{ id: 'e1', amount_creator: '150' }] };
        }
        if (sql.includes('ROLLBACK')) return {};
        return { rows: [] };
      });

      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 90, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'AMOUNT_OVER_DAY_CAP' });
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(dispatchSplit).not.toHaveBeenCalled();
    });
  });

  // ── requestCashout — dispatch failure rollback ────────────────────────────
  describe('requestCashout — dispatch failure', () => {
    it('marks the order failed and restores earnings to available when dispatchSplit throws, without a second ROLLBACK on the released client', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ addr: ADDR }] }) // wallet lookup
        .mockResolvedValueOnce({ rows: [] }) // no open order
        .mockResolvedValueOnce({ rows: [{ total: '0' }] }); // day total

      const client = makeClient();
      getClient.mockResolvedValueOnce(client);
      client.query.mockImplementation(async (sql) => {
        if (sql.includes('BEGIN')) return {};
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return { rows: [{ id: 'e1', amount_creator: '100' }] };
        }
        if (sql.includes('INSERT INTO fiat_cashout_orders')) {
          return { rows: [{ id: 'order-fail', amount_usd: 100 }] };
        }
        return { rows: [] }; // UPDATE creator_earnings, COMMIT
      });
      dispatchSplit.mockRejectedValueOnce(new Error('rpc down'));

      // failCashoutOrder runs on the module-level `query`, post-COMMIT.
      query.mockImplementation(async (sql) => {
        if (sql.includes('FROM users WHERE id')) return { rows: [{ addr: ADDR }] };
        if (sql.includes("status IN ('pending', 'processing')") && sql.includes('SELECT id FROM fiat_cashout_orders')) return { rows: [] };
        if (sql.includes('COALESCE(SUM(amount_usd)')) return { rows: [{ total: '0' }] };
        if (sql.includes('UPDATE fiat_cashout_orders') && sql.includes("status = 'failed'")) {
          return { rows: [{ earning_ids: ['e1'] }] };
        }
        if (sql.includes('UPDATE creator_earnings') && sql.includes("status = 'available'")) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(svc.requestCashout({ creatorId: 'c1', amountUsd: 100, lane: 'privy_wallet' }))
        .rejects.toMatchObject({ code: 'DISPATCH_FAILED', status: 502 });

      // COMMIT happened before dispatch — ROLLBACK must NOT be called on the
      // transactional client for a post-commit dispatch failure.
      const rollbackCalls = client.query.mock.calls.filter((c) => c[0] === 'ROLLBACK');
      expect(rollbackCalls).toHaveLength(0);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();

      // failCashoutOrder restored the earnings via the module-level query.
      const restoreCall = query.mock.calls.find((c) => c[0].includes('UPDATE creator_earnings') && c[0].includes("status = 'available'"));
      expect(restoreCall).toBeDefined();
      expect(restoreCall[1]).toEqual([['e1']]);
    });
  });

  // ── settleCashoutOrder ─────────────────────────────────────────────────────
  describe('settleCashoutOrder', () => {
    it('requires orderId', async () => {
      await expect(svc.settleCashoutOrder()).rejects.toMatchObject({ code: 'MISSING_ORDER_ID' });
    });

    it('throws ORDER_NOT_FOUND when no matching non-terminal order exists', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(svc.settleCashoutOrder('order-x', 'ref-1'))
        .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
    });

    it('flips earnings to paid_out for the settled order', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ earning_ids: ['e1', 'e2'] }] }) // UPDATE order
        .mockResolvedValueOnce({ rows: [] }); // UPDATE earnings

      await svc.settleCashoutOrder('order-1', 'ref-1');

      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).toMatch(/status = 'paid_out'/);
      expect(query.mock.calls[1][1]).toEqual([['e1', 'e2']]);
    });

    it('skips the earnings update when earning_ids is empty', async () => {
      query.mockResolvedValueOnce({ rows: [{ earning_ids: [] }] });
      await svc.settleCashoutOrder('order-2', 'ref-2');
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  // ── failCashoutOrder ───────────────────────────────────────────────────────
  describe('failCashoutOrder', () => {
    it('requires orderId', async () => {
      await expect(svc.failCashoutOrder()).rejects.toMatchObject({ code: 'MISSING_ORDER_ID' });
    });

    it('no-ops when the order is already in a terminal state', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await svc.failCashoutOrder('order-terminal', 'some reason');
      expect(query).toHaveBeenCalledTimes(1); // no earnings-restore query fired
    });

    it('restores earnings to available for a non-terminal order', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ earning_ids: ['e1'] }] }) // UPDATE order -> failed
        .mockResolvedValueOnce({ rows: [] }); // UPDATE earnings -> available

      await svc.failCashoutOrder('order-3', 'rpc timeout');

      expect(query.mock.calls[1][0]).toMatch(/status = 'available'/);
      expect(query.mock.calls[1][0]).toMatch(/status = 'in_payout'/); // guarded to in_payout rows only
      expect(query.mock.calls[1][1]).toEqual([['e1']]);
    });
  });

  // ── dispatchManual ─────────────────────────────────────────────────────────
  describe('dispatchManual', () => {
    it('returns a pending-manual descriptor without touching the DB', async () => {
      const order = { id: 'order-9', creator_id: 'c1', amount_usd: 50 };
      const result = await svc.dispatchManual(order, 'btc', { address: 'bc1...' });
      expect(result).toEqual({
        ref: 'manual-btc-order-9', pending_manual: true, lane: 'btc', destination: { address: 'bc1...' },
      });
      expect(query).not.toHaveBeenCalled();
    });
  });
});
