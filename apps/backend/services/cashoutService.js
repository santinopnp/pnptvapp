'use strict';

/**
 * cashoutService.js
 * Creator cash-out off-ramp — SIMPLIFIED 2026-09-05.
 *
 * Single active lane: `privy_wallet` — USDC on Base, sent to the creator's
 * Privy embedded wallet address (stored on `users.preferred_wallet_address`
 * or `users.wallet_address`). From there creators bridge / swap / off-ramp
 * on their own; we no longer operate fiat rails.
 *
 * Retired 2026-08-08 (migration 364): meru, btc, dash, usdt_tron, usdt_base
 * Retired 2026-09-05: usdc_erc20, eth, bre_b, cashapp, wise
 *
 * Historic orders in fiat_cashout_orders under the retired lanes remain
 * queryable for auditing — new cashouts can only use `privy_wallet`.
 *
 * All public methods throw structured errors with a `.code` property so
 * route handlers can map them to HTTP status codes without string matching.
 */

const { query, getClient } = require('../config/postgres');
const logger = require('../utils/logger');
const { dispatchSplit } = require('./payoutSplitService');

// ── Config ───────────────────────────────────────────────────────────────────

// Operator-configurable cashout limits. Per-request blocks a single huge
// withdrawal (stolen-session abuse); per-day caps total daily outflow per
// creator. Both are enforced server-side regardless of client-supplied amount.
const MAX_CASHOUT_USD_PER_REQUEST = parseFloat(process.env.MAX_CASHOUT_USD_PER_REQUEST || '5000');
const MAX_CASHOUT_USD_PER_DAY = parseFloat(process.env.MAX_CASHOUT_USD_PER_DAY || '10000');

// Auto-payout sweep (runAutoPayoutSweep, below): the floor below which a
// creator's matured balance is left in 'available' rather than spending a gas
// leg to move a few cents. Unlike MIN_CASHOUT_USD_PER_REQUEST ($50, a
// creator-facing UX floor for the manual "cash out" button) this only exists
// to avoid dust transfers — small balances simply roll into the next sweep.
const AUTO_PAYOUT_MIN_USD = parseFloat(process.env.AUTO_PAYOUT_MIN_USD || '1');

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
 * Dispatch an already-reserved (status='in_payout') order's earnings on-chain
 * and finalize the order + earnings rows on success, or roll both back to
 * 'available'/'failed' on failure. Shared by requestCashout (creator-clicked)
 * and runAutoPayoutSweep (auto-payout) so both paths finalize identically.
 *
 * @param {object} order — a fiat_cashout_orders row (id, amount_usd, lane)
 * @param {string[]} earningIds
 * @param {string} walletAddress
 * @param {string} creatorId
 * @returns {Promise<object>} dispatchResult from payoutSplitService.dispatchSplit
 */
async function _dispatchAndFinalize(order, earningIds, walletAddress, creatorId) {
  try {
    const dispatchResult = await dispatchSplit({
      orderId: order.id,
      creatorId,
      amountUsd: parseFloat(order.amount_usd),
      creatorAddress: walletAddress,
    });

    const meta = JSON.stringify({ split: dispatchResult, lane: order.lane });
    await query(
      `UPDATE fiat_cashout_orders
          SET status = 'settled',
              provider_ref = $2,
              provider_meta = $3::jsonb,
              processed_at = NOW(),
              settled_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [order.id, dispatchResult.txCreator, meta]
    );
    await query(
      `UPDATE creator_earnings
          SET status = 'paid_out', updated_at = NOW()
        WHERE id = ANY($1::uuid[])`,
      [earningIds]
    );
    return dispatchResult;
  } catch (dispatchErr) {
    logger.error('[cashoutService] dispatch failed — rolling back order', {
      orderId: order.id, lane: order.lane, error: dispatchErr.message,
    });
    await failCashoutOrder(order.id, dispatchErr.message);
    throw err('DISPATCH_FAILED', `Payment dispatch failed: ${dispatchErr.message}`, 502);
  }
}

/**
 * Request a cash-out.
 *
 * Validates available balance, locks the oldest available earnings rows totaling
 * at least amountUsd (SKIP LOCKED so concurrent requests don't race — this can
 * overshoot amountUsd since earnings rows are indivisible), inserts a
 * fiat_cashout_orders row for the actual (possibly-larger) locked total, marks
 * those earnings as 'in_payout', then dispatches that same total on-chain.
 *
 * @param {object} opts
 * @param {string} opts.creatorId
 * @param {number} opts.amountUsd     — minimum requested amount; must be > 0 and <= available_usd. The
 *                                       actual amount paid (order.amount_usd) may be slightly higher.
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
  const validLanes = ['privy_wallet'];
  if (!validLanes.includes(lane)) {
    throw err('INVALID_LANE', `lane must be one of: ${validLanes.join(', ')}`);
  }

  // For the privy_wallet lane the client does NOT supply the destination — we
  // always send to the creator's own Privy embedded wallet (address stored on
  // their profile). This eliminates the "did you paste the right address?"
  // failure mode entirely.
  const walletRow = await query(
    `SELECT COALESCE(NULLIF(preferred_wallet_address, ''), NULLIF(wallet_address, '')) AS addr
       FROM users WHERE id = $1 LIMIT 1`,
    [String(creatorId)]
  );
  const walletAddress = walletRow.rows[0]?.addr || null;
  if (!walletAddress || !isValidEvmAddress(walletAddress)) {
    throw err(
      'NO_WALLET_CONFIGURED',
      'Connect a wallet first — log in with Privy and finish the wallet setup, then try again.',
      400
    );
  }
  destination = { address: walletAddress, chain: 'base', token: 'USDC' };

  // Minimum cashout floor: $50. Override via MIN_CASHOUT_USD_PER_REQUEST env var if a specific need arises.
  const MIN_CASHOUT_USD = parseFloat(process.env.MIN_CASHOUT_USD_PER_REQUEST || '50');
  if (amountUsd < MIN_CASHOUT_USD) {
    throw err('BELOW_MINIMUM', `Minimum cashout is $${MIN_CASHOUT_USD.toFixed(2)}.`, 400);
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
    // Earnings rows are indivisible, so this can overshoot the requested
    // amount (e.g. two $60 rows to cover a $100 request => $120 selected).
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

    // Re-check both caps against `accumulated` (what will actually be locked
    // and paid), not the originally-requested `amountUsd`. The pre-checks
    // above only validated the request; an overshoot from indivisible
    // earnings rows could otherwise commit and pay out above either cap.
    if (accumulated > MAX_CASHOUT_USD_PER_REQUEST) {
      await client.query('ROLLBACK');
      throw err(
        'AMOUNT_OVER_PER_REQUEST_CAP',
        `Your oldest available earnings can't be split — locking enough rows to cover $${amountUsd.toFixed(2)} would pay out $${accumulated.toFixed(2)}, over the $${MAX_CASHOUT_USD_PER_REQUEST.toFixed(2)} single-request cap. Try a smaller amount.`
      );
    }
    if (dayTotal + accumulated > MAX_CASHOUT_USD_PER_DAY) {
      await client.query('ROLLBACK');
      throw err(
        'AMOUNT_OVER_DAY_CAP',
        `Locking enough earnings to cover $${amountUsd.toFixed(2)} would pay out $${accumulated.toFixed(2)}, pushing your 24h total to $${(dayTotal + accumulated).toFixed(2)} — over the $${MAX_CASHOUT_USD_PER_DAY.toFixed(2)} cap. Try a smaller amount.`
      );
    }

    const earningIds = selected.map(r => r.id);

    // The order (and the on-chain dispatch below) must reflect `accumulated`
    // — the actual sum of the selected, now-locked earnings rows — not the
    // originally-requested `amountUsd`. Dispatching only `amountUsd` while
    // marking the full `accumulated` total as paid_out silently lost the
    // overshoot (the difference) with no record of where it went.
    const { rows: orderRows } = await client.query(
      `INSERT INTO fiat_cashout_orders
         (creator_id, amount_usd, lane, status, destination, earning_ids)
       VALUES ($1, $2, $3, 'pending', $4::jsonb, $5::uuid[])
       RETURNING *`,
      [String(creatorId), accumulated, lane, JSON.stringify(destination), earningIds]
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
      orderId: order.id, creatorId, amountUsd, accumulated, lane, earningCount: earningIds.length,
    });

    // ── Dispatch — 100% of the net cashout amount, on-chain, to the creator ──
    // (payoutSplitService.dispatchSplit — fixed 2026-09-29, see its docstring:
    // amountUsd here is already the creator's net share, not a gross figure)
    // order.amount_usd = accumulated (set in the INSERT above), so
    // _dispatchAndFinalize dispatches the correct locked amount, not the
    // originally-requested amountUsd.
    const dispatchResult = await _dispatchAndFinalize(order, earningIds, destination.address, creatorId);
    order.status = 'settled';
    order.provider_ref = dispatchResult.txCreator;

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
 * Auto-payout sweep — pays matured (status='available') earnings straight to
 * the creator's Privy wallet without waiting for them to click "cash out".
 * Run hourly from services/workers/index.js's 'earnings-maturation' job, right
 * after that job flips holding -> available on EARNINGS_HOLD_HOURS (6h)
 * maturity, so a creator's balance reaches their wallet within ~1h of
 * maturing (i.e. within ~7h of being earned).
 *
 * Idempotent and safe to run concurrently with a manual cashout or with
 * itself: it uses the exact same reservation pattern as requestCashout
 * (OPEN_ORDER_EXISTS guard + FOR UPDATE SKIP LOCKED + status='available' ->
 * 'in_payout' inside one transaction), so a creator can never be double-paid
 * or have a manual cashout race an auto sweep for the same earnings rows.
 * Creators without a valid wallet address are left untouched — their balance
 * simply stays 'available' for a future sweep (once they finish Privy wallet
 * setup) or a manual cashout once one exists.
 *
 * @returns {Promise<{ success: boolean, candidates: number, paid: number, skipped: number, failed: number }>}
 */
async function runAutoPayoutSweep() {
  const { rows: candidates } = await query(
    `SELECT ce.creator_id,
            COALESCE(NULLIF(u.preferred_wallet_address, ''), NULLIF(u.wallet_address, '')) AS wallet_address
       FROM creator_earnings ce
       JOIN users u ON u.id = ce.creator_id
      WHERE ce.status = 'available'
      GROUP BY ce.creator_id, u.preferred_wallet_address, u.wallet_address
     HAVING COALESCE(SUM(ce.amount_creator), 0) >= $1`,
    [AUTO_PAYOUT_MIN_USD]
  );

  let paid = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const { creator_id: creatorId, wallet_address: walletAddress } = candidate;

    if (!isValidEvmAddress(walletAddress)) {
      skipped++;
      continue;
    }

    const { rows: openOrders } = await query(
      `SELECT id FROM fiat_cashout_orders
         WHERE creator_id = $1
           AND status IN ('pending', 'processing')
         LIMIT 1`,
      [creatorId]
    );
    if (openOrders.length > 0) {
      // A manual cashout (or a previous sweep tick) is already in flight for
      // this creator — never race it.
      skipped++;
      continue;
    }

    const client = await getClient();
    let order = null;
    try {
      await client.query('BEGIN');

      const { rows: earnRows } = await client.query(
        `SELECT id, amount_creator
           FROM creator_earnings
          WHERE creator_id = $1
            AND status = 'available'
          FOR UPDATE SKIP LOCKED`,
        [creatorId]
      );
      const amountUsd = Math.round(
        earnRows.reduce((sum, row) => sum + parseFloat(row.amount_creator), 0) * 100
      ) / 100;

      if (amountUsd < AUTO_PAYOUT_MIN_USD) {
        // Rows were claimed by a concurrent transaction between the
        // aggregate query above and this lock — nothing left to pay here.
        await client.query('ROLLBACK');
        skipped++;
        continue;
      }

      const earningIds = earnRows.map((row) => row.id);
      const destination = { address: walletAddress, chain: 'base', token: 'USDC' };

      const { rows: orderRows } = await client.query(
        `INSERT INTO fiat_cashout_orders
           (creator_id, amount_usd, lane, status, destination, earning_ids, is_automatic)
         VALUES ($1, $2, 'privy_wallet', 'pending', $3::jsonb, $4::uuid[], true)
         RETURNING *`,
        [creatorId, amountUsd, JSON.stringify(destination), earningIds]
      );
      order = orderRows[0];

      await client.query(
        `UPDATE creator_earnings
            SET status = 'in_payout', updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [earningIds]
      );
      await client.query('COMMIT');

      logger.info('[cashoutService] auto payout order reserved', {
        orderId: order.id, creatorId, amountUsd, earningCount: earningIds.length,
      });

      await _dispatchAndFinalize(order, earningIds, walletAddress, creatorId);
      logger.info('[cashoutService] auto payout settled', { orderId: order.id, creatorId, amountUsd });
      paid++;
    } catch (e) {
      if (!order) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      }
      // _dispatchAndFinalize already moved a reserved order to 'failed' and
      // its earnings back to 'available' on dispatch failure — nothing more
      // to unwind here for that case.
      failed++;
      logger.error('[cashoutService] auto payout sweep entry failed', { creatorId, error: e.message });
    } finally {
      client.release();
    }
  }

  logger.info('[cashoutService] auto payout sweep complete', {
    candidates: candidates.length, paid, skipped, failed,
  });
  return { success: true, candidates: candidates.length, paid, skipped, failed };
}

/**
 * Validate the destination payload for a given lane. Throws on bad shape.
 * Lane-specific shapes:
 *   privy_wallet → { address, chain: 'base', token: 'USDC' }
 *   The address is not client-supplied — it's read from the creator's
 *   `users.preferred_wallet_address` (or fallback `users.wallet_address`).
 *   USDC on Base is the delivery rail; from there the creator bridges /
 *   swaps / off-ramps as they choose.
 */
function validateLaneDestination(lane, destination) {
  if (lane === 'privy_wallet') {
    if (!isValidEvmAddress(destination?.address)) {
      throw err('INVALID_DESTINATION', 'Privy wallet destination must be a valid EVM address (0x…).');
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
  runAutoPayoutSweep,
  settleCashoutOrder,
  failCashoutOrder,
  // Lane handlers exported for unit testing
  dispatchManual,
};
