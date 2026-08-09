'use strict';

/**
 * Per-surface feature flags for the wallet checkout migration.
 *
 * All flags default to FALSE (legacy path). When flipped to TRUE via env,
 * the corresponding purchase surface routes through walletCheckoutService
 * instead of its legacy provider (NowPayments / Meru / raw SQL debit).
 *
 * Rollout order (planned in Phase 2+):
 *   1. RUSH        — lowest risk, small amounts, easy to reconcile
 *   2. CREATOR_SUB — already partially there via /wallet/pay-creator-sub
 *   3. MEMBERSHIP  — pnp-member $9.99
 *   4. PRIME       — monthly-pass $24.99
 *   5. CHANNEL     — per-channel scoped access
 *   6. HANGOUT     — per-hangout scoped access
 *   7. CALLS       — private call packages (slot-lock semantics preserved)
 *
 * Each flag is independently switchable so a broken rollout can be reverted
 * without touching the others.
 */

const TRUE_VALUES = new Set(['1', 'true', 'TRUE', 'yes', 'on']);

function boolEnv(name) {
  return TRUE_VALUES.has(String(process.env[name] || '').trim());
}

const SURFACES = ['rush', 'creator_sub', 'membership', 'prime', 'channel', 'hangout', 'call'];

function isSurfaceWalletEnabled(surface) {
  switch (surface) {
    case 'rush':        return boolEnv('WALLET_CHECKOUT_RUSH');
    case 'creator_sub': return boolEnv('WALLET_CHECKOUT_CREATOR_SUB');
    case 'membership':  return boolEnv('WALLET_CHECKOUT_MEMBERSHIP');
    case 'prime':       return boolEnv('WALLET_CHECKOUT_PRIME');
    case 'channel':     return boolEnv('WALLET_CHECKOUT_CHANNEL');
    case 'hangout':     return boolEnv('WALLET_CHECKOUT_HANGOUT');
    case 'call':        return boolEnv('WALLET_CHECKOUT_CALLS');
    default:            return false;
  }
}

/**
 * Snapshot of current flag state — useful for admin dashboards and boot
 * logging. Never called in the hot path.
 */
function getAllFlags() {
  return SURFACES.reduce((acc, s) => {
    acc[s] = isSurfaceWalletEnabled(s);
    return acc;
  }, {});
}

module.exports = {
  isSurfaceWalletEnabled,
  getAllFlags,
  SURFACES,
};
