'use strict';

const { query } = require('../config/postgres');
const { cache } = require('../config/redis');
const crypto = require('crypto');
const logger = require('../config/logger');

const RECEIVING_ADDRESS = process.env.CRYPTO_RECEIVING_ADDRESS;
const ALCHEMY_SIGNING_KEY = process.env.ALCHEMY_SIGNING_KEY;
const USDC_BASE_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ALLOWED_TOKENS = ['USDC', 'ETH'];

// Token-aware amount tolerance for on-chain matching, in native units.
// USDC: 2 cents. ETH: 0.00001 ETH (~$0.03 @ $3000 ETH).
const AMOUNT_TOLERANCE = { USDC: 0.02, ETH: 0.00001 };

const ETH_PRICE_CACHE_KEY = 'crypto:eth-usd-price';
const ETH_PRICE_TTL_SECONDS = 60;

class CryptoPaymentService {
  /** Server-side ETH/USD price with 60s Redis cache. Returns null on total failure. */
  static async getEthUsdPrice() {
    const cached = await cache.get(ETH_PRICE_CACHE_KEY);
    if (cached && typeof cached.usd === 'number' && cached.usd > 0) return cached.usd;
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      if (!res.ok) return null;
      const data = await res.json();
      const usd = data?.ethereum?.usd;
      if (typeof usd !== 'number' || usd <= 0) return null;
      await cache.set(ETH_PRICE_CACHE_KEY, { usd }, ETH_PRICE_TTL_SECONDS);
      return usd;
    } catch (err) {
      logger.warn('CryptoPayment: ETH price fetch failed', { error: err.message });
      return null;
    }
  }

  /**
   * Create a pending payment intent.
   * amountUsd MUST come from the DB (plan price) — never trust the client.
   * For ETH intents the native amount is computed server-side from a cached
   * oracle so the on-chain send is locked to the intent's expectation.
   */
  static async createPaymentIntent({ userId, planId, amountUsd, token = 'USDC', creatorId = null, scopeType = null, scopeId = null }) {
    if (!RECEIVING_ADDRESS) throw new Error('CRYPTO_RECEIVING_ADDRESS not configured');
    if (!ALLOWED_TOKENS.includes(token)) throw new Error(`Unsupported token: ${token}`);

    let expectedNative;
    let expectedUsdcCol = null;
    if (token === 'USDC') {
      expectedNative = parseFloat(amountUsd.toFixed(6));
      expectedUsdcCol = expectedNative;
    } else if (token === 'ETH') {
      const ethUsd = await CryptoPaymentService.getEthUsdPrice();
      if (!ethUsd) {
        const err = new Error('ETH price oracle unavailable, please retry in a moment');
        err.code = 'ETH_PRICE_UNAVAILABLE';
        throw err;
      }
      expectedNative = parseFloat((amountUsd / ethUsd).toFixed(10));
    }

    const { rows } = await query(
      `INSERT INTO crypto_payments
         (user_id, plan_id, chain, token, amount_usd, expected_amount_usdc, expected_amount_native, receiving_address, creator_id, scope_type, scope_id)
       VALUES ($1, $2, 'base', $3, $4, $5, $6, $7, $8::varchar, $9, $10)
       RETURNING id, token, expected_amount_native, receiving_address, expires_at`,
      [userId, planId, token, amountUsd, expectedUsdcCol, expectedNative, RECEIVING_ADDRESS, creatorId || null, scopeType || null, scopeId || null]
    );

    const row = rows[0];
    logger.info('CryptoPayment: intent created', { paymentId: row.id, userId, planId, token, expectedNative });

    return {
      paymentId: row.id,
      receivingAddress: row.receiving_address,
      amountNative: parseFloat(row.expected_amount_native),
      // Legacy alias — same value as amountNative for USDC intents. Clients
      // should migrate to amountNative and stop reading amountUsdc.
      amountUsdc: token === 'USDC' ? parseFloat(row.expected_amount_native) : null,
      chain: 'base',
      token: row.token,
      contractAddress: USDC_BASE_CONTRACT,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Record the tx hash submitted by the frontend after the user signs.
   * MUST verify user_id ownership to prevent intent hijacking.
   * `AND tx_hash IS NULL` locks the field to the first legitimate submission
   * so a follow-up call cannot replace the hash before webhook match.
   */
  static async recordSubmittedTx({ paymentId, txHash, fromAddress, userId }) {
    const { rowCount } = await query(
      `UPDATE crypto_payments
       SET tx_hash = $1, from_address = $2
       WHERE id = $3 AND user_id = $4 AND status = 'pending' AND tx_hash IS NULL AND expires_at > NOW()`,
      [txHash, fromAddress?.toLowerCase(), paymentId, userId]
    );
    if (rowCount === 0) throw new Error('Payment intent not found, expired, already-submitted, or not owned by user');
    logger.info('CryptoPayment: tx submitted', { paymentId, txHash, fromAddress, userId });
  }

  /**
   * Called by the Alchemy webhook handler when a transfer to our address confirms.
   */
  static async handleAlchemyWebhook(payload) {
    const activities = payload?.event?.activity ?? [];
    for (const activity of activities) {
      try {
        await CryptoPaymentService._processActivity(activity);
      } catch (err) {
        logger.error('CryptoPayment: error processing activity', { error: err.message, activity });
      }
    }
  }

  static async _processActivity(activity) {
    const { fromAddress, toAddress, value, asset, hash } = activity;

    if (!hash) return;
    if (!ALLOWED_TOKENS.includes(asset)) return;
    if (toAddress?.toLowerCase() !== RECEIVING_ADDRESS?.toLowerCase()) return;

    const amountReceived = parseFloat(value);
    const from = fromAddress?.toLowerCase();
    const tolerance = AMOUNT_TOLERANCE[asset] ?? 0.02;

    // Primary match: tx_hash (set by recordSubmittedTx before confirmation)
    // Fallback: from_address + token + native-amount within tolerance
    const { rows } = await query(
      `SELECT * FROM crypto_payments
       WHERE status = 'pending'
         AND expires_at > NOW()
         AND token = $3
         AND (
           tx_hash = $1
           OR (from_address = $2 AND ABS(expected_amount_native - $4) < $5)
         )
       ORDER BY
         CASE WHEN tx_hash = $1 THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT 1`,
      [hash, from, asset, amountReceived, tolerance]
    );

    if (rows.length === 0) {
      logger.warn('CryptoPayment: no matching intent for transfer', { hash, from, asset, amountReceived });
      return;
    }

    const payment = rows[0];

    // Amount validation — enforced on BOTH primary (tx_hash) and fallback paths.
    // Without this, a user could pay $0.01 against a $9.99 intent and receive
    // the plan grant. Fallback already filters by tolerance in the WHERE clause;
    // this second check guards the primary tx_hash path.
    const expectedNative = parseFloat(payment.expected_amount_native);
    if (Math.abs(expectedNative - amountReceived) > tolerance) {
      logger.error('CryptoPayment: amount mismatch — rejecting', {
        paymentId: payment.id, expected: expectedNative, received: amountReceived, asset,
      });
      await query(
        `UPDATE crypto_payments SET status = 'failed', grant_result = $1 WHERE id = $2 AND status = 'pending'`,
        [JSON.stringify({ error: 'amount_mismatch', expected: expectedNative, received: amountReceived, asset, ts: new Date().toISOString() }), payment.id]
      );
      return;
    }

    // Atomic idempotency — flip to confirmed exactly once
    const { rowCount } = await query(
      `UPDATE crypto_payments
       SET status = 'confirmed', tx_hash = $1, from_address = $2, confirmed_at = NOW()
       WHERE id = $3 AND status = 'pending'`,
      [hash, from, payment.id]
    );
    if (rowCount === 0) return; // already processed by a concurrent webhook delivery

    logger.info('CryptoPayment: confirmed on-chain', {
      paymentId: payment.id, txHash: hash, userId: payment.user_id, planId: payment.plan_id, asset,
    });

    const PaymentService = require('./paymentService');
    const metadata = {
      provider: 'crypto_base',
      asset,
      txHash: hash,
      fromAddress: from,
      amountReceived,
      ...(payment.creator_id && { creatorId: payment.creator_id }),
      ...(payment.scope_type && { scopeType: payment.scope_type }),
      ...(payment.scope_id && { scopeId: payment.scope_id }),
    };

    try {
      const grantResult = await PaymentService.grantEntitlementsForPlan(
        payment.user_id,
        payment.plan_id,
        'crypto_base',
        metadata,
        `crypto_${payment.id}`
      );
      await query(
        `UPDATE crypto_payments SET grant_result = $1 WHERE id = $2`,
        [JSON.stringify(grantResult), payment.id]
      );
      logger.info('CryptoPayment: entitlements granted', { paymentId: payment.id, userId: payment.user_id, planId: payment.plan_id });
    } catch (grantErr) {
      // Mark as grant_failed so reconciler can retry — do NOT leave in confirmed+null state
      await query(
        `UPDATE crypto_payments SET status = 'grant_failed', grant_result = $1 WHERE id = $2`,
        [JSON.stringify({ error: grantErr.message, ts: new Date().toISOString() }), payment.id]
      );
      logger.error('CryptoPayment: grant failed after on-chain confirm — marked grant_failed', {
        paymentId: payment.id, userId: payment.user_id, planId: payment.plan_id, error: grantErr.message,
      });
      throw grantErr;
    }
  }

  /**
   * Verify Alchemy webhook signature. FAILS CLOSED — rejects all requests if
   * ALCHEMY_SIGNING_KEY is not set, preventing unauthenticated grant of entitlements.
   */
  static verifyAlchemySignature(rawBody, signatureHeader) {
    if (!ALCHEMY_SIGNING_KEY) {
      logger.error('CryptoPayment: ALCHEMY_SIGNING_KEY not set — rejecting webhook request');
      return false;
    }
    if (!signatureHeader) return false;
    const hmac = crypto.createHmac('sha256', ALCHEMY_SIGNING_KEY);
    hmac.update(rawBody, 'utf8');
    const digest = hmac.digest('hex');
    try {
      const sigBuf = Buffer.from(signatureHeader, 'hex');
      const digestBuf = Buffer.from(digest, 'hex');
      if (sigBuf.length !== digestBuf.length) return false;
      return crypto.timingSafeEqual(digestBuf, sigBuf);
    } catch {
      return false;
    }
  }

  /** Poll status — frontend uses this to detect confirmation. */
  static async getStatus(paymentId, userId) {
    const { rows } = await query(
      `SELECT id, status, tx_hash, confirmed_at, expires_at FROM crypto_payments
       WHERE id = $1 AND user_id = $2`,
      [paymentId, userId]
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  /** Expire stale pending intents — called by cron every 15 min. */
  static async expireStale() {
    const { rowCount } = await query(
      `UPDATE crypto_payments SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()`
    );
    if (rowCount > 0) logger.info('CryptoPayment: expired stale intents', { count: rowCount });
  }

  /**
   * Alert on stuck payments. Bounded windows prevent the same rows from
   * spamming logs forever after they age past a reasonable investigation
   * horizon — old rows still surface via a lower-severity separate log.
   */
  static async alertStuck() {
    // Fresh stuck: tx submitted but webhook never arrived (5min–24h old)
    const { rows: freshStuck } = await query(
      `SELECT id, user_id, tx_hash, plan_id, created_at FROM crypto_payments
       WHERE tx_hash IS NOT NULL AND status = 'pending'
         AND created_at < NOW() - INTERVAL '5 minutes'
         AND created_at > NOW() - INTERVAL '24 hours'`
    );
    if (freshStuck.length > 0) {
      logger.error('CryptoPayment: stuck payments — webhook may be down or misconfigured', {
        count: freshStuck.length,
        ids: freshStuck.map((r) => r.id),
      });
    }

    // Fresh grant_failed: on-chain confirmed but grant threw (last 7 days)
    const { rows: freshGrantFailed } = await query(
      `SELECT id, user_id, plan_id FROM crypto_payments
       WHERE status = 'grant_failed'
         AND COALESCE(confirmed_at, created_at) > NOW() - INTERVAL '7 days'`
    );
    if (freshGrantFailed.length > 0) {
      logger.error('CryptoPayment: grant_failed rows need manual review', {
        count: freshGrantFailed.length,
        ids: freshGrantFailed.map((r) => r.id),
      });
    }

    // Aged grant_failed: still unresolved past investigation horizon. Warn (not error)
    // to keep signal on fresh alerts high without silently dropping old rows.
    const { rows: agedGrantFailed } = await query(
      `SELECT COUNT(*)::int AS count FROM crypto_payments
       WHERE status = 'grant_failed'
         AND COALESCE(confirmed_at, created_at) <= NOW() - INTERVAL '7 days'`
    );
    if (agedGrantFailed[0]?.count > 0) {
      logger.warn('CryptoPayment: aged grant_failed rows past 7-day horizon', {
        count: agedGrantFailed[0].count,
      });
    }
  }
}

module.exports = CryptoPaymentService;
