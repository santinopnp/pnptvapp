'use strict';

/**
 * CreatorPayoutService
 *
 * Two responsibilities:
 *  1. runMonthlyPayouts()    — called by cron on 1st of month (00:00 UTC)
 *     Groups all `available` creator_earnings by creator and creates ONE BTCPay
 *     Pull Payment per creator (denominated in USD, claimed in DASH). The
 *     creator gets a viewUrl they open to enter their Dash address and pull the
 *     funds. Earnings rows move to status='in_payout' until the BTCPay webhook
 *     confirms claim completion, at which point they are stamped 'paid_out'.
 *
 *  2. runSubscriptionRenewals() — called by cron daily at 09:00 UTC
 *     Finds active creator_subscriptions expiring within 3 days that have
 *     auto_renew=true, creates a new payment for the subscriber, and on
 *     success extends expires_at by 30 days + records new earnings.
 *     On failure the subscription is cancelled and the subscriber is notified.
 *
 * History note:
 *   Pre-cutover, payouts were direct on-chain USDC transfers from a treasury
 *   private key (`sendDirectUSDCTransfer`). That route was removed when all
 *   creators moved to Dash. Creators who still have a legacy 0x EVM address on
 *   file get notified each cycle to enter a Dash address — earnings roll over
 *   in the meantime. The legacy creator_wallet_address column was dropped in migration 123.
 */

const { query } = require('../config/postgres');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');
const NotificationEmitter = require('./notificationEmitter');

const MINIMUM_PAYOUT_USD = 1.00;

// Weekly approval workflow — Monday 09:00 Bogota -> proposal; Monday 16:00 -> deadline.
// Threshold: creators with < WEEKLY_MINIMUM_USD accrued available earnings are
// SKIPPED this week; their balance carries over to the next weekly cycle. Raised
// from $10 to $100 on 2026-08-03 per operator direction. Override via env var.
const WEEKLY_MINIMUM_USD = Number(process.env.CREATOR_WEEKLY_MIN_USD || 100);
const TRM_FALLBACK_COP = Number(process.env.USD_COP_FALLBACK || 4100);
const DATOSGOV_TRM_URL = 'https://www.datos.gov.co/resource/mcec-87by.json?$order=vigenciadesde%20DESC&$limit=1';

// ── CreatorPayoutService ──────────────────────────────────────────────────────

class CreatorPayoutService {
  /**
   * Run monthly payouts for all creators with available earnings >= $1.00.
   * Called by cron on the 1st of every month at 00:00 UTC.
   *
   * Idempotent: `status = 'available' AND paid_at IS NULL` ensures rows that
   * were already paid in a previous run are never double-paid.
   */
  static async runMonthlyPayouts() {
    logger.info('CreatorPayoutService: starting monthly payout run');

    // Aggregate available earnings by creator; only those meeting the minimum threshold
    let rows;
    try {
      // GROUP BY creator_id only — aggregate user fields with MAX so the same
      // creator never splits into multiple aggregate rows when their profile
      // (dash address, email, etc.) changed mid-month. LEFT JOIN so a creator
      // whose users row was removed (e.g. UUID rename via account dedup) still
      // surfaces in the result with NULL contact fields, surfacing as a SKIP
      // rather than silently dropping their earnings.
      const result = await query(`
        SELECT
          ce.creator_id,
          COALESCE(SUM(ce.amount_creator), 0)::numeric  AS total_creator,
          ARRAY_AGG(ce.id)                               AS earning_ids,
          MAX(u.payout_method)                           AS payout_method,
          MAX(u.fiat_payout_method)                      AS fiat_payout_method,
          MAX(u.fiat_payout_account)                     AS fiat_payout_account,
          MAX(u.creator_payout_destinations)             AS creator_payout_destinations,
          COALESCE(MAX(u.payout_reenroll_needed), false) AS payout_reenroll_needed,
          MAX(u.email)                                   AS email,
          MAX(u.username)                                AS username,
          MAX(u.first_name)                              AS first_name,
          MAX(u.language)                                AS language
        FROM creator_earnings ce
        LEFT JOIN users u ON u.id = ce.creator_id
        WHERE ce.status  = 'available'
          AND ce.paid_at IS NULL
        GROUP BY ce.creator_id
        HAVING COALESCE(SUM(ce.amount_creator), 0) >= $1
      `, [MINIMUM_PAYOUT_USD]);
      rows = result.rows;
    } catch (err) {
      logger.error('CreatorPayoutService: failed to fetch payout batch', { error: err.message });
      return { success: false, error: err.message };
    }

    if (rows.length === 0) {
      logger.info('CreatorPayoutService: no creators with payable earnings this month');
      return { success: true, processed: 0, paid: 0, skipped: 0, failed: 0 };
    }

    logger.info(`CreatorPayoutService: ${rows.length} creator(s) eligible for payout`);

    let paid = 0;
    let skipped = 0;
    let failed = 0;

    for (const creator of rows) {
      try {
        const result = await this._processCreatorPayout(creator);
        if (result.skipped) {
          skipped++;
        } else {
          paid++;
        }
      } catch (err) {
        // Error isolation — one failure must not abort the batch
        failed++;
        logger.error('CreatorPayoutService: payout failed for creator', {
          creatorId: creator.creator_id,
          error: err.message,
        });
      }
    }

    logger.info('CreatorPayoutService: monthly payout run complete', {
      eligible: rows.length,
      paid,
      skipped,
      failed,
    });

    return { success: true, processed: rows.length, paid, skipped, failed };
  }

  /**
   * Remind creators with available earnings but no configured payout method that
   * the monthly payout batch runs in ~3 days. Called on the 28th of each month.
   */
  static async runPayoutReadinessReminders() {
    let rows;
    try {
      const result = await query(`
        SELECT
          ce.creator_id,
          COALESCE(SUM(ce.amount_creator), 0)::numeric          AS total_available,
          MAX(u.payout_method)                                   AS payout_method,
          MAX(u.fiat_payout_method)                              AS fiat_payout_method,
          MAX(u.fiat_payout_account)                             AS fiat_payout_account,
          MAX(u.creator_payout_destinations)                     AS creator_payout_destinations,
          COALESCE(MAX(u.payout_reenroll_needed::int)::bool, false) AS payout_reenroll_needed
        FROM creator_earnings ce
        LEFT JOIN users u ON u.id = ce.creator_id
        WHERE ce.status  = 'available'
          AND ce.paid_at IS NULL
        GROUP BY ce.creator_id
        HAVING COALESCE(SUM(ce.amount_creator), 0) >= $1
      `, [MINIMUM_PAYOUT_USD]);
      rows = result.rows;
    } catch (err) {
      logger.error('CreatorPayoutService: failed to fetch payout readiness batch', { error: err.message });
      return { success: false, error: err.message };
    }

    let reminded = 0;
    for (const creator of rows) {
      const hasFiatMethod = creator.payout_method === 'fiat' && !!creator.fiat_payout_method && !!creator.fiat_payout_account;
      const destinations = creator.creator_payout_destinations || {};
      const hasCryptoLane = !!(destinations.usdc_erc20?.address || destinations.eth?.address);
      if (hasFiatMethod || hasCryptoLane) continue;

      const amountUsd = parseFloat(creator.total_available);
      try {
        await NotificationEmitter.emit({
          type: 'system',
          category: 'commerce',
          priority: 'high',
          actorId: null,
          targetUserId: creator.creator_id,
          entityType: 'creator',
          entityId: String(creator.creator_id),
          message: `Tu pago de $${amountUsd.toFixed(2)} se procesa el martes — configura tu dirección USDC (Ethereum) o ETH en Configuración de Creador para recibirlo.`,
          metadata: { pendingAmountUsd: amountUsd },
        });
        reminded++;
      } catch (err) {
        logger.warn('CreatorPayoutService: payout readiness reminder emit failed', {
          creatorId: creator.creator_id, error: err.message,
        });
      }
    }

    logger.info('CreatorPayoutService: payout readiness reminders sent', { reminded, total: rows.length });
    return { success: true, reminded, total: rows.length };
  }

  /**
   * Process a single creator's payout.
   *
   * Routing order (first match wins):
   *   1. payout_reenroll_needed = true AND no valid crypto lane → skip with nudge.
   *   2. payout_method === 'fiat'  → Peer Protocol fiat off-ramp.
   *   3. creator_payout_destinations.bre_b set → fiat off-ramp via bre_b.
   *   4. creator_payout_destinations.usdc_erc20 set → NowPayments payout.
   *   5. creator_payout_destinations.eth set → NowPayments payout.
   *   6. nothing configured → skip + notify creator to set USDC (Ethereum) address.
   *
   * @param {Object} creator - Row from the aggregate query in runMonthlyPayouts
   * @returns {{ skipped: boolean }}
   */
  static async _processCreatorPayout(creator) {
    const {
      creator_id, total_creator, earning_ids,
      payout_method, fiat_payout_method, fiat_payout_account,
      creator_payout_destinations, payout_reenroll_needed,
      email, username, first_name,
    } = creator;
    const displayName = username || first_name || String(creator_id);
    const amountUsd = parseFloat(total_creator);
    const destinations = creator_payout_destinations || {};

    // Acquire a per-creator Redis lock to prevent concurrent payout runs.
    const payoutLockKey = `payout_lock:${creator_id}`;
    const lockAcquired = await cache.acquireLock(payoutLockKey, 120).catch(() => false);
    if (!lockAcquired) {
      logger.warn('CreatorPayoutService: payout skipped — lock already held for creator', { creatorId: creator_id });
      return { skipped: true };
    }

    const hasFiatMethod = payout_method === 'fiat' && !!fiat_payout_method && !!fiat_payout_account;
    const hasBreB = !!(destinations.bre_b?.handle);
    const hasUsdcErc20 = !!(destinations.usdc_erc20?.address);
    const hasEth = !!(destinations.eth?.address);

    // Creator had a removed lane and has not re-enrolled with ETH/USDC yet — skip.
    if (payout_reenroll_needed && !hasFiatMethod && !hasBreB && !hasUsdcErc20 && !hasEth) {
      logger.warn('CreatorPayoutService: payout skipped — re-enrollment required (removed lane)', { creatorId: creator_id, amountUsd });
      await NotificationEmitter.emit({
        type: 'system', category: 'commerce', priority: 'high', actorId: null,
        targetUserId: creator_id, entityType: 'creator', entityId: String(creator_id),
        message: `Tu pago de $${amountUsd.toFixed(2)} está listo — agrega tu dirección USDC (Ethereum ERC-20) en Configuración de Creador para recibirlo. Tu método anterior ya no está disponible.`,
        metadata: { pendingAmountUsd: amountUsd, earningIds: earning_ids, reason: 'reenroll_required' },
      });
      return { skipped: true };
    }

    if (!hasFiatMethod && !hasBreB && !hasUsdcErc20 && !hasEth) {
      logger.warn('CreatorPayoutService: creator has no valid payout method, skipping', { creatorId: creator_id });
      await NotificationEmitter.emit({
        type: 'system', category: 'commerce', priority: 'high', actorId: null,
        targetUserId: creator_id, entityType: 'creator', entityId: String(creator_id),
        message: `Your payout of $${amountUsd.toFixed(2)} is ready! Add your USDC (Ethereum ERC-20) wallet address in Creator Settings to receive it.`,
        metadata: { pendingAmountUsd: amountUsd, earningIds: earning_ids },
      });
      return { skipped: true };
    }

    // ── Route 1: Fiat off-ramp ────────────────────────────────────────────────
    if (hasFiatMethod || hasBreB) {
      const provider = hasFiatMethod ? fiat_payout_method : 'bre_b';
      const recipientHandle = hasFiatMethod ? fiat_payout_account : destinations.bre_b.handle;
      let transferResult;
      try {
        const peerProtocolService = require('./peerProtocolService');
        transferResult = await peerProtocolService.sendFiatPayout({
          amount: amountUsd,
          provider,
          recipientHandle,
          creatorId: creator_id,
        });
      } catch (fiatErr) {
        throw new Error(`Fiat payout failed: ${fiatErr.message}`);
      }
      if (!transferResult.success) {
        throw new Error(`Fiat payout transfer failed: ${transferResult.error}`);
      }
      await this._markEarningsPaid(earning_ids, creator_id, {
        method: 'fiat',
        txRef: transferResult.txHash || transferResult.reference || null,
      });
      await NotificationEmitter.emit({
        type: 'payment', category: 'commerce', priority: 'high', actorId: null,
        targetUserId: creator_id, entityType: 'creator', entityId: String(creator_id),
        message: `Your fiat payout of $${amountUsd.toFixed(2)} has been sent to your account.`,
        metadata: { amountUsd, payoutMethod: 'fiat' },
      });
      logger.info('CreatorPayoutService: fiat payout sent', { creatorId: creator_id, amountUsd });
      return { skipped: false };
    }

    // ── Route 2: Crypto via NowPayments payout (usdc_erc20 preferred, eth fallback) ──
    if (hasUsdcErc20 || hasEth) {
      const cryptoCurrency = hasUsdcErc20 ? 'usdcerc20' : 'eth';
      const cryptoAddress = hasUsdcErc20 ? destinations.usdc_erc20.address : destinations.eth.address;

      // Reserve the earnings: move 'available' → 'in_payout' atomically.
      const { rows: reservedRows } = await query(`
        UPDATE creator_earnings
        SET status = 'in_payout',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
        WHERE id = ANY($2)
          AND status  = 'available'
          AND paid_at IS NULL
        RETURNING id
      `, [
        JSON.stringify({ payoutCurrency: cryptoCurrency, payoutAddress: cryptoAddress }),
        earning_ids,
      ]);

      if (reservedRows.length === 0) {
        logger.warn('CreatorPayoutService: earnings already reserved by concurrent run — skipping', { creatorId: creator_id });
        return { skipped: true };
      }

      const reservedIds = reservedRows.map((r) => r.id);

      // Dispatch via NowPayments payout API.
      let npPayoutRow;
      try {
        const nowpaymentsPayoutService = require('./nowpaymentsPayoutService');
        npPayoutRow = await nowpaymentsPayoutService.requestPayout({
          userId: creator_id,
          address: cryptoAddress,
          currency: cryptoCurrency,
          method: 'crypto',
        });
      } catch (npErr) {
        // Roll earnings back to 'available' so the next cron tick retries.
        await query(
          `UPDATE creator_earnings SET status='available' WHERE id = ANY($1) AND status='in_payout' AND paid_at IS NULL`,
          [reservedIds]
        ).catch((re) => logger.error('CreatorPayoutService: failed to roll back earnings after NP error', { creatorId: creator_id, error: re.message }));
        throw new Error(`NowPayments payout failed: ${npErr.message}`);
      }

      await NotificationEmitter.emit({
        type: 'payment', category: 'commerce', priority: 'high', actorId: null,
        targetUserId: creator_id, entityType: 'creator', entityId: String(creator_id),
        message: `Your payout of $${amountUsd.toFixed(2)} (${cryptoCurrency === 'usdcerc20' ? 'USDC' : 'ETH'}) is being processed.`,
        metadata: { amountUsd, payoutMethod: cryptoCurrency, npPayoutId: npPayoutRow?.nowpayments_payout_id },
      });

      logger.info('CreatorPayoutService: NowPayments payout dispatched', {
        creatorId: creator_id, displayName, amountUsd, cryptoCurrency,
        npPayoutId: npPayoutRow?.nowpayments_payout_id, earningsCount: reservedIds.length,
      });
      return { skipped: false };
    }

    // Defensive throw — routing guards above should cover all branches.
    throw new Error('CreatorPayoutService: no payout route matched (this should be unreachable)');
  }

  /**
   * Atomic payout-stamp helper used by the immediately-settled paths (fiat,
   * legacy USDC sweep). Returns the rows actually flipped so the caller can
   * detect a no-op caused by a concurrent run.
   *
   * @param {string[]} earningIds
   * @param {string} creatorId
   * @param {{method:string, txRef:string|null, payoutId?:string}} extra
   */
  static async _markEarningsPaid(earningIds, creatorId, extra) {
    const { rows } = await query(`
      UPDATE creator_earnings
      SET status = 'paid_out',
          paid_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
      WHERE id = ANY($2)
        AND status IN ('available', 'in_payout')
        AND paid_at IS NULL
      RETURNING amount_creator
    `, [
      JSON.stringify({
        txHash: extra.txRef || null,
        payoutMethod: extra.method,
        payoutId: extra.payoutId || null,
      }),
      earningIds,
    ]);

    if (rows.length === 0) {
      logger.warn('CreatorPayoutService: earnings already settled by concurrent run', {
        creatorId, txRef: extra.txRef,
      });
    }
    return rows;
  }

  /**
   * Stub — BTCPay/Dash retired 2026-07-31. Called by btcpayWebhookController.js
   * which is still wired for any in-flight webhooks. Safe no-op.
   */
  static async settleDashPullPayment(pullPaymentId, meta = {}) {
    logger.info('settleDashPullPayment: no-op — BTCPay/Dash retired 2026-07-31', { pullPaymentId });
    return { settled: false, reason: 'btcpay_retired' };
  }

  // ── Subscription Renewals ──────────────────────────────────────────────────

  /**
   * Run daily subscription renewal for creator subscriptions expiring within 3 days.
   * Called by cron daily at 09:00 UTC. Only processes subscriptions with auto_renew = true.
   *
   * Strategy: create a Dash invoice via BTCPay for each renewal. ePayco cards cannot
   * be auto-charged without a stored vault token, and Daimo is retired, so Dash is
   * now the universal renewal path. The subscription's expires_at is NOT extended
   * optimistically — extension happens only when the BTCPay webhook fires
   * `InvoiceSettled` for a `dash_subscription_orders` row whose plan_id is
   * `creator_monthly`, at which point CreatorService.subscribeToCreator() runs.
   * Duplicate earnings are avoided by the per-(creator_id, subscription_id, period_month)
   * natural key pattern already in use.
   */
  static async runSubscriptionRenewals() {
    logger.info('CreatorPayoutService: starting subscription renewal run');

    let subs;
    try {
      const result = await query(`
        SELECT
          cs.id                 AS subscription_id,
          cs.creator_id,
          cs.subscriber_id,
          cs.price_usd,
          cs.expires_at,
          cs.payment_id         AS original_payment_id,
          cs.renewal_payment_id,
          sub.username          AS subscriber_username,
          sub.first_name        AS subscriber_first_name,
          cr.username           AS creator_username,
          cr.first_name         AS creator_first_name
        FROM creator_subscriptions cs
        JOIN users sub ON sub.id = cs.subscriber_id
        JOIN users cr  ON cr.id  = cs.creator_id
        -- Skip if a pending renewal invoice is already in-flight for this subscription.
        -- Checked via LEFT JOIN so subscriptions without a renewal_payment_id still pass.
        LEFT JOIN payments rp ON rp.id = cs.renewal_payment_id
        WHERE cs.status     = 'active'
          AND cs.auto_renew = true
          AND cs.expires_at <= NOW() + INTERVAL '3 days'
          AND cs.expires_at >  NOW()
          AND (cs.renewal_payment_id IS NULL OR rp.status NOT IN ('pending'))
        ORDER BY cs.expires_at ASC
      `);
      subs = result.rows;
    } catch (err) {
      logger.error('CreatorPayoutService: failed to fetch renewal batch', { error: err.message });
      return { success: false, error: err.message };
    }

    if (subs.length === 0) {
      logger.info('CreatorPayoutService: no subscriptions due for renewal');
      return { success: true, processed: 0, renewed: 0, cancelled: 0, failed: 0 };
    }

    logger.info(`CreatorPayoutService: ${subs.length} subscription(s) due for renewal`);

    let renewed = 0;
    let cancelled = 0;
    let failed = 0;

    for (const sub of subs) {
      try {
        const result = await this._processRenewal(sub);
        if (result.renewed) {
          renewed++;
        } else {
          cancelled++;
        }
      } catch (err) {
        failed++;
        logger.error('CreatorPayoutService: unhandled error during renewal', {
          subscriptionId: sub.subscription_id,
          error: err.message,
        });
      }
    }

    logger.info('CreatorPayoutService: renewal run complete', {
      processed: subs.length,
      renewed,
      cancelled,
      failed,
    });

    return { success: true, processed: subs.length, renewed, cancelled, failed };
  }

  /**
   * Process renewal for a single creator subscription.
   * @param {Object} sub - Row from the renewal query in runSubscriptionRenewals
   * @returns {{ renewed: boolean }}
   */
  static async _processRenewal(sub) {
    const {
      subscription_id,
      creator_id,
      subscriber_id,
      price_usd,
      original_payment_id,
      creator_username,
      creator_first_name,
    } = sub;

    const creatorName = creator_username || creator_first_name || String(creator_id);
    let priceUsd = parseFloat(price_usd);

    // Lazy-require to avoid circular dependency issues at module load time
    const { query: dbQuery } = require('../config/postgres');

    // 2026-07-31: Dash/BTCPay retired. This renewal path hardcodes Dash — every
    // renewal since Phase 1 has been generating stuck pending payments that
    // never settle. Short-circuit: disable auto_renew, notify subscriber to
    // re-subscribe manually via the working NowPayments/USDC flow, and stop
    // creating orphan payments. Full rewrite (route to NowPayments) is deferred
    // Phase 3 — needs staging test since paymentSettlementService is shared.
    try {
      await dbQuery(
        'UPDATE creator_subscriptions SET auto_renew=FALSE, updated_at=NOW() WHERE id=$1',
        [subscription_id]
      );
      logger.warn('[CreatorPayoutService] auto-renew disabled — Dash retired, no NP renewal path yet', {
        subscriptionId: subscription_id, subscriberId: subscriber_id, creatorId: creator_id,
      });
      await NotificationEmitter.emit({
        type: 'subscription_renewal_failed',
        category: 'commerce',
        priority: 'high',
        targetUserId: String(subscriber_id),
        entityType: 'creator_subscription',
        entityId: String(subscription_id),
        message: `Your subscription to ${creatorName} won't auto-renew. Re-subscribe from their profile to keep access.`,
        metadata: { creatorId: String(creator_id), creatorName, priceUsd, reason: 'dash_retired_no_renewal_path' },
      }).catch(() => {});
    } catch (guardErr) {
      logger.warn('[CreatorPayoutService] failed to disable auto_renew during Dash short-circuit', {
        subscriptionId: subscription_id, error: guardErr.message,
      });
    }
    return { renewed: false };
  }

  /**
   * Cancel a subscription and emit a cancellation notification to the subscriber.
   * Non-fatal: errors are logged but not re-thrown.
   */
  static async _cancelAndNotify({ subscription_id, subscriber_id, creator_id, creatorName, reason }) {
    try {
      await query(`
        UPDATE creator_subscriptions
        SET
          status       = 'cancelled',
          cancelled_at = NOW(),
          auto_renew   = false
        WHERE id     = $1
          AND status = 'active'
      `, [subscription_id]);

      // Decrement subscriber count on creator
      await query(`
        UPDATE users
        SET creator_subscriber_count = GREATEST(0, creator_subscriber_count - 1)
        WHERE id = $1
      `, [creator_id]);

      await NotificationEmitter.emit({
        type: 'system',
        category: 'commerce',
        priority: 'high',
        actorId: null,
        targetUserId: subscriber_id,
        entityType: 'creator_subscription',
        entityId: String(subscription_id),
        message: `Your subscription to ${creatorName} could not be renewed and has been cancelled.`,
        metadata: {
          creatorId: String(creator_id),
          creatorName,
          reason,
        },
      });

      logger.info('CreatorPayoutService: subscription cancelled due to renewal failure', {
        subscriptionId: subscription_id,
        subscriberId: subscriber_id,
        creatorId: creator_id,
        reason,
      });
    } catch (err) {
      logger.error('CreatorPayoutService: failed to cancel subscription', {
        subscriptionId: subscription_id,
        error: err.message,
      });
    }
  }

  // ── Scoped Subscription Renewals (paid channels & paid hangouts) ─────────────

  /**
   * Run daily renewal reminders for paid channel-access and hangout-access
   * entitlements expiring within the next 3 days. Sends multi-channel reminders
   * (in-app notification + push + Telegram bot DM via NotificationEmitter, plus
   * email via EmailService) — does NOT create any invoice. The user follows the
   * reminder link back to the channel/hangout and re-purchases through the
   * existing /api/webapp/{channels,hangouts}/:id/purchase flow when they're ready.
   *
   * Triggered by CHANNEL_HANGOUT_RENEWAL_CRON (default: '15 9 * * *').
   */
  static async runScopedSubscriptionRenewals() {
    logger.info('CreatorPayoutService: starting scoped (channel/hangout) renewal reminders');

    let entitlements;
    try {
      const result = await query(`
        SELECT
          ue.id            AS entitlement_id,
          ue.user_id,
          ue.add_on_id,
          ue.creator_id    AS scope_id,
          ue.expires_at,
          u.email          AS user_email,
          u.language       AS user_language,
          u.first_name     AS subscriber_first_name,
          u.username       AS subscriber_username
        FROM user_entitlements ue
        JOIN users u ON u.id = ue.user_id
        WHERE ue.add_on_id IN ('channel-access', 'hangout-access')
          AND ue.is_consumed = false
          AND ue.is_lifetime = false
          AND ue.auto_renew  = true
          AND ue.expires_at IS NOT NULL
          AND ue.expires_at <= NOW() + INTERVAL '3 days'
          AND ue.expires_at >  NOW()
        ORDER BY ue.expires_at ASC
      `);
      entitlements = result.rows;
    } catch (err) {
      logger.error('CreatorPayoutService: failed to fetch scoped renewal batch', { error: err.message });
      return { success: false, error: err.message };
    }

    if (entitlements.length === 0) {
      logger.info('CreatorPayoutService: no scoped subscriptions due for renewal reminder');
      return { success: true, processed: 0, reminded: 0, failed: 0 };
    }

    logger.info(`CreatorPayoutService: sending renewal reminders for ${entitlements.length} scoped subscription(s)`);

    let reminded = 0;
    let failed = 0;

    for (const ent of entitlements) {
      try {
        const result = await this._sendScopedRenewalReminder(ent);
        if (result.reminded) reminded++;
        else failed++;
      } catch (err) {
        failed++;
        logger.error('CreatorPayoutService: unhandled error during scoped renewal reminder', {
          entitlementId: ent.entitlement_id,
          error: err.message,
        });
      }
    }

    logger.info('CreatorPayoutService: scoped renewal reminders complete', {
      processed: entitlements.length, reminded, failed,
    });
    return { success: true, processed: entitlements.length, reminded, failed };
  }

  /**
   * Send a renewal reminder for a single channel-access or hangout-access
   * entitlement. Multi-channel: in-app + push + Telegram bot DM (via
   * NotificationEmitter, which respects the user's notification preferences)
   * plus email (if the user has one). No payment record is created — the user
   * re-purchases through the existing flow when they choose to.
   */
  static async _sendScopedRenewalReminder(ent) {
    const { entitlement_id, user_id, add_on_id, scope_id, expires_at, user_email, user_language } = ent;
    const webAppUrl = process.env.WEB_APP_URL || 'https://pnptv.app';

    // Look up the resource so we know it's still active + for the deep link / current price
    let priceUsd, resourceName, scopeMetadata, deepLink, kindLabel;
    try {
      if (add_on_id === 'channel-access') {
        const { rows } = await query(
          `SELECT id, name, price_usd, hangout_group_id, access_type
             FROM creator_channels WHERE id = $1 AND is_active = true LIMIT 1`,
          [scope_id]
        );
        if (!rows.length || rows[0].access_type !== 'paid' || Number(rows[0].price_usd) <= 0) {
          logger.warn('Scoped renewal reminder skipped — channel no longer paid/active', {
            entitlementId: entitlement_id, channelId: scope_id,
          });
          // Auto-disable renewal so we stop reminding
          await query(`UPDATE user_entitlements SET auto_renew = false WHERE id = $1`, [entitlement_id]);
          return { reminded: false };
        }
        const ch = rows[0];
        priceUsd = Number(ch.price_usd);
        resourceName = ch.name;
        scopeMetadata = { channelId: ch.id, hangoutGroupId: ch.hangout_group_id, channelName: ch.name };
        deepLink = `${webAppUrl}/channels/${ch.id}`;
        kindLabel = 'channel';
      } else {
        const { rows } = await query(
          `SELECT id, name, price_usd, is_paid
             FROM hangout_groups WHERE id = $1 LIMIT 1`,
          [scope_id]
        );
        if (!rows.length || !rows[0].is_paid || Number(rows[0].price_usd) <= 0) {
          logger.warn('Scoped renewal reminder skipped — hangout no longer paid/active', {
            entitlementId: entitlement_id, hangoutId: scope_id,
          });
          await query(`UPDATE user_entitlements SET auto_renew = false WHERE id = $1`, [entitlement_id]);
          return { reminded: false };
        }
        const hg = rows[0];
        priceUsd = Number(hg.price_usd);
        resourceName = hg.name;
        scopeMetadata = { hangoutGroupId: hg.id, hangoutName: hg.name };
        deepLink = `${webAppUrl}/chat/${hg.id}`;
        kindLabel = 'hangout';
      }
    } catch (lookupErr) {
      logger.error('Scoped renewal reminder: resource lookup failed', {
        entitlementId: entitlement_id, error: lookupErr.message,
      });
      return { reminded: false };
    }

    const daysLeft = Math.max(0, Math.ceil((new Date(expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const lang = (user_language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
    const expiresLabel = new Date(expires_at).toUTCString();

    // 1. In-app + push + Telegram bot — handled by NotificationEmitter respecting per-channel prefs
    try {
      const messageEn = `Your ${kindLabel} subscription to "${resourceName}" expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Tap to renew for $${priceUsd.toFixed(2)}.`;
      const messageEs = `Tu suscripción al ${kindLabel === 'channel' ? 'canal' : 'hangout'} "${resourceName}" vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}. Toca para renovar por $${priceUsd.toFixed(2)}.`;
      await NotificationEmitter.emit({
        type: 'payment',
        category: 'commerce',
        priority: 'high',
        actorId: null,
        targetUserId: user_id,
        entityType: kindLabel,
        entityId: String(scope_id),
        message: lang === 'es' ? messageEs : messageEn,
        metadata: { ...scopeMetadata, priceUsd, daysLeft, deepLink, expiresAt: expires_at },
      });
    } catch (notifyErr) {
      logger.warn('Scoped renewal reminder: in-app/push/bot notify failed (non-fatal)', {
        entitlementId: entitlement_id, error: notifyErr.message,
      });
    }

    // 2. Email — if the user has one
    if (user_email) {
      try {
        const EmailService = require('./emailservice');
        const subject = lang === 'es'
          ? `Tu suscripción a "${resourceName}" vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
          : `Your "${resourceName}" subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
        const html = lang === 'es'
          ? `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
              <h2 style="color:#D4007A">Renueva tu suscripción</h2>
              <p>Tu suscripción al ${kindLabel === 'channel' ? 'canal' : 'hangout'} <strong>${resourceName}</strong> vence el ${expiresLabel} (en ${daysLeft} día${daysLeft === 1 ? '' : 's'}).</p>
              <p>Renueva ahora por <strong>$${priceUsd.toFixed(2)}</strong> para mantener tu acceso.</p>
              <p style="margin:24px 0"><a href="${deepLink}" style="background:#D4007A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Renovar acceso</a></p>
              <p style="color:#888;font-size:12px">Puedes cancelar la renovación automática en cualquier momento desde tu cuenta.</p>
            </div>`
          : `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
              <h2 style="color:#D4007A">Renew your subscription</h2>
              <p>Your ${kindLabel} subscription to <strong>${resourceName}</strong> expires on ${expiresLabel} (in ${daysLeft} day${daysLeft === 1 ? '' : 's'}).</p>
              <p>Renew now for <strong>$${priceUsd.toFixed(2)}</strong> to keep your access.</p>
              <p style="margin:24px 0"><a href="${deepLink}" style="background:#D4007A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Renew access</a></p>
              <p style="color:#888;font-size:12px">You can cancel auto-renewal anytime from your account.</p>
            </div>`;
        await EmailService.send({ to: user_email, subject, html });
      } catch (emailErr) {
        logger.warn('Scoped renewal reminder: email failed (non-fatal)', {
          entitlementId: entitlement_id, error: emailErr.message,
        });
      }
    }

    logger.info('CreatorPayoutService: scoped renewal reminder sent', {
      entitlementId: entitlement_id, userId: user_id, addOnId: add_on_id, scopeId: scope_id,
      daysLeft, hasEmail: !!user_email,
    });
    return { reminded: true };
  }

  // ── Weekly approval workflow (Colombia-friendly) ────────────────────────────
  //
  // Cadence:
  //   Monday 09:00 America/Bogota → runWeeklyPayoutProposals()
  //     • Aggregates available earnings per creator (>= WEEKLY_MINIMUM_USD).
  //     • Snapshots preferred payout method + USD/COP TRM.
  //     • Moves earnings to status='in_payout' (transactional reservation).
  //     • Emails + DMs the creator with a deep-link to /creator/earnings.
  //
  //   Monday 16:00 America/Bogota → runWeeklyApprovalDeadline()
  //     • Any 'proposed' row that has aged past the deadline is expired.
  //     • Its reserved earnings roll back to 'available' for next Monday.
  //
  //   Tuesday → admin marks approved rows as paid via the admin ledger
  //   (POST /api/admin/creator-payouts/weekly/:id/mark-paid).

  /**
   * Get today's USD->COP TRM. Caches by rate_date in Postgres so multiple
   * concurrent renders share the same daily fetch. Falls back to the most
   * recent cached rate, then to TRM_FALLBACK_COP when the API is unreachable.
   */
  static async getUsdCopRate() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { rows: cached } = await query(
        'SELECT rate_cop FROM usd_cop_rate_cache WHERE rate_date = $1',
        [today]
      );
      if (cached[0]) return Number(cached[0].rate_cop);
    } catch (err) {
      logger.warn('getUsdCopRate: cache read failed', { error: err.message });
    }

    let rate = null;
    try {
      const resp = await fetch(DATOSGOV_TRM_URL, { headers: { Accept: 'application/json' } });
      if (resp.ok) {
        const data = await resp.json();
        // Row shape: [{ valor: "4123.45", unidad, vigenciadesde, vigenciahasta }]
        const raw = Array.isArray(data) && data[0]?.valor ? parseFloat(data[0].valor) : null;
        if (Number.isFinite(raw) && raw > 100) rate = raw;
      }
    } catch (err) {
      logger.warn('getUsdCopRate: TRM fetch failed', { error: err.message });
    }

    if (rate) {
      try {
        await query(
          `INSERT INTO usd_cop_rate_cache (rate_date, rate_cop, source)
           VALUES ($1, $2, 'banrep_datosgov')
           ON CONFLICT (rate_date) DO UPDATE
             SET rate_cop = EXCLUDED.rate_cop, fetched_at = NOW()`,
          [today, rate]
        );
      } catch (err) {
        logger.warn('getUsdCopRate: cache write failed', { error: err.message });
      }
      return rate;
    }

    // Fallback: last known rate, then env constant.
    try {
      const { rows } = await query(
        'SELECT rate_cop FROM usd_cop_rate_cache ORDER BY rate_date DESC LIMIT 1'
      );
      if (rows[0]) return Number(rows[0].rate_cop);
    } catch (_) { /* ignore */ }
    return TRM_FALLBACK_COP;
  }

  /**
   * Return the Monday 00:00 America/Bogota date for the current run as YYYY-MM-DD.
   * Uses a UTC-5 offset (Colombia has no DST) so cron ticks near midnight land
   * on the correct week.
   */
  static _mondayOfBogotaWeek(now = new Date()) {
    const bogotaMs = now.getTime() - 5 * 3600 * 1000;
    const b = new Date(bogotaMs);
    // Bogota day-of-week (0=Sun ... 1=Mon)
    const dow = b.getUTCDay();
    const daysBack = (dow + 6) % 7; // Mon-start
    const monday = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - daysBack));
    return monday.toISOString().slice(0, 10);
  }

  /**
   * Read the creator's preferred payout method as { lane, dest, label }.
   * Priority: creator_payout_destinations (JSONB) → legacy dash/fiat columns.
   */
  static _pickPreferredMethod(user) {
    const dests = user.creator_payout_destinations || {};
    const order = ['bre_b', 'meru', 'usdt_tron', 'usdt_base', 'btc', 'dash'];
    for (const lane of order) {
      const d = dests[lane];
      if (!d) continue;
      const val = d.address || d.handle || d.key || null;
      if (val) return { lane, dest: d, label: lane };
    }
    if (user.creator_dash_address) {
      return { lane: 'dash', dest: { address: user.creator_dash_address }, label: 'dash' };
    }
    if (user.fiat_payout_method && user.fiat_payout_account) {
      return {
        lane: 'fiat_legacy',
        dest: { provider: user.fiat_payout_method, account: user.fiat_payout_account },
        label: user.fiat_payout_method,
      };
    }
    if (user.meru_account) {
      return { lane: 'meru', dest: { handle: user.meru_account }, label: 'meru' };
    }
    return null;
  }

  /**
   * Monday 09:00 Bogota cron. Aggregates available earnings per creator and
   * creates one creator_weekly_payout_approvals row per creator with status
   * 'proposed'. Reserves the underlying earnings (status='in_payout') so
   * concurrent payout paths cannot double-count them.
   */
  static async runWeeklyPayoutProposals() {
    logger.info('CreatorPayoutService: starting weekly payout proposals');
    const weekStart = this._mondayOfBogotaWeek();
    const rateCop = await this.getUsdCopRate();

    let rows;
    try {
      const result = await query(`
        SELECT
          ce.creator_id,
          COALESCE(SUM(ce.amount_creator), 0)::numeric   AS total_creator,
          ARRAY_AGG(ce.id)                                AS earning_ids,
          MAX(u.email)                                    AS email,
          MAX(u.username)                                 AS username,
          MAX(u.first_name)                               AS first_name,
          MAX(u.language)                                 AS language,
          MAX(u.country)                                  AS country,
          MAX(u.creator_dash_address)                     AS creator_dash_address,
          MAX(u.meru_account)                             AS meru_account,
          MAX(u.fiat_payout_method)                       AS fiat_payout_method,
          MAX(u.fiat_payout_account)                      AS fiat_payout_account,
          MAX(u.creator_payout_destinations::text)::jsonb AS creator_payout_destinations
        FROM creator_earnings ce
        LEFT JOIN users u ON u.id = ce.creator_id
        WHERE ce.status  = 'available'
          AND ce.paid_at IS NULL
        GROUP BY ce.creator_id
        HAVING COALESCE(SUM(ce.amount_creator), 0) >= $1
      `, [WEEKLY_MINIMUM_USD]);
      rows = result.rows;
    } catch (err) {
      logger.error('runWeeklyPayoutProposals: fetch failed', { error: err.message });
      return { success: false, error: err.message };
    }

    let proposed = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const creatorId = row.creator_id;
      const amountUsd = Number(row.total_creator);
      const method = this._pickPreferredMethod(row);
      if (!method) {
        skipped++;
        logger.warn('runWeeklyPayoutProposals: no method configured, skipping', { creatorId });
        continue;
      }
      const balanceCop = Math.round(amountUsd * rateCop);

      const client = await require('../config/postgres').getPool().connect();
      try {
        await client.query('BEGIN');
        // Reserve earnings so any parallel monthly-payout or ad-hoc cashout skips them.
        const { rows: reserved } = await client.query(
          `UPDATE creator_earnings
             SET status = 'in_payout',
                 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('weekly_approval_week', $2::text)
           WHERE id = ANY($1::uuid[])
             AND status = 'available'
             AND paid_at IS NULL
           RETURNING id`,
          [row.earning_ids, weekStart]
        );
        if (reserved.length === 0) {
          await client.query('ROLLBACK');
          skipped++;
          continue;
        }
        const reservedIds = reserved.map((r) => r.id);
        const { rows: inserted } = await client.query(
          `INSERT INTO creator_weekly_payout_approvals
             (week_start, creator_id, balance_usd, balance_cop, usd_cop_rate,
              payout_method_snapshot, source_earning_ids, status, is_manual)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'proposed', false)
           ON CONFLICT (week_start, creator_id) WHERE is_manual = false DO NOTHING
           RETURNING id`,
          [weekStart, creatorId, amountUsd, balanceCop, rateCop,
            JSON.stringify({ lane: method.lane, ...method.dest, label: method.label }),
            reservedIds]
        );
        if (inserted.length === 0) {
          // Race with another tick — release the reservation.
          await client.query(
            `UPDATE creator_earnings SET status = 'available'
               WHERE id = ANY($1::uuid[]) AND status = 'in_payout'`,
            [reservedIds]
          );
          await client.query('COMMIT');
          skipped++;
          continue;
        }
        await client.query('COMMIT');
        proposed++;

        const approvalId = inserted[0].id;
        // Fire notifications outside the txn — best-effort.
        try {
          const emailService = require('./emailservice');
          if (row.email && emailService.isEmailSafe && emailService.isEmailSafe(row.email)) {
            await emailService.sendCreatorWeeklyPayoutProposal({
              to: row.email,
              displayName: row.username || row.first_name || String(creatorId),
              language: row.language || 'en',
              approvalId,
              balanceUsd: amountUsd,
              balanceCop,
              methodLabel: method.label,
              country: row.country,
            });
          }
        } catch (emailErr) {
          logger.warn('runWeeklyPayoutProposals: email failed (non-fatal)', {
            creatorId, error: emailErr.message,
          });
        }
        try {
          const { sendNotificationViaTelegram } = require('./notificationBotDelivery');
          await sendNotificationViaTelegram(creatorId, {
            type: 'payment',
            entityType: 'weekly_payout_proposal',
            entityId: String(approvalId),
            message: (row.language || 'en').toLowerCase().startsWith('es')
              ? `Tu pago semanal de $${amountUsd.toFixed(2)} USD está listo para aprobar. Confirma antes de las 4pm (Bogotá).`
              : `Your weekly payout of $${amountUsd.toFixed(2)} USD is ready to approve. Confirm before 4pm (Bogota).`,
          });
        } catch (dmErr) {
          logger.warn('runWeeklyPayoutProposals: DM failed (non-fatal)', {
            creatorId, error: dmErr.message,
          });
        }
      } catch (err) {
        failed++;
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        logger.error('runWeeklyPayoutProposals: creator failed', {
          creatorId, error: err.message,
        });
      } finally {
        client.release();
      }
    }

    logger.info('runWeeklyPayoutProposals: complete', {
      weekStart, eligible: rows.length, proposed, skipped, failed,
    });
    return { success: true, weekStart, proposed, skipped, failed };
  }

  /**
   * Monday 16:00 Bogota cron. Any row still in 'proposed' state past the
   * deadline expires and its reserved earnings roll back to 'available' so
   * they're picked up in next week's batch.
   *
   * Manual (admin-initiated) proposals are intentionally excluded — the admin
   * owns their lifecycle and can cancel them explicitly from the ledger UI.
   */
  static async runWeeklyApprovalDeadline() {
    logger.info('CreatorPayoutService: running weekly approval deadline sweep');
    const weekStart = this._mondayOfBogotaWeek();

    let expired;
    try {
      const { rows } = await query(
        `UPDATE creator_weekly_payout_approvals
            SET status = 'expired', updated_at = NOW()
          WHERE status = 'proposed'
            AND week_start = $1
            AND is_manual = false
        RETURNING id, creator_id, source_earning_ids`,
        [weekStart]
      );
      expired = rows;
    } catch (err) {
      logger.error('runWeeklyApprovalDeadline: expire query failed', { error: err.message });
      return { success: false, error: err.message };
    }

    let restored = 0;
    for (const row of expired) {
      try {
        await query(
          `UPDATE creator_earnings
             SET status = 'available'
           WHERE id = ANY($1::uuid[])
             AND status = 'in_payout'`,
          [row.source_earning_ids]
        );
        restored++;
      } catch (err) {
        logger.warn('runWeeklyApprovalDeadline: rollback failed', {
          approvalId: row.id, error: err.message,
        });
      }
    }

    logger.info('runWeeklyApprovalDeadline: complete', {
      weekStart, expiredCount: expired.length, restored,
    });
    return { success: true, weekStart, expired: expired.length, restored };
  }

  /**
   * Approve or reject a weekly proposal for the authenticated creator.
   * When `methodOverride` is provided the snapshot's `approved_method_override`
   * is stored so the admin sees exactly what to pay to.
   */
  static async approveWeeklyProposal(approvalId, creatorId, { methodOverride } = {}) {
    const { rows } = await query(
      `UPDATE creator_weekly_payout_approvals
         SET status = 'approved',
             approved_at = NOW(),
             approved_method_override = $3::jsonb,
             updated_at = NOW()
       WHERE id = $1
         AND creator_id = $2
         AND status = 'proposed'
       RETURNING id, balance_usd, balance_cop`,
      [approvalId, creatorId, methodOverride ? JSON.stringify(methodOverride) : null]
    );
    if (rows.length === 0) {
      const err = new Error('Approval row not found or not in proposed state');
      err.code = 'NOT_APPROVABLE';
      throw err;
    }
    return rows[0];
  }

  static async rejectWeeklyProposal(approvalId, creatorId) {
    const client = await require('../config/postgres').getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE creator_weekly_payout_approvals
           SET status = 'rejected', updated_at = NOW()
         WHERE id = $1
           AND creator_id = $2
           AND status = 'proposed'
         RETURNING id, source_earning_ids`,
        [approvalId, creatorId]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Approval row not found or not in proposed state');
        err.code = 'NOT_REJECTABLE';
        throw err;
      }
      await client.query(
        `UPDATE creator_earnings SET status = 'available'
           WHERE id = ANY($1::uuid[]) AND status = 'in_payout'`,
        [rows[0].source_earning_ids]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: mark an approved weekly payout as paid. Stamps receipt_url +
   * tx_reference, flips source_earning_ids to 'paid_out', writes paid_at.
   */
  static async adminMarkWeeklyPaid(approvalId, adminId, { txReference, receiptUrl, adminNotes }) {
    const client = await require('../config/postgres').getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows: approvalRows } = await client.query(
        `UPDATE creator_weekly_payout_approvals
           SET status = 'paid',
               processed_at = NOW(),
               processed_by_admin_id = $2,
               tx_reference = $3,
               receipt_url = COALESCE($4, receipt_url),
               receipt_uploaded_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE receipt_uploaded_at END,
               admin_notes = $5,
               updated_at = NOW()
         WHERE id = $1
           AND status = 'approved'
         RETURNING id, creator_id, source_earning_ids, balance_usd`,
        [approvalId, adminId, txReference, receiptUrl || null, adminNotes || null]
      );
      if (approvalRows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Approval row not in approved state');
        err.code = 'NOT_MARKABLE';
        throw err;
      }
      const approval = approvalRows[0];
      await client.query(
        `UPDATE creator_earnings
           SET status  = 'paid_out',
               paid_at = NOW(),
               metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'weekly_approval_id', $2::text,
                             'tx_reference', $3::text,
                             'payoutMethod', 'weekly_manual'
                           )
         WHERE id = ANY($1::uuid[])
           AND status IN ('in_payout','available')`,
        [approval.source_earning_ids, approvalId, txReference || '']
      );
      await client.query('COMMIT');

      // Creator personal Slack notification — best-effort, outside transaction
      try {
        const creatorNotify = require('./slackCreatorNotifyService');
        const amountUsd = approval.balance_usd != null ? parseFloat(approval.balance_usd) : null;
        if (approval.creator_id && amountUsd != null) {
          creatorNotify.notifyPayoutProcessed(approval.creator_id, { amount: amountUsd }).catch(() => {});
        }
      } catch (_) {}

      return approval;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  static async attachWeeklyReceipt(approvalId, receiptUrl) {
    const { rows } = await query(
      `UPDATE creator_weekly_payout_approvals
         SET receipt_url = $2, receipt_uploaded_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, receipt_url`,
      [approvalId, receiptUrl]
    );
    return rows[0] || null;
  }

  /**
   * Fetch the open payout proposal for a creator (proposed OR approved).
   * Includes both the weekly automatic row and any admin-initiated manual
   * row still open — manual takes precedence when both exist so the emergency
   * advance surfaces first in the banner.
   */
  static async getCreatorPendingApproval(creatorId) {
    const weekStart = this._mondayOfBogotaWeek();
    const { rows } = await query(
      `SELECT id, week_start, balance_usd, balance_cop, usd_cop_rate,
              payout_method_snapshot, approved_method_override, status,
              approved_at, created_at, is_manual, admin_note
         FROM creator_weekly_payout_approvals
        WHERE creator_id = $1
          AND status IN ('proposed','approved')
          AND (is_manual = true OR week_start = $2)
        ORDER BY is_manual DESC, created_at DESC
        LIMIT 1`,
      [creatorId, weekStart]
    );
    return rows[0] || null;
  }

  /**
   * Admin: list payouts for the given week. Includes both automatic (Monday
   * cron) and manual (admin-initiated emergency) rows. Manuals for other
   * weeks that are still open (proposed/approved) are also surfaced so the
   * admin never loses track of pending exceptions.
   */
  static async getAdminWeeklyLedger({ weekStart, status, country }) {
    const params = [weekStart];
    let sql = `
      SELECT a.id, a.week_start, a.creator_id, a.balance_usd, a.balance_cop, a.usd_cop_rate,
             a.payout_method_snapshot, a.approved_method_override, a.status,
             a.approved_at, a.processed_at, a.processed_by_admin_id,
             a.receipt_url, a.tx_reference, a.admin_notes, a.created_at,
             a.is_manual, a.admin_note, a.created_by_admin_id,
             u.username, u.first_name, u.email, u.country, u.language
        FROM creator_weekly_payout_approvals a
        LEFT JOIN users u ON u.id = a.creator_id
       WHERE (a.week_start = $1
              OR (a.is_manual = true AND a.status IN ('proposed','approved')))
    `;
    if (status) { params.push(status); sql += ` AND a.status = $${params.length}`; }
    if (country) { params.push(country); sql += ` AND u.country = $${params.length}`; }
    sql += ' ORDER BY a.is_manual DESC, a.balance_usd DESC';
    const { rows } = await query(sql, params);
    return rows;
  }

  static async getAdminWeeklySummary({ weekStart }) {
    const { rows } = await query(
      `SELECT status,
              COUNT(*)::int AS count,
              COALESCE(SUM(balance_usd), 0)::numeric AS total_usd
         FROM creator_weekly_payout_approvals
        WHERE week_start = $1
        GROUP BY status`,
      [weekStart]
    );
    return rows;
  }

  /**
   * Admin: emergency off-cycle payout proposal for a single creator. Reuses
   * the same table + notification path as the weekly cron, tagged is_manual.
   * The row does NOT participate in the Monday deadline sweep — admin
   * cancels it explicitly via cancelManualProposal if the creator goes
   * unresponsive.
   *
   * Throws:
   *   - INSUFFICIENT_BALANCE  — creator has < WEEKLY_MINIMUM_USD available
   *   - MANUAL_ALREADY_OPEN   — an active manual proposal already exists
   *   - NO_PAYOUT_METHOD      — creator hasn't configured any lane
   */
  static async runManualPayoutProposal(creatorId, adminId, { note } = {}) {
    logger.info('CreatorPayoutService: manual payout proposal requested', { creatorId, adminId });

    const { rows: existingRows } = await query(
      `SELECT id FROM creator_weekly_payout_approvals
        WHERE creator_id = $1 AND is_manual = true AND status IN ('proposed','approved')
        LIMIT 1`,
      [creatorId]
    );
    if (existingRows.length > 0) {
      const err = new Error('Creator already has an open manual proposal');
      err.code = 'MANUAL_ALREADY_OPEN';
      throw err;
    }

    const { rows: userRows } = await query(`
      SELECT id, email, username, first_name, language, country,
             creator_dash_address, meru_account,
             fiat_payout_method, fiat_payout_account,
             creator_payout_destinations
        FROM users WHERE id = $1
    `, [creatorId]);
    const user = userRows[0];
    if (!user) {
      const err = new Error('Creator not found');
      err.code = 'CREATOR_NOT_FOUND';
      throw err;
    }

    const method = this._pickPreferredMethod(user);
    if (!method) {
      const err = new Error('Creator has no payout method configured');
      err.code = 'NO_PAYOUT_METHOD';
      throw err;
    }

    const { rows: earningRows } = await query(`
      SELECT id, amount_creator
        FROM creator_earnings
       WHERE creator_id = $1 AND status = 'available' AND paid_at IS NULL
    `, [creatorId]);
    if (earningRows.length === 0) {
      const err = new Error('No available earnings to advance');
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    const amountUsd = earningRows.reduce((s, r) => s + Number(r.amount_creator || 0), 0);
    if (amountUsd < WEEKLY_MINIMUM_USD) {
      const err = new Error(`Balance below minimum $${WEEKLY_MINIMUM_USD}`);
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }
    const earningIds = earningRows.map((r) => r.id);

    const rateCop = await this.getUsdCopRate();
    const balanceCop = Math.round(amountUsd * rateCop);
    const weekStart = this._mondayOfBogotaWeek();

    const client = await require('../config/postgres').getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows: reserved } = await client.query(
        `UPDATE creator_earnings
            SET status = 'in_payout',
                metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('manual_advance_week', $2::text)
          WHERE id = ANY($1::uuid[])
            AND status = 'available'
            AND paid_at IS NULL
          RETURNING id`,
        [earningIds, weekStart]
      );
      if (reserved.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Race lost while reserving earnings');
        err.code = 'RESERVE_RACE';
        throw err;
      }
      const reservedIds = reserved.map((r) => r.id);
      const { rows: inserted } = await client.query(
        `INSERT INTO creator_weekly_payout_approvals
           (week_start, creator_id, balance_usd, balance_cop, usd_cop_rate,
            payout_method_snapshot, source_earning_ids, status,
            is_manual, admin_note, created_by_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'proposed',
                 true, $8, $9)
         RETURNING id, week_start`,
        [weekStart, creatorId, amountUsd, balanceCop, rateCop,
          JSON.stringify({ lane: method.lane, ...method.dest, label: method.label }),
          reservedIds, note || null, adminId || null]
      );
      await client.query('COMMIT');
      const approvalId = inserted[0].id;

      try {
        const emailService = require('./emailservice');
        if (user.email && emailService.isEmailSafe && emailService.isEmailSafe(user.email)) {
          await emailService.sendCreatorWeeklyPayoutProposal({
            to: user.email,
            displayName: user.username || user.first_name || String(creatorId),
            language: user.language || 'en',
            approvalId,
            balanceUsd: amountUsd,
            balanceCop,
            methodLabel: method.label,
            country: user.country,
            isEmergency: true,
            adminNote: note || null,
          });
        }
      } catch (emailErr) {
        logger.warn('runManualPayoutProposal: email failed (non-fatal)', {
          creatorId, error: emailErr.message,
        });
      }
      try {
        const { sendNotificationViaTelegram } = require('./notificationBotDelivery');
        await sendNotificationViaTelegram(creatorId, {
          type: 'payment',
          entityType: 'weekly_payout_proposal',
          entityId: String(approvalId),
          message: (user.language || 'en').toLowerCase().startsWith('es')
            ? `🚨 Adelanto de pago: $${amountUsd.toFixed(2)} USD listo para aprobar.`
            : `🚨 Emergency advance: $${amountUsd.toFixed(2)} USD ready to approve.`,
        });
      } catch (dmErr) {
        logger.warn('runManualPayoutProposal: DM failed (non-fatal)', {
          creatorId, error: dmErr.message,
        });
      }

      return { id: approvalId, weekStart, amountUsd, balanceCop, method };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: cancel an outstanding manual proposal (only if not paid). Releases
   * the reserved earnings back to 'available' so they roll into next week's
   * automatic cohort.
   */
  static async cancelManualProposal(approvalId, adminId, { reason } = {}) {
    const client = await require('../config/postgres').getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE creator_weekly_payout_approvals
            SET status = 'rejected',
                admin_notes = COALESCE(admin_notes, '') ||
                  CASE WHEN $3::text IS NOT NULL AND $3 <> ''
                       THEN '[cancel:' || $2 || '] ' || $3::text
                       ELSE '[cancel:' || $2 || ']' END,
                updated_at = NOW()
          WHERE id = $1
            AND is_manual = true
            AND status = 'proposed'
        RETURNING id, source_earning_ids`,
        [approvalId, adminId, reason || null]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        const err = new Error('Manual proposal not found or not cancellable');
        err.code = 'NOT_CANCELLABLE';
        throw err;
      }
      await client.query(
        `UPDATE creator_earnings SET status = 'available'
           WHERE id = ANY($1::uuid[]) AND status = 'in_payout'`,
        [rows[0].source_earning_ids]
      );
      await client.query('COMMIT');
      return rows[0];
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: last N payout approvals for a specific creator (any status) —
   * used by the creator-detail drawer to show recent history alongside the
   * pending balance.
   */
  static async getCreatorPayoutHistory(creatorId, limit = 6) {
    const { rows } = await query(
      `SELECT id, week_start, balance_usd, balance_cop, status,
              approved_at, processed_at, tx_reference, receipt_url,
              is_manual, admin_note, created_at
         FROM creator_weekly_payout_approvals
        WHERE creator_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [creatorId, Math.min(Number(limit) || 6, 50)]
    );
    return rows;
  }
}

module.exports = CreatorPayoutService;
