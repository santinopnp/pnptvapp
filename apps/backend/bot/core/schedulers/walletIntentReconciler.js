'use strict';

/**
 * Reconciles wallet-checkout intents whose on-chain transaction confirmed
 * but never got verify-tx'd by the client (tab closed, network drop, etc.).
 *
 * Without this, an intent stays 'pending' until expires_at (30 min) even
 * though the tx already landed. Forensics on 30d of data showed 186/194
 * expired intents — many with a broadcast tx that we never reconciled.
 *
 * Every 60s: pick pending wallet_usdc intents that have a tx_hash set (or
 * whose from_address might match a recent Alchemy-observable transfer),
 * fetch the receipt from Alchemy JSON-RPC, then call the existing
 * walletCheckoutService.verifyAndFulfill* to run the same grant path the
 * synchronous verify-tx route uses.
 *
 * Note: only reconciles intents that HAVE a tx_hash (i.e. user broadcast
 * but we never confirmed). Intents where the user never even signed are a
 * different problem — solved by Commit A's client-error instrumentation.
 */

const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');
const walletCheckoutService = require('../../../services/walletCheckoutService');

const CHECK_INTERVAL = 60 * 1000;
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function _fetchEthTransferReceipt(txHash, expectedRecipient) {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return { ok: false, reason: 'alchemy_not_configured' };
  const url = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;

  let tx, receipt;
  try {
    const [txRes, rcptRes] = await Promise.all([
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] }),
      }),
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [txHash] }),
      }),
    ]);
    tx = (await txRes.json()).result;
    receipt = (await rcptRes.json()).result;
  } catch (err) {
    return { ok: false, reason: 'rpc_failed', err: err.message };
  }
  if (!tx || !receipt) return { ok: false, reason: 'tx_not_found_or_unconfirmed' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'tx_reverted' };
  if (!tx.to) return { ok: false, reason: 'no_to_field' };
  if (String(tx.to).toLowerCase() !== String(expectedRecipient).toLowerCase()) {
    return { ok: false, reason: 'wrong_recipient' };
  }
  const valueWei = BigInt(tx.value || '0x0');
  if (valueWei <= 0n) return { ok: false, reason: 'zero_value' };
  return { ok: true, valueWei, from: String(tx.from).toLowerCase() };
}

async function _fetchUsdcTransferReceipt(txHash, expectedRecipient) {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return { ok: false, reason: 'alchemy_not_configured' };
  const url = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;

  let receipt;
  try {
    const rpcRes = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
    });
    receipt = (await rpcRes.json()).result;
  } catch (err) {
    return { ok: false, reason: 'rpc_failed', err: err.message };
  }
  if (!receipt) return { ok: false, reason: 'tx_not_found_or_unconfirmed' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'tx_reverted' };

  const targetPadded = '0x' + String(expectedRecipient).toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const transferLog = (receipt.logs || []).find(l =>
    String(l.address).toLowerCase() === USDC &&
    l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
    String(l.topics?.[2]).toLowerCase() === targetPadded
  );
  if (!transferLog) return { ok: false, reason: 'no_matching_usdc_transfer' };

  const rawAmount = BigInt(transferLog.data);
  const amount = Number(rawAmount) / 1_000_000;
  const from = '0x' + String(transferLog.topics[1]).toLowerCase().replace(/^0x/, '').slice(-40);
  return { ok: true, amount, from };
}

class WalletIntentReconciler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.stats = { checked: 0, confirmed: 0, reverted: 0, unconfirmed: 0, rpcErr: 0 };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    // Kick off after 15s to avoid piling into startup.
    setTimeout(() => this.runChecks().catch(() => {}), 15_000);
    this.interval = setInterval(() => this.runChecks().catch(() => {}), CHECK_INTERVAL);
    logger.info('[walletIntentReconciler] started (60s interval)');
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.isRunning = false;
  }

  async runChecks() {
    if (!process.env.ALCHEMY_API_KEY) return; // silent no-op if not configured

    // Pending intents that broadcast a tx but never got verified. Include a
    // 30-min grace past expires_at so late-landing txs still credit.
    const { rows } = await query(`
      SELECT id, user_id, tx_hash, token, receiving_address, expected_amount_native, amount_usd
        FROM checkout_intents
       WHERE provider = 'wallet_usdc'
         AND status = 'pending'
         AND tx_hash IS NOT NULL
         AND created_at > NOW() - INTERVAL '2 hours'
       ORDER BY created_at ASC
       LIMIT 50
    `);

    if (rows.length === 0) return;

    for (const intent of rows) {
      this.stats.checked++;
      try {
        if (String(intent.token).toUpperCase() === 'ETH') {
          const receipt = await _fetchEthTransferReceipt(intent.tx_hash, intent.receiving_address);
          if (!receipt.ok) {
            if (receipt.reason === 'tx_reverted') this.stats.reverted++;
            else if (receipt.reason === 'rpc_failed') this.stats.rpcErr++;
            else this.stats.unconfirmed++;
            continue;
          }
          const result = await walletCheckoutService.verifyAndFulfillEth({
            txHash: intent.tx_hash,
            fromAddress: receipt.from,
            amountWeiReceived: receipt.valueWei,
          });
          if (result.ok) {
            this.stats.confirmed++;
            logger.info('[walletIntentReconciler] confirmed orphan ETH intent', {
              intentId: intent.id, userId: intent.user_id, txHash: intent.tx_hash,
              entitlementId: result.entitlementId, rushCredited: result.rushCredited,
            });
          } else {
            logger.warn('[walletIntentReconciler] fulfill returned not-ok', {
              intentId: intent.id, reason: result.reason,
            });
          }
        } else {
          // USDC (default)
          const receipt = await _fetchUsdcTransferReceipt(intent.tx_hash, intent.receiving_address);
          if (!receipt.ok) {
            if (receipt.reason === 'tx_reverted') this.stats.reverted++;
            else if (receipt.reason === 'rpc_failed') this.stats.rpcErr++;
            else this.stats.unconfirmed++;
            continue;
          }
          const result = await walletCheckoutService.verifyAndFulfillUsdc({
            txHash: intent.tx_hash,
            fromAddress: receipt.from,
            amountReceived: receipt.amount,
          });
          if (result.ok) {
            this.stats.confirmed++;
            logger.info('[walletIntentReconciler] confirmed orphan USDC intent', {
              intentId: intent.id, userId: intent.user_id, txHash: intent.tx_hash,
              entitlementId: result.entitlementId, rushCredited: result.rushCredited,
            });
          } else {
            logger.warn('[walletIntentReconciler] fulfill returned not-ok', {
              intentId: intent.id, reason: result.reason,
            });
          }
        }
      } catch (err) {
        logger.error('[walletIntentReconciler] intent reconcile threw', {
          intentId: intent.id, err: err.message,
        });
      }
    }
  }
}

module.exports = WalletIntentReconciler;
