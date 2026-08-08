'use strict';

/**
 * tokenLedgerService.js
 *
 * Single source of truth for Ru$h currency mutations.
 *
 * Every change to user_token_wallets.{balance_tokens,gifted_balance}
 * MUST go through credit() or debit() here so we get an append-only
 * ledger row (token_ledger table) alongside the wallet cache update.
 *
 * The ledger is authoritative — the wallet columns are a cached
 * materialization for fast reads. Never UPDATE user_token_wallets
 * from outside this service.
 */

const logger = require('../utils/logger');
const { getClient, query } = require('../config/postgres');
const { cache } = require('../config/redis');

const VALID_REASONS = new Set([
  'purchase',
  'admin_grant',
  'admin_debit',
  'refund_credit',
  'live_tip_send',
  'live_tip_receive',
  'call_book',
  'call_refund',
  'content_purchase',
  'membership_purchase',
  'gift_send',
  'gift_receive',
  'earnings_conversion',
  'withdraw_hold',
  'withdraw_paid',
  'withdraw_reverse',
]);

// Optional externally-supplied pg client (for callers already inside a transaction)
function pickClient(externalClient) {
  return externalClient || null;
}

async function invalidateWalletCache(userId) {
  try {
    await Promise.all([
      cache.del(`wallet:${userId}`),
      cache.del(`wallet:obj:${userId}`),
    ]);
  } catch (_) { /* non-fatal */ }
}

/**
 * Credit tokens to a user's wallet + record ledger row.
 * Positive deltas only.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {number} [opts.balanceDelta=0]   Ru$h added to balance_tokens (must be >= 0)
 * @param {number} [opts.giftedDelta=0]    Ru$h added to gifted_balance (must be >= 0)
 * @param {string} opts.reason             one of VALID_REASONS
 * @param {string} [opts.sourceType]
 * @param {string} [opts.sourceId]
 * @param {string} [opts.actorId='system']
 * @param {object} [opts.metadata={}]
 * @param {object} [opts.externalClient]   optional pg client already inside a transaction
 * @returns {Promise<{balance_after:number, gifted_after:number, ledger_id:number}>}
 */
async function credit(opts) {
  const {
    userId, balanceDelta = 0,
    reason, sourceType = null, sourceId = null,
    actorId = 'system', metadata = {}, externalClient,
  } = opts || {};
  // giftedDelta may be zeroed by the creator/model guard below — needs `let`.
  let giftedDelta = (opts && Number.isFinite(opts.giftedDelta)) ? opts.giftedDelta : 0;

  if (!userId) throw new Error('tokenLedger.credit: userId required');
  if (!reason || !VALID_REASONS.has(reason)) throw new Error(`tokenLedger.credit: invalid reason "${reason}"`);
  if (balanceDelta < 0 || giftedDelta < 0) throw new Error('tokenLedger.credit: deltas must be >= 0 (use debit for negatives)');
  if (balanceDelta === 0 && giftedDelta === 0) throw new Error('tokenLedger.credit: at least one delta must be > 0');

  // Guard: gifted balance is a viewer-only promo pool (spendable only on
  // Santino + Lex per monetizationConfig). Creators/models must never accrue
  // gifted tokens — a signup bonus once assigned 4,107 tokens ($684 promo)
  // to 28 creators (fixed 2026-08-03). Silently drop the gifted portion
  // when the recipient is a creator; balance portion still credits normally.
  if (giftedDelta > 0) {
    try {
      const { rows: roleRows } = await query(
        `SELECT role, creator_status FROM users WHERE id = $1 LIMIT 1`, [String(userId)]
      );
      const role = roleRows[0]?.role;
      const creatorStatus = roleRows[0]?.creator_status;
      // Block on BOTH signals: role bump (creator/model) OR creator_status='active'.
      // Some users have creator_status='active' while role stays 'user' — that's
      // still a creator for gifted-guard purposes.
      const isCreator = role === 'creator' || role === 'model' || creatorStatus === 'active';
      if (isCreator) {
        logger.warn('[tokenLedger] gifted delta dropped — recipient is a creator/model', {
          userId, role, creatorStatus, giftedDelta, reason, sourceType, sourceId, actorId,
        });
        giftedDelta = 0;
        if (balanceDelta === 0) {
          // Nothing left to credit — bail out cleanly (no ledger row, no wallet write)
          return { balance_after: 0, gifted_after: 0, ledger_id: null, skipped: 'creator_gifted_guard' };
        }
      }
    } catch (guardErr) {
      logger.warn('[tokenLedger] gifted-guard role lookup failed — proceeding with grant', {
        userId, error: guardErr.message,
      });
    }
  }

  const client = pickClient(externalClient) || await getClient();
  const owned = !externalClient;
  try {
    if (owned) await client.query('BEGIN');

    // Upsert wallet + increment atomically. Gifted balance is hard-capped at 3600.
    const { rows } = await client.query(
      `INSERT INTO user_token_wallets (user_id, balance_tokens, gifted_balance)
       VALUES ($1, $2, LEAST($3, 3600))
       ON CONFLICT (user_id) DO UPDATE
         SET balance_tokens = user_token_wallets.balance_tokens + EXCLUDED.balance_tokens,
             gifted_balance = LEAST(user_token_wallets.gifted_balance + EXCLUDED.gifted_balance, 3600),
             updated_at = now()
       RETURNING balance_tokens, gifted_balance`,
      [String(userId), balanceDelta, giftedDelta]
    );
    const balanceAfter = Number(rows[0].balance_tokens);
    const giftedAfter = Number(rows[0].gifted_balance);

    const { rows: ledgerRows } = await client.query(
      `INSERT INTO token_ledger (user_id, delta_balance, delta_gifted, reason, source_type, source_id, actor_id, balance_after, gifted_after, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [String(userId), balanceDelta, giftedDelta, reason, sourceType, sourceId, actorId, balanceAfter, giftedAfter, JSON.stringify(metadata || {})]
    );

    if (owned) await client.query('COMMIT');
    invalidateWalletCache(userId).catch(() => {});
    return { balance_after: balanceAfter, gifted_after: giftedAfter, ledger_id: Number(ledgerRows[0].id) };
  } catch (err) {
    if (owned) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (owned) client.release();
  }
}

/**
 * Debit tokens from a user's wallet + record ledger row.
 * Positive amounts only (converted to negative deltas in ledger).
 * Balance MUST cover the debit — throws { code: 'INSUFFICIENT_FUNDS' } otherwise.
 *
 * Spend priority (default): balance_tokens only. gifted_balance is a scoped
 * promo pool spendable only on Santino/Lex live tips (enforced by pnpLiveTipsService's
 * own SQL — it does not route through this function). Pass `allowGifted: true`
 * to opt-in to drain-gifted-first behavior for gifted-eligible spend paths.
 * Pass `giftedOnly: true` to spend gifted_balance exclusively.
 */
async function debit(opts) {
  const {
    userId, amount = 0,
    reason, sourceType = null, sourceId = null,
    actorId = 'system', metadata = {}, externalClient,
    giftedOnly = false,
    allowGifted = false,
  } = opts || {};

  if (!userId) throw new Error('tokenLedger.debit: userId required');
  if (!reason || !VALID_REASONS.has(reason)) throw new Error(`tokenLedger.debit: invalid reason "${reason}"`);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('tokenLedger.debit: amount must be > 0');

  const client = pickClient(externalClient) || await getClient();
  const owned = !externalClient;
  try {
    if (owned) await client.query('BEGIN');

    const { rows: wRows } = await client.query(
      `SELECT balance_tokens, gifted_balance FROM user_token_wallets WHERE user_id = $1 FOR UPDATE`,
      [String(userId)]
    );
    if (!wRows.length) {
      const err = new Error('Insufficient Ru$h balance');
      err.code = 'INSUFFICIENT_FUNDS';
      throw err;
    }
    const bal = Number(wRows[0].balance_tokens);
    const gifted = Number(wRows[0].gifted_balance);
    const spendable = giftedOnly ? gifted : (allowGifted ? bal + gifted : bal);
    if (spendable < amount) {
      const err = new Error('Insufficient Ru$h balance');
      err.code = 'INSUFFICIENT_FUNDS';
      err.available = spendable;
      err.required = amount;
      throw err;
    }

    // Spend routing:
    //  giftedOnly=true → all from gifted (promo redemption)
    //  allowGifted=true → drain gifted first, then balance (legacy scoped path)
    //  default → balance only; gifted stays locked for Santino/Lex live tips
    let takeGifted, takeBalance;
    if (giftedOnly) {
      takeGifted = amount;
      takeBalance = 0;
    } else if (allowGifted) {
      takeGifted = Math.min(gifted, amount);
      takeBalance = amount - takeGifted;
    } else {
      takeGifted = 0;
      takeBalance = amount;
    }

    const balanceAfter = bal - takeBalance;
    const giftedAfter = gifted - takeGifted;

    await client.query(
      `UPDATE user_token_wallets SET balance_tokens = $2, gifted_balance = $3, updated_at = now() WHERE user_id = $1`,
      [String(userId), balanceAfter, giftedAfter]
    );

    const { rows: ledgerRows } = await client.query(
      `INSERT INTO token_ledger (user_id, delta_balance, delta_gifted, reason, source_type, source_id, actor_id, balance_after, gifted_after, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING id`,
      [String(userId), -takeBalance, -takeGifted, reason, sourceType, sourceId, actorId, balanceAfter, giftedAfter, JSON.stringify(metadata || {})]
    );

    if (owned) await client.query('COMMIT');
    invalidateWalletCache(userId).catch(() => {});
    return {
      balance_after: balanceAfter,
      gifted_after: giftedAfter,
      spent_balance: takeBalance,
      spent_gifted: takeGifted,
      ledger_id: Number(ledgerRows[0].id),
    };
  } catch (err) {
    if (owned) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (owned) client.release();
  }
}

async function getBalance(userId) {
  const { rows } = await query(
    `SELECT balance_tokens, gifted_balance FROM user_token_wallets WHERE user_id = $1`,
    [String(userId)]
  );
  if (!rows.length) return { balance_tokens: 0, gifted_balance: 0, total: 0 };
  const b = Number(rows[0].balance_tokens);
  const g = Number(rows[0].gifted_balance);
  return { balance_tokens: b, gifted_balance: g, total: b + g };
}

/**
 * Read paginated ledger for a user (admin/support view or user's own history).
 */
async function getLedger(userId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT id, delta_balance, delta_gifted, reason, source_type, source_id, actor_id,
            balance_after, gifted_after, metadata, created_at
     FROM token_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [String(userId), Math.min(200, Math.max(1, limit)), Math.max(0, offset)]
  );
  return rows;
}

/**
 * Integrity check: sum of ledger deltas per user == current wallet balance.
 * Returns a list of drifted users (should be empty).
 */
async function findDrift() {
  const { rows } = await query(
    `SELECT w.user_id,
            w.balance_tokens AS wallet_balance,
            w.gifted_balance AS wallet_gifted,
            COALESCE(l.sum_bal, 0) AS ledger_balance,
            COALESCE(l.sum_gift, 0) AS ledger_gifted
     FROM user_token_wallets w
     LEFT JOIN (
       SELECT user_id,
              SUM(delta_balance)::int AS sum_bal,
              SUM(delta_gifted)::int AS sum_gift
       FROM token_ledger GROUP BY user_id
     ) l ON l.user_id = w.user_id
     WHERE w.balance_tokens <> COALESCE(l.sum_bal, 0)
        OR w.gifted_balance <> COALESCE(l.sum_gift, 0)`
  );
  return rows;
}

module.exports = {
  credit,
  debit,
  getBalance,
  getLedger,
  findDrift,
  VALID_REASONS,
};
