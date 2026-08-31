'use strict';

/**
 * gasTopupService.js
 *
 * Seeds a small amount of Base ETH into a user's Privy-embedded EOA so they
 * can pay their own gas when broadcasting a USDC/ETH purchase. Called from
 * POST /api/wallet/gas-topup right before the frontend calls
 * privySendTransaction on an embedded wallet.
 *
 * Never touch external wallets (Trust/MetaMask) — those users bring their
 * own ETH. The endpoint layer decides via req.body.isEmbedded; this service
 * is pure — it will send to any address the caller specifies.
 *
 * Env:
 *   GAS_TREASURY_PRIVATE_KEY        0x-prefixed hex, EOA on Base
 *   ALCHEMY_API_KEY                 for eth_getBalance + eth_sendRawTransaction
 *   GAS_TOPUP_THRESHOLD_WEI         default 30000000000000  (0.00003 ETH ~ $0.10)
 *   GAS_TOPUP_AMOUNT_WEI            default 60000000000000  (0.00006 ETH ~ $0.20)
 *   GAS_TOPUP_MAX_PER_USER_PER_DAY  default 3
 *   GAS_TOPUP_TREASURY_DAILY_CAP_WEI  default 5000000000000000 (0.005 ETH ~ $17)
 *   GAS_TOPUP_LOW_ALERT_WEI         default 3000000000000000 (0.003 ETH ~ $10) — Slack ping when treasury drops below
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { createWalletClient, createPublicClient, http, parseGwei } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

// ── Config ────────────────────────────────────────────────────────────────
const DEFAULT_THRESHOLD_WEI = 30_000_000_000_000n;    // 0.00003 ETH
const DEFAULT_TOPUP_WEI     = 60_000_000_000_000n;    // 0.00006 ETH
const DEFAULT_MAX_PER_DAY   = 3;
const DEFAULT_TREASURY_CAP  = 5_000_000_000_000_000n; // 0.005 ETH/24h
const DEFAULT_LOW_ALERT     = 3_000_000_000_000_000n; // 0.003 ETH

function _thresholdWei() { return BigInt(process.env.GAS_TOPUP_THRESHOLD_WEI || DEFAULT_THRESHOLD_WEI); }
function _topupWei()     { return BigInt(process.env.GAS_TOPUP_AMOUNT_WEI    || DEFAULT_TOPUP_WEI); }
function _maxPerDay()    { return Number(process.env.GAS_TOPUP_MAX_PER_USER_PER_DAY || DEFAULT_MAX_PER_DAY); }
function _treasuryCap()  { return BigInt(process.env.GAS_TOPUP_TREASURY_DAILY_CAP_WEI || DEFAULT_TREASURY_CAP); }
function _lowAlert()     { return BigInt(process.env.GAS_TOPUP_LOW_ALERT_WEI || DEFAULT_LOW_ALERT); }

// ── viem clients (lazy) ───────────────────────────────────────────────────
let _account = null;
let _walletClient = null;
let _publicClient = null;

function _rpcUrl() {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return null;
  return `https://base-mainnet.g.alchemy.com/v2/${key}`;
}

function _clients() {
  if (_walletClient && _publicClient) {
    return { walletClient: _walletClient, publicClient: _publicClient, account: _account };
  }
  const pk = process.env.GAS_TREASURY_PRIVATE_KEY;
  if (!pk) throw new Error('gas_topup_disabled: GAS_TREASURY_PRIVATE_KEY not set');
  const rpcUrl = _rpcUrl();
  if (!rpcUrl) throw new Error('gas_topup_disabled: ALCHEMY_API_KEY not set');

  _account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  _walletClient = createWalletClient({ account: _account, chain: base, transport: http(rpcUrl) });
  _publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  return { walletClient: _walletClient, publicClient: _publicClient, account: _account };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Top up gas for a user if needed. Idempotent-ish: if the user already has
 * enough ETH OR has hit the daily cap, returns { ok: true, skipped: true }.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.address        The wallet to fund
 * @returns {Promise<{ok:true, skipped?:boolean, reason?:string, txHash?:string, weiSent?:string, balanceWei?:string}>}
 */
async function topupIfNeeded({ userId, address }) {
  if (!userId) throw Object.assign(new Error('userId required'), { status: 400 });
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw Object.assign(new Error('valid address required'), { status: 400 });
  }

  // 1. Per-user daily cap
  const { rows: recent } = await query(
    `SELECT COUNT(*)::int AS cnt FROM gas_topups
      WHERE user_id = $1 AND status IN ('pending', 'sent')
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [String(userId)]
  );
  if (recent[0].cnt >= _maxPerDay()) {
    return { ok: true, skipped: true, reason: 'user_daily_cap' };
  }

  // 2. Read user's current balance
  const { publicClient, walletClient, account } = _clients();
  const userBalance = await publicClient.getBalance({ address });
  if (userBalance >= _thresholdWei()) {
    return { ok: true, skipped: true, reason: 'sufficient', balanceWei: userBalance.toString() };
  }

  // 3. Treasury daily-cap check (sum of pending+sent in last 24h)
  const { rows: capRow } = await query(
    `SELECT COALESCE(SUM(wei), 0)::text AS total_wei FROM gas_topups
      WHERE status IN ('pending', 'sent')
        AND created_at > NOW() - INTERVAL '24 hours'`
  );
  const spentToday = BigInt(capRow[0].total_wei);
  const amount = _topupWei();
  if (spentToday + amount > _treasuryCap()) {
    logger.warn('[gasTopup] treasury_daily_cap_exceeded', {
      spentToday: spentToday.toString(),
      cap: _treasuryCap().toString(),
    });
    _alertLowTreasury(spentToday, 'daily_cap_exceeded').catch(() => {});
    return { ok: true, skipped: true, reason: 'treasury_daily_cap' };
  }

  // 4. Treasury balance guard — must be able to fund at least this + gas overhead
  const treasuryBalance = await publicClient.getBalance({ address: account.address });
  if (treasuryBalance < amount + parseGwei('50000')) {  // ~0.00005 ETH safety margin for own gas
    logger.error('[gasTopup] treasury_empty', {
      treasuryBalance: treasuryBalance.toString(),
      needed: amount.toString(),
    });
    _alertLowTreasury(treasuryBalance, 'treasury_empty').catch(() => {});
    throw Object.assign(new Error('gas_topup_unavailable'), { status: 503 });
  }

  // 5. Insert pending row
  const { rows: pendingRows } = await query(
    `INSERT INTO gas_topups (user_id, address, wei, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [String(userId), address, amount.toString()]
  );
  const topupId = pendingRows[0].id;

  // 6. Broadcast the tx
  let txHash;
  try {
    txHash = await walletClient.sendTransaction({
      to: address,
      value: amount,
    });
  } catch (err) {
    await query(
      `UPDATE gas_topups SET status = 'failed', reason = $2, updated_at = NOW() WHERE id = $1`,
      [topupId, String(err.message || 'send_failed').slice(0, 500)]
    );
    logger.error('[gasTopup] send_failed', { err: err.message, userId, address, topupId });
    throw Object.assign(new Error('gas_topup_send_failed'), { status: 502 });
  }

  await query(
    `UPDATE gas_topups SET status = 'sent', tx_hash = $2, updated_at = NOW() WHERE id = $1`,
    [topupId, txHash]
  );

  logger.info('[gasTopup] sent', { userId, address, weiSent: amount.toString(), txHash, topupId });

  // 7. Post-send treasury low check (fire and forget)
  if (treasuryBalance - amount < _lowAlert()) {
    _alertLowTreasury(treasuryBalance - amount, 'balance_low').catch(() => {});
  }

  return {
    ok: true,
    txHash,
    weiSent: amount.toString(),
    balanceWei: userBalance.toString(),
  };
}

/**
 * Read-only stats snapshot for admin / health endpoints.
 */
async function getStatus() {
  try {
    const { publicClient, account } = _clients();
    const balance = await publicClient.getBalance({ address: account.address });
    const { rows } = await query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(wei), 0)::text AS total_wei
         FROM gas_topups
        WHERE status IN ('pending', 'sent')
          AND created_at > NOW() - INTERVAL '24 hours'`
    );
    return {
      ok: true,
      configured: true,
      address: account.address,
      balanceWei: balance.toString(),
      last24h: { count: rows[0].cnt, weiSent: rows[0].total_wei },
      config: {
        thresholdWei: _thresholdWei().toString(),
        topupWei: _topupWei().toString(),
        maxPerUserPerDay: _maxPerDay(),
        treasuryDailyCapWei: _treasuryCap().toString(),
      },
    };
  } catch (err) {
    return { ok: false, configured: false, reason: err.message };
  }
}

async function _alertLowTreasury(balanceWei, kind) {
  try {
    const tok = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_OPS_ADMIN_CHANNEL;
    if (!tok || !channel) return;
    const { account } = _clients();
    const ethFmt = (Number(balanceWei) / 1e18).toFixed(6);
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        channel,
        text: `⛽ Gas treasury alert (${kind}) — balance ${ethFmt} ETH on Base. Top up ${account.address}.`,
      }),
    });
  } catch { /* alerting is best-effort */ }
}

module.exports = {
  topupIfNeeded,
  getStatus,
};
