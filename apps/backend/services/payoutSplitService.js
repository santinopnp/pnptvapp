'use strict';

/**
 * payoutSplitService.js
 *
 * Two responsibilities:
 *
 * 1. USDC split dispatch — when a creator cashout is approved, sends USDC
 *    from the PNPtv treasury EOA in three on-chain transactions on Base:
 *      70% → creator's wallet
 *      10% → Creators Resources Budget wallet (0x326B…81A)
 *      20% → SantinoFurioso's wallet
 *
 * 2. Creator wallet provisioning — when a user gains creator_status='active',
 *    ensures they have a Privy embedded wallet. If they already have a
 *    privy_id, creates the wallet server-side immediately. If not, defers
 *    until they next link Privy (privyLinkService calls back into here).
 *
 * Env (all required for dispatch; wallet provisioning also needs PRIVY_*):
 *   GAS_TREASURY_PRIVATE_KEY    — treasury EOA private key (0x…)
 *   ALCHEMY_API_KEY             — Base RPC
 *   CREATORS_BUDGET_ADDRESS     — 10% bucket
 *   SANTINO_PAYOUT_ADDRESS      — 20% bucket
 *   PRIVY_APP_ID / PRIVY_APP_SECRET — for server-side wallet creation
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

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

// ── Split ratios ──────────────────────────────────────────────────────────────
const SPLIT_CREATOR  = 0.70;
const SPLIT_BUDGET   = 0.10;
const SPLIT_SANTINO  = 0.20;

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

// ── Privy client (lazy) ───────────────────────────────────────────────────────
let _privyClient = null;
function _privy() {
  if (_privyClient) return _privyClient;
  const { PrivyClient } = require('@privy-io/server-auth');
  _privyClient = new PrivyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET);
  return _privyClient;
}

// ── Public: dispatch USDC split ───────────────────────────────────────────────

/**
 * Send the 70/10/20 USDC split from treasury.
 *
 * @param {object} opts
 * @param {string} opts.orderId        — fiat_cashout_orders.id (for logging)
 * @param {string} opts.creatorId      — users.id
 * @param {number} opts.amountUsd      — gross amount to split (creator's 100%)
 * @param {string} opts.creatorAddress — 0x… wallet address for the creator
 * @returns {Promise<{ txCreator, txBudget, txSantino }>}
 */
async function dispatchSplit({ orderId, creatorId, amountUsd, creatorAddress }) {
  const budgetAddress  = process.env.CREATORS_BUDGET_ADDRESS;
  const santinoAddress = process.env.SANTINO_PAYOUT_ADDRESS;

  if (!budgetAddress || !santinoAddress) {
    throw Object.assign(
      new Error('payout_split_disabled: CREATORS_BUDGET_ADDRESS or SANTINO_PAYOUT_ADDRESS not set'),
      { code: 'SPLIT_CONFIG_MISSING' }
    );
  }

  const amtCreator = Math.round(amountUsd * SPLIT_CREATOR * 100) / 100;
  const amtBudget  = Math.round(amountUsd * SPLIT_BUDGET  * 100) / 100;
  // Santino gets the remainder to avoid rounding gaps
  const amtSantino = Math.round((amountUsd - amtCreator - amtBudget) * 100) / 100;

  const { walletClient } = _clients();

  async function sendUsdc(to, usd, label) {
    const value = _usdcAmount(usd);
    const data  = encodeFunctionData({ abi: USDC_TRANSFER_ABI, functionName: 'transfer', args: [to, value] });
    const hash  = await walletClient.sendTransaction({ to: USDC_ADDRESS, data });
    logger.info('[payoutSplit] sent', { orderId, creatorId, label, to, usd, hash });
    return hash;
  }

  const txCreator = await sendUsdc(creatorAddress, amtCreator, 'creator_70pct');
  const txBudget  = await sendUsdc(budgetAddress,  amtBudget,  'budget_10pct');
  const txSantino = await sendUsdc(santinoAddress, amtSantino, 'santino_20pct');

  return { txCreator, txBudget, txSantino, amtCreator, amtBudget, amtSantino };
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

module.exports = { dispatchSplit, provisionCreatorWallet };
