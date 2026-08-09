'use strict';

/**
 * cashoutService.js
 * Creator cash-out off-ramp. Active lanes (migration 364):
 *   1. usdc_erc20 — USDC on Ethereum ERC-20; manual settlement from treasury
 *   2. eth        — Ethereum mainnet address; manual settlement from treasury
 *   3. bre_b      — bre_b fiat; manual operator settlement (Colombia)
 *   4. cashapp    — Cash App $cashtag; manual operator settlement
 *   5. wise       — Wise email; manual operator settlement
 *
 * Retired lanes (2026-08-08, migration 364): meru, btc, dash, usdt_tron, usdt_base
 *
 * All public methods throw structured errors with a `.code` property so
 * route handlers can map them to HTTP status codes without string matching.
 */

const { query, getClient } = require('../config/postgres');
const logger = require('../utils/logger');

// ── Config ───────────────────────────────────────────────────────────────────

// Operator-configurable cashout limits. Per-request blocks a single huge
// withdrawal (stolen-session abuse); per-day caps total daily outflow per
// creator. Both are enforced server-side regardless of client-supplied amount.
const MAX_CASHOUT_USD_PER_REQUEST = parseFloat(process.env.MAX_CASHOUT_USD_PER_REQUEST || '5000');
const MAX_CASHOUT_USD_PER_DAY = parseFloat(process.env.MAX_CASHOUT_USD_PER_DAY || '10000');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a structured error with a machine-readable code.
 * @param {string} code  — e.g. 'INSUFFICIENT_BALANCE', 'INVALID_LANE'
 * @param {string} msg   — human-readable message
 * @param {number} [status=400] — suggested HTTP status
 */
function err(code, msg, status = 400) {
  const e = new Error(msg);
  e.code = code;
  e.status = status;
  return e;
}

/**
 * Validate an EVM (Ethereum) wallet address — 0x followed by 40 hex chars.
 * Used for both 'eth' and 'usdc_erc20' lanes.
 */
function isValidEvmAddress(address) {
  return typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a creator's current earnings balance, split by hold status.
 *
 * @param {string} creatorId
 * @returns {Promise<{
 *   holding_usd: number,
 *   holding_count: number,
 *   available_usd: number,
 *   available_count: number,
 *   earliest_available_at: string|null
 * }>}
 */
async function getCreatorBalance(creatorId) {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount_creator) FILTER (WHERE status = 'holding'),  0)::float AS holding_usd,
       COUNT(*)                     FILTER (WHERE status = 'holding')              AS holding_count,
       COALESCE(SUM(amount_creator) FILTER (WHERE status = 'available'), 0)::float AS available_usd,
       COUNT(*)                     FILTER (WHERE status = 'available')             AS available_count,
       MIN(available_at)            FILTER (WHERE status = 'holding')               AS earliest_available_at
     FROM creator_earnings
     WHERE creator_id = $1
       AND status IN ('holding', 'available')`,
    [String(creatorId)]
  );
  const row = rows[0];
  return {
    holding_usd: parseFloat(row.holding_usd) || 0,
    holding_count: parseInt(row.holding_count, 10) || 0,
    available_usd: parseFloat(row.available_usd) || 0,
    available_count: parseInt(row.available_count, 10) || 0,
    earliest_available_at: row.earliest_available_at || null,
  };
}

/**
 * Request a cash-out.
 *
 * Validates available balance, locks the oldest available earnings rows totaling
 * amountUsd (SKIP LOCKED so concurrent requests don't race), inserts a
 * fiat_cashout_orders row, marks those earnings as 'in_payout', then dispatches
 * to the appropriate lane handler.
 *
 * @param {object} opts
 * @param {string} opts.creatorId
 * @param {number} opts.amountUsd     — must be > 0 and <= available_usd
 * @param {string} opts.lane          — 'meru' | 'btc' | 'dash' | 'usdt_tron' | 'usdt_base'
 * @param {object} opts.destination   — lane-specific payload; see validateLaneDestination
 * @returns {Promise<{ order: object, dispatch: object }>}
 */
async function requestCashout({ creatorId, amountUsd, lane, destination }) {
  // ── Validate inputs ───────────────────────────────────────────────────────
  if (!creatorId) throw err('MISSING_CREATOR_ID', 'creatorId is required');
  if (!amountUsd || typeof amountUsd !== 'number' || amountUsd <= 0) {
    throw err('INVALID_AMOUNT', 'amount_usd must be a positive number');
  }
  if (amountUsd > MAX_CASHOUT_USD_PER_REQUEST) {
    throw err(
      'AMOUNT_OVER_PER_REQUEST_CAP',
      `Single cashout request cannot exceed $${MAX_CASHOUT_USD_PER_REQUEST.toFixed(2)}.`
    );
  }
  const validLanes = ['usdc_erc20', 'eth', 'bre_b', 'cashapp', 'wise'];
  if (!validLanes.includes(lane)) {
    throw err('INVALID_LANE', `lane must be one of: ${validLanes.join(', ')}`);
  }
  if (!destination || typeof destination !== 'object') {
    throw err('MISSING_DESTINATION', 'destination object is required');
  }
  // Per-lane address shape + format validation runs server-side regardless of
  // what the client says is saved on their profile.
  validateLaneDestination(lane, destination);

  // Minimum cashout floor — raised from $5 to $50 on 2026-08-03 per operator direction.
  // Override via MIN_CASHOUT_USD_PER_REQUEST env var if a specific creator needs a lower floor.
  const MIN_CASHOUT_USD = parseFloat(process.env.MIN_CASHOUT_USD_PER_REQUEST || '50');
  if (amountUsd < MIN_CASHOUT_USD) {
    throw err('BELOW_MINIMUM', `Minimum cashout is $${MIN_CASHOUT_USD.toFixed(2)}.`, 400);
  }

  // Fix 8: Verify destination matches the stored value for that lane
  const destCheck = await query(
    `SELECT creator_payout_destinations FROM users WHERE id = $1`,
    [creatorId]
  );
  const stored = destCheck.rows[0]?.creator_payout_destinations || {};
  if (stored[lane]) {
    const storedVal = (lane === 'bre_b' || lane === 'cashapp')
      ? stored[lane]?.handle
      : lane === 'wise'
        ? stored[lane]?.email
        : stored[lane]?.address;
    const submittedVal = (lane === 'bre_b' || lane === 'cashapp')
      ? destination.handle
      : lane === 'wise'
        ? destination.email
        : destination.address;
    if (storedVal && storedVal !== submittedVal) {
      throw err('DESTINATION_MISMATCH', 'Destination does not match your saved payout address.', 400);
    }
  }

  // Block concurrent / overlapping cashout orders. The DB-level SKIP LOCKED on
  // earnings rows prevents double-spend at the row level, but a creator with
  // a large balance can still spin up multiple orders in sequence — bad for
  // every lane, since each one settles manually by an operator.
  const { rows: openOrders } = await query(
    `SELECT id FROM fiat_cashout_orders
       WHERE creator_id = $1
         AND status IN ('pending', 'processing')
       LIMIT 1`,
    [String(creatorId)]
  );
  if (openOrders.length > 0) {
    throw err(
      'OPEN_ORDER_EXISTS',
      'You already have a cashout order in flight. Wait for it to settle before requesting another.',
      409
    );
  }

  // Per-day cap (rolling 24h). Counts pending/processing/settled — anything
  // that already committed earnings to a payout.
  const { rows: dayRows } = await query(
    `SELECT COALESCE(SUM(amount_usd), 0)::numeric AS total
       FROM fiat_cashout_orders
       WHERE creator_id = $1
         AND status NOT IN ('failed', 'cancelled')
         AND requested_at >= NOW() - INTERVAL '24 hours'`,
    [String(creatorId)]
  );
  const dayTotal = parseFloat(dayRows[0]?.total || 0);
  if (dayTotal + amountUsd > MAX_CASHOUT_USD_PER_DAY) {
    throw err(
      'AMOUNT_OVER_DAY_CAP',
      `24h cashout cap is $${MAX_CASHOUT_USD_PER_DAY.toFixed(2)} — used $${dayTotal.toFixed(2)} so far.`
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // ── Lock oldest available earnings up to the requested amount ─────────
    // SKIP LOCKED ensures concurrent requests don't pick the same rows.
    // We fetch more than enough rows and stop once we've accumulated amountUsd.
    const { rows: candidates } = await client.query(
      `SELECT id, amount_creator
         FROM creator_earnings
        WHERE creator_id = $1
          AND status = 'available'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 500`,
      [String(creatorId)]
    );

    // Walk the candidates and pick the minimum set that covers amountUsd.
    let accumulated = 0;
    const selected = [];
    for (const row of candidates) {
      if (accumulated >= amountUsd) break;
      selected.push(row);
      accumulated = Math.round((accumulated + parseFloat(row.amount_creator)) * 100) / 100;
    }

    if (accumulated < amountUsd) {
      await client.query('ROLLBACK');
      throw err('INSUFFICIENT_BALANCE', `Available balance ($${accumulated.toFixed(2)}) is less than requested amount ($${amountUsd.toFixed(2)})`);
    }

    const earningIds = selected.map(r => r.id);

    // ── Insert the order ──────────────────────────────────────────────────
    const { rows: orderRows } = await client.query(
      `INSERT INTO fiat_cashout_orders
         (creator_id, amount_usd, lane, status, destination, earning_ids)
       VALUES ($1, $2, $3, 'pending', $4::jsonb, $5::uuid[])
       RETURNING *`,
      [String(creatorId), amountUsd, lane, JSON.stringify(destination), earningIds]
    );
    const order = orderRows[0];

    // ── Flip selected earnings to in_payout ───────────────────────────────
    await client.query(
      `UPDATE creator_earnings
          SET status = 'in_payout',
              updated_at = NOW()
        WHERE id = ANY($1::uuid[])`,
      [earningIds]
    );

    await client.query('COMMIT');

    logger.info('[cashoutService] cashout order created', {
      orderId: order.id, creatorId, amountUsd, lane, earningCount: earningIds.length,
    });

    // ── Dispatch to lane (outside the transaction — provider calls must not block DB) ──
    // All current lanes are manual-settled (operator dispatches from treasury
    // via BTCPay / Meru UI / wallet). Lane handlers are thin wrappers that log
    // the pending order and return ref + pending_manual=true so the order row
    // moves to 'processing'.
    let dispatchResult;
    try {
      dispatchResult = await dispatchManual(order, lane, destination);

      // Update order with provider_ref and set to processing
      await query(
        `UPDATE fiat_cashout_orders
            SET status = 'processing',
                provider_ref = $2,
                provider_meta = $3::jsonb,
                processed_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [order.id, dispatchResult.ref || null, JSON.stringify(dispatchResult)]
      );
      order.status = 'processing';
      order.provider_ref = dispatchResult.ref || null;
    } catch (dispatchErr) {
      // On dispatch failure, roll the order to 'failed' and restore earnings to 'available'.
      logger.error('[cashoutService] dispatch failed — rolling back order', {
        orderId: order.id, lane, error: dispatchErr.message,
      });
      await failCashoutOrder(order.id, dispatchErr.message);
      throw err('DISPATCH_FAILED', `Payment lane dispatch failed: ${dispatchErr.message}`, 502);
    }

    return { order, dispatch: dispatchResult };
  } catch (e) {
    // Only roll back if the transaction is still open (i.e. we didn't COMMIT yet).
    // If e is our structured error thrown after COMMIT (dispatch failure), the
    // failCashoutOrder call above already handled cleanup.
    if (e.code !== 'DISPATCH_FAILED') {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Validate the destination payload for a given lane. Throws on bad shape.
 * Lane-specific shapes:
 *   usdc_erc20 → { address: string }   (EVM 0x…)
 *   eth        → { address: string }   (EVM 0x…)
 *   bre_b      → { handle: string }    (Colombia bre_b handle)
 *   cashapp    → { handle: string }    ($cashtag or phone)
 *   wise       → { email: string }     (Wise registered email)
 */
function validateLaneDestination(lane, destination) {
  if (lane === 'usdc_erc20' || lane === 'eth') {
    if (!isValidEvmAddress(destination.address)) {
      throw err('INVALID_DESTINATION', `${lane === 'eth' ? 'ETH' : 'USDC-ERC20'} destination must be { address: 0x… } Ethereum mainnet address.`);
    }
    return;
  }
  if (lane === 'bre_b') {
    const h = String(destination.handle || '').trim();
    if (!h || h.length < 3 || h.length > 50) {
      throw err('INVALID_DESTINATION', 'bre_b destination must be { handle: string } — account handle or phone.');
    }
    return;
  }
  if (lane === 'cashapp') {
    const h = String(destination.handle || '').trim();
    if (!h || h.length < 2 || h.length > 50) {
      throw err('INVALID_DESTINATION', 'Cash App destination must be { handle: string } — $cashtag or phone.');
    }
    return;
  }
  if (lane === 'wise') {
    const e = String(destination.email || '').trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) {
      throw err('INVALID_DESTINATION', 'Wise destination must be { email: string } — Wise registered email.');
    }
    return;
  }
  throw err('INVALID_LANE', `Unknown lane: ${lane}`);
}

/**
 * Manual-settlement dispatcher used by all current lanes (meru/btc/dash/usdt_*).
 * Logs the pending order with enough detail for the operator to fulfil, then
 * marks the order pending_manual=true so the route handler can show "pending
 * manual settlement" in the response.
 */
async function dispatchManual(order, lane, destination) {
  logger.info('[cashoutService.manual] settlement pending', {
    orderId: order.id,
    creatorId: order.creator_id,
    amountUsd: order.amount_usd,
    lane,
    destination,
  });
  return {
    ref: `manual-${lane}-${order.id}`,
    pending_manual: true,
    lane,
    destination,
  };
}

// Legacy bitrefill / transak dispatchers were removed when the cashout lanes
// migrated to meru/btc/dash/usdt_tron/usdt_base (migration 284). The webhook
// handlers (bitrefillWebhook / transakWebhook in cashoutRoutes.js) remain in
// place to drain any in-flight orders that may still arrive from a provider
// after the cutover — they call settleCashoutOrder / failCashoutOrder directly
// and do not need a dispatcher.

/**
 * Mark a cashout order as settled and flip its earnings to paid_out.
 *
 * @param {string} orderId
 * @param {string} providerRef — provider's settlement reference
 */
async function settleCashoutOrder(orderId, providerRef) {
  if (!orderId) throw err('MISSING_ORDER_ID', 'orderId is required', 400);

  const { rows } = await query(
    `UPDATE fiat_cashout_orders
        SET status = 'settled',
            provider_ref = COALESCE($2, provider_ref),
            settled_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND status IN ('pending', 'processing')
      RETURNING earning_ids`,
    [orderId, providerRef || null]
  );

  if (rows.length === 0) {
    throw err('ORDER_NOT_FOUND', `Order ${orderId} not found or already in a terminal state`, 404);
  }

  const earningIds = rows[0].earning_ids;
  if (earningIds && earningIds.length > 0) {
    await query(
      `UPDATE creator_earnings
          SET status = 'paid_out',
              updated_at = NOW()
        WHERE id = ANY($1::uuid[])`,
      [earningIds]
    );
  }

  logger.info('[cashoutService] order settled', { orderId, providerRef, earningCount: earningIds?.length });
}

/**
 * Mark a cashout order as failed and restore its earnings to 'available'.
 *
 * @param {string} orderId
 * @param {string} reason — human-readable failure reason stored for diagnostics
 */
async function failCashoutOrder(orderId, reason) {
  if (!orderId) throw err('MISSING_ORDER_ID', 'orderId is required', 400);

  const { rows } = await query(
    `UPDATE fiat_cashout_orders
        SET status = 'failed',
            failure_reason = $2,
            updated_at = NOW()
      WHERE id = $1
        AND status NOT IN ('settled', 'failed', 'cancelled')
      RETURNING earning_ids`,
    [orderId, reason || 'unknown']
  );

  if (rows.length === 0) {
    // Already in terminal state — log and no-op.
    logger.warn('[cashoutService] failCashoutOrder: order not found or already terminal', { orderId });
    return;
  }

  const earningIds = rows[0].earning_ids;
  if (earningIds && earningIds.length > 0) {
    await query(
      `UPDATE creator_earnings
          SET status = 'available',
              updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status = 'in_payout'`,
      [earningIds]
    );
  }

  logger.info('[cashoutService] order failed — earnings restored', { orderId, reason, earningCount: earningIds?.length });
}

module.exports = {
  getCreatorBalance,
  requestCashout,
  settleCashoutOrder,
  failCashoutOrder,
  // Lane handlers exported for unit testing
  dispatchManual,
};
