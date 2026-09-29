'use strict';

/**
 * privyWalletService.js
 *
 * Creator/performer payout-side wallet management. Sits on top of the
 * wallet-linking primitives in privyLinkService.js and the provisioning /
 * on-chain dispatch primitives in payoutSplitService.js:
 *
 *  - ensureCreatorWallet(userId)     — called on creator/performer approval.
 *    Provisions a Privy embedded wallet if the user doesn't have one yet,
 *    then auto-configures their payout method to PNPtv Treasury Wallet.
 *  - configurePaymentMethod(userId)  — sets users.has_pnptv_payout_configured.
 *    Requires creator_status='active' AND a linked wallet_address — rejects
 *    (NOT_ELIGIBLE / NO_WALLET) otherwise, so an ordinary user calling the
 *    public route can't flip this flag on themselves.
 *  - getCreatorPayoutConfig(userId)  — read model for the "payment configured"
 *    UI state.
 *  - validateSingleWallet(address, userId) — app-level pre-check mirroring the
 *    DB unique index (idx_users_wallet_address_unique) so callers get a
 *    friendly rejection instead of a raw 23505.
 *
 * Only one payout method exists today: 'pnptv_treasury' (USDC on Base, sent
 * to the user's Privy embedded wallet). No external-wallet import is
 * supported anywhere in this module — see privyLinkService.extractWalletAddress,
 * which only recognizes walletClientType === 'privy'.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { provisionCreatorWallet } = require('./payoutSplitService');

const PNPTV_TREASURY_METHOD = 'pnptv_treasury';

/**
 * Ensure an approved creator/performer has a payout-ready wallet:
 *   1. Provision a Privy embedded wallet if missing (idempotent).
 *   2. Auto-configure payout method to PNPtv Treasury Wallet.
 *   3. Notify the user (DM) + ops (Slack) the first time this completes.
 *
 * Safe to call repeatedly — every step underneath is idempotent. If the
 * wallet still isn't ready (no privy_id yet, or provisioning failed),
 * configurePaymentMethod's eligibility check rejects with NOT_ELIGIBLE/
 * NO_WALLET — that's expected and swallowed here; payoutConfigured stays
 * false until a later call (next /api/privy/link, or re-approval) succeeds.
 *
 * @param {string} userId
 * @returns {Promise<{ provisioned: boolean, address: string|null, payoutConfigured: boolean }>}
 */
async function ensureCreatorWallet(userId) {
  if (!userId) throw new Error('userId required');

  const walletResult = await provisionCreatorWallet(userId);
  if (!walletResult.provisioned && !walletResult.address) {
    logger.info('[privyWallet] ensureCreatorWallet deferred', { userId, reason: walletResult.reason });
  }

  try {
    const configResult = await configurePaymentMethod(userId, PNPTV_TREASURY_METHOD);
    return {
      provisioned: walletResult.provisioned,
      address: walletResult.address,
      payoutConfigured: configResult.configured || configResult.alreadyConfigured,
    };
  } catch (err) {
    if (err.code === 'NOT_ELIGIBLE' || err.code === 'NO_WALLET') {
      return { provisioned: walletResult.provisioned, address: walletResult.address, payoutConfigured: false };
    }
    throw err;
  }
}

/**
 * Set the creator's payout method. Only 'pnptv_treasury' exists today.
 * Idempotent — returns alreadyConfigured=true without writing if already set.
 *
 * Requires the caller to actually be an active creator/performer with a
 * linked wallet — without this check, any authenticated (non-creator) user
 * could hit the public POST /api/privy/payment-method route and flip
 * has_pnptv_payout_configured on themselves.
 *
 * @param {string} userId
 * @param {string} [method='pnptv_treasury']
 * @returns {Promise<{ configured: boolean, alreadyConfigured: boolean, method: string }>}
 */
async function configurePaymentMethod(userId, method = PNPTV_TREASURY_METHOD) {
  if (!userId) throw new Error('userId required');
  if (method !== PNPTV_TREASURY_METHOD) {
    const e = new Error(`unsupported_payment_method: ${method}`);
    e.code = 'UNSUPPORTED_PAYMENT_METHOD';
    throw e;
  }

  const { rows } = await query(
    `SELECT creator_status, wallet_address, has_pnptv_payout_configured FROM users WHERE id = $1 LIMIT 1`,
    [String(userId)],
  );
  const user = rows[0];
  if (!user) {
    const e = new Error('user_not_found');
    e.code = 'USER_NOT_FOUND';
    e.status = 404;
    throw e;
  }
  if (user.creator_status !== 'active') {
    const e = new Error('not_an_active_creator');
    e.code = 'NOT_ELIGIBLE';
    e.status = 403;
    throw e;
  }
  if (!user.wallet_address) {
    const e = new Error('no_wallet_linked');
    e.code = 'NO_WALLET';
    e.status = 409;
    throw e;
  }
  if (user.has_pnptv_payout_configured) {
    return { configured: false, alreadyConfigured: true, method: PNPTV_TREASURY_METHOD };
  }

  await query(
    `UPDATE users SET has_pnptv_payout_configured = TRUE, updated_at = NOW() WHERE id = $1`,
    [String(userId)],
  );
  logger.info('[privyWallet] payout method configured', { userId, method: PNPTV_TREASURY_METHOD });
  _notifyPayoutConfigured(userId).catch((err) =>
    logger.warn('[privyWallet] payout-configured notify failed', { userId, err: err.message }),
  );

  return { configured: true, alreadyConfigured: false, method: PNPTV_TREASURY_METHOD };
}

/**
 * Read model for the "Billetera de pagos configurada" UI state.
 *
 * @param {string} userId
 * @returns {Promise<{ walletAddress: string|null, hasPnptvPayoutConfigured: boolean, creatorStatus: string|null, method: string|null } | null>}
 */
async function getCreatorPayoutConfig(userId) {
  const { rows } = await query(
    `SELECT wallet_address, has_pnptv_payout_configured, creator_status
       FROM users WHERE id = $1 LIMIT 1`,
    [String(userId)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    walletAddress: row.wallet_address || null,
    hasPnptvPayoutConfigured: !!row.has_pnptv_payout_configured,
    creatorStatus: row.creator_status || null,
    method: row.has_pnptv_payout_configured ? PNPTV_TREASURY_METHOD : null,
  };
}

/**
 * Confirm `newAddress` isn't already claimed by a different user.
 * Case-insensitive. Complements — does not replace — the DB-level unique
 * index (idx_users_wallet_address_unique, migration 370): this check lets a
 * caller reject the attempt with a friendly message before hitting the DB,
 * while the index remains the hard backstop against a race.
 *
 * @param {string} newAddress
 * @param {string} userId — the user attempting to claim the address
 * @throws {Error} code=MULTIPLE_WALLETS_NOT_ALLOWED if already owned by someone else
 */
async function validateSingleWallet(newAddress, userId) {
  const normalized = String(newAddress || '').trim().toLowerCase();
  if (!normalized) {
    const e = new Error('address_required');
    e.code = 'ADDRESS_REQUIRED';
    throw e;
  }
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    const e = new Error('invalid_address');
    e.code = 'INVALID_ADDRESS';
    throw e;
  }

  const { rows } = await query(
    `SELECT id FROM users WHERE lower(wallet_address) = $1 AND id <> $2 LIMIT 1`,
    [normalized, String(userId)],
  );
  if (rows.length > 0) {
    const e = new Error('Solo puedes tener 1 billetera');
    e.code = 'MULTIPLE_WALLETS_NOT_ALLOWED';
    e.otherUserId = rows[0].id;
    throw e;
  }
  return true;
}

async function _notifyPayoutConfigured(userId) {
  try {
    const sendSystemDM = require('./sendSystemDM');
    const SYSTEM_SENDER = process.env.SYSTEM_SENDER_ID || '8552451957';
    await sendSystemDM(
      SYSTEM_SENDER,
      String(userId),
      '✅ Billetera de pagos configurada — tu método de cobro es PNPtv Treasury Wallet. Tus ganancias como Creador/Performer llegan en USDC (Base) directo a tu billetera.',
      query,
    );
  } catch (err) {
    logger.warn('[privyWallet] DM notify failed', { userId, err: err.message });
  }

  try {
    const channel = process.env.SLACK_OPS_ADMIN_CHANNEL || process.env.SLACK_OPS_INCIDENTS_CHANNEL;
    const token = process.env.SLACK_BOT_TOKEN;
    if (channel && token) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          channel,
          text: `💳 Payout auto-configurado — user \`${userId}\` → PNPtv Treasury Wallet`,
        }),
      });
    }
  } catch { /* non-fatal */ }
}

module.exports = {
  PNPTV_TREASURY_METHOD,
  ensureCreatorWallet,
  configurePaymentMethod,
  getCreatorPayoutConfig,
  validateSingleWallet,
};
