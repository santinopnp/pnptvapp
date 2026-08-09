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
  'tip',  // creator tips (in-call, in-stream, in-hangout) — credits creator earnings, no entitlement
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
      userId, entitlementSpec, surface, provider: 'wallet_rush', intentId,
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
    const { rows: intentRows } = await client.query(
      `SELECT id, user_id, amount_usd, entitlement_spec, surface, receiving_address
         FROM checkout_intents
        WHERE provider = 'wallet_usdc'
          AND status = 'pending'
          AND (
            lower(tx_hash) = lower($1)
            OR (
              tx_hash IS NULL
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
      [txHash, amountReceived, fromAddress || '']
    );
    if (intentRows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'no_matching_intent' };
    }
    const intent = intentRows[0];

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

    logger.info('[walletCheckout] USDC purchase fulfilled', {
      intentId: intent.id, userId: intent.user_id, surface: intent.surface,
      entitlementId, rushCredited: fulfillment.rushCredited || 0, txHash,
    });

    return { ok: true, intentId: intent.id, entitlementId, rushCredited: fulfillment.rushCredited || 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
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
  if (surface === 'rush') {
    return _fulfillRush(client, { userId, entitlementSpec, provider, intentId });
  }
  if (surface === 'tip') {
    return _fulfillTip(client, { payerUserId: userId, entitlementSpec, provider, intentId, amountUsd });
  }
  return _fulfillEntitlement(client, { userId, entitlementSpec, surface, provider, intentId });
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

async function _fulfillEntitlement(client, { userId, entitlementSpec, surface, provider, intentId }) {
  const {
    add_on_id, duration_days, is_lifetime = false,
    creator_id = null, scope_id = null, auto_renew = true,
  } = entitlementSpec || {};

  if (!add_on_id) throw new Error(`_fulfillEntitlement: add_on_id required (surface=${surface})`);

  // Whitelist duration_days to a bounded integer to prevent SQL-injection into
  // the INTERVAL expression via objects that override valueOf. Bounds: 1–3650.
  const rawDays = Number(duration_days);
  const safeDays = Number.isInteger(rawDays) && rawDays > 0 && rawDays <= 3650
    ? rawDays : 30;

  // Parameterize the INTERVAL through explicit multiplication so no string
  // interpolation reaches Postgres text ($N is bound, safe from injection).
  const { rows } = await client.query(
    `INSERT INTO user_entitlements
       (user_id, add_on_id, is_lifetime, expires_at, creator_id, source_plan_id, source_payment_id, auto_renew, grant_source)
     VALUES (
       $1, $2, $3,
       CASE WHEN $9::boolean THEN NULL ELSE NOW() + ($10::int * INTERVAL '1 day') END,
       $4, $5, $6, $7, $8
     )
     ON CONFLICT (user_id, add_on_id, creator_id) DO UPDATE
       SET expires_at   = GREATEST(user_entitlements.expires_at, EXCLUDED.expires_at),
           auto_renew   = EXCLUDED.auto_renew,
           grant_source = EXCLUDED.grant_source,
           updated_at   = NOW()
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
  verifyAndFulfillUsdc,
  requireWalletForSurface,
  // Constants exposed for tests / callers
  USDC_BASE_CONTRACT,
  TOKENS_PER_USD,
  INTENT_EXPIRY_MINUTES,
};
