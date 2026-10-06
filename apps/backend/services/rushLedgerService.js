'use strict';

/**
 * rushLedgerService.js
 *
 * DISCONNECTED 2026-09-29 — do not re-wire accumulateForCreator without
 * reconciling against creator_earnings first (see below). No code currently
 * calls into this file.
 *
 * Accumulates the USD value of Ru$h (internal credit) spend per creator and
 * settles it as on-chain USDC (via payoutSplitService.dispatchRushSplit)
 * once the creator's pending balance crosses RUSH_MIN_SETTLE_USD (default
 * $100).
 *
 * Why it got disconnected:
 *   walletCheckoutService._fulfill used to call accumulateForCreator for
 *   every Ru$h-funded (provider='wallet_rush') spend on a creator-scoped
 *   surface. But _fulfillTip, _fulfillEntitlement's creator_sub branch,
 *   channelPassService, and privateCallBookingService ALL already credit
 *   creator_earnings for that same spend, regardless of `provider` — that
 *   ledger is the single correct, already-cashoutable record whether the
 *   fan paid in USDC or Ru$h. Settling this ledger too paid the creator a
 *   second time for the same revenue the moment rush_creator_ledger crossed
 *   the threshold. rush_creator_ledger was empty in production when this
 *   was caught, so no real money was double-paid — but the trigger was live.
 *
 * Why not dispatch instantly on every Ru$h tip? (kept for future reference)
 *   A $0.83 tip triggering three 6-cent gas legs (creator + treasury +
 *   reinvest) is antieconomical. Batching per creator until $100 keeps the
 *   gas overhead under ~0.2%.
 *
 * To reintroduce this safely: either (a) have the creator_earnings insert
 * for Ru$h-funded surfaces mark those rows as non-cashoutable from the
 * start (e.g. a distinct status this settlement path alone can clear), or
 * (b) make Ru$h-funded surfaces skip the creator_earnings insert entirely
 * and rely solely on this ledger. Don't reconnect the old way — a second,
 * uncoordinated payout rail for revenue creator_earnings already owns.
 *
 * Rate:
 *   1 USD = 6 Ru$h base (see feedback_token_rate memory). Package bonuses
 *   are irrelevant here — we care about the USD value at spend time, and the
 *   creator's take was already priced in USD when the tip/call/channel pass
 *   was quoted. Callers pass amountUsd directly, so this service never has
 *   to convert.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const RUSH_MIN_SETTLE_USD = parseFloat(process.env.RUSH_MIN_SETTLE_USD || '100');

/**
 * Add creator earnings from a Ru$h-denominated spend event and, if the
 * accumulator now exceeds RUSH_MIN_SETTLE_USD, kick off the on-chain
 * settlement.
 *
 * Idempotency: caller is responsible for only calling this once per spend
 * event (typically inside the fulfill transaction) — this function has no
 * built-in dedup because the source table already enforces it (token_ledger
 * unique constraints, checkout_intents.status='confirmed', etc.).
 *
 * @param {object} opts
 * @param {string} opts.creatorId
 * @param {number} opts.amountUsd — creator's SHARE in USD (already net of
 *                                   platform cut — 70% of the paid amount).
 * @param {object} [opts.settleContext] — passed to dispatchRushSplit for logging
 * @returns {Promise<{ pendingUsd: number, settled: boolean, settleResult?: object }>}
 */
async function accumulateForCreator({ creatorId, amountUsd, settleContext = {} }) {
  if (!creatorId) throw new Error('rushLedger: creatorId required');
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { pendingUsd: 0, settled: false };
  }

  const { rows } = await query(
    `INSERT INTO rush_creator_ledger (creator_id, pending_usd, last_credit_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (creator_id) DO UPDATE
        SET pending_usd    = rush_creator_ledger.pending_usd + EXCLUDED.pending_usd,
            last_credit_at = NOW(),
            updated_at     = NOW()
     RETURNING pending_usd`,
    [String(creatorId), amountUsd],
  );
  const pendingUsd = Number(rows[0].pending_usd);
  logger.info('[rushLedger] accrued', { creatorId, amountUsd, pendingUsd });

  if (pendingUsd < RUSH_MIN_SETTLE_USD) {
    return { pendingUsd, settled: false };
  }

  // Threshold hit — try to settle. If the creator doesn't have a wallet yet,
  // leave the accumulator alone (a later _link event will re-check).
  const settleResult = await settleIfEligible(creatorId, settleContext).catch((err) => {
    logger.warn('[rushLedger] settle failed after crossing threshold', {
      creatorId, pendingUsd, err: err.message,
    });
    return { settled: false, reason: err.message };
  });
  return { pendingUsd, ...settleResult };
}

/**
 * Try to settle a creator's pending Ru$h earnings on-chain. No-op if:
 *  - creator has no wallet_address yet,
 *  - pending_usd < RUSH_MIN_SETTLE_USD,
 *  - or the creator is soft-deleted / banned.
 *
 * The `pending_usd` reset is inside the same UPDATE that captured the
 * settled amount, so a concurrent accumulate call can add fresh spend
 * without racing.
 *
 * @param {string} creatorId
 * @param {object} [context]
 * @returns {Promise<{ settled: boolean, amountUsd?: number, txs?: object, reason?: string }>}
 */
async function settleIfEligible(creatorId, context = {}) {
  const { rows: cRows } = await query(
    `SELECT u.wallet_address, u.creator_status, l.pending_usd
       FROM users u
       LEFT JOIN rush_creator_ledger l ON l.creator_id = u.id
      WHERE u.id = $1
      LIMIT 1`,
    [String(creatorId)],
  );
  const row = cRows[0];
  if (!row) return { settled: false, reason: 'user_not_found' };
  if (row.creator_status !== 'active') return { settled: false, reason: 'creator_not_active' };
  if (!row.wallet_address) return { settled: false, reason: 'no_wallet' };
  const pendingUsd = Number(row.pending_usd || 0);
  if (pendingUsd < RUSH_MIN_SETTLE_USD) return { settled: false, reason: 'below_threshold', pendingUsd };

  // Atomically claim the pending amount by resetting to 0. If we send USDC
  // and the DB update below fails, the on-chain payment goes through but
  // the creator's ledger row keeps the amount — a duplicate settle attempt
  // (via the periodic sweep) would double-pay. The claim-then-send order
  // means a failed send restores the amount for retry.
  const settleAmount = Math.round(pendingUsd * 100) / 100;

  const claim = await query(
    `UPDATE rush_creator_ledger
        SET pending_usd = 0, updated_at = NOW()
      WHERE creator_id = $1 AND pending_usd >= $2
      RETURNING pending_usd`,
    [String(creatorId), settleAmount],
  );
  if (claim.rowCount === 0) return { settled: false, reason: 'claim_lost' };

  let dispatch;
  try {
    const { dispatchRushSplit } = require('./payoutSplitService');
    dispatch = await dispatchRushSplit({
      rushSpendId: context.rushSpendId || `batch:${creatorId}:${Date.now()}`,
      creatorId: String(creatorId),
      amountUsd: settleAmount,
      creatorAddress: row.wallet_address,
    });
  } catch (dispatchErr) {
    // Nothing was sent — dispatchRushSplit only throws after exhausting its
    // own retries — so it's still safe to restore the claim for next attempt.
    await query(
      `UPDATE rush_creator_ledger
          SET pending_usd = pending_usd + $2, updated_at = NOW()
        WHERE creator_id = $1`,
      [String(creatorId), settleAmount],
    ).catch(() => {});
    logger.error('[rushLedger] settle send failed — pending restored', {
      creatorId, settleAmount, err: dispatchErr.message,
    });
    throw dispatchErr;
  }

  // The USDC is on-chain now. This write must NEVER trigger a restore of
  // pending_usd on failure — that would let the next sweep tick resend
  // money that's already gone (same risk cashoutService._dispatchAndFinalize
  // and refundService.approveRefund guard against). Retry the bookkeeping
  // write instead, and alert ops for manual reconciliation if it still fails.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await query(
        `UPDATE rush_creator_ledger
            SET total_settled_usd = total_settled_usd + $2,
                last_settled_at   = NOW(),
                updated_at        = NOW()
          WHERE creator_id = $1`,
        [String(creatorId), settleAmount],
      );
      logger.info('[rushLedger] settled', { creatorId, settleAmount, ...dispatch });
      return { settled: true, amountUsd: settleAmount, txs: dispatch };
    } catch (writeErr) {
      logger.error('[rushLedger] USDC sent but ledger update failed — retrying', {
        creatorId, settleAmount, txs: dispatch, attempt, err: writeErr.message,
      });
      if (attempt === 3) {
        _notifyOpsPaidButUnrecorded({ creatorId, settleAmount, dispatch }).catch(() => {});
        throw Object.assign(
          new Error('RUSH settlement paid on-chain but the ledger update failed — needs manual reconciliation'),
          { code: 'PAID_BUT_UNRECORDED', creatorId, settleAmount, txs: dispatch },
        );
      }
      await new Promise((res) => setTimeout(res, 500 * attempt));
    }
  }
}

async function _notifyOpsPaidButUnrecorded({ creatorId, settleAmount, dispatch }) {
  // This is the only alert ops gets for a PAID_BUT_UNRECORDED incident — the
  // caller fire-and-forgets this (`.catch(...)`), so swallowing a failure
  // here silently (missing config, a non-2xx response, or Slack's own
  // `ok: false`) would mean the incident never reaches a human. Log loudly
  // on every failure mode instead of just returning.
  const channel = process.env.SLACK_OPS_ADMIN_CHANNEL || process.env.SLACK_OPS_INCIDENTS_CHANNEL;
  const token = process.env.SLACK_BOT_TOKEN;
  const context = { creatorId, settleAmount, txs: dispatch };
  if (!channel || !token) {
    logger.error('[rushLedger] PAID_BUT_UNRECORDED alert NOT sent — Slack not configured (SLACK_OPS_ADMIN_CHANNEL/SLACK_OPS_INCIDENTS_CHANNEL/SLACK_BOT_TOKEN)', context);
    return;
  }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        channel,
        text: `🚨 RUSH settlement for creator \`${creatorId}\` — USDC SENT ($${settleAmount}, tx \`${dispatch?.txCreator}\`) but the ledger update failed 3x. Needs manual reconciliation: add $${settleAmount} to total_settled_usd by hand once verified — do NOT let pending_usd be re-settled.`,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      logger.error('[rushLedger] PAID_BUT_UNRECORDED alert NOT delivered — Slack rejected it', { ...context, httpStatus: res.status, slackError: body?.error });
    }
  } catch (fetchErr) {
    logger.error('[rushLedger] PAID_BUT_UNRECORDED alert NOT delivered — Slack request failed', { ...context, error: fetchErr.message });
  }
}

/**
 * Sweep: iterate every creator over threshold and try to settle. Called from
 * a cron (queueService.js) as a safety net for accumulateForCreator calls
 * that failed their inline settle.
 *
 * @returns {Promise<{ scanned: number, settled: number, failed: number }>}
 */
async function sweepPending() {
  const { rows } = await query(
    `SELECT creator_id FROM rush_creator_ledger WHERE pending_usd >= $1 LIMIT 100`,
    [RUSH_MIN_SETTLE_USD],
  );
  let settled = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await settleIfEligible(row.creator_id, { rushSpendId: `sweep:${row.creator_id}:${Date.now()}` });
      if (result.settled) settled++;
    } catch (err) {
      failed++;
      logger.warn('[rushLedger] sweep entry failed', { creatorId: row.creator_id, err: err.message });
    }
  }
  logger.info('[rushLedger] sweep complete', { scanned: rows.length, settled, failed });
  return { scanned: rows.length, settled, failed };
}

module.exports = {
  accumulateForCreator,
  settleIfEligible,
  sweepPending,
  RUSH_MIN_SETTLE_USD,
};
