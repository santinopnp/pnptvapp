'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

// ── Version constants ────────────────────────────────────────────────────────
// Bump these strings to force all users through re-acceptance of a new version.
const RULES_VERSION   = '1.0';
const TERMS_VERSION   = '1.0';
const PRIVACY_VERSION = '1.0';

// Ordered wizard steps. The frontend drives display order; here we just need
// the full set to determine completion.
const ALL_STEPS = ['tiers', 'age', 'terms', 'privacy', 'rules', 'values', 'crypto'];

/**
 * Returns the onboarding status for a user.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   complete: boolean,
 *   steps: Record<string, boolean>,
 *   currentStep: string|null
 * }>}
 */
async function getOnboardingStatus(userId) {
  const { rows } = await query(
    `SELECT
       onboarding_complete,
       tiers_seen_at,
       date_of_birth,
       age_verified,
       terms_accepted,
       privacy_accepted,
       rules_accepted,
       values_acknowledged_at,
       crypto_onboarded_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const u = rows[0];

  const steps = {
    tiers:   !!u.tiers_seen_at,
    age:     !!(u.date_of_birth && u.age_verified),
    terms:   !!u.terms_accepted,
    privacy: !!u.privacy_accepted,
    rules:   !!u.rules_accepted,
    values:  !!u.values_acknowledged_at,
    crypto:  !!u.crypto_onboarded_at,
  };

  // First incomplete step in wizard order
  const currentStep = ALL_STEPS.find((s) => !steps[s]) || null;

  return {
    complete: !!u.onboarding_complete,
    steps,
    currentStep,
  };
}

/**
 * Records the user's completion of a single wizard step.
 *
 * @param {string} userId
 * @param {string} step   - one of ALL_STEPS
 * @param {object} payload
 * @param {string} ip
 * @returns {Promise<{ ok: true } | { error: string }>}
 */
async function markStep(userId, step, payload, ip) {
  if (!ALL_STEPS.includes(step)) {
    return { error: 'invalid_step' };
  }

  switch (step) {
    case 'tiers': {
      await query(
        `UPDATE users SET tiers_seen_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [userId]
      );
      break;
    }

    case 'age': {
      const { dob } = payload || {};
      if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return { error: 'invalid_dob_format' };
      }

      const birthDate = new Date(dob);
      if (isNaN(birthDate.getTime())) {
        return { error: 'invalid_dob_format' };
      }

      // Server-side age calculation — no frontend trust
      const today   = new Date();
      let age        = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 18) {
        return { error: 'must_be_18' };
      }

      await query(
        `UPDATE users
         SET date_of_birth   = $2,
             age_verified     = true,
             age_verified_at  = NOW(),
             updated_at       = NOW()
         WHERE id = $1`,
        [userId, dob]
      );
      break;
    }

    case 'terms': {
      await query(
        `UPDATE users
         SET terms_accepted     = true,
             terms_accepted_at  = NOW(),
             terms_accepted_ip  = $2,
             terms_version      = $3,
             updated_at         = NOW()
         WHERE id = $1`,
        [userId, ip || null, TERMS_VERSION]
      );
      break;
    }

    case 'privacy': {
      await query(
        `UPDATE users
         SET privacy_accepted     = true,
             privacy_accepted_at  = NOW(),
             privacy_accepted_ip  = $2,
             privacy_version      = $3,
             updated_at           = NOW()
         WHERE id = $1`,
        [userId, ip || null, PRIVACY_VERSION]
      );
      break;
    }

    case 'rules': {
      await query(
        `UPDATE users
         SET rules_accepted     = true,
             rules_accepted_at  = NOW(),
             rules_accepted_ip  = $2,
             rules_version      = $3,
             updated_at         = NOW()
         WHERE id = $1`,
        [userId, ip || null, RULES_VERSION]
      );
      break;
    }

    case 'values': {
      await query(
        `UPDATE users
         SET values_acknowledged_at = NOW(),
             updated_at             = NOW()
         WHERE id = $1`,
        [userId]
      );
      break;
    }

    case 'crypto': {
      await query(
        `UPDATE users
         SET crypto_onboarded_at = NOW(),
             updated_at          = NOW()
         WHERE id = $1`,
        [userId]
      );
      break;
    }

    default:
      return { error: 'invalid_step' };
  }

  return { ok: true };
}

/**
 * Finalizes onboarding after verifying ALL steps are complete server-side.
 * Sets onboarding_complete = true only when all 7 steps pass.
 *
 * @param {string} userId
 * @returns {Promise<{ complete: true } | { error: string, missing: string[] }>}
 */
async function completeOnboarding(userId) {
  const status = await getOnboardingStatus(userId);

  const missing = ALL_STEPS.filter((s) => !status.steps[s]);
  if (missing.length > 0) {
    return { error: 'missing_steps', missing };
  }

  await query(
    `UPDATE users SET onboarding_complete = true, updated_at = NOW() WHERE id = $1`,
    [userId]
  );

  logger.info(`[Onboarding] User ${userId} completed onboarding wizard`);

  // Grant the tutorial bonus (180 gifted Ru$h + 30-day pnp-member trial).
  // Wrapped so a bonus failure never prevents onboarding completion.
  try {
    const result = await grantOnboardingBonus(userId);
    if (result?.granted) {
      logger.info('[Onboarding] Tutorial bonus granted', { userId, ...result });
    }
  } catch (err) {
    logger.error('[Onboarding] Bonus grant failed (onboarding still complete)', {
      userId,
      error: err.message,
    });
  }

  return { complete: true };
}

/**
 * Grant the one-time onboarding tutorial bonus:
 *  - 180 gifted Ru$h (spendable on santinofurioso first sub via the pay-creator-sub
 *    allow-gifted branch)
 *  - 30-day pnp-member entitlement so the sub endpoint's MEMBER_REQUIRED check passes
 *  - Marks users.onboarding_bonus_granted_at so re-runs are silent no-ops.
 *
 * Idempotent: WHERE onboarding_bonus_granted_at IS NULL guards the whole grant.
 * Skipped for creators (creator role/status) so a creator finishing onboarding
 * doesn't get gifted Ru$h that would collide with tokenLedger's creator-guard.
 */
async function grantOnboardingBonus(userId) {
  const { rows } = await query(
    `SELECT id, role, creator_status, onboarding_bonus_granted_at
       FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return { granted: false, reason: 'user_not_found' };
  if (user.onboarding_bonus_granted_at) return { granted: false, reason: 'already_granted' };

  const isCreator =
    user.role === 'creator' || user.role === 'model' || user.creator_status === 'active';
  if (isCreator) {
    // Creators skip the gifted grant (would be silently dropped by ledger guard
    // anyway) but still get the timestamp marker so we don't retry.
    await query(
      `UPDATE users SET onboarding_bonus_granted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND onboarding_bonus_granted_at IS NULL`,
      [userId]
    );
    return { granted: false, reason: 'creator_skipped' };
  }

  const tokenLedger = require('./tokenLedgerService');
  const client = await require('../config/postgres').getPool().connect();
  try {
    await client.query('BEGIN');

    // Atomic idempotency claim — flip the timestamp first, then grant. If another
    // concurrent request already claimed the row, rowCount === 0 and we bail out.
    const claim = await client.query(
      `UPDATE users SET onboarding_bonus_granted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND onboarding_bonus_granted_at IS NULL
         RETURNING id`,
      [userId]
    );
    if (claim.rowCount === 0) {
      await client.query('ROLLBACK');
      return { granted: false, reason: 'race_lost' };
    }

    // Gifted Ru$h — priced to cover santinofurioso's $30 monthly sub exactly
    // ($30 × 6 tok/USD = 180). Reason 'admin_grant' with metadata tag so
    // finance can filter promo grants from organic purchases.
    await tokenLedger.credit({
      userId: String(userId),
      giftedDelta: 180,
      reason: 'admin_grant',
      sourceType: 'onboarding_bonus',
      actorId: 'system:onboarding',
      metadata: { bonus: 'onboarding_v1', tutorial_target: 'santinofurioso' },
      externalClient: client,
    });

    // 30-day pnp-member trial. Lets the /api/wallet/pay-creator-sub endpoint's
    // MEMBER_REQUIRED check pass, so the user can actually spend the 180
    // gifted on santinofurioso's monthly. Skipped when the user already has
    // an active pnp-member entitlement (e.g. arrived onboarding via a legacy
    // paid path) — otherwise the uq_user_entitlement_non_creator constraint
    // would throw and roll back the whole grant, wasting the 180 gifted too.
    const { rows: existingMember } = await client.query(
      `SELECT 1 FROM user_entitlements
         WHERE user_id = $1 AND add_on_id = 'pnp-member' AND creator_id IS NULL
           AND (is_lifetime = true OR expires_at > NOW())
         LIMIT 1`,
      [String(userId)]
    );
    if (existingMember.length === 0) {
      await client.query(
        `INSERT INTO user_entitlements
           (user_id, add_on_id, is_lifetime, expires_at, auto_renew, grant_source)
         VALUES ($1, 'pnp-member', false, NOW() + INTERVAL '30 days', false, 'onboarding_bonus')`,
        [String(userId)]
      );
    }

    await client.query('COMMIT');

    // Invalidate entitlement/user caches so the frontend sees pnp-member immediately.
    try {
      const { cache } = require('../config/redis');
      await Promise.all([
        cache.del(`wallet:${userId}`).catch(() => {}),
        cache.del(`wallet:obj:${userId}`).catch(() => {}),
        cache.del(`entitlements:${userId}`).catch(() => {}),
        cache.del(`user:tier:${userId}`).catch(() => {}),
      ]);
    } catch { /* non-fatal */ }

    return {
      granted: true,
      gifted: 180,
      trialDays: 30,
      trialAddOn: 'pnp-member',
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  RULES_VERSION,
  TERMS_VERSION,
  PRIVACY_VERSION,
  getOnboardingStatus,
  markStep,
  completeOnboarding,
  grantOnboardingBonus,
};
