'use strict';

/**
 * privyCheckoutService.js
 *
 * Backend service for the /checkout page experiment — a separate Privy app
 * (app ID: VITE_PRIVY_CHECKOUT_APP_ID) with its own embedded wallets, policy
 * enforcement, and 35/35/20/10 split-wallet setup.
 *
 * Responsibilities:
 *   1. getCheckoutClient() — lazy PrivyClient for the CHECKOUT app (not the
 *      main PRIVY_APP_ID). Used to verify JWTs issued by the checkout app.
 *
 *   2. verifyCheckoutPayment(txHash, planId, privyUserId, pnptvUserId) — verify
 *      a USDC-on-Base transfer on-chain, confirm it sent to one of the four
 *      split wallets, confirm the amount matches the plan price, record the
 *      payment, and grant entitlements.
 *
 *      The on-chain split-wallet policy is enforced by the Privy spending
 *      policy (PRIVY_CHECKOUT_POLICY_ID). This function is the server-side
 *      double-check: it independently verifies the tx went to a whitelisted
 *      address and the correct amount landed.
 *
 * Split wallets (env vars, all required at runtime):
 *   PRIVY_SPLIT_CARLOS_ADDRESS    — 35%
 *   PRIVY_SPLIT_MOISES_ADDRESS    — 35%
 *   PRIVY_SPLIT_TREASURY_ADDRESS  — 20%
 *   PRIVY_SPLIT_REINVERSION_ADDRESS — 10%
 *
 * Env (required):
 *   PRIVY_CHECKOUT_APP_ID
 *   PRIVY_CHECKOUT_APP_SECRET
 *   PRIVY_CHECKOUT_AUTHORIZATION_KEY      — P-256 wallet-auth key
 *   PRIVY_CHECKOUT_AUTHORIZATION_KEY_ID
 *   ALCHEMY_API_KEY                       — Base RPC
 */

const { query, getPool } = require('../config/postgres');
const logger = require('../utils/logger');

// ── USDC on Base ─────────────────────────────────────────────────────────────
const USDC_ADDRESS_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // lowercase
const USDC_DECIMALS = 6;
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// 2% slippage tolerance: allows for rounding differences between plan price
// and on-chain amount received.
const SLIPPAGE_TOLERANCE = 0.02;

// Idempotency window for on-ramp payments (no immediate tx hash). If the same
// privy_user_id + plan_id lands within this window, treat as duplicate.
const ONRAMP_IDEMPOTENCY_WINDOW_MINUTES = 5;

// ── Lazy singletons ───────────────────────────────────────────────────────────
let _checkoutPrivyClient = null;
let _treasuryPrivyClient = null;

/**
 * Return the PrivyClient scoped to the CHECKOUT Privy app (cmvf3ecxm01760flbg4ij8aon).
 * Used exclusively for JWT verification of checkout session tokens.
 *
 * @returns {import('@privy-io/server-auth').PrivyClient}
 */
function getCheckoutClient() {
  if (_checkoutPrivyClient) return _checkoutPrivyClient;

  const appId = process.env.PRIVY_CHECKOUT_APP_ID || process.env.VITE_PRIVY_CHECKOUT_APP_ID;
  const appSecret = process.env.PRIVY_CHECKOUT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('privyCheckout: PRIVY_CHECKOUT_APP_ID / PRIVY_CHECKOUT_APP_SECRET not configured');
  }

  const { PrivyClient } = require('@privy-io/server-auth');
  _checkoutPrivyClient = new PrivyClient(appId, appSecret);
  return _checkoutPrivyClient;
}

/**
 * Return the PrivyClient scoped to the TREASURY Privy app (cmvf3jmp301uf0fl6koud8g0y).
 * Used for all server-wallet operations: executeSplit, _earnDeposit.
 *
 * @returns {import('@privy-io/server-auth').PrivyClient}
 */
function getTreasuryClient() {
  if (_treasuryPrivyClient) return _treasuryPrivyClient;

  const appId = process.env.PRIVY_TREASURY_APP_ID;
  const appSecret = process.env.PRIVY_TREASURY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('privyCheckout: PRIVY_TREASURY_APP_ID / PRIVY_TREASURY_APP_SECRET not configured');
  }

  const { PrivyClient } = require('@privy-io/server-auth');
  _treasuryPrivyClient = new PrivyClient(appId, appSecret);
  return _treasuryPrivyClient;
}

/**
 * Return the four split wallet addresses from env, lowercased.
 * Throws if any are missing so misconfiguration is caught at call-time.
 *
 * @returns {{ carlos: string, moises: string, treasury: string, reinversion: string }}
 */
function _splitAddresses() {
  const carlos    = process.env.PRIVY_SPLIT_CARLOS_ADDRESS;
  const moises    = process.env.PRIVY_SPLIT_MOISES_ADDRESS;
  const treasury  = process.env.PRIVY_SPLIT_TREASURY_ADDRESS;
  const reinversion = process.env.PRIVY_SPLIT_REINVERSION_ADDRESS;

  if (!carlos || !moises || !treasury || !reinversion) {
    throw new Error(
      'privyCheckout: PRIVY_SPLIT_CARLOS_ADDRESS / PRIVY_SPLIT_MOISES_ADDRESS / ' +
      'PRIVY_SPLIT_TREASURY_ADDRESS / PRIVY_SPLIT_REINVERSION_ADDRESS not all set'
    );
  }

  return {
    carlos:     carlos.toLowerCase(),
    moises:     moises.toLowerCase(),
    treasury:   treasury.toLowerCase(),
    reinversion: reinversion.toLowerCase(),
  };
}

/**
 * Fetch the USDC Transfer log from a Base transaction and return the
 * recipient + amount, or an error reason.
 *
 * Does NOT verify which recipient the payment went to — that happens in
 * verifyCheckoutPayment after we know which addresses are whitelisted.
 *
 * @param {string} txHash
 * @returns {Promise<{ok:true, recipient:string, amount:number, from:string} | {ok:false, reason:string}>}
 */
async function _fetchUsdcTransfer(txHash) {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return { ok: false, reason: 'alchemy_not_configured' };

  const url = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;

  let receipt;
  try {
    const rpcRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await rpcRes.json();
    receipt = j.result;
  } catch (err) {
    logger.warn('[privyCheckout] alchemy rpc failed', { err: err.message, txHash });
    return { ok: false, reason: 'rpc_failed' };
  }

  if (!receipt) return { ok: false, reason: 'tx_not_found_or_unconfirmed' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'tx_reverted' };

  // Find any USDC Transfer log — we do NOT pre-filter by recipient here so that
  // the caller can compare against all four split addresses.
  const transferLog = (receipt.logs || []).find(l =>
    String(l.address).toLowerCase() === USDC_ADDRESS_BASE &&
    l.topics?.[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC &&
    l.topics?.length >= 3
  );

  if (!transferLog) return { ok: false, reason: 'no_usdc_transfer_log' };

  const rawAmount = BigInt(transferLog.data);
  const amount    = Number(rawAmount) / Math.pow(10, USDC_DECIMALS);

  // topics[1] = from (padded 32 bytes), topics[2] = to (padded 32 bytes)
  const from      = '0x' + String(transferLog.topics[1]).toLowerCase().replace(/^0x/, '').slice(-40);
  const recipient = '0x' + String(transferLog.topics[2]).toLowerCase().replace(/^0x/, '').slice(-40);

  return { ok: true, recipient, amount, from };
}

/**
 * Record the payment in `checkout_payments` (a lightweight receipts table
 * for the checkout experiment; separate from `checkout_intents` used by the
 * main wallet flow so the two are fully isolated).
 *
 * If the table doesn't exist yet, creation is guarded by a migration — this
 * function will throw and let the caller surface a 500, which is appropriate.
 */
async function _recordPayment({ txHash, planId, pnptvUserId, privyUserId, amountUsd, recipientAddress }) {
  await query(
    `INSERT INTO checkout_payments
       (tx_hash, plan_id, pnptv_user_id, privy_user_id, amount_usd,
        recipient_address, chain, token, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'base', 'USDC', 'confirmed', NOW())`,
    [
      txHash,
      planId,
      pnptvUserId ? String(pnptvUserId) : null,
      privyUserId ? String(privyUserId) : null,
      amountUsd,
      recipientAddress,
    ]
  );
}

/**
 * Grant plan entitlements to a pnptv user using the same `_fulfillEntitlement`
 * logic path as the main wallet checkout — we reuse `walletCheckoutService`
 * directly, wrapping it in a pool transaction so the DB writes are atomic.
 *
 * entitlementSpec is built from the plan's add_ons array (first add-on wins for
 * now, which covers every single-add-on PRIME/member plan in the catalog).
 */
async function _grantEntitlements({ pnptvUserId, plan, txHash, checkoutPaymentId }) {
  const addOns = Array.isArray(plan.addOns) ? plan.addOns : [];
  if (addOns.length === 0) {
    throw new Error(`privyCheckout: plan ${plan.id} has no add_ons — cannot grant entitlements`);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entitlementIds = [];
    for (const addOn of addOns) {
      // Pre-check: if user already has a lifetime or still-active entitlement
      // for this add-on, the DB trigger will block any UPDATE attempt.
      // Reuse the existing row and skip the insert entirely.
      const { rows: existing } = await client.query(
        `SELECT id FROM user_entitlements
           WHERE user_id = $1 AND add_on_id = $2
             AND creator_id IS NULL
             AND (is_lifetime = true OR expires_at > NOW())
           LIMIT 1`,
        [String(pnptvUserId), addOn.id]
      );
      if (existing.length > 0) {
        logger.info('[privyCheckout] user already has active/lifetime entitlement — skipping grant', {
          pnptvUserId, addOnId: addOn.id, existingId: existing[0].id,
        });
        entitlementIds.push(Number(existing[0].id));
        continue;
      }

      const isLifetime = addOn.is_lifetime === true;
      const durationDays = isLifetime ? null : (addOn.duration_days || plan.duration_days || plan.duration || 30);

      // Same insert shape as walletCheckoutService._fulfillEntitlement
      const safeDays = isLifetime ? 30 : (
        Number.isInteger(Number(durationDays)) && Number(durationDays) > 0 && Number(durationDays) <= 3650
          ? Number(durationDays) : 30
      );

      const { rows } = await client.query(
        `INSERT INTO user_entitlements
           (user_id, add_on_id, is_lifetime, expires_at, source_plan_id, source_payment_id, auto_renew, grant_source)
         VALUES (
           $1, $2, $3,
           CASE WHEN $4::boolean THEN NULL ELSE NOW() + ($5::int * INTERVAL '1 day') END,
           $6, $7, $8, $9
         )
         ON CONFLICT (user_id, add_on_id, creator_id) DO UPDATE
           SET expires_at        = CASE WHEN $4::boolean THEN NULL
                                        ELSE GREATEST(user_entitlements.expires_at, NOW()) + ($5::int * INTERVAL '1 day')
                                   END,
               is_lifetime       = user_entitlements.is_lifetime OR EXCLUDED.is_lifetime,
               auto_renew        = EXCLUDED.auto_renew,
               source_payment_id = EXCLUDED.source_payment_id,
               source_plan_id    = EXCLUDED.source_plan_id,
               grant_source      = EXCLUDED.grant_source,
               is_consumed       = false,
               granted_at        = NOW(),
               updated_at        = NOW()
         RETURNING id`,
        [
          String(pnptvUserId),
          addOn.id,
          isLifetime,
          isLifetime,
          safeDays,
          plan.id,
          `checkout_payment:${checkoutPaymentId || txHash}`,
          !isLifetime,
          `wallet_checkout:privy_checkout`,
        ]
      );

      if (rows[0]?.id) entitlementIds.push(Number(rows[0].id));
    }

    // Sync users.tier for admin display — mirror the tier string from the
    // highest-tier add-on. Same approach as entitlementAccessService.
    const tierAddOn = addOns.find(a => a.id === 'prime') || addOns.find(a => a.id === 'pnp-member');
    if (tierAddOn) {
      const tierValue = tierAddOn.id === 'prime' ? 'prime' : 'member';
      await client.query(
        `UPDATE users SET tier = $1, updated_at = NOW() WHERE id = $2
           AND tier NOT IN ('prime', 'banned')`,
        [tierValue, String(pnptvUserId)]
      );
    }

    await client.query('COMMIT');
    return entitlementIds;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Invalidate per-user entitlement + tier caches after grant.
 * Mirrors entitlementAccessService.invalidateCache — we call it separately
 * so this service has no hard dependency on that module.
 */
async function _invalidateUserCache(userId) {
  try {
    const { cache } = require('../config/redis');
    const uid = String(userId);
    const keysToDelete = [
      `user_label:${uid}`,
      `tier_check:${uid}`,
      `user:session:${uid}`,
    ];
    await Promise.allSettled(keysToDelete.map(k => cache.del(k)));
    // Wildcard-style pattern delete for ent:<uid>:* entries
    if (cache.keys) {
      const pattern = `ent:${uid}:*`;
      const keys = await cache.keys(pattern).catch(() => []);
      if (keys.length) await Promise.allSettled(keys.map(k => cache.del(k)));
    }
  } catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a checkout payment and grant entitlements.
 *
 * Two modes:
 *   • On-chain (txHash provided): legacy BYOUSDC path — fetches the Base USDC
 *     Transfer log, verifies recipient is whitelisted + amount matches, records
 *     via unique tx_hash.
 *   • On-ramp (no txHash): Stripe-like fiat-card flow via Privy useDepositFunds.
 *     The on-ramp provider sends USDC directly to our server wallet; we trust
 *     Privy's completion signal and record the payment with a synthetic
 *     `onramp:<privyUserId>:<planId>:<ts>` reference. Idempotency within a
 *     5-minute window on (privy_user_id, plan_id) prevents duplicate grants
 *     from double-clicks.
 *
 * @param {object} opts
 * @param {string} [opts.txHash]       — 0x-prefixed hex transaction hash (on-chain mode)
 * @param {string} opts.planId         — plan id
 * @param {string} opts.privyUserId    — did:privy:xxx from the checkout app
 * @param {string|null} opts.pnptvUserId — users.id for entitlement grant
 * @returns {Promise<{
 *   ok: boolean,
 *   entitlementIds?: number[],
 *   alreadyConfirmed?: boolean,
 *   reason?: string
 * }>}
 */
async function verifyCheckoutPayment({ txHash, planId, privyUserId, pnptvUserId }) {
  const isOnramp = !txHash;

  if (!isOnramp) {
    if (typeof txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return { ok: false, reason: 'invalid_tx_hash' };
    }
  } else {
    if (!privyUserId || typeof privyUserId !== 'string') {
      return { ok: false, reason: 'invalid_privy_user_id' };
    }
  }
  if (!planId || typeof planId !== 'string') {
    return { ok: false, reason: 'invalid_plan_id' };
  }

  // ── Load plan ─────────────────────────────────────────────────────────────
  const PlanModel = require('../models/planModel');
  const plan = await PlanModel.getById(planId);
  if (!plan) return { ok: false, reason: 'plan_not_found' };
  if (!plan.active) return { ok: false, reason: 'plan_inactive' };

  const expectedAmountUsd = Number(plan.price);
  if (!expectedAmountUsd || expectedAmountUsd <= 0) {
    return { ok: false, reason: 'plan_price_invalid' };
  }

  // ── Resolve the record identifiers + idempotency ──────────────────────────
  let txHashForRecord;
  let receivedUsd;
  let recipient;

  if (!isOnramp) {
    // ── On-chain mode: idempotency on tx_hash, verify log on-chain ──────────
    const { rows: existingRows } = await query(
      `SELECT id, status FROM checkout_payments WHERE tx_hash = $1 LIMIT 1`,
      [txHash]
    );
    if (existingRows.length > 0) {
      logger.info('[privyCheckout] tx already processed — returning idempotent ok', {
        txHash, existingId: existingRows[0].id,
      });
      return { ok: true, alreadyConfirmed: true, checkoutPaymentId: existingRows[0].id };
    }

    const txResult = await _fetchUsdcTransfer(txHash);
    if (!txResult.ok) {
      logger.warn('[privyCheckout] on-chain verification failed', { txHash, reason: txResult.reason });
      return { ok: false, reason: txResult.reason };
    }

    recipient = txResult.recipient;
    receivedUsd = txResult.amount;

    const splits = _splitAddresses();
    const whitelisted = Object.values(splits);
    if (!whitelisted.includes(recipient.toLowerCase())) {
      logger.error('[privyCheckout] SECURITY: tx recipient not in split wallet whitelist', {
        txHash, recipient, whitelist: whitelisted,
      });
      return { ok: false, reason: 'recipient_not_whitelisted' };
    }

    const delta = Math.abs(receivedUsd - expectedAmountUsd) / expectedAmountUsd;
    if (delta > SLIPPAGE_TOLERANCE) {
      logger.error('[privyCheckout] amount mismatch', {
        txHash, planId, expectedAmountUsd, receivedUsd, delta,
      });
      return { ok: false, reason: 'amount_mismatch', expected: expectedAmountUsd, received: receivedUsd };
    }

    txHashForRecord = txHash;
  } else {
    // ── On-ramp mode: idempotency on (privy_user_id, plan_id) 5-min window ──
    const { rows: existingRows } = await query(
      `SELECT id, status FROM checkout_payments
         WHERE privy_user_id = $1 AND plan_id = $2
           AND created_at > NOW() - INTERVAL '${ONRAMP_IDEMPOTENCY_WINDOW_MINUTES} minutes'
         ORDER BY created_at DESC LIMIT 1`,
      [privyUserId, planId]
    );
    if (existingRows.length > 0) {
      logger.info('[privyCheckout] onramp duplicate within window — returning idempotent ok', {
        planId, privyUserId, existingId: existingRows[0].id,
      });
      return { ok: true, alreadyConfirmed: true, checkoutPaymentId: existingRows[0].id };
    }

    // We trust Privy's completion signal: amount = plan price.
    receivedUsd = expectedAmountUsd;
    // The on-ramp provider deposits to the server wallet (Carlos's 35% EOA).
    recipient = (process.env.PRIVY_SPLIT_CARLOS_ADDRESS || '').toLowerCase();
    if (!recipient) {
      logger.error('[privyCheckout] onramp: PRIVY_SPLIT_CARLOS_ADDRESS not configured');
      return { ok: false, reason: 'receiver_not_configured' };
    }
    // Synthetic tx_hash so the UNIQUE index catches rapid duplicates. 66 chars
    // total ("0x" + 64) to fit the column; we pad a sha256-like token.
    const crypto = require('crypto');
    const tag = crypto
      .createHash('sha256')
      .update(`onramp:${privyUserId}:${planId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`)
      .digest('hex');
    txHashForRecord = '0x' + tag;
  }

  // ── Record payment ────────────────────────────────────────────────────────
  let checkoutPaymentId = null;
  try {
    await _recordPayment({
      txHash: txHashForRecord,
      planId,
      pnptvUserId: pnptvUserId || null,
      privyUserId: privyUserId || null,
      amountUsd: receivedUsd,
      recipientAddress: recipient,
    });
    const { rows: newRows } = await query(
      `SELECT id FROM checkout_payments WHERE tx_hash = $1 LIMIT 1`,
      [txHashForRecord]
    );
    checkoutPaymentId = newRows[0]?.id || null;
  } catch (err) {
    if (err.code === '23505') {
      logger.info('[privyCheckout] payment insert race — treating as already confirmed', {
        txHash: txHashForRecord,
      });
      return { ok: true, alreadyConfirmed: true };
    }
    throw err;
  }

  // ── Grant entitlements (only when pnptvUserId is known) ───────────────────
  let entitlementIds = [];
  if (pnptvUserId) {
    entitlementIds = await _grantEntitlements({
      pnptvUserId,
      plan,
      txHash: txHashForRecord,
      checkoutPaymentId,
    });

    await _invalidateUserCache(pnptvUserId);

    logger.info('[privyCheckout] entitlements granted', {
      txHash: txHashForRecord, planId, pnptvUserId, privyUserId, entitlementIds,
      mode: isOnramp ? 'onramp' : 'onchain',
    });
  } else {
    // Payment recorded without a pnptv user — the frontend should call a
    // separate "claim" endpoint once the user completes onboarding and links
    // their pnptv account to the privyUserId. For now, log and move on.
    logger.warn('[privyCheckout] payment recorded but no pnptv user — entitlements deferred', {
      txHash: txHashForRecord, planId, privyUserId,
    });
  }

  // Fire-and-forget Zoho revenue log + CRM sync — never blocks fulfillment.
  setImmediate(async () => {
    try {
      const zohoBooks = require('./zohoBooksService');
      if (zohoBooks.isConfigured() && receivedUsd > 0) {
        await zohoBooks.logRevenue({
          buyerUserId: pnptvUserId ? String(pnptvUserId) : null,
          buyerEmail: null,
          buyerName: null,
          buyerUsername: null,
          sku: `PRIME (checkout) — ${planId}`,
          priceCents: Math.round(receivedUsd * 100),
          provider: isOnramp ? 'privy_checkout_onramp' : 'privy_checkout_usdc',
          reference: `checkout_payment:${checkoutPaymentId || txHashForRecord}`,
          notes: `privyUser=${privyUserId || 'unknown'}; mode=${isOnramp ? 'onramp' : 'onchain'}`,
        });
      }
    } catch (err) {
      logger.warn('[privyCheckout] zohoBooksService.logRevenue failed', { txHash: txHashForRecord, err: err.message });
    }
    if (pnptvUserId) {
      try {
        const zohoSync = require('./zohoSyncService');
        await zohoSync.syncOneUser(pnptvUserId);
      } catch (err) {
        logger.warn('[privyCheckout] zohoSyncService.syncOneUser failed', { pnptvUserId, err: err.message });
      }
    }
  });

  // Fire-and-forget on-chain split + earn deposits.
  // On-chain BYOUSDC payments skip this — the user sent directly and
  // Privy's spending policy handles the split server-side.
  if (isOnramp) {
    setImmediate(async () => {
      try {
        const result = await executeSplit(receivedUsd);
        logger.info('[privyCheckout] split executed', {
          checkoutPaymentId, amountUsd: receivedUsd, result,
        });
      } catch (err) {
        logger.error('[privyCheckout] split failed — manual settle required', {
          checkoutPaymentId, amountUsd: receivedUsd, err: err.message,
        });
      }

      // Earn deposits: wait 15 s for Base txs to confirm, then deposit
      // treasury (20%) and reinversion (10%) shares into the yield vault.
      // Silently skipped if PRIVY_EARN_VAULT_ID is not set.
      await new Promise(r => setTimeout(r, 15_000));
      await _triggerEarnDeposits(receivedUsd).catch(err =>
        logger.warn('[privyCheckout] earn deposit error', { err: err.message })
      );
    });
  }

  return { ok: true, entitlementIds, checkoutPaymentId };
}

// ── Split executor ───────────────────────────────────────────────────────────
//
// Sends USDC from Carlos's server wallet (35% receiver) to Moi (35%),
// Treasury (20%), and Reinversion (10%). Uses the Privy server-auth SDK's
// ethereum.sendTransaction with the configured authorization key.
//
// NOTE: this assumes the on-ramp provider deposits full plan price to Carlos's
// wallet, and the split is executed afterward. On-chain tx fees come from
// Carlos's wallet gas balance.

const USDC_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

/**
 * Execute the 35/20/10 split from Carlos's wallet. The first 35% is kept
 * (it's already in Carlos's wallet from the on-ramp deposit).
 *
 * @param {number} totalAmountUsd — total payment amount in USD (= USDC)
 * @returns {Promise<Array<{recipient: string, pct: number, hash: string}>>}
 */
async function executeSplit(totalAmountUsd) {
  if (!totalAmountUsd || totalAmountUsd <= 0) {
    throw new Error('executeSplit: invalid totalAmountUsd');
  }

  const carlosWalletId = process.env.PRIVY_SPLIT_CARLOS_WALLET_ID;
  if (!carlosWalletId) {
    throw new Error('executeSplit: PRIVY_SPLIT_CARLOS_WALLET_ID not configured');
  }

  const splits = _splitAddresses();
  // Recipients + percentages. Carlos keeps 35% (no outbound tx).
  const outbound = [
    { recipient: splits.moises,      pct: 0.35, label: 'moises' },
    { recipient: splits.treasury,    pct: 0.20, label: 'treasury' },
    { recipient: splits.reinversion, pct: 0.10, label: 'reinversion' },
  ];

  const { encodeFunctionData, parseUnits } = require('viem');
  const client = getTreasuryClient();

  const results = [];
  for (const leg of outbound) {
    const amountStr = (totalAmountUsd * leg.pct).toFixed(6);
    const amountWei = parseUnits(amountStr, USDC_DECIMALS);
    const data = encodeFunctionData({
      abi: USDC_TRANSFER_ABI,
      functionName: 'transfer',
      args: [leg.recipient, amountWei],
    });

    try {
      const resp = await client.walletApi.ethereum.sendTransaction({
        walletId: carlosWalletId,
        caip2: 'eip155:8453',
        transaction: {
          to: '0x' + USDC_ADDRESS_BASE.replace(/^0x/, ''),
          data,
          value: '0x0',
          chainId: 8453,
        },
      });
      results.push({ recipient: leg.recipient, label: leg.label, pct: leg.pct, hash: resp.hash });
    } catch (err) {
      logger.error('[privyCheckout] split leg failed', {
        label: leg.label, recipient: leg.recipient, amountUsd: amountStr, err: err.message,
      });
      results.push({ recipient: leg.recipient, label: leg.label, pct: leg.pct, error: err.message });
    }
  }

  return results;
}

// ── Privy Earn integration ────────────────────────────────────────────────────
//
// Deposits USDC from a Privy server wallet into the configured earn vault
// (Gauntlet / Steakhouse on Morpho / Aave on Base).
//
// Requires env vars:
//   PRIVY_EARN_VAULT_ID  — vault ID from the Privy dashboard → Wallet
//                          infrastructure → Earn. Leave empty to disable.
//
// Uses the @privy-io/server-auth internal signing helper so the authorization
// key format (wallet-auth:…) is handled correctly — same key used by
// executeSplit above.

/**
 * Deposit USDC from a single Privy server wallet into the earn vault.
 *
 * @param {string} walletId — Privy wallet ID (PRIVY_SPLIT_*_WALLET_ID)
 * @param {number} amountUsd — amount in USD (= USDC, 1:1)
 * @param {string} label — descriptive label for logging
 */
async function _earnDeposit(walletId, amountUsd, label) {
  const appId    = process.env.PRIVY_TREASURY_APP_ID;
  const appSecret = process.env.PRIVY_TREASURY_APP_SECRET;
  const vaultId  = process.env.PRIVY_EARN_VAULT_ID;

  if (!appId || !appSecret || !vaultId) {
    throw new Error(`_earnDeposit(${label}): missing PRIVY_TREASURY_APP_ID/SECRET or PRIVY_EARN_VAULT_ID`);
  }

  // Amount in USDC token units (6 decimals), floored to avoid dust errors.
  const amountStr = String(Math.floor(amountUsd * 1e6));
  if (amountStr === '0') return; // nothing to deposit

  const path = `/api/v1/wallets/${walletId}/earn/ethereum/deposit`;
  const url  = `https://api.privy.io${path}`;
  const body = { vault_id: vaultId, amount: amountStr };

  const headers = {
    'Content-Type': 'application/json',
    'privy-app-id': appId,
    'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`_earnDeposit(${label}) ${res.status}: ${errText.slice(0, 240)}`);
  }

  return res.json();
}

/**
 * Fire earn deposits for the treasury (20%) and reinversion (10%) legs.
 * Called ~15 s after on-ramp split so Base txs have time to confirm.
 * Silently returns if PRIVY_EARN_VAULT_ID is not configured.
 *
 * @param {number} totalAmountUsd
 */
async function _triggerEarnDeposits(totalAmountUsd) {
  if (!process.env.PRIVY_EARN_VAULT_ID) return;

  const legs = [
    {
      walletId: process.env.PRIVY_SPLIT_TREASURY_WALLET_ID,
      amountUsd: totalAmountUsd * 0.20,
      label: 'treasury',
    },
    {
      walletId: process.env.PRIVY_SPLIT_REINVERSION_WALLET_ID,
      amountUsd: totalAmountUsd * 0.10,
      label: 'reinversion',
    },
  ].filter(l => l.walletId);

  for (const leg of legs) {
    try {
      const result = await _earnDeposit(leg.walletId, leg.amountUsd, leg.label);
      logger.info('[privyCheckout] earn deposit submitted', {
        label: leg.label, amountUsd: leg.amountUsd, walletId: leg.walletId,
        txHash: result?.transaction_hash,
      });
    } catch (err) {
      logger.warn('[privyCheckout] earn deposit failed — USDC stays in wallet (deposit manually)', {
        label: leg.label, amountUsd: leg.amountUsd, err: err.message,
      });
    }
  }
}

/**
 * Send USDC from Carlos's treasury split wallet to an arbitrary address.
 * Used by downstream services (e.g. Bridge fiat payout) to move USDC
 * before an external provider converts it to fiat.
 *
 * @param {{ toAddress: string, amountUsd: number, reference: string }} opts
 * @returns {Promise<{ hash: string }>}
 */
async function sendTreasuryUsdcTransfer({ toAddress, amountUsd, reference }) {
  if (!toAddress || !amountUsd || amountUsd <= 0) {
    throw new Error('sendTreasuryUsdcTransfer: invalid args');
  }

  const carlosWalletId = process.env.PRIVY_SPLIT_CARLOS_WALLET_ID;
  if (!carlosWalletId) throw new Error('sendTreasuryUsdcTransfer: PRIVY_SPLIT_CARLOS_WALLET_ID not set');

  const { encodeFunctionData, parseUnits } = require('viem');
  const amountStr = amountUsd.toFixed(6);
  const amountWei = parseUnits(amountStr, USDC_DECIMALS);
  const data = encodeFunctionData({
    abi: USDC_TRANSFER_ABI,
    functionName: 'transfer',
    args: [toAddress.toLowerCase(), amountWei],
  });

  const client = getCheckoutClient();
  const resp = await client.walletApi.ethereum.sendTransaction({
    walletId: carlosWalletId,
    caip2: 'eip155:8453',
    transaction: {
      to: '0x' + USDC_ADDRESS_BASE.replace(/^0x/, ''),
      data,
      value: '0x0',
      chainId: 8453,
    },
  });

  logger.info('[privyCheckout] treasury USDC transfer sent', {
    toAddress, amountUsd, reference, hash: resp.hash,
  });

  return { hash: resp.hash };
}

module.exports = {
  getCheckoutClient,
  verifyCheckoutPayment,
  executeSplit,
  sendTreasuryUsdcTransfer,
};
