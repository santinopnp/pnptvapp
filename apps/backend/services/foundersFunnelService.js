'use strict';

/**
 * foundersFunnelService.js
 *
 * 3-Day Trial + Founders Funnel experiment.
 *
 * Flow triggered on every brand-new account creation:
 *   1. Grant the 3-day PRIME trial via EntitlementAccessService.grantTrialPrime()
 *      (inserts user_entitlements rows + calls recomputeUserTier).
 *   2. Stamp users columns: subscription_type='trial', plan_id='prime-trial-3d',
 *      plan_expiry=NOW()+3d, founders_offer_expires_at=NOW()+1h.
 *   3. Enqueue a BullMQ job on the 'notifications' queue, delayed 24 hours, to
 *      deliver the year50 follow-up DM if the user is still on the trial.
 *
 * grantFoundersFunnel() is fire-and-forget safe — it never throws.
 * Any internal error is logged and silently swallowed so a funnel failure
 * never blocks account creation.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

/**
 * Grant the founders funnel to a newly registered user.
 *
 * @param {string} userId — PNPtv users.id (UUID or telegram string ID)
 * @returns {Promise<void>} — never rejects
 */
async function grantFoundersFunnel(userId) {
  if (!userId) return;

  try {
    // ── Step 1: Grant trial entitlement via the canonical method ────────────
    // grantTrialPrime:
    //   - Inserts (or skips) user_entitlements rows for 'prime' and 'pnp-member'
    //     with expires_at = NOW() + 3 days, source_plan_id = 'prime-trial-3d'
    //   - Calls recomputeUserTier + invalidateCache
    //   - Skips silently if the user already holds an active non-trial prime entitlement
    const EntitlementAccessService = require('./entitlementAccessService');
    await EntitlementAccessService.grantTrialPrime(String(userId));

    // ── Step 2: Stamp users row with trial metadata + founders offer window ─
    // Guarded by: tier = 'PRIME' (recomputeUserTier just set this) AND
    //             (plan_expiry IS NULL OR plan_expiry < NOW()) so we don't
    //             overwrite an already-active paid plan in the edge case where
    //             grantTrialPrime skipped due to an existing entitlement.
    const stampResult = await query(`
      UPDATE users
         SET subscription_type          = 'trial',
             plan_id                    = 'prime-trial-3d',
             plan_expiry                = NOW() + INTERVAL '3 days',
             founders_offer_expires_at  = NOW() + INTERVAL '1 hour',
             subscription_status        = 'active',
             updated_at                 = NOW()
       WHERE id = $1::text
         AND tier = 'PRIME'
         AND (plan_expiry IS NULL OR plan_expiry < NOW())
    `, [String(userId)]);

    if (stampResult.rowCount === 0) {
      // Either the user already has an active paid plan or tier wasn't set to PRIME
      // (which means grantTrialPrime skipped). Either way, nothing to do.
      logger.info('[FoundersFunnel] stamp skipped — user already has active plan or non-PRIME tier', { userId });
      return;
    }

    logger.info('[FoundersFunnel] trial granted and stamped', { userId });

    // ── Step 3: Schedule year50 follow-up DM at 24 hours ───────────────────
    const { getQueue } = require('./queueService');
    const notificationsQueue = getQueue('notifications');
    await notificationsQueue.add(
      'year50_funnel_promo',
      { userId: String(userId) },
      { delay: 48 * 60 * 60 * 1000 }  // 48 hours in ms
    );

    logger.info('[FoundersFunnel] year50_funnel_promo job scheduled', { userId, delayMs: 48 * 60 * 60 * 1000 });
  } catch (err) {
    // Never let funnel errors surface to the caller — account creation must not fail.
    logger.error('[FoundersFunnel] grantFoundersFunnel failed (non-fatal)', { userId, error: err.message });
  }
}

module.exports = { grantFoundersFunnel };
