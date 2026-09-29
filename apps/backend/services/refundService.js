'use strict';

/**
 * refundService.js
 *
 * 72h manual-review refund queue for USDC-on-Base checkout_intents payments.
 *
 *   1. requestRefund   — user files a request; status='pending', reviewed by ops.
 *   2. approveRefund    — USDC sent straight to the user's wallet (provisioning
 *      one via Privy first if they don't have one yet); logs the tx.
 *   3. denyRefund       — starts the denial-signature flow: the user must sign
 *      a denial-acknowledgement message with their linked wallet (blockchain
 *      signature via Privy, never email) before the denial is considered final.
 *   4. recordRefundDenialSignature — verifies the signature against the
 *      user's linked wallet address and, on success, marks
 *      refund_denial_signed=true + stores the signature hash. This waives
 *      further chargeback claims against Moonpay/Privy/Stripe for the
 *      payment in question.
 */

const crypto = require('crypto');
const { recoverMessageAddress } = require('viem');
const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const REFUND_DENIAL_SIGNATURE_TIMEOUT_HOURS = parseInt(
  process.env.REFUND_DENIAL_SIGNATURE_TIMEOUT_HOURS || '720',
  10,
);

function err(code, msg, status = 400) {
  const e = new Error(msg);
  e.code = code;
  e.status = status;
  return e;
}

/**
 * Canonical message the user's wallet must sign to acknowledge a refund
 * denial. Built server-side (not client-supplied) so the signature can't be
 * replayed against a different refund or forged by editing the message.
 */
function getDenialMessage(refund) {
  return (
    `PNPtv refund denial acknowledgement\n` +
    `Refund ID: ${refund.id}\n` +
    `Payment ID: ${refund.payment_id}\n` +
    `I acknowledge this refund request was denied and waive further chargeback ` +
    `claims against Moonpay, Privy, or Stripe for this payment.`
  );
}

/**
 * File a refund request for a confirmed on-chain payment.
 *
 * @param {object} opts
 * @param {number} opts.paymentId — checkout_intents.id
 * @param {string} opts.userId    — must own the payment
 * @param {string} [opts.reason]
 * @returns {Promise<object>} the created refunds row
 */
async function requestRefund({ paymentId, userId, reason }) {
  if (!paymentId) throw err('MISSING_PAYMENT_ID', 'paymentId is required');
  if (!userId) throw err('MISSING_USER_ID', 'userId is required');

  const { rows } = await query(
    `SELECT id, user_id, amount_usd, status FROM checkout_intents WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [paymentId, String(userId)],
  );
  const payment = rows[0];
  if (!payment) throw err('PAYMENT_NOT_FOUND', 'Payment not found or not owned by user', 404);
  if (payment.status !== 'confirmed') {
    throw err('PAYMENT_NOT_CONFIRMED', 'Only confirmed on-chain payments can be refunded');
  }

  const dup = await query(
    `SELECT id FROM refunds WHERE payment_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
    [paymentId],
  );
  if (dup.rowCount > 0) {
    throw err('REFUND_ALREADY_EXISTS', 'A refund request already exists for this payment', 409);
  }

  const { rows: inserted } = await query(
    `INSERT INTO refunds (payment_id, user_id, amount_usd, reason, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [paymentId, String(userId), payment.amount_usd, reason ? String(reason).slice(0, 2000) : null],
  );
  const refund = inserted[0];
  logger.info('[refundService] refund requested', { refundId: refund.id, paymentId, userId });
  _notifyOpsNewRefund(refund).catch((e) => logger.warn('[refundService] ops notify failed', { err: e.message }));
  return refund;
}

/**
 * Read a refund. When `userId` is passed (non-admin caller), enforces
 * ownership.
 */
async function getRefund(refundId, { userId, isAdmin = false } = {}) {
  const { rows } = await query(`SELECT * FROM refunds WHERE id = $1 LIMIT 1`, [refundId]);
  const refund = rows[0];
  if (!refund) return null;
  if (!isAdmin && userId && String(refund.user_id) !== String(userId)) {
    throw err('FORBIDDEN', 'Not your refund', 403);
  }
  return refund;
}

/**
 * Approve a pending refund: send USDC on Base directly to the user's
 * wallet, provisioning one via Privy first if they don't have one.
 *
 * @param {number} refundId
 * @param {object} [opts]
 * @param {string} [opts.notes]
 * @param {string} [opts.reviewedBy]
 * @returns {Promise<object>} the updated refunds row
 */
async function approveRefund(refundId, opts = {}) {
  const { notes = null, reviewedBy = null } = typeof opts === 'string' ? { notes: opts } : opts;

  const { rows } = await query(`SELECT * FROM refunds WHERE id = $1 LIMIT 1`, [refundId]);
  const refund = rows[0];
  if (!refund) throw err('REFUND_NOT_FOUND', 'Refund not found', 404);
  if (refund.status !== 'pending') throw err('REFUND_NOT_PENDING', 'Refund already reviewed', 409);

  const { rows: userRows } = await query(
    `SELECT wallet_address, privy_id FROM users WHERE id = $1 LIMIT 1`,
    [refund.user_id],
  );
  const user = userRows[0];
  if (!user) throw err('USER_NOT_FOUND', 'Refund recipient no longer exists', 404);

  let toAddress = user.wallet_address;
  if (!toAddress) {
    if (!user.privy_id) {
      throw err('NO_WALLET_NO_PRIVY', 'User has no wallet and no linked Privy identity — cannot create one to refund into');
    }
    const { provisionCreatorWallet } = require('./payoutSplitService');
    const provisioned = await provisionCreatorWallet(refund.user_id);
    if (!provisioned.address) {
      throw err('WALLET_PROVISION_FAILED', provisioned.reason || 'Could not create a wallet for this user');
    }
    toAddress = provisioned.address;
  }

  const txHash = await _sendRefundUsdc({
    refundId: refund.id,
    toAddress,
    amountUsd: parseFloat(refund.amount_usd),
  });

  const { rows: updated } = await query(
    `UPDATE refunds
        SET status = 'approved', reviewed_by = $2, review_notes = $3,
            reviewed_at = NOW(), to_address = $4, tx_hash = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [refundId, reviewedBy, notes, toAddress, txHash],
  );
  logger.info('[refundService] refund approved & paid', { refundId, txHash, toAddress, amountUsd: refund.amount_usd });
  return updated[0];
}

/**
 * Deny a pending refund and start the blockchain denial-signature flow.
 *
 * @param {number} refundId
 * @param {string} reasons
 * @param {string} [reviewedBy]
 * @returns {Promise<object>} the updated refunds row
 */
async function denyRefund(refundId, reasons, reviewedBy = null) {
  const { rows } = await query(`SELECT * FROM refunds WHERE id = $1 LIMIT 1`, [refundId]);
  const refund = rows[0];
  if (!refund) throw err('REFUND_NOT_FOUND', 'Refund not found', 404);
  if (refund.status !== 'pending') throw err('REFUND_NOT_PENDING', 'Refund already reviewed', 409);

  const deadline = new Date(Date.now() + REFUND_DENIAL_SIGNATURE_TIMEOUT_HOURS * 3600 * 1000);

  const { rows: updated } = await query(
    `UPDATE refunds
        SET status = 'denied', reviewed_by = $2, denial_reasons = $3,
            reviewed_at = NOW(), signature_requested_at = NOW(),
            signature_deadline_at = $4, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [refundId, reviewedBy, reasons ? String(reasons).slice(0, 2000) : null, deadline],
  );
  const denied = updated[0];
  logger.info('[refundService] refund denied', { refundId, deadline });
  _notifyUserDenied(denied).catch((e) => logger.warn('[refundService] denial DM failed', { err: e.message }));
  return denied;
}

/**
 * Record the user's blockchain signature acknowledging a refund denial.
 * Verifies the signature against the user's linked wallet address for the
 * server-built canonical message (getDenialMessage) — never trusts a
 * client-supplied message. Idempotent: re-submitting after already signed
 * just returns the existing row.
 *
 * @param {number} refundId
 * @param {string} signature — hex signature from the user's Privy wallet
 * @returns {Promise<object>} the updated refunds row
 */
async function recordRefundDenialSignature(refundId, signature) {
  if (!signature || typeof signature !== 'string') {
    throw err('INVALID_SIGNATURE', 'signature is required');
  }

  const { rows } = await query(`SELECT * FROM refunds WHERE id = $1 LIMIT 1`, [refundId]);
  const refund = rows[0];
  if (!refund) throw err('REFUND_NOT_FOUND', 'Refund not found', 404);
  if (refund.status !== 'denied') throw err('REFUND_NOT_DENIED', 'Refund is not in denied state', 409);
  if (refund.refund_denial_signed) return refund;

  const { rows: userRows } = await query(`SELECT wallet_address FROM users WHERE id = $1 LIMIT 1`, [refund.user_id]);
  const address = userRows[0]?.wallet_address;
  if (!address) throw err('NO_WALLET', 'User has no linked wallet to verify the signature against');

  // Privy embedded wallets are plain EOAs, so pure ECDSA recovery (no RPC
  // call, no EIP-1271 contract-wallet path) is sufficient and avoids an
  // extra dependency on Base RPC availability for this check.
  const message = getDenialMessage(refund);
  let recovered = null;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch (e) {
    logger.warn('[refundService] signature recovery threw', { refundId, err: e.message });
  }
  if (!recovered || recovered.toLowerCase() !== String(address).toLowerCase()) {
    throw err('INVALID_SIGNATURE', 'Signature verification failed');
  }

  if (refund.signature_deadline_at && new Date() > new Date(refund.signature_deadline_at)) {
    logger.warn('[refundService] denial signature received past deadline', { refundId, deadline: refund.signature_deadline_at });
  }

  const signatureHash = crypto.createHash('sha256').update(signature).digest('hex');
  const { rows: updated } = await query(
    `UPDATE refunds
        SET refund_denial_signed = TRUE, signature_hash = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [refundId, signatureHash],
  );
  logger.info('[refundService] denial signature recorded', { refundId });
  return updated[0];
}

// ── On-chain USDC send for approved refunds ───────────────────────────────────

async function _sendRefundUsdc({ refundId, toAddress, amountUsd }) {
  const { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits } = require('viem');
  const { privateKeyToAccount } = require('viem/accounts');
  const { base } = require('viem/chains');

  const pk = process.env.GAS_TREASURY_PRIVATE_KEY;
  if (!pk) throw err('REFUND_DISABLED', 'GAS_TREASURY_PRIVATE_KEY not configured', 503);

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  const rpcUrl = process.env.ALCHEMY_API_KEY
    ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : 'https://mainnet.base.org';
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const USDC_TRANSFER_ABI = [{
    name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  }];
  const value = parseUnits(amountUsd.toFixed(6), 6);
  const data = encodeFunctionData({ abi: USDC_TRANSFER_ABI, functionName: 'transfer', args: [toAddress, value] });

  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const hash = await walletClient.sendTransaction({ to: USDC_ADDRESS, data });
      await _logRefundTx({ refundId, txHash: hash, fromAddress: account.address, toAddress, amountUsd, status: 'sent', attempt });
      logger.info('[refundService] refund USDC sent', { refundId, toAddress, amountUsd, hash, attempt });
      return hash;
    } catch (e) {
      lastErr = e;
      await _logRefundTx({ refundId, fromAddress: account.address, toAddress, amountUsd, status: 'failed', error: e.message, attempt });
      if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw err('REFUND_SEND_FAILED', `Refund USDC send failed after ${MAX_ATTEMPTS} attempts: ${lastErr.message}`, 502);
}

async function _logRefundTx({ refundId, txHash, fromAddress, toAddress, amountUsd, status, error, attempt }) {
  try {
    await query(
      `INSERT INTO payment_transactions
         (payment_id, purpose, tx_hash, from_address, to_address, token, chain, amount_usd, status, error, attempt)
       VALUES ($1, 'refund', $2, $3, $4, 'USDC', 'base', $5, $6, $7, $8)`,
      [String(refundId), txHash || null, fromAddress || null, toAddress, amountUsd, status, error || null, attempt],
    );
  } catch (e) {
    logger.warn('[refundService] failed to log payment_transactions row', { refundId, err: e.message });
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function _notifyOpsNewRefund(refund) {
  const channel = process.env.SLACK_OPS_ADMIN_CHANNEL || process.env.SLACK_OPS_INCIDENTS_CHANNEL;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!channel || !token) return;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      channel,
      text: `🧾 New refund request — \`${refund.id}\` · user \`${refund.user_id}\` · $${refund.amount_usd} · payment \`${refund.payment_id}\`\nReview within 72h.`,
    }),
  });
}

async function _notifyUserDenied(refund) {
  try {
    const sendSystemDM = require('./sendSystemDM');
    const SYSTEM_SENDER = process.env.SYSTEM_SENDER_ID || '8552451957';
    const reasons = refund.denial_reasons || 'No cumple con los criterios de reembolso.';
    await sendSystemDM(
      SYSTEM_SENDER,
      String(refund.user_id),
      `Tu solicitud de reembolso #${refund.id} fue negada.\n\nMotivo: ${reasons}\n\nPara cerrar el caso necesitamos que firmes (con tu billetera, sin costo) el acuse de recibo de esta decisión. Te lo pediremos la próxima vez que abras la app.`,
      query,
    );
  } catch (e) {
    logger.warn('[refundService] denial DM failed', { refundId: refund.id, err: e.message });
  }
}

module.exports = {
  requestRefund,
  getRefund,
  approveRefund,
  denyRefund,
  recordRefundDenialSignature,
  getDenialMessage,
};
