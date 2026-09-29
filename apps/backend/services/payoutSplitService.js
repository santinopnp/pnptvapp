'use strict';

/**
 * payoutSplitService.js
 *
 * Four responsibilities:
 *
 * 1. Creator cashout payout (dispatchSplit) — sends 100% of the requested,
 *    already-net cashout amount to the creator's wallet. ONE on-chain leg.
 *
 *    Fixed 2026-09-29: creator_earnings.amount_creator is already the
 *    creator's net 70% share — it's computed with CREATOR_REVENUE_RATE at
 *    the moment revenue is recorded (see pnpLiveTipsService, paymentService,
 *    etc). This function used to re-apply ANOTHER 70/20/10 split on top of
 *    that already-net amount at cashout time, so a creator only ever
 *    received 0.70 × 0.70 = 49% of what the customer originally paid,
 *    instead of the 70% advertised in the Creator Program Terms. There is
 *    no double deduction anymore: the customer's gross payment already sits
 *    in the treasury-controlled receiving address the moment it lands
 *    on-chain, and cashout simply releases the creator's already-computed
 *    share to them — nothing else needs to move.
 *
 * 2. PRIME Channel subscription split (distributePrimeChannelSplit) and
 *    3. RUSH credit spend split (dispatchRushSplit) — both apply a 70/20/10
 *    split to a GROSS amount (customer payment / credit spent, not a
 *    ledger-derived net figure):
 *      70% → creator bucket (PRIME: split 35/35 between the two co-founders)
 *      20% → PNPtv Treasury
 *      10% → Creators Resources Budget / reinvestment wallet (0x326B…81A)
 *    NOT WIRED to any automatic trigger yet (2026-09-29) — every other
 *    revenue surface (tips, subs, calls, current PRIME) flows through the
 *    creator_earnings ledger + 7-day hold + manual cashout, and wiring these
 *    in parallel without reconciling that ledger risks double-paying. They
 *    are exposed for manual/scripted use until that reconciliation happens.
 *
 * All three dispatch functions run their legs in parallel (explicit nonce
 * allocation — viem's sendTransaction resolves the current nonce per call,
 * so concurrent sends from the same EOA need pre-assigned nonces to avoid
 * collisions), retry each leg up to 3x with exponential backoff, and log
 * every attempt + outcome to payment_transactions.
 *
 * 4. Creator wallet provisioning (provisionCreatorWallet) — when a user gains
 *    creator_status='active', ensures they have a Privy embedded wallet.
 *
 * Env (all required for dispatch; wallet provisioning also needs PRIVY_*):
 *   GAS_TREASURY_PRIVATE_KEY    — treasury EOA private key (0x…)
 *   ALCHEMY_API_KEY             — Base RPC
 *   CREATORS_BUDGET_ADDRESS     — reinvestment fund bucket (PRIME/RUSH splits)
 *   PNPTV_TREASURY_WALLET       — treasury bucket (PRIME/RUSH splits)
 *   SANTINO_PAYOUT_ADDRESS      — legacy fallback for PNPTV_TREASURY_WALLET
 *   SANTINO_PRIME_WALLET        — PRIME co-founder #1 (Santino), lifetime
 *   PNP_LATINO_PRIME_WALLET     — PRIME co-founder #2 (Lex), lifetime
 *   PRIVY_APP_ID / PRIVY_APP_SECRET — for server-side wallet creation
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');
const {
  PRIME_CHANNEL_CRYPTO_CREATOR_RATE,
  PRIME_CHANNEL_CRYPTO_TREASURY_RATE,
  PRIME_CHANNEL_CRYPTO_REINVESTMENT_RATE,
  SANTINO_USER_ID,
  LEX_USER_ID,
} = require('../config/monetizationConfig');

// ── USDC on Base ─────────────────────────────────────────────────────────────
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;
const USDC_TRANSFER_ABI = [{
  name: 'transfer',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}];

// ── Split ratios — standard pattern (cashout + RUSH spend) ───────────────────
const SPLIT_CREATOR      = 0.70;
const SPLIT_TREASURY     = 0.20;
const SPLIT_REINVESTMENT = 0.10;

const MAX_SEND_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s, 2s, 4s

// ── viem clients (lazy, same pattern as gasTopupService) ─────────────────────
let _walletClient = null;
let _publicClient = null;
let _account = null;

function _rpcUrl() {
  const key = process.env.ALCHEMY_API_KEY;
  return key ? `https://base-mainnet.g.alchemy.com/v2/${key}` : 'https://mainnet.base.org';
}

function _clients() {
  if (_walletClient) return { walletClient: _walletClient, publicClient: _publicClient, account: _account };
  const pk = process.env.GAS_TREASURY_PRIVATE_KEY;
  if (!pk) throw new Error('payout_split_disabled: GAS_TREASURY_PRIVATE_KEY not set');
  _account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  _walletClient = createWalletClient({ account: _account, chain: base, transport: http(_rpcUrl()) });
  _publicClient = createPublicClient({ chain: base, transport: http(_rpcUrl()) });
  return { walletClient: _walletClient, publicClient: _publicClient, account: _account };
}

function _usdcAmount(usd) {
  return parseUnits(usd.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

function _treasuryAddress() {
  return process.env.PNPTV_TREASURY_WALLET || process.env.SANTINO_PAYOUT_ADDRESS;
}

// ── Privy client (lazy) ───────────────────────────────────────────────────────
let _privyClient = null;
function _privy() {
  if (_privyClient) return _privyClient;
  const { PrivyClient } = require('@privy-io/server-auth');
  _privyClient = new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET);
  return _privyClient;
}

// ── payment_transactions logging ─────────────────────────────────────────────

async function _logTx({ paymentId, purpose, txHash, fromAddress, toAddress, amountUsd, status, error, attempt }) {
  try {
    await query(
      `INSERT INTO payment_transactions
         (payment_id, purpose, tx_hash, from_address, to_address, token, chain, amount_usd, status, error, attempt)
       VALUES ($1, $2, $3, $4, $5, 'USDC', 'base', $6, $7, $8, $9)`,
      [paymentId != null ? String(paymentId) : null, purpose, txHash || null, fromAddress || null, toAddress || null, amountUsd, status, error || null, attempt],
    );
  } catch (err) {
    logger.warn('[payoutSplit] failed to log payment_transactions row', { purpose, err: err.message });
  }
}

/**
 * Send one USDC leg with retry (max 3 attempts, exponential backoff:
 * 1s / 2s / 4s). Logs every attempt to payment_transactions.
 *
 * @returns {Promise<{ label, to, usd, hash }>}
 */
async function _sendLegWithRetry({ walletClient, account, to, usd, label, nonce, paymentId, purpose }) {
  const value = _usdcAmount(usd);
  const data = encodeFunctionData({ abi: USDC_TRANSFER_ABI, functionName: 'transfer', args: [to, value] });

  let lastErr;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const hash = await walletClient.sendTransaction({ to: USDC_ADDRESS, data, nonce });
      logger.info('[payoutSplit] sent', { paymentId, purpose, label, to, usd, hash, attempt });
      await _logTx({ paymentId, purpose, txHash: hash, fromAddress: account.address, toAddress: to, amountUsd: usd, status: 'sent', attempt });
      return { label, to, usd, hash };
    } catch (err) {
      lastErr = err;
      logger.warn('[payoutSplit] send failed', { paymentId, purpose, label, to, usd, attempt, err: err.message });
      await _logTx({ paymentId, purpose, fromAddress: account.address, toAddress: to, amountUsd: usd, status: 'failed', error: err.message, attempt });
      if (attempt < MAX_SEND_ATTEMPTS) {
        await new Promise((res) => setTimeout(res, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
      }
    }
  }
  throw Object.assign(new Error(`payout leg failed after ${MAX_SEND_ATTEMPTS} attempts: ${lastErr.message}`), { code: 'PAYOUT_LEG_FAILED', label, cause: lastErr });
}

/**
 * Process-wide nonce reservation for the treasury EOA. `_dispatchLegsInParallel`
 * pre-allocating nonces per-call was only safe within a single invocation —
 * two concurrent invocations (a cashout dispatch racing a refund send, or two
 * cashouts settling around the same time) both read the same "pending" nonce
 * from the chain and collided. This chains every reservation onto the last
 * one issued *synchronously* (no `await` before the chain is updated), so
 * concurrent callers always get non-overlapping ranges regardless of when
 * their underlying RPC calls actually resolve. refundService's USDC send
 * shares this allocator via `sendTreasuryLeg` below — it must never build its
 * own independent nonce source for the same EOA.
 */
let _nonceChainPromise = null;

async function _reserveNonceRange(count) {
  const { publicClient, account } = _clients();
  if (!_nonceChainPromise) {
    _nonceChainPromise = publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
  }
  const myBase = _nonceChainPromise;
  _nonceChainPromise = myBase.then((base) => base + count);
  return myBase;
}

/**
 * Send several USDC legs in parallel from the treasury EOA. Nonces are
 * reserved from the shared process-wide allocator so concurrent dispatches
 * (from this function or from `sendTreasuryLeg`) never collide.
 *
 * @param {Array<{ to: string, usd: number, label: string }>} legs
 * @returns {Promise<Array<{ label, to, usd, hash }>>}
 */
async function _dispatchLegsInParallel(legs, { paymentId, purpose } = {}) {
  const { walletClient, account } = _clients();
  const baseNonce = await _reserveNonceRange(legs.length);
  try {
    return await Promise.all(
      legs.map((leg, i) =>
        _sendLegWithRetry({ walletClient, account, to: leg.to, usd: leg.usd, label: leg.label, nonce: baseNonce + i, paymentId, purpose: purpose || leg.label }),
      ),
    );
  } catch (err) {
    // A leg exhausted its retries — on-chain nonce state for this EOA is now
    // uncertain (was it mined, dropped, replaced?). Force the next caller to
    // re-fetch from the chain rather than keep extending a possibly-wrong
    // local counter forever.
    _nonceChainPromise = null;
    throw err;
  }
}

/**
 * Send a single USDC leg from the treasury EOA, reserving its nonce from the
 * same shared allocator as `_dispatchLegsInParallel`. Public because
 * refundService's approved-refund payout shares this treasury EOA and MUST
 * NOT allocate nonces independently.
 *
 * @param {object} opts
 * @param {string} opts.paymentId — free-form id for payment_transactions (e.g. refund id)
 * @param {string} opts.purpose
 * @param {string} opts.to
 * @param {number} opts.usd
 * @returns {Promise<string>} tx hash
 */
async function sendTreasuryLeg({ paymentId, purpose, to, usd }) {
  const { walletClient, account } = _clients();
  const baseNonce = await _reserveNonceRange(1);
  try {
    const { hash } = await _sendLegWithRetry({ walletClient, account, to, usd, label: purpose, nonce: baseNonce, paymentId, purpose });
    return hash;
  } catch (err) {
    _nonceChainPromise = null;
    throw err;
  }
}

// ── Public: dispatch standard 70/20/10 USDC split ─────────────────────────────

/**
 * Pay out a creator cashout: sends 100% of the requested amount straight to
 * the creator's wallet. `amountUsd` is already the creator's net share (it's
 * a sum of creator_earnings.amount_creator rows, each already computed at
 * CREATOR_REVENUE_RATE when the revenue was recorded) — do NOT re-split it.
 *
 * @param {object} opts
 * @param {string} opts.orderId        — fiat_cashout_orders.id (for logging)
 * @param {string} opts.creatorId      — users.id (for logging)
 * @param {number} opts.amountUsd      — net cashout amount to pay the creator
 * @param {string} opts.creatorAddress — 0x… wallet address for the creator
 * @returns {Promise<{ txCreator, amtCreator }>}
 */
async function dispatchSplit({ orderId, creatorId, amountUsd, creatorAddress }) {
  const [creator] = await _dispatchLegsInParallel(
    [{ to: creatorAddress, usd: amountUsd, label: 'cashout_creator_payout' }],
    { paymentId: orderId, purpose: null },
  );

  return { txCreator: creator.hash, amtCreator: amountUsd };
}

// ── Public: PRIME Channel subscription split (35/35/20/10) ───────────────────

/**
 * Send the PRIME Channel bundle split: 70% creator bucket split 35/35 between
 * the two co-founders, 20% treasury, 10% reinvestment.
 *
 * Co-founder wallets are read from `users.wallet_address` for SANTINO_USER_ID
 * + LEX_USER_ID (no env vars needed) — they are creators like any other, just
 * the beneficiaries of the app+PRIME-channel bundle. Once a co-founder rotates
 * their wallet through Privy, this reads the new address automatically.
 *
 * @param {object} opts
 * @param {string} opts.subscriptionId — for logging/audit
 * @param {number} opts.amountUsd      — gross subscription revenue to split
 * @returns {Promise<{ txSantino, txLex, txTreasury, txReinvestment, amounts }>}
 */
async function distributePrimeChannelSplit({ subscriptionId, amountUsd }) {
  const { rows } = await query(
    `SELECT id, wallet_address FROM users WHERE id IN ($1, $2)`,
    [String(SANTINO_USER_ID), String(LEX_USER_ID)],
  );
  const byId = new Map(rows.map((r) => [String(r.id), r.wallet_address ? String(r.wallet_address).toLowerCase() : null]));
  const santinoAddress = byId.get(String(SANTINO_USER_ID));
  const lexAddress = byId.get(String(LEX_USER_ID));
  const treasuryAddress = _treasuryAddress();
  const reinvestmentAddress = process.env.CREATORS_BUDGET_ADDRESS;

  if (!santinoAddress || !lexAddress || !treasuryAddress || !reinvestmentAddress) {
    const missing = [
      !santinoAddress && `SANTINO wallet (users.id=${SANTINO_USER_ID})`,
      !lexAddress && `LEX wallet (users.id=${LEX_USER_ID})`,
      !treasuryAddress && 'PNPTV_TREASURY_WALLET/SANTINO_PAYOUT_ADDRESS',
      !reinvestmentAddress && 'CREATORS_BUDGET_ADDRESS',
    ].filter(Boolean).join(', ');
    throw Object.assign(
      new Error(`prime_split_disabled: missing ${missing}`),
      { code: 'PRIME_SPLIT_CONFIG_MISSING' },
    );
  }

  const creatorPool = Math.round(amountUsd * PRIME_CHANNEL_CRYPTO_CREATOR_RATE * 100) / 100;
  const amtSantino = Math.round((creatorPool / 2) * 100) / 100;
  const amtLex = Math.round((creatorPool / 2) * 100) / 100;
  const amtTreasury = Math.round(amountUsd * PRIME_CHANNEL_CRYPTO_TREASURY_RATE * 100) / 100;
  // Reinvestment gets the remainder to avoid rounding gaps
  const amtReinvestment = Math.round((amountUsd - amtSantino - amtLex - amtTreasury) * 100) / 100;

  const [santino, lex, treasury, reinvestment] = await _dispatchLegsInParallel(
    [
      { to: santinoAddress, usd: amtSantino, label: 'prime_split_santino' },
      { to: lexAddress, usd: amtLex, label: 'prime_split_lex' },
      { to: treasuryAddress, usd: amtTreasury, label: 'prime_split_treasury' },
      { to: reinvestmentAddress, usd: amtReinvestment, label: 'prime_split_reinvestment' },
    ],
    { paymentId: subscriptionId, purpose: null },
  );

  return {
    txSantino: santino.hash, txLex: lex.hash, txTreasury: treasury.hash, txReinvestment: reinvestment.hash,
    amounts: { amtSantino, amtLex, amtTreasury, amtReinvestment },
  };
}

// ── Public: RUSH credit spend split (dispatched at spend time) ───────────────

/**
 * Dispatch the standard 70/20/10 split for a RUSH credit spend event. RUSH
 * balances sit 100% in treasury on purchase; this is called at spend time
 * (no holds) so the creator gets their 70% the moment the credit is used.
 *
 * @param {object} opts
 * @param {string} opts.rushSpendId
 * @param {string} opts.creatorId
 * @param {number} opts.amountUsd      — value of the RUSH credit spent
 * @param {string} opts.creatorAddress
 * @returns {Promise<{ txCreator, txTreasury, txReinvestment, amounts }>}
 */
async function dispatchRushSplit({ rushSpendId, creatorId, amountUsd, creatorAddress }) {
  const reinvestmentAddress = process.env.CREATORS_BUDGET_ADDRESS;
  const treasuryAddress = _treasuryAddress();

  if (!reinvestmentAddress || !treasuryAddress) {
    throw Object.assign(
      new Error('rush_split_disabled: CREATORS_BUDGET_ADDRESS or PNPTV_TREASURY_WALLET/SANTINO_PAYOUT_ADDRESS not set'),
      { code: 'SPLIT_CONFIG_MISSING' },
    );
  }

  const amtCreator = Math.round(amountUsd * SPLIT_CREATOR * 100) / 100;
  const amtTreasury = Math.round(amountUsd * SPLIT_TREASURY * 100) / 100;
  const amtReinvestment = Math.round((amountUsd - amtCreator - amtTreasury) * 100) / 100;

  const [creator, treasury, reinvestment] = await _dispatchLegsInParallel(
    [
      { to: creatorAddress, usd: amtCreator, label: 'rush_split_creator' },
      { to: treasuryAddress, usd: amtTreasury, label: 'rush_split_treasury' },
      { to: reinvestmentAddress, usd: amtReinvestment, label: 'rush_split_reinvestment' },
    ],
    { paymentId: rushSpendId, purpose: null },
  );

  return {
    txCreator: creator.hash, txTreasury: treasury.hash, txReinvestment: reinvestment.hash,
    amounts: { amtCreator, amtTreasury, amtReinvestment },
  };
}

// ── Public: creator wallet provisioning ──────────────────────────────────────

/**
 * Ensure a creator has a Privy embedded wallet.
 *
 * - If they have a privy_id: creates the wallet server-side via Privy SDK and
 *   writes the address back to users.wallet_address.
 * - If they have no privy_id: a DB flag is left; privyLinkService will call
 *   back here when they next authenticate via Privy.
 *
 * Idempotent: no-ops if wallet_address is already populated.
 *
 * @param {string} userId
 * @returns {Promise<{ provisioned: boolean, address: string|null, reason?: string }>}
 */
async function provisionCreatorWallet(userId) {
  const { rows } = await query(
    `SELECT privy_id, wallet_address FROM users WHERE id = $1 LIMIT 1`,
    [String(userId)]
  );
  const user = rows[0];
  if (!user) return { provisioned: false, address: null, reason: 'user_not_found' };
  if (user.wallet_address) return { provisioned: false, address: user.wallet_address, reason: 'already_has_wallet' };
  if (!user.privy_id) return { provisioned: false, address: null, reason: 'no_privy_id_yet' };

  try {
    const privy  = _privy();
    const result = await privy.createWallets({ userId: user.privy_id, createEthereumWallet: true });

    // Find the newly created embedded wallet address
    const linkedAccounts = result?.linkedAccounts ?? [];
    const embeddedWallet = linkedAccounts.find(
      (a) => a.type === 'wallet' && (a.walletClientType === 'privy' || a.walletClient === 'privy')
    );
    const address = embeddedWallet?.address ?? null;

    if (address) {
      await query(
        `UPDATE users
            SET wallet_address   = $2,
                wallet_linked_at = COALESCE(wallet_linked_at, NOW()),
                updated_at       = NOW()
          WHERE id = $1 AND wallet_address IS NULL`,
        [String(userId), address]
      );
      logger.info('[payoutSplit] creator wallet provisioned', { userId, address });
    }

    return { provisioned: !!address, address };
  } catch (err) {
    logger.warn('[payoutSplit] provisionCreatorWallet failed', { userId, error: err.message });
    return { provisioned: false, address: null, reason: err.message };
  }
}

module.exports = {
  dispatchSplit,
  distributePrimeChannelSplit,
  dispatchRushSplit,
  provisionCreatorWallet,
  sendTreasuryLeg,
  SPLIT_CREATOR,
  SPLIT_TREASURY,
  SPLIT_REINVESTMENT,
};
