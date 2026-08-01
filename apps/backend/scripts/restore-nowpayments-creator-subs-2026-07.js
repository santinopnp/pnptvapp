/**
 * One-off restore for 9 NowPayments creator_monthly orders (2026-06-25 → 2026-07-20)
 * that were confirmed paid but never granted, due to creator_subscriptions.payment_id
 * having been UUID-typed while the webhook passed a plain order-id string (fixed by
 * migration 317). Calls the now-fixed CreatorService.subscribeToCreator() directly —
 * SantinoFurioso is in CONTENT_COMPLIANCE_EXEMPT_USER_IDS so his orders grant
 * normally; the other creators go through the new content-compliance hold + notice
 * automatically, since none of them has 4 minutes of exclusive content today.
 *
 * Two orders (2345, 2294) are earnings-only: a dry-run found both subscribers
 * already have an ACTIVE creator_subscriptions row for that creator (payment_id
 * NULL, both created at the identical timestamp 2026-06-28 06:06:16 — an earlier,
 * unrelated manual bulk fix) with an expiry BETTER than what this restore would
 * produce. Re-granting via subscribeToCreator would overwrite/shorten that
 * existing access. Since creator_earnings for these two orders was confirmed
 * missing, only the earnings row is inserted — the subscription/entitlement is
 * left untouched.
 *
 * Usage:
 *   node scripts/restore-nowpayments-creator-subs-2026-07.js            # dry-run
 *   node scripts/restore-nowpayments-creator-subs-2026-07.js --confirm  # writes
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { CREATOR_REVENUE_RATE, PLATFORM_COMMISSION_RATE, EARNINGS_HOLD_HOURS } = require('../config/monetizationConfig');

const CONFIRM = process.argv.includes('--confirm');

const ORDERS = [
  { dsoId: 52400, orderId: 'pnptv-nowp-7536213346-1784519597174', subscriberId: '7536213346', creatorId: '8599671840', usd: 5.00 },
  { dsoId: 52394, orderId: 'pnptv-nowp-7536213346-1784510357647', subscriberId: '7536213346', creatorId: '8599671840', usd: 5.00 },
  { dsoId: 52281, orderId: 'pnptv-nowp-8706669302-1784346334009', subscriberId: '8706669302', creatorId: '5994313923', usd: 5.00 },
  { dsoId: 52278, orderId: 'pnptv-nowp-8706669302-1784337668356', subscriberId: '8706669302', creatorId: '7246621722', usd: 15.00 },
  { dsoId: 9033,  orderId: 'pnptv-nowp-99e21e5c-5fcb-490b-aa54-769d12de0663-1783083494097', subscriberId: '99e21e5c-5fcb-490b-aa54-769d12de0663', creatorId: '8599671840', usd: 10.00 },
  { dsoId: 3038,  orderId: 'pnptv-nowp-8760179959-1782958836829', subscriberId: '8760179959', creatorId: '50da5ca8-08fa-4a71-a6f0-cab5331391eb', usd: 5.00 },
  { dsoId: 2345,  orderId: 'pnptv-nowp-8312901004-1782624368700', subscriberId: '8312901004', creatorId: '5867063315', usd: 15.00, earningsOnly: true, existingSubscriptionId: '5b4cd493-e7ab-4228-922d-02a56be58009' },
  { dsoId: 2294,  orderId: 'pnptv-nowp-1966945732-1782568012909', subscriberId: '1966945732', creatorId: '8599671840', usd: 15.00, earningsOnly: true, existingSubscriptionId: 'e5b6e2ba-222f-4759-9621-257a7fd0d2e3' },
  { dsoId: 1756,  orderId: 'pnptv-nowp-8757558324-1782423108657', subscriberId: '8757558324', creatorId: '8599671840', usd: 15.00 },
];

async function main() {
  const CreatorService = require('../services/creatorService');
  const ContentComplianceService = require('../services/contentComplianceService');

  logger.info(`Restore run starting — mode: ${CONFIRM ? 'CONFIRM (writing)' : 'DRY-RUN (no writes)'}`);

  for (const order of ORDERS) {
    const exempt = ContentComplianceService.isExempt(order.creatorId);
    console.log(`\n[order ${order.orderId}] subscriber=${order.subscriberId} creator=${order.creatorId} usd=${order.usd} exempt=${exempt}${order.earningsOnly ? ' [EARNINGS-ONLY]' : ''}`);

    if (order.earningsOnly) {
      if (!CONFIRM) {
        const { rows: earningsCheck } = await query(
          `SELECT id FROM creator_earnings WHERE source_payment_id=$1`, [order.orderId]
        );
        console.log(`  would insert creator_earnings only (subscription ${order.existingSubscriptionId} left untouched — already has better active access)`);
        console.log(`  existing earnings row for this order: ${earningsCheck[0] ? 'already exists, would no-op' : 'none — would insert'}`);
        continue;
      }

      try {
        const priceUsd = order.usd;
        const amountCreator = Math.round(priceUsd * CREATOR_REVENUE_RATE * 100) / 100;
        const amountPlatform = Math.round(priceUsd * PLATFORM_COMMISSION_RATE * 100) / 100;

        const { rowCount } = await query(
          `INSERT INTO creator_earnings (creator_id, subscription_id, amount_gross, amount_creator, amount_platform, status, available_at, source_payment_id, period_month)
           VALUES ($1, $2, $3, $4, $5, 'holding', NOW() + ($6 || ' hours')::interval, $7, date_trunc('month', CURRENT_DATE)::date)
           ON CONFLICT (source_payment_id, creator_id) DO NOTHING`,
          [order.creatorId, order.existingSubscriptionId, priceUsd, amountCreator, amountPlatform, String(EARNINGS_HOLD_HOURS), order.orderId]
        );
        console.log(`  earnings ${rowCount > 0 ? 'inserted' : 'already existed (no-op)'}`);

        await query(
          `UPDATE dash_subscription_orders SET status='completed', completed_at=NOW(), notes=$2 WHERE id=$1`,
          [order.dsoId, 'manual_restore_2026-07_earnings_only']
        );
        console.log(`  order ${order.dsoId} marked completed`);
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        logger.error('restore-nowpayments-creator-subs: earnings-only order failed', { orderId: order.orderId, error: err.message });
      }
      continue;
    }

    if (!CONFIRM) {
      const { rows: existing } = await query(
        `SELECT id, status, expires_at, compliance_hold FROM creator_subscriptions WHERE creator_id=$1 AND subscriber_id=$2`,
        [order.creatorId, order.subscriberId]
      );
      const compliant = await ContentComplianceService.isCompliant(order.creatorId);
      console.log(`  would call subscribeToCreator(${order.subscriberId}, ${order.creatorId}, ${order.orderId})`);
      console.log(`  creator currently compliant: ${compliant} — existing subscription row: ${existing[0] ? JSON.stringify(existing[0]) : 'none'}`);
      continue;
    }

    try {
      const result = await CreatorService.subscribeToCreator(order.subscriberId, order.creatorId, order.orderId);
      console.log(`  granted: subscriptionId=${result.subscriptionId} expiresAt=${result.expiresAt || 'HELD (pending content compliance)'}`);

      await query(
        `UPDATE dash_subscription_orders SET status='completed', completed_at=NOW(), notes=$2 WHERE id=$1`,
        [order.dsoId, 'manual_restore_2026-07']
      );
      console.log(`  order ${order.dsoId} marked completed`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      logger.error('restore-nowpayments-creator-subs: order failed', { orderId: order.orderId, error: err.message });
    }
  }

  logger.info('Restore run finished');
  process.exit(0);
}

main().catch((err) => {
  logger.error('restore-nowpayments-creator-subs: fatal', { error: err.message });
  console.error(err);
  process.exit(1);
});
