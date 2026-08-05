'use strict';

/**
 * tokenService.js
 *
 * Manages user token balances for all pay-per-use features.
 * This service is the single source of truth for token transactions.
 * Integrates with user_token_wallets table.
 */

const logger = require('../utils/logger');
const userService = require('./userService');
const { query, getClient } = require('../config/postgres');
const { cache } = require('../config/redis');
const tokenLedger = require('./tokenLedgerService');

const { CREATOR_REVENUE_RATE, PLATFORM_COMMISSION_RATE, EARNINGS_HOLD_HOURS, GIFTED_ALLOWED_PERFORMER_USER_IDS, SANTINO_USER_ID } = require('../config/monetizationConfig');

const STREAM_HEARTBEAT_COST = 1; // 1 token/min billed to viewer
// Stream heartbeat uses a 4/6 creator / 2/6 platform split (not the default 70/30).
// Integer wallet credit is always 1 token to creator; USD accounting uses fractional amounts.
const STREAM_HEARTBEAT_REVENUE = 1; // full token credited to creator wallet
const STREAM_HEARTBEAT_PLATFORM = 0; // platform share tracked only in creator_earnings USD rows

// ── Creator Weekend Bonus ─────────────────────────────────────────────────────
// July 18 2026 05:00 UTC → July 21 2026 11:00 UTC
// When pnpapp:creator_bonus:active Redis key exists AND current time is within window,
// creator earns 10% extra (capped so total never exceeds cost paid by viewer).
const CREATOR_BONUS_WINDOW_START = new Date('2026-07-18T05:00:00Z');
const CREATOR_BONUS_WINDOW_END = new Date('2026-07-21T11:00:00Z');

/**
 * Returns the creator earnings amount with bonus applied if active.
 * Uses raw Redis GET (not cache.get) to avoid JSON.parse turning '1' → 1 (number).
 * @param {number} baseCreatorAmount  Normal creator share (e.g. 70)
 * @param {number} totalCost  Total tokens spent by viewer (e.g. 100)
 * @returns {Promise<{ creatorAmount: number, platformAmount: number, bonusApplied: boolean }>}
 */
async function applyCreatorBonus(baseCreatorAmount, totalCost) {
  try {
    const now = new Date();
    if (now < CREATOR_BONUS_WINDOW_START || now > CREATOR_BONUS_WINDOW_END) {
      return { creatorAmount: baseCreatorAmount, platformAmount: totalCost - baseCreatorAmount, bonusApplied: false };
    }
    // Use raw Redis client — cache.get() runs JSON.parse which converts '1' → 1
    const { getRedis } = require('../config/redis');
    const redisClient = getRedis();
    const bonusFlag = await redisClient.get('pnpapp:creator_bonus:active').catch(() => null);
    if (bonusFlag !== '1') {
      return { creatorAmount: baseCreatorAmount, platformAmount: totalCost - baseCreatorAmount, bonusApplied: false };
    }
    // Apply 10% bonus, capped so creator never gets more than total paid
    const bonusedAmount = Math.min(Math.round(baseCreatorAmount * 1.1 * 1000) / 1000, totalCost);
    const platformAmount = Math.max(0, totalCost - bonusedAmount);
    return { creatorAmount: bonusedAmount, platformAmount, bonusApplied: true };
  } catch (_) {
    return { creatorAmount: baseCreatorAmount, platformAmount: totalCost - baseCreatorAmount, bonusApplied: false };
  }
}

/**
 * Checks if a user has at least a certain number of tokens.
 *
 * @param {string|number} userId The user's ID.
 * @param {number} requiredAmount The amount of tokens required.
 * @returns {Promise<boolean>} True if the user has enough tokens, false otherwise.
 */
async function hasSufficientBalance(userId, requiredAmount) {
  try {
    // Match the /api/wallet/balance surface: sum regular + gifted + creator_gifts.
    // Callers that need to enforce "regular tokens only" (e.g. subscription spend)
    // must query balance_tokens directly, not use this helper.
    const res = await query(
      `SELECT balance_tokens, gifted_balance,
              COALESCE((SELECT SUM((v)::numeric)
                        FROM jsonb_each_text(creator_gifts) AS t(k, v)), 0) AS cg_total
       FROM user_token_wallets WHERE user_id = $1`,
      [String(userId)]
    );
    if (res.rows.length === 0) return requiredAmount <= 0;
    const r = res.rows[0];
    const total = (Number(r.balance_tokens) || 0)
                + (Number(r.gifted_balance) || 0)
                + (Number(r.cg_total) || 0);
    return total >= requiredAmount;
  } catch (error) {
    logger.error('tokenService.hasSufficientBalance error', { userId, error: error.message });
    return false; // Fail safe
  }
}

/**
 * Deducts a specified number of tokens from a user's balance.
 *
 * @param {string|number} userId The user's ID.
 * @param {number} amount The number of tokens to deduct. Must be a positive number.
 * @param {string} [reason] Optional reason for deduction.
 * @returns {Promise<{success: boolean, newBalance: number}>}
 */
async function deductTokens(userId, amount, reason = 'deduction', ledgerOpts = {}) {
  if (amount <= 0) {
    logger.warn('tokenService.deductTokens: Amount must be positive.', { userId, amount });
    return { success: false, newBalance: 0 };
  }
  const ledgerReason = ledgerOpts.ledgerReason || 'content_purchase';
  try {
    const { balance_after, gifted_after } = await tokenLedger.debit({
      userId,
      amount,
      reason: ledgerReason,
      sourceType: ledgerOpts.sourceType || null,
      sourceId: ledgerOpts.sourceId || null,
      actorId: ledgerOpts.actorId || String(userId),
      metadata: { legacyReason: reason, ...(ledgerOpts.metadata || {}) },
    });
    const newBalance = balance_after + gifted_after;
    logger.info(`Deducted ${amount} Ru$h from user ${userId} for ${reason}. New balance: ${newBalance}`);
    return { success: true, newBalance };
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return { success: false, newBalance: error.available || 0, error: 'Insufficient tokens' };
    }
    logger.error('tokenService.deductTokens error', { userId, amount, error: error.message });
    return { success: false, newBalance: 0, error: 'Database error' };
  }
}

/**
 * Credits a specified number of tokens to a user's balance.
 *
 * @param {string|number} userId The user's ID.
 * @param {number} amount The number of tokens to credit. Must be a positive number.
 * @param {string} [reason] Optional reason for credit.
 * @returns {Promise<boolean>} True on success, false on failure.
 */
async function creditTokens(userId, amount, reason = 'credit', ledgerOpts = {}) {
  if (amount <= 0) {
    logger.warn('tokenService.creditTokens: Amount must be positive.', { userId, amount });
    return false;
  }
  const ledgerReason = ledgerOpts.ledgerReason || 'admin_grant';
  try {
    const { balance_after, gifted_after } = await tokenLedger.credit({
      userId,
      balanceDelta: amount,
      reason: ledgerReason,
      sourceType: ledgerOpts.sourceType || null,
      sourceId: ledgerOpts.sourceId || null,
      actorId: ledgerOpts.actorId || 'system',
      metadata: { legacyReason: reason, ...(ledgerOpts.metadata || {}) },
    });
    const newBalance = balance_after + gifted_after;
    logger.info(`Credited ${amount} Ru$h to user ${userId} for ${reason}. New balance: ${newBalance}`);
    return newBalance;
  } catch (error) {
    logger.error('tokenService.creditTokens error', { userId, amount, error: error.message });
    return false;
  }
}

/**
 * Credits bonus tokens into the creator-specific gift pool (creator_gifts JSONB).
 * These can only be spent on the named creator's streams and tips.
 *
 * @param {string|number} userId
 * @param {string|number} creatorId
 * @param {number} amount
 * @returns {Promise<boolean>}
 */
async function creditCreatorGiftTokens(userId, creatorId, amount) {
  if (amount <= 0) return false;
  try {
    await query(
      `INSERT INTO user_token_wallets (user_id, creator_gifts)
       VALUES ($1, jsonb_build_object($2::text, $3::numeric))
       ON CONFLICT (user_id) DO UPDATE
         SET creator_gifts = jsonb_set(
               COALESCE(user_token_wallets.creator_gifts, '{}'),
               ARRAY[$2],
               to_jsonb(COALESCE((user_token_wallets.creator_gifts->>$2)::numeric, 0) + $3)
             ),
             updated_at = NOW()`,
      [String(userId), String(creatorId), amount]
    );
    await Promise.all([
      cache.del(`wallet:${userId}`).catch(() => {}),
      cache.del(`wallet:obj:${userId}`).catch(() => {}),
    ]);
    logger.info(`Credited ${amount} creator gift tokens to user ${userId} for creator ${creatorId}`);
    return true;
  } catch (error) {
    logger.error('tokenService.creditCreatorGiftTokens error', { userId, creatorId, amount, error: error.message });
    return false;
  }
}

/**
 * Processes a stream heartbeat, deducting tokens from the viewer and crediting the streamer.
 * @param {string|number} viewerId The ID of the user watching the stream.
 * @param {string} channelRef The channel reference of the stream being watched.
 * @returns {Promise<{success: boolean, error?: string, newBalance?: number}>}
 */
async function processStreamHeartbeat(viewerId, channelRef) {
  const streamer = await userService.findUserByChannelRef(channelRef);
  if (!streamer) {
    return { success: false, error: 'STREAMER_NOT_FOUND' };
  }

  // Ensure the streamer is an active creator before processing payment
  if (streamer.creatorStatus !== 'active') {
    logger.warn('Heartbeat for non-active creator.', { viewerId, channelRef, streamerId: streamer.id });
    const balRow = await query(
      `SELECT COALESCE(balance_tokens,0) + COALESCE(gifted_balance,0) AS total FROM user_token_wallets WHERE user_id = $1`,
      [String(viewerId)]
    );
    return { success: true, newBalance: Number(balRow.rows[0]?.total) || 0 };
  }

  // Don't charge the streamer for watching their own stream
  if (String(viewerId) === String(streamer.id)) {
    const balRow = await query(
      `SELECT COALESCE(balance_tokens,0) + COALESCE(gifted_balance,0) AS total FROM user_token_wallets WHERE user_id = $1`,
      [String(viewerId)]
    );
    return { success: true, newBalance: Number(balRow.rows[0]?.total) || 0 };
  }

  // Free-period check — first 15 minutes after entering are unbilled
  let redisForBilling;
  try {
    const { getRedis } = require('../config/redis');
    redisForBilling = getRedis();
    const freeUntilStr = await redisForBilling.get(`live:viewer:freeuntil:${viewerId}:${channelRef}`);
    if (freeUntilStr) {
      const freeUntil = parseInt(freeUntilStr, 10);
      if (Number.isFinite(freeUntil) && Date.now() < freeUntil) {
        const balRow = await query(
          `SELECT COALESCE(balance_tokens,0) + COALESCE(gifted_balance,0) AS total FROM user_token_wallets WHERE user_id = $1`,
          [String(viewerId)]
        );
        const currentBalance = Number(balRow.rows[0]?.total) || 0;
        const freeMinutesLeft = Math.max(0, Math.ceil((freeUntil - Date.now()) / 60000));
        return { success: true, newBalance: currentBalance, freeMinutesLeft };
      }
    }
  } catch (freeCheckErr) {
    logger.warn('processStreamHeartbeat: free-period check failed, proceeding to bill', { viewerId, channelRef, error: freeCheckErr.message });
  }

  // Dedup lock — prevents double-charging within the same 55-second window.
  // Guards against: effect re-runs on stream.isLive flicker, webcam-switch race
  // conditions, and clients sending multiple heartbeats within one minute.
  try {
    if (redisForBilling) {
      const lockKey = `live:hb:lock:${viewerId}:${channelRef}`;
      const acquired = await redisForBilling.set(lockKey, '1', 'EX', 55, 'NX');
      if (!acquired) {
        const balRow = await query(
          `SELECT COALESCE(balance_tokens,0) + COALESCE(gifted_balance,0) AS total FROM user_token_wallets WHERE user_id = $1`,
          [String(viewerId)]
        );
        return { success: true, newBalance: Number(balRow.rows[0]?.total) || 0 };
      }
    }
  } catch (lockErr) {
    logger.warn('processStreamHeartbeat: dedup lock check failed, proceeding to bill', { viewerId, channelRef, error: lockErr.message });
  }

  // Gifted tokens are accepted for Santino/PNPLatinoBoy streams; regular-only elsewhere.
  const isGiftedAllowed = GIFTED_ALLOWED_PERFORMER_USER_IDS.includes(String(streamer.id));

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Check and deduct from viewer.
    // Santino: drain creator_gifts['SANTINO'] first, then gifted_balance, then balance_tokens.
    // PNPLatinoBoy (other allowed): drain gifted_balance first, then balance_tokens.
    // All others: balance_tokens only.
    let debitResult;
    const isSantino = String(streamer.id) === SANTINO_USER_ID;
    if (isSantino) {
      debitResult = await client.query(
        `WITH before AS (
           SELECT COALESCE((creator_gifts->>$3)::numeric, 0) AS cg_val, gifted_balance
           FROM user_token_wallets WHERE user_id = $1
         ),
         upd AS (
           UPDATE user_token_wallets
           SET creator_gifts = jsonb_set(
                 creator_gifts,
                 ARRAY[$3],
                 to_jsonb(GREATEST(0.0, COALESCE((creator_gifts->>$3)::numeric, 0) - $2))
               ),
               gifted_balance = GREATEST(0, gifted_balance - GREATEST(0, $2 - COALESCE((creator_gifts->>$3)::numeric, 0))),
               balance_tokens = balance_tokens - GREATEST(0, $2 - COALESCE((creator_gifts->>$3)::numeric, 0) - gifted_balance),
               updated_at = NOW()
           WHERE user_id = $1
             AND COALESCE((creator_gifts->>$3)::numeric, 0) + gifted_balance + balance_tokens >= $2
           RETURNING balance_tokens, gifted_balance, creator_gifts
         )
         SELECT u.balance_tokens, u.gifted_balance, u.creator_gifts,
                GREATEST(0, $2::numeric - b.cg_val - b.gifted_balance)::int AS balance_tokens_spent
         FROM upd u, before b`,
        [String(viewerId), STREAM_HEARTBEAT_COST, SANTINO_USER_ID]
      );
    } else if (isGiftedAllowed) {
      debitResult = await client.query(
        `WITH before AS (
           SELECT gifted_balance FROM user_token_wallets WHERE user_id = $1
         ),
         upd AS (
           UPDATE user_token_wallets
           SET gifted_balance = GREATEST(0, gifted_balance - $2),
               balance_tokens = balance_tokens - GREATEST(0, $2 - gifted_balance),
               updated_at = NOW()
           WHERE user_id = $1 AND (gifted_balance + balance_tokens) >= $2
           RETURNING balance_tokens, gifted_balance, creator_gifts
         )
         SELECT u.balance_tokens, u.gifted_balance, u.creator_gifts,
                GREATEST(0, $2::numeric - b.gifted_balance)::int AS balance_tokens_spent
         FROM upd u, before b`,
        [String(viewerId), STREAM_HEARTBEAT_COST]
      );
    } else {
      debitResult = await client.query(
        `UPDATE user_token_wallets
         SET balance_tokens = balance_tokens - $2,
             updated_at = NOW()
         WHERE user_id = $1 AND balance_tokens >= $2
         RETURNING balance_tokens, gifted_balance, creator_gifts`,
        [String(viewerId), STREAM_HEARTBEAT_COST]
      );
    }

    if (debitResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'INSUFFICIENT_FUNDS' };
    }

    const { balance_tokens: reg, gifted_balance: gift, creator_gifts: cg } = debitResult.rows[0];
    const cgTotal = cg ? Object.values(cg).reduce((s, v) => s + Number(v), 0) : 0;
    const newBalance = (reg || 0) + (gift || 0) + cgTotal;

    // Determine how many tokens came from the purchased (balance_tokens) pool.
    // Santino and isGiftedAllowed paths return balance_tokens_spent from the CTE.
    // Regular path debits only from balance_tokens, so the full cost is purchased.
    const balanceTokensSpent = isSantino || isGiftedAllowed
      ? (debitResult.rows[0].balance_tokens_spent ?? STREAM_HEARTBEAT_COST)
      : STREAM_HEARTBEAT_COST;

    // 2. Check for creator weekend bonus and compute final amounts (always based on full cost for wallet credit)
    const { creatorAmount, platformAmount, bonusApplied } = await applyCreatorBonus(STREAM_HEARTBEAT_REVENUE, STREAM_HEARTBEAT_COST);

    // 3. Credit streamer (with bonus if active) — always use full cost so UX is unchanged
    const { rows: streamerAfterRows } = await client.query(
      `INSERT INTO user_token_wallets (user_id, balance_tokens)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET balance_tokens = user_token_wallets.balance_tokens + $2,
             updated_at = NOW()
       RETURNING balance_tokens, gifted_balance`,
      [String(streamer.id), creatorAmount]
    );

    // 3b. Ledger rows for viewer debit + streamer credit (audit trail)
    // Viewer: split debit into balance vs gifted using computed spent amounts
    const viewerTakeBalance = balanceTokensSpent;
    const viewerTakeGifted = STREAM_HEARTBEAT_COST - balanceTokensSpent;
    const hbSourceId = `live-hb:${viewerId}:${Date.now()}`;
    await client.query(
      `INSERT INTO token_ledger (user_id, delta_balance, delta_gifted, reason, source_type, source_id, actor_id, balance_after, gifted_after, metadata)
       VALUES ($1, $2, $3, 'live_tip_send', 'live_heartbeat', $4, $1, $5, $6, $7::jsonb)`,
      [String(viewerId), -viewerTakeBalance, -viewerTakeGifted, hbSourceId, Number(reg), Number(gift),
       JSON.stringify({ streamerId: String(streamer.id), channelRef, cost: STREAM_HEARTBEAT_COST })]
    );
    await client.query(
      `INSERT INTO token_ledger (user_id, delta_balance, delta_gifted, reason, source_type, source_id, actor_id, balance_after, gifted_after, metadata)
       VALUES ($1, $2, 0, 'live_tip_receive', 'live_heartbeat', $3, $4, $5, $6, $7::jsonb)`,
      [String(streamer.id), creatorAmount, hbSourceId, String(viewerId),
       Number(streamerAfterRows[0].balance_tokens), Number(streamerAfterRows[0].gifted_balance),
       JSON.stringify({ viewerId: String(viewerId), channelRef, bonusApplied })]
    );

    // 4. Log the earning record — only for purchased tokens (real cash obligation).
    // Gifted / creator_gifts tokens credit the streamer's wallet for UX but do not
    // generate payout obligations.
    // Stream heartbeat split: 4/6 creator, 2/6 platform (different from tip 70/30).
    const TOKENS_PER_USD = 6;
    const HEARTBEAT_CREATOR_RATE = 4 / 6;
    const HEARTBEAT_PLATFORM_RATE = 2 / 6;
    if (balanceTokensSpent > 0) {
      const baseEarnCreator = Math.round(balanceTokensSpent * HEARTBEAT_CREATOR_RATE * 1000) / 1000;
      const { creatorAmount: earnCreator, platformAmount: earnPlatform } = await applyCreatorBonus(
        baseEarnCreator,
        balanceTokensSpent
      );
      // If bonus did not push earnCreator above base, use the heartbeat platform rate for the earnings row
      const finalEarnPlatform = bonusApplied
        ? earnPlatform
        : Math.round(balanceTokensSpent * HEARTBEAT_PLATFORM_RATE * 1000) / 1000;
      await client.query(
        `INSERT INTO creator_earnings (creator_id, amount_gross, amount_creator, amount_platform, status, available_at, period_month, source_payment_id, metadata)
         VALUES ($1, $2, $3, $4, 'holding', NOW() + ($5 || ' hours')::interval, date_trunc('month', CURRENT_DATE), $6, $7::jsonb)`,
        [String(streamer.id), balanceTokensSpent / TOKENS_PER_USD, earnCreator / TOKENS_PER_USD, finalEarnPlatform / TOKENS_PER_USD, String(EARNINGS_HOLD_HOURS),
         hbSourceId, JSON.stringify({ viewerId: String(viewerId), channelRef, source: 'live_heartbeat' })]
      );
    }
    if (bonusApplied) {
      logger.info('Creator weekend bonus applied on heartbeat', { streamerId: streamer.id, creatorAmount, platformAmount });
    }

    await client.query('COMMIT');

    // Invalidate caches
    await Promise.all([
      cache.del(`wallet:${viewerId}`),
      cache.del(`wallet:obj:${viewerId}`),
      cache.del(`wallet:${streamer.id}`),
      cache.del(`wallet:obj:${streamer.id}`),
    ]).catch(() => {});

    // Emit real-time updates via Socket.IO
    try {
      const socketSingleton = require('./socketSingleton');
      const io = socketSingleton.get();
      if (io) {
        // Update viewer's wallet balance
        io.to(`user:${viewerId}`).emit('wallet:updated', { balance: newBalance });

        // Fetch and update streamer's wallet balance — same shape as viewer
        // (regular + gifted + creator_gifts) so client-side handlers can be
        // symmetric on both sides of the socket.
        const streamerWallet = await query(
          `SELECT balance_tokens, gifted_balance,
                  COALESCE((SELECT SUM((v)::numeric)
                            FROM jsonb_each_text(creator_gifts) AS t(k, v)), 0) AS cg_total
             FROM user_token_wallets WHERE user_id = $1`,
          [String(streamer.id)]
        );
        if (streamerWallet.rows.length > 0) {
          const r = streamerWallet.rows[0];
          const streamerBalance = (Number(r.balance_tokens) || 0)
                                + (Number(r.gifted_balance) || 0)
                                + (Number(r.cg_total) || 0);
          io.to(`user:${streamer.id}`).emit('wallet:updated', { balance: streamerBalance });
          
          // Emit session earnings update for streamer's dashboard
          io.to(`user:${streamer.id}`).emit('stream:earnings_update', {
            amount: creatorAmount,
            reason: 'heartbeat',
            viewerId,
            bonusApplied: bonusApplied || false,
          });
        }
      }
    } catch (socketErr) {
      logger.warn('Failed to emit socket updates after heartbeat', { error: socketErr.message });
    }

    return { success: true, newBalance, freeMinutesLeft: 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('processStreamHeartbeat error', { viewerId, channelRef, error: error.message });
    return { success: false, error: 'INTERNAL_ERROR' };
  } finally {
    client.release();
  }
}


/**
 * Returns the user's current token balance. Returns 0 if no wallet exists yet.
 *
 * @param {string|number} userId
 * @returns {Promise<number>}
 */
async function getBalance(userId) {
  try {
    const cached = await cache.get(`wallet:${userId}`).catch(() => null);
    if (cached != null) {
      const n = Number(cached);
      if (Number.isFinite(n)) return n;
    }
    // Full spendable total: regular + gifted + creator_gifts pools, matching
    // what /api/wallet/balance reports to the frontend.
    const res = await query(
      `SELECT balance_tokens, gifted_balance,
              COALESCE((SELECT SUM((v)::numeric)
                        FROM jsonb_each_text(creator_gifts) AS t(k, v)), 0) AS cg_total
       FROM user_token_wallets WHERE user_id = $1`,
      [String(userId)]
    );
    const balance = res.rows.length === 0
      ? 0
      : (Number(res.rows[0].balance_tokens) || 0)
      + (Number(res.rows[0].gifted_balance) || 0)
      + (Number(res.rows[0].cg_total) || 0);
    await cache.set(`wallet:${userId}`, balance, 30).catch(() => {});
    return balance;
  } catch (error) {
    logger.error('tokenService.getBalance error', { userId, error: error.message });
    return 0;
  }
}

module.exports = {
  hasSufficientBalance,
  getBalance,
  deductTokens,
  creditTokens,
  creditCreatorGiftTokens,
  processStreamHeartbeat,
  applyCreatorBonus,
};
