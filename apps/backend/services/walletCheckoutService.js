'use strict';

/**
 * walletCheckoutService.js
 *
 * Unified purchase handler that replaces the scattered per-provider payment
 * services (nowPaymentsService, meruService, dashTokenService, and the
 * per-surface debit code paths in routes.js). Every purchase across every
 * surface — memberships, PRIME, creator subs, calls, Ru$h, channel/hangout
 * access — resolves to one of two rails:
 *
 *   - Ru$h rail   → atomic debit from user_token_wallets.balance_tokens
 *                   (or gifted, when the surface allows it), synchronous grant.
 *   - USDC rail   → intent record + on-chain USDC transfer on Base;
 *                   Alchemy webhook fires verifyAndFulfillUsdc → grant.
 *
 * Phase 1 (current) only exposes the entry points and infrastructure; no route
 * calls into it yet. Per-surface feature flags in `checkoutFlags.js` gate the
 * cutover from legacy providers to this service.
 */

const crypto = require('crypto');
const { query, getPool } = require('../config/postgres');
const logger = require('../utils/logger');
const tokenLedger = require('./tokenLedgerService');
const { cache } = require('../config/redis');

// ── Config ────────────────────────────────────────────────────────────────
const USDC_BASE_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RECEIVING_ADDRESS = () => process.env.CRYPTO_RECEIVING_ADDRESS;
const GAS_MANAGER_POLICY_ID = () => process.env.ALCHEMY_GAS_MANAGER_POLICY_ID || null;
const INTENT_EXPIRY_MINUTES = 20;
const TOKENS_PER_USD = 6;  // See memory: feedback_token_rate.md

const VALID_SURFACES = new Set([
  'donation', 'membership', 'prime', 'creator_sub', 'call', 'rush', 'channel', 'hangout',
  'tip',          // creator tips (in-call, in-stream, in-hangout) — credits creator earnings, no entitlement
  'crystal_self',    // Crystal Creator pass — invited creator self-purchase ($100/30d)
  'crystal_gift',    // Crystal Creator pass — fan gifts to a creator ($150/30d)
  'crystal_service', // Crystal Creator premium service booking (private call / custom content / etc.)
  'channel_pass',    // Channel Pass — fan monthly sub to a creator ($5-$50/30d)
]);

// ── Ru$h rail ──────────────────────────────────────────────────────────────
/**
 * Debit Ru$h from a user's wallet + grant the entitlement in one transaction.
 * Fully synchronous — the returned promise resolves only once the entitlement
 * exists.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.surface
 * @param {number} opts.amountUsd
 * @param {object} opts.entitlementSpec  { add_on_id, expires_at?, creator_id?, ... }
 * @param {boolean} [opts.allowGifted=false]  Drain gifted first when true.
 * @param {object} [opts.metadata={}]
 * @returns {Promise<{ok:true, intentId:number, spentBalance:number, spentGifted:number, entitlementId:number}>}
 */
async function initiateRushPurchase(opts) {
  const {
    userId, surface, amountUsd, entitlementSpec = {},
    allowGifted = false, metadata = {},
  } = opts || {};

  if (!userId) throw new Error('walletCheckout: userId required');
  if (!VALID_SURFACES.has(surface)) throw new Error(`walletCheckout: invalid surface "${surface}"`);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('walletCheckout: amountUsd must be > 0');

  const tokenCost = Math.round(amountUsd * TOKENS_PER_USD);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert the intent row FIRST so we have a stable ID for logs/rollback.
    const { rows: intentRows } = await client.query(
      `INSERT INTO checkout_intents
         (user_id, surface, provider, amount_usd, status, entitlement_spec, metadata, receiving_address, chain, token, expires_at)
       VALUES ($1, $2, 'wallet_rush', $3, 'pending', $4::jsonb, $5::jsonb, '', 'off_chain', 'RUSH', NOW() + ($6 || ' minutes')::interval)
       RETURNING id`,
      [String(userId), surface, amountUsd, JSON.stringify(entitlementSpec), JSON.stringify(metadata), INTENT_EXPIRY_MINUTES]
    );
    const intentId = Number(intentRows[0].id);

    // Debit through tokenLedgerService for the ledger + wallet write.
    const debitOut = await tokenLedger.debit({
      userId: String(userId),
      amount: tokenCost,
      reason: _reasonForSurface(surface),
      sourceType: 'checkout_intent',
      sourceId: String(intentId),
      actorId: 'user',
      allowGifted,
      metadata: { surface, amountUsd, ...metadata },
      externalClient: client,
    });

    // Spending Ru$h to buy Ru$h would be nonsense — hard-block it here.
    if (surface === 'rush') {
      throw new Error('walletCheckout: Ru$h rail cannot fulfill "rush" surface (use USDC rail to buy Ru$h)');
    }

    // Grant the entitlement inside the same transaction. Ru$h rail always
    // fulfills an entitlement (never a Ru$h credit) by construction of the
    // guard above.
    const { entitlementId } = await _fulfillEntitlement(client, {
      userId, entitlementSpec, surface, provider: 'wallet_rush', intentId, amountUsd,
    });

    // Mark intent fulfilled.
    await client.query(
      `UPDATE checkout_intents
         SET status = 'confirmed', fulfilled_at = NOW(),
             grant_result = $2::jsonb
       WHERE id = $1`,
      [intentId, JSON.stringify({
        entitlement_id: entitlementId,
        spent_balance: debitOut.spent_balance,
        spent_gifted: debitOut.spent_gifted,
        ledger_id: debitOut.ledger_id,
      })]
    );

    await client.query('COMMIT');

    _invalidateCaches(userId).catch(() => {});
    _notifyPurchaseSuccess({
      userId, surface, amountUsd, provider: 'wallet_rush', intentId,
      entitlementSpec, isLifetime: entitlementSpec?.is_lifetime === true,
    });
    logger.info('[walletCheckout] Ru$h purchase completed', {
      userId, surface, intentId, tokenCost, entitlementId,
    });

    return {
      ok: true,
      intentId,
      spentBalance: debitOut.spent_balance,
      spentGifted: debitOut.spent_gifted,
      entitlementId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── USDC rail ─────────────────────────────────────────────────────────────
/**
 * Create an on-chain USDC checkout intent. Returns the values the frontend
 * needs to construct + submit the transaction via Privy sendTransaction().
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.surface
 * @param {number} opts.amountUsd
 * @param {object} opts.entitlementSpec
 * @param {object} [opts.metadata={}]
 * @returns {Promise<{intentId:number, receivingAddress:string, amountUsdc:number, expiresAt:string, gasPolicyId:string|null}>}
 */
async function initiateUsdcPurchase(opts) {
  const {
    userId, surface, amountUsd, entitlementSpec = {}, metadata = {},
  } = opts || {};

  if (!userId) throw new Error('walletCheckout: userId required');
  if (!VALID_SURFACES.has(surface)) throw new Error(`walletCheckout: invalid surface "${surface}"`);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('walletCheckout: amountUsd must be > 0');

  // crystal_self is invite-only. Verify before creating any intent row.
  if (surface === 'crystal_self') {
    const { rows: invRows } = await query(
      `SELECT crystal_creator_invited_at FROM users WHERE id = $1 LIMIT 1`,
      [String(userId)]
    );
    if (!invRows[0] || !invRows[0].crystal_creator_invited_at) {
      const err = new Error('walletCheckout: crystal_self — user has not been invited to Crystal Creator');
      err.statusCode = 403;
      err.code = 'not_invited';
      throw err;
    }
  }

  const receivingAddress = RECEIVING_ADDRESS();
  if (!receivingAddress) throw new Error('CRYPTO_RECEIVING_ADDRESS not configured');

  const amountUsdc = amountUsd;  // USDC is 1:1 with USD by construction.

  const { rows } = await query(
    `INSERT INTO checkout_intents
       (user_id, surface, provider, amount_usd, expected_amount_usdc, expected_amount_native,
        status, chain, token, receiving_address, entitlement_spec, metadata, expires_at)
     VALUES ($1, $2, 'wallet_usdc', $3, $3, $3, 'pending', 'base', 'USDC', $4, $5::jsonb, $6::jsonb,
             NOW() + ($7 || ' minutes')::interval)
     RETURNING id, expires_at`,
    [String(userId), surface, amountUsd, receivingAddress,
     JSON.stringify(entitlementSpec), JSON.stringify(metadata), INTENT_EXPIRY_MINUTES]
  );

  const intentId = Number(rows[0].id);
  const expiresAt = rows[0].expires_at;

  logger.info('[walletCheckout] USDC intent created', {
    userId, surface, intentId, amountUsdc, receivingAddress,
  });

  return {
    intentId,
    receivingAddress,
    usdcContract: USDC_BASE_CONTRACT,
    amountUsdc,
    expiresAt,
    gasPolicyId: GAS_MANAGER_POLICY_ID(),
  };
}

/**
 * Create an on-chain ETH checkout intent on Base. Native transfer (no ERC20
 * contract call). Piggybacks on provider='wallet_usdc' but stores token='ETH'
 * as the discriminator. Server captures the ETH→USD price at intent time and
 * stores it in metadata so the verifier can apply a bounded slippage tolerance
 * against value received on-chain.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.surface
 * @param {number} opts.amountUsd
 * @param {number} opts.ethUsdPrice   Server-fetched spot at intent time (USD per ETH)
 * @param {object} opts.entitlementSpec
 * @param {object} [opts.metadata={}]
 * @returns {Promise<{intentId, receivingAddress, amountEth, ethUsdPrice, amountWeiExpected, expiresAt}>}
 */
async function initiateEthPurchase(opts) {
  const {
    userId, surface, amountUsd, ethUsdPrice, entitlementSpec = {}, metadata = {},
  } = opts || {};

  if (!userId) throw new Error('walletCheckout: userId required');
  if (!VALID_SURFACES.has(surface)) throw new Error(`walletCheckout: invalid surface "${surface}"`);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('walletCheckout: amountUsd must be > 0');
  if (!Number.isFinite(ethUsdPrice) || ethUsdPrice <= 0) throw new Error('walletCheckout: ethUsdPrice must be > 0');

  const receivingAddress = RECEIVING_ADDRESS();
  if (!receivingAddress) throw new Error('CRYPTO_RECEIVING_ADDRESS not configured');

  // ETH amount = USD / price. Round to 12 decimals (schema precision) and to
  // avoid a wei-level rounding mismatch we truncate down slightly so the user
  // is never asked to send fractionally more than intended.
  const rawEth = amountUsd / ethUsdPrice;
  const amountEth = Math.floor(rawEth * 1e12) / 1e12;
  const amountWeiExpected = BigInt(Math.floor(amountEth * 1e18)).toString();

  const mergedMetadata = {
    ...metadata,
    rail: 'eth',
    ethUsdPriceSnapshot: ethUsdPrice,
    amountWeiExpected,
  };

  const { rows } = await query(
    `INSERT INTO checkout_intents
       (user_id, surface, provider, amount_usd, expected_amount_usdc, expected_amount_native,
        status, chain, token, receiving_address, entitlement_spec, metadata, expires_at)
     VALUES ($1, $2, 'wallet_usdc', $3, $3, $4, 'pending', 'base', 'ETH', $5, $6::jsonb, $7::jsonb,
             NOW() + ($8 || ' minutes')::interval)
     RETURNING id, expires_at`,
    [String(userId), surface, amountUsd, amountEth, receivingAddress,
     JSON.stringify(entitlementSpec), JSON.stringify(mergedMetadata), INTENT_EXPIRY_MINUTES]
  );

  const intentId = Number(rows[0].id);
  const expiresAt = rows[0].expires_at;

  logger.info('[walletCheckout] ETH intent created', {
    userId, surface, intentId, amountEth, amountUsd, ethUsdPrice, receivingAddress,
  });

  return {
    intentId,
    receivingAddress,
    amountEth,
    ethUsdPrice,
    amountWeiExpected,
    expiresAt,
    gasPolicyId: GAS_MANAGER_POLICY_ID(),
  };
}

/**
 * Fulfill an on-chain ETH transfer against a pending intent. Called by
 * /api/wallet/checkout/verify-tx after the frontend broadcasts. Idempotent
 * on tx_hash. Applies 2% slippage tolerance on value received vs expected.
 *
 * @param {object} opts
 * @param {string} opts.txHash
 * @param {string} opts.fromAddress
 * @param {bigint|string} opts.amountWeiReceived
 */
async function verifyAndFulfillEth(opts) {
  const { txHash, fromAddress } = opts || {};
  const amountWeiReceived = BigInt(opts?.amountWeiReceived || 0);
  if (!txHash) throw new Error('walletCheckout: txHash required');

  const pool = getPool();
  const client = await pool.connect();
  let intentIdForFallback = null;
  try {
    await client.query('BEGIN');

    // Idempotent claim.
    const { rows: existingByTx } = await client.query(
      `SELECT id, status FROM checkout_intents
         WHERE lower(tx_hash) = lower($1) FOR UPDATE`,
      [txHash]
    );
    if (existingByTx.length > 0 && existingByTx[0].status === 'confirmed') {
      await client.query('COMMIT');
      return { ok: true, intentId: existingByTx[0].id, reason: 'already_confirmed' };
    }

    // Match by tx_hash or by (expected_amount_native, address, sender). ETH
    // discriminator is token='ETH'. Fallback address match uses users.wallet_address.
    // Rescue window: an EXPIRED intent still matches via tx_hash for 24h after
    // creation — covers the case where the Alchemy webhook fires after the
    // 20-min expiry (slow network, RPC lag, or a user who paid gas late).
    const amountEthReceived = Number(amountWeiReceived) / 1e18;
    const { rows: intentRows } = await client.query(
      `SELECT id, user_id, amount_usd, expected_amount_native, entitlement_spec,
              surface, receiving_address, metadata, status
         FROM checkout_intents
        WHERE provider = 'wallet_usdc'
          AND token = 'ETH'
          AND status IN ('pending', 'expired')
          AND created_at > NOW() - INTERVAL '24 hours'
          AND (
            lower(tx_hash) = lower($1)
            OR (
              status = 'pending'
              AND tx_hash IS NULL
              AND expires_at > NOW()
              AND user_id::text = (
                SELECT id::text FROM users
                 WHERE lower(wallet_address) = lower($2) LIMIT 1
              )
              -- 2% slippage tolerance on the primary match too.
              AND ABS(expected_amount_native - $3) <= (expected_amount_native * 0.02)
            )
          )
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      // Pass null (not '') for missing fromAddress so lower('') doesn't
      // silently match users with wallet_address = '' (empty-string writes
      // from a Privy edge case would let a fresh checkout hijack another
      // user's pending intent).
      [txHash, fromAddress || null, amountEthReceived]
    );
    if (intentRows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'no_matching_intent' };
    }
    const intent = intentRows[0];
    intentIdForFallback = intent.id;

    // Value guard — allow 2% under (price moved unfavorably during broadcast).
    const expectedEth = Number(intent.expected_amount_native);
    const tolerance = expectedEth * 0.02;
    if (amountEthReceived + 1e-12 < expectedEth - tolerance) {
      await client.query(
        `UPDATE checkout_intents SET status = 'failed',
             grant_result = jsonb_build_object('reason', 'amount_mismatch', 'received_eth', $2::text, 'expected_eth', expected_amount_native::text),
             tx_hash = $3
           WHERE id = $1`,
        [intent.id, amountEthReceived, txHash]
      );
      await client.query('COMMIT');
      logger.warn('[walletCheckout] ETH amount_mismatch', {
        intentId: intent.id, expected: expectedEth, received: amountEthReceived, txHash,
      });
      return { ok: false, reason: 'amount_mismatch', intentId: intent.id };
    }

    let entitlementSpec;
    try {
      entitlementSpec = typeof intent.entitlement_spec === 'string'
        ? JSON.parse(intent.entitlement_spec)
        : (intent.entitlement_spec || {});
    } catch { entitlementSpec = {}; }

    const fulfillment = await _fulfill(client, {
      userId: intent.user_id,
      entitlementSpec,
      surface: intent.surface,
      provider: 'wallet_usdc',
      intentId: intent.id,
      amountUsd: Number(intent.amount_usd),
    });
    const entitlementId = fulfillment.entitlementId;

    await client.query(
      `UPDATE checkout_intents
         SET status = 'confirmed', fulfilled_at = NOW(),
             tx_hash = $2, from_address = $3, confirmed_at = NOW(),
             grant_result = jsonb_build_object('entitlement_id', $4::bigint, 'received_eth', $5::text, 'rush_credited', $6::int)
       WHERE id = $1`,
      [intent.id, txHash, fromAddress || null, entitlementId, String(amountEthReceived), fulfillment.rushCredited || 0]
    );

    await client.query('COMMIT');
    _invalidateCaches(intent.user_id).catch(() => {});
    _notifyPurchaseSuccess({
      userId: intent.user_id, surface: intent.surface,
      amountUsd: Number(intent.amount_usd), provider: 'wallet_usdc',
      intentId: intent.id, txHash, chain: 'base',
      entitlementSpec, isLifetime: entitlementSpec?.is_lifetime === true,
    });

    logger.info('[walletCheckout] ETH purchase fulfilled', {
      intentId: intent.id, userId: intent.user_id, surface: intent.surface,
      entitlementId, rushCredited: fulfillment.rushCredited || 0, txHash,
      amountEthReceived, amountUsd: Number(intent.amount_usd),
    });

    return { ok: true, intentId: intent.id, entitlementId, rushCredited: fulfillment.rushCredited || 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Mark the intent grant_failed OUTSIDE the rolled-back transaction so a
    // reconciler / operator can see stuck intents and retry (previously
    // fulfillment throws left status='pending' + no error trail).
    if (intentIdForFallback) {
      await _markGrantFailed(pool, intentIdForFallback, txHash, err.message).catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
}

async function _markGrantFailed(pool, intentId, txHash, errMsg) {
  await pool.query(
    `UPDATE checkout_intents
       SET status = 'grant_failed',
           grant_result = jsonb_build_object('reason', 'grant_error', 'error', $3::text, 'failed_at', NOW()::text),
           tx_hash = COALESCE(tx_hash, $2)
     WHERE id = $1 AND status IN ('pending', 'confirmed')`,
    [intentId, txHash, String(errMsg || 'unknown').slice(0, 500)]
  );
}

/**
 * Called from Alchemy webhook after an on-chain USDC transfer is observed.
 * Verifies the tx matches an outstanding intent, grants entitlement, marks
 * intent fulfilled. Idempotent on tx_hash — replaying the same webhook is
 * a no-op after first success.
 *
 * @param {object} opts
 * @param {string} opts.txHash
 * @param {string} opts.fromAddress
 * @param {number} opts.amountReceived   USDC amount (already parsed to human-readable)
 * @returns {Promise<{ok:boolean, intentId?:number, entitlementId?:number, reason?:string}>}
 */
async function verifyAndFulfillUsdc(opts) {
  const { txHash, fromAddress, amountReceived } = opts || {};
  if (!txHash) throw new Error('walletCheckout: txHash required');

  const pool = getPool();
  const client = await pool.connect();
  let intentIdForFallback = null;
  try {
    await client.query('BEGIN');

    // Idempotent claim: only proceed if intent is still pending AND we haven't
    // already stamped this tx_hash on any confirmed row.
    const { rows: existingByTx } = await client.query(
      `SELECT id, status FROM checkout_intents
         WHERE lower(tx_hash) = lower($1) FOR UPDATE`,
      [txHash]
    );
    if (existingByTx.length > 0) {
      const existing = existingByTx[0];
      if (existing.status === 'confirmed') {
        await client.query('COMMIT');
        return { ok: true, intentId: existing.id, reason: 'already_confirmed' };
      }
    }

    // Match by amount + address if tx_hash wasn't pre-recorded by the frontend.
    // (Frontend records tx_hash immediately after Privy sendTransaction, but
    // there's a race window where the webhook fires first.)
    // Rescue window: an EXPIRED intent still matches via tx_hash for 24h after
    // creation — covers late-arriving webhooks after the 20-min intent expiry.
    const { rows: intentRows } = await client.query(
      `SELECT id, user_id, amount_usd, entitlement_spec, surface, receiving_address, status
         FROM checkout_intents
        WHERE provider = 'wallet_usdc'
          AND status IN ('pending', 'expired')
          AND created_at > NOW() - INTERVAL '24 hours'
          AND (
            lower(tx_hash) = lower($1)
            OR (
              status = 'pending'
              AND tx_hash IS NULL
              AND expected_amount_usdc = $2
              AND expires_at > NOW()
              -- Fallback match must be bound to the SENDER's wallet or two
              -- users with identical pending amounts could cross-fulfill.
              AND user_id::text = (
                SELECT id::text FROM users
                 WHERE lower(wallet_address) = lower($3) LIMIT 1
              )
            )
          )
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      // See ETH counterpart above — null over '' avoids empty-string collision.
      [txHash, amountReceived, fromAddress || null]
    );
    if (intentRows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'no_matching_intent' };
    }
    const intent = intentRows[0];
    intentIdForFallback = intent.id;

    // Amount guard — the tx_hash-primary match still gets amount-validated here
    // so a $0.01 transfer can't fulfill a $9.99 intent even if the frontend
    // recorded the wrong hash.
    if (Math.abs(Number(intent.amount_usd) - Number(amountReceived)) > 0.01) {
      await client.query(
        `UPDATE checkout_intents SET status = 'failed',
             grant_result = jsonb_build_object('reason', 'amount_mismatch', 'received', $2::text, 'expected', amount_usd::text),
             tx_hash = $3
           WHERE id = $1`,
        [intent.id, amountReceived, txHash]
      );
      await client.query('COMMIT');
      logger.warn('[walletCheckout] amount_mismatch', {
        intentId: intent.id, expected: intent.amount_usd, received: amountReceived, txHash,
      });
      return { ok: false, reason: 'amount_mismatch', intentId: intent.id };
    }

    // Grant the entitlement.
    let entitlementSpec;
    try {
      entitlementSpec = typeof intent.entitlement_spec === 'string'
        ? JSON.parse(intent.entitlement_spec)
        : (intent.entitlement_spec || {});
    } catch { entitlementSpec = {}; }

    const fulfillment = await _fulfill(client, {
      userId: intent.user_id,
      entitlementSpec,
      surface: intent.surface,
      provider: 'wallet_usdc',
      intentId: intent.id,
      amountUsd: Number(intent.amount_usd),
    });
    const entitlementId = fulfillment.entitlementId;

    await client.query(
      `UPDATE checkout_intents
         SET status = 'confirmed', fulfilled_at = NOW(),
             tx_hash = $2, from_address = $3, confirmed_at = NOW(),
             grant_result = jsonb_build_object('entitlement_id', $4::bigint, 'received', $5::text, 'rush_credited', $6::int)
       WHERE id = $1`,
      [intent.id, txHash, fromAddress || null, entitlementId, String(amountReceived), fulfillment.rushCredited || 0]
    );

    await client.query('COMMIT');
    _invalidateCaches(intent.user_id).catch(() => {});
    _notifyPurchaseSuccess({
      userId: intent.user_id, surface: intent.surface,
      amountUsd: Number(intent.amount_usd), provider: 'wallet_usdc',
      intentId: intent.id, txHash, chain: 'base',
      entitlementSpec, isLifetime: entitlementSpec?.is_lifetime === true,
    });

    logger.info('[walletCheckout] USDC purchase fulfilled', {
      intentId: intent.id, userId: intent.user_id, surface: intent.surface,
      entitlementId, rushCredited: fulfillment.rushCredited || 0, txHash,
    });

    return { ok: true, intentId: intent.id, entitlementId, rushCredited: fulfillment.rushCredited || 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (intentIdForFallback) {
      await _markGrantFailed(pool, intentIdForFallback, txHash, err.message).catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Fulfill a checkout intent. Dispatches by surface:
 *   - surface === 'rush' → credit balance_tokens via tokenLedger, returns { rushCredited: N }
 *   - anything else       → insert user_entitlements row, returns { entitlementId }
 *
 * Must be called inside an existing transaction (`client` arg) so both the
 * fulfillment write and the intent status flip commit atomically.
 *
 * entitlementSpec shapes:
 *   rush:  { tokens: 315, giftedTokens?: 0, packageId?: 'pkg_50' }
 *   other: { add_on_id, duration_days?, is_lifetime?, creator_id?, scope_id?, auto_renew? }
 */
async function _fulfill(client, { userId, entitlementSpec, surface, provider, intentId, amountUsd }) {
  let fulfillResult;
  if (surface === 'rush') {
    fulfillResult = await _fulfillRush(client, { userId, entitlementSpec, provider, intentId });
  } else if (surface === 'tip') {
    fulfillResult = await _fulfillTip(client, { payerUserId: userId, entitlementSpec, provider, intentId, amountUsd });
  } else if (surface === 'call') {
    fulfillResult = await _fulfillCallBooking(client, { userId, entitlementSpec, provider, intentId, amountUsd });
  } else if (surface === 'crystal_self') {
    fulfillResult = await _fulfillCrystalPass(client, { userId, entitlementSpec, provider, intentId, isGift: false });
  } else if (surface === 'crystal_gift') {
    fulfillResult = await _fulfillCrystalPass(client, { userId, entitlementSpec, provider, intentId, isGift: true });
  } else if (surface === 'crystal_service') {
    fulfillResult = await _fulfillCrystalService(client, { userId, entitlementSpec, provider, intentId, amountUsd });
  } else if (surface === 'channel_pass') {
    fulfillResult = await _fulfillChannelPass(client, { userId, entitlementSpec, provider, intentId, amountUsd });
  } else {
    fulfillResult = await _fulfillEntitlement(client, { userId, entitlementSpec, surface, provider, intentId, amountUsd });
  }

  // Zoho revenue log + CRM sync — fire-and-forget, never blocks fulfillment.
  // Skips wallet_usdc calls when the amount is zero (e.g. founder grants) or
  // when the surface is 'rush' (Ru$h purchases are logged separately via
  // _fulfillRush's own hook to include the token count).
  setImmediate(async () => {
    try {
      const zohoBooks = require('./zohoBooksService');
      if (!zohoBooks.isConfigured()) return;
      if (Number(amountUsd) <= 0) return;

      // Build a human-readable SKU per surface so P&L breaks down by product.
      const spec = entitlementSpec || {};
      const skuMap = {
        rush:            `Ru$h tokens${spec.packageId ? ` — ${spec.packageId}` : (spec.tokens ? ` — ${spec.tokens}` : '')}`,
        tip:             `Tip${spec.creatorId ? ` → ${String(spec.creatorId).slice(0, 12)}` : ''}`,
        call:            `Private call${spec.creatorId ? ` — ${String(spec.creatorId).slice(0, 12)}` : ''}`,
        crystal_self:    'Crystal Creator Pass — Self',
        crystal_gift:    'Crystal Creator Pass — Gift',
        crystal_service: `Crystal service — ${spec.serviceType || 'unknown'}`,
        channel_pass:    `Channel Pass${spec.creatorId ? ` — ${String(spec.creatorId).slice(0, 12)}` : ''}`,
        prime:           `PRIME — ${spec.add_on_id || spec.plan_id || 'plan'}`,
        membership:      `Membership — ${spec.add_on_id || spec.plan_id || 'plan'}`,
        creator_sub:     `Creator sub${spec.creator_id || spec.creatorId ? ` — ${String(spec.creator_id || spec.creatorId).slice(0, 12)}` : ''}`,
        channel:         `Channel access${spec.creator_id ? ` — ${String(spec.creator_id).slice(0, 12)}` : ''}`,
        hangout:         `Hangout access${spec.creator_id ? ` — ${String(spec.creator_id).slice(0, 12)}` : ''}`,
        donation:        'Donation',
      };
      const sku = skuMap[surface] || `Purchase — ${surface}`;

      const { rows: uRows } = await query(
        `SELECT email, first_name, username FROM users WHERE id = $1`, [String(userId)]
      );
      const u = uRows[0] || {};

      await zohoBooks.logRevenue({
        buyerUserId: String(userId),
        buyerEmail: u.email || null,
        buyerName: u.first_name || null,
        buyerUsername: u.username || null,
        sku,
        priceCents: Math.round((Number(amountUsd) || 0) * 100),
        provider: `wallet_${(entitlementSpec?.rail || 'usdc')}`,
        reference: `checkout_intent:${intentId}`,
        notes: spec.creatorId || spec.creator_id
          ? `Recipient creator: ${spec.creatorId || spec.creator_id}`
          : (spec.serviceType ? `Service: ${spec.serviceType}` : null),
      });
    } catch (err) {
      logger.warn('[walletCheckout._fulfill] Books logRevenue hook failed', {
        surface, intentId, error: err.message,
      });
    }

    // CRM sync — refresh the buyer's contact so tier/earnings/subs update
    try {
      require('./zohoSyncService').syncOneUser(String(userId)).catch(() => {});
    } catch { /* no-op if module missing */ }
  });

  return fulfillResult;
}

/**
 * Fulfill a Channel Pass wallet-USDC purchase. Delegates to
 * channelPassService.fulfillChannelPassFromPayment with the caller's client
 * so both writes commit atomically with the intent status flip.
 *
 * entitlementSpec: { creatorId, type:'channel_pass' }
 * Server re-loads creator's authoritative price and validates against amountUsd.
 */
async function _fulfillChannelPass(client, { userId, entitlementSpec, provider, intentId, amountUsd }) {
  const { creatorId } = entitlementSpec || {};
  if (!creatorId) {
    throw new Error(`_fulfillChannelPass: creatorId required (intentId=${intentId})`);
  }

  const { rows: crRows } = await client.query(
    `SELECT channel_pass_enabled, channel_pass_price_usd
       FROM users WHERE id = $1::text LIMIT 1`,
    [String(creatorId)]
  );
  const cr = crRows[0];
  if (!cr || !cr.channel_pass_enabled || cr.channel_pass_price_usd == null) {
    throw new Error(`_fulfillChannelPass: creator ${creatorId} has no active pass (intentId=${intentId})`);
  }

  const authPriceCents = Math.round(Number(cr.channel_pass_price_usd) * 100);
  const declaredCents  = Math.round((Number(amountUsd) || 0) * 100);
  if (Math.abs(authPriceCents - declaredCents) > 1) {
    throw new Error(`_fulfillChannelPass: price mismatch (intent=${declaredCents}¢ expected=${authPriceCents}¢)`);
  }

  const channelPassService = require('./channelPassService');
  const result = await channelPassService.fulfillChannelPassFromPayment({
    userId:          String(userId),
    creatorId:       String(creatorId),
    priceUsd:        Number(cr.channel_pass_price_usd),
    sourceProvider:  `wallet_${provider || 'usdc'}`,
    sourceRef:       `checkout_intent:${intentId}`,
    externalClient:  client,
  });

  logger.info('[walletCheckout] _fulfillChannelPass: fulfilled', {
    intentId, userId, creatorId, priceUsd: cr.channel_pass_price_usd,
    subscriptionId: result.subscription_id, alreadyFulfilled: result.already_fulfilled,
  });
  return { subscriptionId: result.subscription_id, alreadyApplied: !!result.already_fulfilled };
}

/**
 * Fulfill a Crystal Service booking (private call, custom content, priority
 * DM, private main stage, BTS subscription). Server-side re-loads the
 * service row and re-verifies audience gating before recording the booking
 * so a client can't spoof serviceId/creator/price.
 *
 * entitlementSpec: { serviceId, creatorUserId, serviceType, buyerNote?, fulfillmentDays? }
 */
async function _fulfillCrystalService(client, { userId, entitlementSpec, provider, intentId, amountUsd }) {
  const { serviceId, creatorUserId, buyerNote = null } = entitlementSpec || {};
  if (!serviceId || !creatorUserId) {
    throw new Error(`_fulfillCrystalService: serviceId + creatorUserId required (intentId=${intentId})`);
  }

  const CrystalSvc = require('./crystalServiceService');
  // Re-verify — spec was written when intent was created, but audience may
  // have changed OR service may have been deactivated in the interim.
  const audience = await CrystalSvc.getViewerAudience(String(userId));
  const gate = await CrystalSvc.loadServiceForBooking(String(serviceId), audience);
  if (gate.gate !== 'ok') {
    throw new Error(`_fulfillCrystalService: gate=${gate.gate} for serviceId=${serviceId}, userId=${userId}`);
  }
  if (String(gate.service.creator_user_id) !== String(creatorUserId)) {
    throw new Error(`_fulfillCrystalService: creator mismatch (intentId=${intentId})`);
  }

  // Server-authoritative price check — client's declared amountUsd must match
  // the service's DB price (within 1 cent tolerance for float rounding).
  const priceCents = Number(gate.price_cents);
  const declaredCents = Math.round((Number(amountUsd) || 0) * 100);
  if (Math.abs(priceCents - declaredCents) > 1) {
    throw new Error(`_fulfillCrystalService: price mismatch (intent=${declaredCents}¢ expected=${priceCents}¢) — refusing to fulfill`);
  }
  const paymentRef = `checkout_intent:${intentId}`;

  const { bookingId, alreadyApplied } = await CrystalSvc.recordBooking({
    serviceId: Number(serviceId),
    creatorUserId: String(creatorUserId),
    buyerUserId: String(userId),
    serviceType: gate.service.service_type,
    priceCents,
    paymentProvider: provider,
    paymentRef,
    buyerNote,
    fulfillmentDays: gate.service.fulfillment_days,
  });

  if (alreadyApplied) {
    logger.info('[walletCheckout] _fulfillCrystalService: idempotent — booking already existed', {
      bookingId, intentId, serviceId,
    });
    return { bookingId, alreadyApplied: true };
  }

  // LiveKit auto-schedule for private_call / private_main_stage.
  // Deterministic room name so re-runs / retries land on the same room; the
  // /private-call/:bookingId frontend page fetches a fresh token from
  // /api/creator/services/bookings/:bookingId/livekit-token when either party
  // joins. Stored on booking.metadata so the endpoint can validate ownership.
  const isLiveKitCall = gate.service.service_type === 'private_call'
                       || gate.service.service_type === 'private_main_stage';
  const livekitRoomName = isLiveKitCall ? `crystal-call-${bookingId}` : null;
  if (isLiveKitCall) {
    try {
      await query(
        `UPDATE creator_service_bookings
            SET metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('livekitRoomName', $2::text)
          WHERE id = $1`,
        [bookingId, livekitRoomName]
      );
    } catch (err) {
      logger.warn('[walletCheckout] _fulfillCrystalService: livekit room name write failed (non-fatal)', {
        bookingId, error: err.message,
      });
    }
  }

  // Fire-and-forget notifications: creator DM + buyer DM (LiveKit call links)
  // + Slack ops ping.
  setImmediate(async () => {
    try {
      const { rows: buyerRows } = await query(
        `SELECT username, first_name FROM users WHERE id = $1`, [String(userId)]
      );
      const buyer = buyerRows[0] || {};
      const buyerHandle = buyer.username ? `@${buyer.username}` : (buyer.first_name || String(userId).slice(0, 8));
      const priceUsd = (priceCents / 100).toFixed(0);
      const callLink = livekitRoomName
        ? `https://pnptv.app/private-call/${bookingId}`
        : null;

      // Creator DM — new booking notification. Includes call link if applicable.
      const creatorDm = livekitRoomName
        ? `💎 New booking — ${gate.service.service_type.replace(/_/g, ' ')} — $${priceUsd} paid.\nFrom: ${buyerHandle}${buyerNote ? `\nNote: ${String(buyerNote).slice(0, 300)}` : ''}\n\n📞 Coordinate the time with them, then join the private LiveKit room:\n${callLink}\n\nManage: https://pnptv.app/creators/services`
        : `💎 New booking — ${gate.service.service_type.replace(/_/g, ' ')} — $${priceUsd} paid.\nFrom: ${buyerHandle}${buyerNote ? `\nNote: ${String(buyerNote).slice(0, 300)}` : ''}\n\nManage: https://pnptv.app/creators/services`;

      let bot = null;
      try { bot = require('../bot/core/bot'); } catch { /* no bot */ }
      if (bot?.telegram && /^\d+$/.test(String(creatorUserId))) {
        await bot.telegram.sendMessage(creatorUserId, creatorDm).catch(() => {});
      }

      // Buyer DM — only for LiveKit calls; other services (custom_content,
      // priority_dm, bts_subscription) don't need a call link.
      if (livekitRoomName && bot?.telegram && /^\d+$/.test(String(userId))) {
        const creatorHandle = gate.service.username
          ? `@${gate.service.username}`
          : (gate.service.first_name || 'the creator');
        const buyerDm = `💎 Your ${gate.service.service_type.replace(/_/g, ' ')} with ${creatorHandle} is confirmed.\n\n📞 Coordinate the time with them, then join the private LiveKit room:\n${callLink}\n\nBoth of you need this link — nobody else can join.`;
        await bot.telegram.sendMessage(userId, buyerDm).catch(() => {});
      }

      try {
        const slackOps = require('./slackOpsService');
        slackOps.notifyPaymentSuccess({
          orderId: paymentRef,
          userId: String(userId),
          username: buyerHandle,
          amount: priceUsd,
          currency: 'USD',
          plan: `Crystal service: ${gate.service.service_type}`,
          provider: `wallet_usdc → @${gate.service.username || creatorUserId}`,
        }).catch(() => {});
      } catch { /* non-fatal */ }
    } catch (err) {
      logger.warn('[walletCheckout] _fulfillCrystalService notify hook failed', {
        bookingId, error: err.message,
      });
    }
  });

  logger.info('[walletCheckout] _fulfillCrystalService: booking fulfilled', {
    bookingId, intentId, serviceId, serviceType: gate.service.service_type, priceCents,
  });
  return { bookingId, alreadyApplied: false };
}

/**
 * Fulfill a Crystal Creator wallet-USDC purchase (self or gift).
 *
 * `isGift` is passed by _fulfill() based on the surface ('crystal_self' vs
 * 'crystal_gift') — NEVER read from entitlementSpec to prevent surface spoofing.
 *
 * Server-side prices are authoritative:
 *   crystal_self → CRYSTAL_CREATOR_SELF_PRICE_CENTS ($100)
 *   crystal_gift → CRYSTAL_CREATOR_GIFT_PRICE_CENTS ($150)
 *
 * entitlementSpec accepted fields:
 *   {
 *     creatorId: string,  // for crystal_gift — creator receiving the pass
 *     giftNote: string|null,
 *     months: 1,
 *   }
 *
 * Delegates to creatorService.activateCrystalPass which writes to
 * crystal_creator_passes and updates users.crystal_creator_active_until.
 * Called from within an outer PG transaction — activateCrystalPass uses the
 * module-level `query` (separate pool connection) rather than the passed client
 * because it handles its own transactional logic. The outer intent status flip
 * commits atomically after this returns.
 */
async function _fulfillCrystalPass(client, { userId, entitlementSpec, provider, intentId, isGift }) {
  const {
    CRYSTAL_CREATOR_SELF_PRICE_CENTS,
    CRYSTAL_CREATOR_GIFT_PRICE_CENTS,
  } = require('../config/monetizationConfig');

  // All pricing is server-authoritative — never trusts client-sent amounts.
  const priceCents = isGift ? CRYSTAL_CREATOR_GIFT_PRICE_CENTS : CRYSTAL_CREATOR_SELF_PRICE_CENTS;

  // Target creator:
  //   crystal_self → the purchasing user IS the creator receiving the pass.
  //   crystal_gift → entitlementSpec.creatorId is the creator to gift.
  let targetCreatorId;
  let giftedBy;
  if (isGift) {
    targetCreatorId = entitlementSpec?.creatorId ? String(entitlementSpec.creatorId) : null;
    giftedBy = String(userId);
  } else {
    targetCreatorId = String(userId);
    giftedBy = null;
    // Invite-only guard for self-purchase. initiateUsdcPurchase already checked
    // this before the intent was created, but the fulfill path may be called
    // from the Alchemy webhook (verifyAndFulfillUsdc) so we re-verify here.
    const { rows: invRows } = await query(
      `SELECT crystal_creator_invited_at FROM users WHERE id = $1 LIMIT 1`,
      [String(userId)]
    );
    if (!invRows[0] || !invRows[0].crystal_creator_invited_at) {
      logger.error('[walletCheckout] _fulfillCrystalPass: self-purchase on uninvited user — refusing grant', {
        userId, intentId,
      });
      // Return without granting; the outer transaction will still mark the
      // intent confirmed so the funds are not lost — ops team resolves manually.
      return { entitlementId: null, rushCredited: 0, giftedCredited: 0, crystalCreatorActivated: false };
    }
  }

  const giftNote = typeof entitlementSpec?.giftNote === 'string'
    ? entitlementSpec.giftNote.slice(0, 500)
    : null;
  const months = Number(entitlementSpec?.months) >= 1 ? Math.min(Number(entitlementSpec.months), 12) : 1;

  if (!targetCreatorId) {
    throw new Error(`_fulfillCrystalPass: creatorId required in entitlementSpec for crystal_gift (intentId=${intentId})`);
  }

  // creatorService.activateCrystalPass uses the shared pool (module-level query),
  // not the transaction client — it manages its own UPDATE on crystal_creator_passes
  // and users. The outer transaction wraps only the intent status flip.
  const CreatorSvc = require('./creatorService');
  await CreatorSvc.activateCrystalPass(String(targetCreatorId), {
    isGift,
    giftedBy,
    giftNote: isGift ? giftNote : null,
    months,
    provider,
    ref: `checkout_intent:${intentId}`,
    priceCents,
  });

  // Fire-and-forget in-app notification to target creator.
  setImmediate(() => {
    try {
      const NotificationEmitter = require('./notificationEmitter');
      const msgType = isGift ? 'crystal_creator_gifted' : 'crystal_creator_activated';
      const msgText = isGift
        ? 'A fan just gifted you a Crystal Creator pass — your badge is now active!'
        : 'Your Crystal Creator pass is now active! Enjoy your new benefits.';
      NotificationEmitter.emit({
        type: msgType,
        category: 'commerce',
        priority: 'high',
        targetUserId: String(targetCreatorId),
        entityType: 'crystal_creator_pass',
        entityId: String(intentId),
        message: msgText,
        metadata: { url: '/creator/dashboard', pushTitle: 'Crystal Creator activated!', pushBody: msgText },
      }).catch(() => {});
    } catch { /* non-fatal */ }
  });

  // Fire-and-forget Slack ops ping (no dollar amounts — price-secrecy invariant).
  setImmediate(async () => {
    try {
      const slackOps = require('./slackOpsService');
      const { rows } = await query(`SELECT username FROM users WHERE id = $1`, [String(targetCreatorId)]).catch(() => ({ rows: [] }));
      const handle = rows[0]?.username ? `@${rows[0].username}` : String(targetCreatorId);
      const label = isGift ? 'gift' : 'self-purchase';
      slackOps.notifyPaymentSuccess({
        orderId: `checkout_intent:${intentId}`,
        userId: String(targetCreatorId),
        username: handle,
        amount: '',
        currency: '',
        plan: `Crystal Creator pass (${label}) — wallet`,
        provider: 'wallet_usdc',
      }).catch(() => {});
    } catch { /* non-fatal */ }
  });

  logger.info('[walletCheckout] Crystal Creator pass activated via wallet_usdc', {
    intentId, targetCreatorId, isGift, priceCents, provider,
  });

  // Return shape consistent with _fulfillEntitlement for the verify-tx caller.
  return { entitlementId: null, rushCredited: 0, giftedCredited: 0, crystalCreatorActivated: true };
}

/**
 * Fulfill a wallet-USDC call package purchase. Creates the payments row
 * (status='completed'), grants call credits, and — when slot times are on
 * the spec — inserts a confirmed bookings row. All in the outer transaction
 * so replayed webhooks are naturally deduped by the checkout_intents FOR
 * UPDATE lock plus call_credits.payment_id UNIQUE.
 */
async function _fulfillCallBooking(client, { userId, entitlementSpec, provider, intentId, amountUsd }) {
  const { v4: uuidv4 } = require('uuid');
  const { packageId, creator_id, startAt = null, endAt = null, clientNotes = null, email = null } =
    entitlementSpec || {};
  if (!packageId) throw new Error('_fulfillCallBooking: packageId required');
  if (!creator_id) throw new Error('_fulfillCallBooking: creator_id required');

  const pkgRes = await client.query(
    `SELECT id, sku, quantity, duration_minutes, price_usd, creator_id, is_active
       FROM call_packages WHERE id = $1`,
    [packageId]
  );
  if (pkgRes.rows.length === 0) throw new Error(`_fulfillCallBooking: package ${packageId} not found`);
  const pkg = pkgRes.rows[0];
  if (!pkg.is_active) throw new Error(`_fulfillCallBooking: package ${packageId} inactive`);
  if (String(pkg.creator_id) !== String(creator_id)) {
    throw new Error(`_fulfillCallBooking: package ${packageId} does not belong to creator ${creator_id}`);
  }

  const paymentId = uuidv4();
  const meta = {
    type: 'call_package',
    packageId: pkg.id,
    packageSku: pkg.sku,
    creatorId: pkg.creator_id,
    email: email || null,
    intentId,
    ...(startAt && endAt ? { startTimeUtc: startAt, endTimeUtc: endAt, clientNotes } : {}),
  };
  await client.query(
    `INSERT INTO payments (id, reference, user_id, plan_id, provider, amount, currency, status, metadata, created_at, updated_at)
       VALUES ($1, $1, $2, NULL, $3, $4, 'USD', 'completed', $5::jsonb, NOW(), NOW())`,
    [paymentId, String(userId), provider, Number(amountUsd), JSON.stringify(meta)]
  );

  const creditRes = await client.query(
    `INSERT INTO call_credits (member_id, creator_id, package_id, quantity_total, payment_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (payment_id) DO NOTHING
       RETURNING id`,
    [String(userId), pkg.creator_id, pkg.id, pkg.quantity, paymentId]
  );
  const creditId = creditRes.rows[0]?.id || null;

  let bookingId = null;
  if (startAt && endAt) {
    const performerRes = await client.query(
      `SELECT id FROM performers WHERE user_id = $1 LIMIT 1`,
      [String(pkg.creator_id)]
    );
    const performerId = performerRes.rows[0]?.id;
    if (performerId) {
      const priceCents = Math.round(Number(pkg.price_usd) * 100);
      const bookingRes = await client.query(
        `INSERT INTO bookings
           (user_id, performer_id, package_id, payment_id, credit_id,
            start_time_utc, end_time_utc, status, call_type,
            duration_minutes, price_cents, currency, client_notes)
         VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,
                 'confirmed','video',$8,$9,'USD',$10::text)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          String(userId), performerId, pkg.id, paymentId, creditId,
          startAt, endAt, pkg.duration_minutes, priceCents,
          clientNotes ? String(clientNotes).slice(0, 1000) : null,
        ]
      );
      bookingId = bookingRes.rows[0]?.id || null;
    }
  }

  return {
    entitlementId: null,
    rushCredited: 0,
    giftedCredited: 0,
    callCreditId: creditId,
    bookingId,
    paymentId,
  };
}

/**
 * Fulfill a wallet-USDC tip to a creator. Credits creator_earnings with
 * TIP_CREATOR_RATE (100% to creator per monetizationConfig) and NO entitlement.
 * The `source_payment_id` = `wallet_tip:<intentId>` guarantees a unique row
 * so a replayed webhook is a no-op via the unique constraint.
 */
async function _fulfillTip(client, { payerUserId, entitlementSpec, provider, intentId, amountUsd }) {
  const { creator_id, message = null } = entitlementSpec || {};
  if (!creator_id) throw new Error('_fulfillTip: creator_id required');
  if (String(creator_id) === String(payerUserId)) throw new Error('_fulfillTip: cannot tip yourself');
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('_fulfillTip: amountUsd must be > 0');

  const { TIP_CREATOR_RATE } = require('../config/monetizationConfig');
  const amountGross = Number(amountUsd);
  const amountCreator = Math.round(amountGross * TIP_CREATOR_RATE * 100) / 100;
  const amountPlatform = Math.round((amountGross - amountCreator) * 100) / 100;

  const sourcePaymentId = `wallet_tip:${intentId}`;
  const { rows } = await client.query(
    `INSERT INTO creator_earnings
       (creator_id, amount_gross, amount_creator, amount_platform, status, available_at,
        source_payment_id, is_tip, metadata)
     VALUES ($1, $2, $3, $4, 'available', NOW(), $5, true, $6::jsonb)
     ON CONFLICT (source_payment_id, creator_id) DO NOTHING
     RETURNING id`,
    [String(creator_id), amountGross, amountCreator, amountPlatform, sourcePaymentId,
     JSON.stringify({ payerUserId: String(payerUserId), message, provider })]
  );

  // Fire-and-forget: real-time push to the creator so they can react during
  // an active call/stream. Deliberately outside the transaction — a failed
  // push must never rollback the tip credit.
  if (rows[0]?.id) {
    setImmediate(() => {
      try {
        const push = require('./pushNotificationService');
        push.sendToUser(String(creator_id), {
          title: `💸 Tip received: $${amountCreator.toFixed(2)}`,
          body: message ? `"${String(message).slice(0, 80)}"` : 'From a supporter — tap to open payouts.',
          url: '/creator/payouts',
          icon: '/Logo2-50.png',
        }).catch(() => {});
      } catch { /* push service optional */ }
    });
  }

  return {
    entitlementId: null,
    rushCredited: 0,
    giftedCredited: 0,
    tipEarningsId: rows[0]?.id || null,
    creatorNetCents: Math.round(amountCreator * 100),
  };
}

async function _fulfillRush(client, { userId, entitlementSpec, provider, intentId }) {
  const { tokens, giftedTokens = 0, packageId = null } = entitlementSpec || {};
  const balanceDelta = Number(tokens) || 0;
  const giftedDelta = Number(giftedTokens) || 0;
  if (balanceDelta <= 0 && giftedDelta <= 0) {
    throw new Error(`_fulfillRush: at least one of tokens/giftedTokens must be > 0 (intent ${intentId})`);
  }
  const creditRes = await tokenLedger.credit({
    userId: String(userId),
    balanceDelta,
    giftedDelta,
    reason: 'purchase',
    sourceType: 'checkout_intent',
    sourceId: String(intentId),
    actorId: 'user',
    metadata: { surface: 'rush', packageId, provider },
    externalClient: client,
  });
  return {
    rushCredited: balanceDelta,
    giftedCredited: giftedDelta,
    balanceAfter: creditRes.balance_after,
    ledgerId: creditRes.ledger_id,
    // Kept for uniform return shape at call sites.
    entitlementId: null,
  };
}

async function _fulfillEntitlement(client, { userId, entitlementSpec, surface, provider, intentId, amountUsd }) {
  const {
    add_on_id, duration_days, is_lifetime = false,
    creator_id = null, scope_id = null, auto_renew = true,
  } = entitlementSpec || {};

  if (!add_on_id) throw new Error(`_fulfillEntitlement: add_on_id required (surface=${surface})`);

  // Guard: if a lifetime row already exists for (user, add_on, creator), the DB
  // trigger `protect_lifetime_entitlements` will block the ON CONFLICT UPDATE
  // below and 500 the verify-tx after USDC already moved. Detect early and
  // no-op — the user already has the benefit forever.
  const existing = await client.query(
    `SELECT id, is_lifetime FROM user_entitlements
      WHERE user_id = $1 AND add_on_id = $2
        AND creator_id IS NOT DISTINCT FROM $3
      LIMIT 1`,
    [String(userId), add_on_id, creator_id]
  );
  if (existing.rows[0]?.is_lifetime === true) {
    logger.warn('walletCheckout._fulfillEntitlement: skipping — user already has lifetime', {
      userId: String(userId), add_on_id, creator_id, intentId, surface, existingId: existing.rows[0].id,
    });
    return { entitlementId: Number(existing.rows[0].id), rushCredited: 0, giftedCredited: 0, alreadyLifetime: true };
  }

  // Whitelist duration_days to a bounded integer to prevent SQL-injection into
  // the INTERVAL expression via objects that override valueOf. Bounds: 1–3650.
  const rawDays = Number(duration_days);
  const safeDays = Number.isInteger(rawDays) && rawDays > 0 && rawDays <= 3650
    ? rawDays : 30;

  // Parameterize the INTERVAL through explicit multiplication so no string
  // interpolation reaches Postgres text ($N is bound, safe from injection).
  // Extension math on ON CONFLICT: `GREATEST(current, NOW()) + interval` — so a
  // second payment while the sub is still active stacks a fresh 30-day window
  // on top of the remaining time. The old MAX(current, NOW()+30d) silently
  // dropped the top-up when current already extended past NOW() (bit us with
  // intent 269 on 2026-08-31 — user paid twice, got 30d + 27s).
  const { rows } = await client.query(
    `INSERT INTO user_entitlements
       (user_id, add_on_id, is_lifetime, expires_at, creator_id, source_plan_id, source_payment_id, auto_renew, grant_source)
     VALUES (
       $1, $2, $3,
       CASE WHEN $9::boolean THEN NULL ELSE NOW() + ($10::int * INTERVAL '1 day') END,
       $4, $5, $6, $7, $8
     )
     ON CONFLICT (user_id, add_on_id, creator_id) DO UPDATE
       SET expires_at        = CASE WHEN $9::boolean THEN NULL
                                    ELSE GREATEST(user_entitlements.expires_at, NOW()) + ($10::int * INTERVAL '1 day')
                               END,
           is_lifetime       = user_entitlements.is_lifetime OR EXCLUDED.is_lifetime,
           auto_renew        = EXCLUDED.auto_renew,
           source_payment_id = EXCLUDED.source_payment_id,
           source_plan_id    = EXCLUDED.source_plan_id,
           grant_source      = EXCLUDED.grant_source,
           is_consumed       = false,
           granted_at        = NOW(),
           updated_at        = NOW()
     RETURNING id`,
    [
      String(userId),
      add_on_id,
      is_lifetime === true,
      creator_id,
      scope_id || null,
      `checkout_intent:${intentId}`,
      auto_renew === true && is_lifetime !== true,
      `wallet_checkout:${provider}`,
      is_lifetime === true,
      safeDays,
    ]
  );

  // Creator revenue split — every wallet_usdc purchase of a creator_sub (or any
  // entitlement scoped to a specific creator) must credit creator_earnings at
  // the canonical rate. Legacy paymentService.js has the same insert for
  // NowPayments/Meru/BTCPay paths; the new wallet rail was missing it and
  // silently dropped ~3 payments to DUKEOFDENSITY on 2026-08-31 before we
  // caught it. Held for EARNINGS_HOLD_HOURS to cover chargeback window.
  if (creator_id && surface === 'creator_sub' && Number(amountUsd) > 0) {
    try {
      const {
        CREATOR_REVENUE_RATE, EARNINGS_HOLD_HOURS,
      } = require('../config/monetizationConfig');
      const gross = Number(amountUsd);
      const amountCreator = Math.round(gross * CREATOR_REVENUE_RATE * 100) / 100;
      const amountPlatform = Math.round((gross - amountCreator) * 100) / 100;
      // The unique index `creator_earnings_source_payment_creator_unique` is
      // partial (WHERE source_payment_id IS NOT NULL) — Postgres needs the
      // constraint referenced by name in ON CONFLICT for partial indexes.
      await client.query(
        `INSERT INTO creator_earnings
           (creator_id, amount_gross, amount_creator, amount_platform, status,
            available_at, source_payment_id, period_month)
         VALUES ($1, $2, $3, $4, 'holding', NOW() + ($5 || ' hours')::interval, $6,
                 date_trunc('month', CURRENT_DATE))
         ON CONFLICT ON CONSTRAINT creator_earnings_source_payment_creator_unique
           DO NOTHING`,
        [String(creator_id), gross, amountCreator, amountPlatform,
         String(EARNINGS_HOLD_HOURS), `checkout_intent:${intentId}`]
      );
    } catch (e) {
      logger.warn('[walletCheckout] creator_earnings insert failed', {
        creator_id, intentId, amountUsd, err: e.message,
      });
    }
  }

  return { entitlementId: Number(rows[0].id), rushCredited: 0, giftedCredited: 0 };
}

function _reasonForSurface(surface) {
  switch (surface) {
    case 'membership':
    case 'prime':
    case 'creator_sub':
    case 'channel':
    case 'hangout':
      return 'membership_purchase';
    case 'call':      return 'call_book';
    case 'rush':      return 'purchase';
    case 'donation':  return 'purchase';
    default:          return 'purchase';
  }
}

async function _invalidateCaches(userId) {
  const uid = String(userId);
  await Promise.all([
    cache.del(`wallet:${uid}`).catch(() => {}),
    cache.del(`wallet:obj:${uid}`).catch(() => {}),
    cache.del(`entitlements:${uid}`).catch(() => {}),
    cache.del(`user:tier:${uid}`).catch(() => {}),
  ]);
}

/**
 * Post-sale notifications for wallet-checkout grants. Matches parity with the
 * legacy providers (NowPayments/Banxa) which fire the same two channels
 * from paymentSettlementService. Fire-and-forget — never rejects. Never call
 * this before the grant is committed; callers must invoke after their COMMIT.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.surface        'membership'|'prime'|'creator_sub'|'channel'|'hangout'|'rush'|'call'|'tip'
 * @param {number} opts.amountUsd
 * @param {string} opts.provider       'wallet_usdc'|'wallet_rush'
 * @param {number} opts.intentId
 * @param {string} [opts.txHash]       On-chain hash (usdc/eth path only)
 * @param {string} [opts.chain]        'base' (default)
 * @param {object} [opts.entitlementSpec]  For resolving plan name (add_on_id, tokens count, etc.)
 * @param {boolean} [opts.isLifetime]
 * @param {string} [opts.expiresAt]    ISO string when set, else null
 */
function _notifyPurchaseSuccess(opts) {
  // Deliberately non-blocking. Wrapped in setImmediate so a slow SMTP or
  // Slack API call can't extend the parent request latency.
  setImmediate(async () => {
    try {
      const {
        userId, surface, amountUsd, provider, intentId,
        txHash = null, chain = 'base', entitlementSpec = {},
        isLifetime = false, expiresAt = null,
      } = opts || {};

      // Skip zero-value or unrecognised surfaces.
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;
      if (surface === 'tip') return;  // tips get their own creator push already
      if (surface === 'donation') return;  // no receipt for donations

      const planName = await _resolvePlanNameForNotify(surface, entitlementSpec);

      // Email receipt (best-effort, silent on failure).
      try {
        const PaymentNotificationService = require('./paymentNotificationService');
        await PaymentNotificationService.deliverPurchaseConfirmation(String(userId), {
          planId: entitlementSpec?.add_on_id || surface,
          planName,
          amount: amountUsd,
          transactionId: txHash || `wallet-intent:${intentId}`,
          provider: provider === 'wallet_rush' ? 'wallet_rush' : 'wallet_usdc',
          expiryDate: expiresAt,
          isLifetime: isLifetime === true,
        });
      } catch (emailErr) {
        logger.warn('[walletCheckout] email receipt failed (non-critical)', {
          userId, intentId, err: emailErr.message,
        });
      }

      // Slack ops ping — matches legacy provider format.
      try {
        const slackOps = require('./slackOpsService');
        await slackOps.notifyPaymentSuccess({
          orderId: `intent:${intentId}`,
          userId,
          amount: amountUsd,
          currency: 'USD',
          plan: planName,
          txId: txHash || `intent:${intentId}`,
          provider: provider === 'wallet_rush' ? 'Wallet (Ru$h)' : `Wallet USDC (${chain})`,
        });
      } catch (slackErr) {
        logger.warn('[walletCheckout] slack ops ping failed (non-critical)', {
          userId, intentId, err: slackErr.message,
        });
      }
    } catch (fatal) {
      logger.error('[walletCheckout] _notifyPurchaseSuccess unexpected', {
        err: fatal.message,
      });
    }
  });
}

async function _resolvePlanNameForNotify(surface, entitlementSpec) {
  // Ru$h → describe the token grant, no add_on to look up.
  if (surface === 'rush') {
    const tokens = Number(entitlementSpec?.tokens) || 0;
    const gifted = Number(entitlementSpec?.giftedTokens) || 0;
    const total = tokens + gifted;
    return total > 0 ? `${total.toLocaleString()} Ru$h` : 'Ru$h Package';
  }
  if (surface === 'call') return 'Private Call Booking';
  const addOnId = entitlementSpec?.add_on_id;
  if (!addOnId) return surface || 'Purchase';
  try {
    const { rows } = await query(
      `SELECT name FROM add_ons WHERE id = $1 LIMIT 1`,
      [addOnId]
    );
    return rows[0]?.name || addOnId;
  } catch {
    return addOnId;
  }
}

// ── Wallet-required middleware ────────────────────────────────────────────
/**
 * Express middleware factory. Rejects requests with 409 { needsWallet: true }
 * when the session user has no linked wallet_address AND the surface flag is
 * on. Used by every purchase endpoint after Phase 2 wires flags per-surface.
 *
 * @param {string} surface  which surface this route belongs to
 * @returns Express middleware
 */
function requireWalletForSurface(surface) {
  const flags = require('../config/checkoutFlags');
  return async function requireWalletMw(req, res, next) {
    if (!flags.isSurfaceWalletEnabled(surface)) return next();  // legacy path
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'unauthenticated' });
    const { rows } = await query(
      `SELECT wallet_address FROM users WHERE id = $1 LIMIT 1`,
      [String(userId)]
    );
    if (!rows.length || !rows[0].wallet_address) {
      return res.status(409).json({
        needsWallet: true,
        error: 'wallet_required',
        message: 'A wallet is required to complete this purchase.',
      });
    }
    return next();
  };
}

module.exports = {
  initiateRushPurchase,
  initiateUsdcPurchase,
  initiateEthPurchase,
  verifyAndFulfillUsdc,
  verifyAndFulfillEth,
  requireWalletForSurface,
  // Constants exposed for tests / callers
  USDC_BASE_CONTRACT,
  TOKENS_PER_USD,
  INTENT_EXPIRY_MINUTES,
};
