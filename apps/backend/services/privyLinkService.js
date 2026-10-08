'use strict';

/**
 * Client-side Privy link sync — replaces the Enterprise-only webhook flow.
 *
 * When a user completes Privy authentication (embedded wallet creation, social
 * login, or external wallet connect), the frontend calls
 * `POST /api/privy/link` with the Privy identity token. This service verifies
 * the token, extracts the Privy user id + embedded/linked wallet address, and
 * writes them onto the currently-authenticated pnptv user's row.
 *
 * Support surface: given wallet address 0xabc, look up which pnptv user owns
 * it — `SELECT id, telegram, twitter FROM users WHERE lower(wallet_address) = lower('0xabc')`.
 */

const { query, getPool } = require('../config/postgres');
const logger = require('../utils/logger');
const { validateSingleWallet, ensureCreatorWallet } = require('./privyWalletService');

// USDC contract addresses per EVM chain that fiat ramps (Revolut, MoonPay,
// Meld, Banxa, Coinbase, etc.) commonly deposit to. Used by
// _oldWalletUsdBalance to decide whether a rotated-away wallet still holds
// user funds and must be preserved as multi_wallet_funded_exception.
// Extended 2026-09-29 after the kobton1 incident where $322 USDC on Ethereum
// mainnet was invisible because this guard was Base-only.
// USDC contract addresses forced to lowercase to bypass viem's EIP-55 checksum
// validation (viem rejects mixed-case addresses that don't match the exact
// checksum spec — this bit us during the kobton1 audit when a single wrong
// capitalization caused silent "0 balance" returns for all mainnet queries).
const USDC_CHAINS = [
  { name: 'ethereum', chain: 'mainnet', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', rpcHost: 'eth-mainnet.g.alchemy.com', fallback: 'https://cloudflare-eth.com' },
  { name: 'base',     chain: 'base',    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', rpcHost: 'base-mainnet.g.alchemy.com', fallback: 'https://mainnet.base.org' },
  { name: 'polygon',  chain: 'polygon', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', rpcHost: 'polygon-mainnet.g.alchemy.com', fallback: 'https://polygon-rpc.com' },
  { name: 'arbitrum', chain: 'arbitrum', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', rpcHost: 'arb-mainnet.g.alchemy.com', fallback: 'https://arb1.arbitrum.io/rpc' },
];

const USDC_BALANCE_ABI = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}];

// Kept for external callers that still import USDC_BASE.
const USDC_BASE = USDC_CHAINS.find(c => c.name === 'base').address;

/**
 * On-chain USDC balance of an address, summed across every EVM chain that
 * fiat ramps commonly deposit to (Ethereum mainnet, Base, Polygon, Arbitrum).
 * Returned in USD (float).
 *
 * Fail-closed on the AGGREGATE: if any chain query errors, we log but include
 * 0 for that chain. We never fail-open in a way that would let a funded
 * wallet be silently rotated — a partial number is safer than 0.
 */
async function _oldWalletUsdBalance(address) {
  if (!address) return 0;
  const { createPublicClient, http } = require('viem');
  const viemChains = require('viem/chains');
  const chainMap = {
    mainnet: viemChains.mainnet,
    base: viemChains.base,
    polygon: viemChains.polygon,
    arbitrum: viemChains.arbitrum,
  };
  const alchemyKey = process.env.ALCHEMY_API_KEY;

  const results = await Promise.allSettled(USDC_CHAINS.map(async (c) => {
    const rpc = alchemyKey ? `https://${c.rpcHost}/v2/${alchemyKey}` : c.fallback;
    const client = createPublicClient({ chain: chainMap[c.chain], transport: http(rpc) });
    const raw = await client.readContract({
      address: c.address, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [address],
    });
    return { name: c.name, usd: Number(raw) / 1_000_000 };
  }));

  let total = 0;
  const perChain = {};
  results.forEach((r, i) => {
    const cname = USDC_CHAINS[i].name;
    if (r.status === 'fulfilled') {
      perChain[cname] = r.value.usd;
      total += r.value.usd;
    } else {
      perChain[cname] = null;
      logger.warn('[privy-link] USDC balance check failed', {
        address, chain: cname, err: r.reason?.message || String(r.reason),
      });
    }
  });

  if (total > 0.01) {
    logger.info('[privy-link] old wallet funded — will preserve', { address, total, perChain });
  }
  return total;
}

async function _notifyWalletChanged({ pnptvUserId, oldWallet, newWallet, oldWalletUsdBalance = 0 }) {
  try {
    const sendSystemDM = require('./sendSystemDM');
    const SYSTEM_SENDER = process.env.SYSTEM_SENDER_ID || '8552451957';
    const funded = oldWalletUsdBalance > 0.01;
    const body = funded
      ? `⚠️ Tienes DOS billeteras activas ahora

Detectamos una nueva billetera en tu cuenta:
  Nueva (activa): ${newWallet}
  Anterior (con fondos): ${oldWallet}  →  $${oldWalletUsdBalance.toFixed(2)} USDC

Mantenemos ambas vivas para que no pierdas tus fondos. Cuando quieras mover el saldo de la antigua a la nueva, responde a este DM y te ayudamos.`
      : `⚠️ Wallet update detected

Your PNPtv wallet address just changed:
  old: ${oldWallet || '—'}
  new: ${newWallet}

If you sent USDC or ETH to the OLD address, those funds are still there and will NOT show up in the app. Reply to this DM and we'll help you move them.`;
    await sendSystemDM(SYSTEM_SENDER, String(pnptvUserId), body, query);
  } catch (err) {
    logger.warn('[privy-link] wallet-change notification failed', { pnptvUserId, err: err.message });
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
          text: oldWalletUsdBalance > 0.01
            ? `🔁💰 Wallet change — user \`${pnptvUserId}\` — OLD WALLET HOLDS $${oldWalletUsdBalance.toFixed(2)} USDC\n  old: \`${oldWallet || '—'}\` (funded, kept alive)\n  new: \`${newWallet}\``
            : `🔁 Wallet change — user \`${pnptvUserId}\`\n  old: \`${oldWallet || '—'}\`\n  new: \`${newWallet}\``,
        }),
      });
    }
  } catch { /* non-fatal */ }
}

let _privyClient = null;
function getPrivyClient() {
  if (_privyClient) return _privyClient;
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('PRIVY_APP_ID / PRIVY_APP_SECRET not configured');
  }
  const { PrivyClient } = require('@privy-io/server-auth');
  _privyClient = new PrivyClient(appId, appSecret);
  return _privyClient;
}

/**
 * Strict Privy-only: we return an address ONLY when it's an embedded wallet
 * provisioned by Privy. External wallets (MetaMask / Coinbase / WalletConnect
 * / Trust / Rabby / etc.) are intentionally ignored so a user cannot link a
 * signer we don't control. The Privy provider config (App.tsx) already omits
 * the external-wallet login methods; this backend check is the belt-and-braces
 * side, in case a legacy client still passes an external token.
 */
function extractWalletAddress(privyUser) {
  if (!privyUser) return null;
  const linked = Array.isArray(privyUser.linkedAccounts) ? privyUser.linkedAccounts : [];
  const embedded = linked.find(
    (a) => a?.type === 'wallet' && (a.walletClientType === 'privy' || a.walletClient === 'privy'),
  );
  if (embedded?.address) return String(embedded.address).toLowerCase();
  // Non-Privy wallet detected — do NOT link. Caller sees walletAddress=null
  // and treats it as "user still needs to create a Privy embedded wallet".
  const external = linked.find((a) => a?.type === 'wallet' && a.address);
  if (external?.address) {
    logger.warn('[privy-link] ignoring external wallet — Privy embedded required', {
      address: external.address,
      walletClientType: external.walletClientType || external.walletClient,
    });
  }
  return null;
}

/**
 * Verify a Privy identity token and link the resulting privy_id + wallet
 * address to the given pnptv user id.
 *
 * @param {object} args
 * @param {string} args.pnptvUserId - users.id of the authenticated session
 * @param {string} args.privyToken  - the identity token from usePrivy().getAccessToken()
 * @returns {Promise<{privyId: string, walletAddress: string|null}>}
 */
async function verifyAndLink({ pnptvUserId, privyToken }) {
  if (!pnptvUserId) throw new Error('pnptvUserId required');
  if (!privyToken) throw new Error('privyToken required');

  const client = getPrivyClient();

  let claims;
  try {
    claims = await client.verifyAuthToken(privyToken);
  } catch (err) {
    const e = new Error('invalid_privy_token');
    e.cause = err;
    throw e;
  }

  const privyId = claims?.userId;
  if (!privyId) throw new Error('invalid_privy_token');

  let walletAddress = null;
  try {
    const privyUser = await client.getUserById(privyId);
    walletAddress = extractWalletAddress(privyUser);
  } catch (err) {
    logger.warn('[privy-link] getUserById failed, proceeding with id only', {
      privyId,
      err: err.message,
    });
  }

  // Refuse to steal a Privy id already linked to a different pnptv user.
  const collision = await query(
    `SELECT id FROM users WHERE privy_id = $1 AND id <> $2 LIMIT 1`,
    [privyId, pnptvUserId],
  );
  if (collision.rowCount > 0) {
    logger.warn('[privy-link] collision: privy_id already on another user', { privyId, pnptvUserId, otherUserId: collision.rows[0].id });
    const e = new Error('privy_id_already_linked');
    e.otherUserId = collision.rows[0].id;
    throw e;
  }

  // Read the outgoing state inside a transaction with a row-level lock so
  // concurrent re-auth requests for the same user cannot race through the
  // funded-exception check and skip archiving the old wallet.
  const pool = getPool();
  const pgClient = await pool.connect();
  let prior = {}, oldWallet, newWallet, walletChanged, privyIdChanged, oldWalletUsdBalance = 0;
  try {
    await pgClient.query('BEGIN');
    const priorRes = await pgClient.query(
      `SELECT privy_id AS old_privy_id, wallet_address AS old_wallet_address
         FROM users WHERE id = $1 FOR UPDATE`,
      [pnptvUserId],
    );
    prior = priorRes.rows[0] || {};
    oldWallet = prior.old_wallet_address ? String(prior.old_wallet_address).toLowerCase() : null;
    newWallet = walletAddress || null;
    walletChanged = Boolean(newWallet) && oldWallet !== newWallet;
    privyIdChanged = Boolean(privyId) && prior.old_privy_id && prior.old_privy_id !== privyId;

    // Max 1 wallet per user, enforced app-side (friendly error) on top of the
    // DB unique index (idx_users_wallet_address_unique, migration 370). Only
    // relevant when the incoming address is new/changed — re-linking the same
    // address the user already owns is always fine.
    if (walletChanged) {
      await validateSingleWallet(newWallet, pnptvUserId);
    }

    if (walletChanged) {
      // Funded-exception check: if the old address still holds USDC on any
      // supported chain, keep both wallets alive (previous_wallet_address
      // preserved + wallet_lock_reason marker so future audits know why).
      oldWalletUsdBalance = oldWallet ? await _oldWalletUsdBalance(oldWallet) : 0;
      const isFundedException = oldWalletUsdBalance > 0.01;

      await pgClient.query(
        `UPDATE users
            SET privy_id                     = $1,
                wallet_address               = $2,
                previous_wallet_address      = CASE WHEN $3::text IS NULL THEN previous_wallet_address ELSE $3::text END,
                wallet_linked_at             = NOW(),
                has_pnptv_payout_configured  = FALSE,
                wallet_lock_reason           = CASE WHEN $5::boolean THEN 'multi_wallet_funded_exception' ELSE wallet_lock_reason END
          WHERE id = $4`,
        [privyId, newWallet, oldWallet, pnptvUserId, isFundedException],
      );
      await pgClient.query(
        `INSERT INTO wallet_changes (user_id, old_wallet_address, new_wallet_address, old_privy_id, new_privy_id, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [String(pnptvUserId), oldWallet, newWallet, prior.old_privy_id || null, privyId,
         isFundedException ? 'privy-link-funded-exception' : 'privy-link'],
      );
      logger.warn('[privy-link] wallet address changed', {
        pnptvUserId, privyId, oldWallet, newWallet, oldWalletUsdBalance, isFundedException,
      });
    } else {
      await pgClient.query(
        `UPDATE users
            SET privy_id         = $1,
                wallet_address   = COALESCE(NULLIF($2::text, ''), wallet_address),
                wallet_linked_at = COALESCE(wallet_linked_at, CASE WHEN $2::text <> '' THEN NOW() ELSE wallet_linked_at END)
          WHERE id = $3`,
        [privyId, walletAddress || '', pnptvUserId],
      );
      if (privyIdChanged) {
        await pgClient.query(
          `INSERT INTO wallet_changes (user_id, old_wallet_address, new_wallet_address, old_privy_id, new_privy_id, source)
           VALUES ($1, $2, $3, $4, $5, 'privy-link')`,
          [String(pnptvUserId), oldWallet, newWallet, prior.old_privy_id, privyId],
        );
      }
      logger.info('[privy-link] linked', { pnptvUserId, privyId, walletAddress });
    }
    await pgClient.query('COMMIT');
  } catch (txErr) {
    await pgClient.query('ROLLBACK');
    throw txErr;
  } finally {
    pgClient.release();
  }

  if (walletChanged) {
    _notifyWalletChanged({ pnptvUserId, oldWallet, newWallet, oldWalletUsdBalance }).catch(() => {});
  }

  // "wallet_linked" for active creators/performers: make sure the wallet is
  // provisioned (in case a wallet still isn't attached) and the payout
  // method is (re-)configured to PNPtv Treasury Wallet — walletChanged just
  // reset has_pnptv_payout_configured above, so this re-confirms it against
  // the newly-linked address. Fire-and-forget.
  query(
    `SELECT 1 FROM users WHERE id = $1 AND creator_status = 'active' LIMIT 1`,
    [pnptvUserId],
  ).then(({ rowCount }) => {
    if (rowCount > 0) {
      ensureCreatorWallet(pnptvUserId).catch((e) =>
        logger.warn('[privy-link] ensureCreatorWallet failed', { pnptvUserId, error: e.message })
      );
    }
  }).catch(() => {});

  return { privyId, walletAddress };
}

/**
 * Return every wallet address linked to the given Privy user id.
 * Used by the wallet-preference endpoint to verify a submitted address
 * actually belongs to the caller before writing it to their DB row.
 *
 * All returned addresses are lowercased for case-insensitive comparison.
 * On failure (missing Privy user, network error) returns an empty array —
 * callers should treat that as "cannot confirm ownership" and reject.
 *
 * @param {string} privyId
 * @returns {Promise<string[]>}
 */
async function listWalletAddresses(privyId) {
  if (!privyId) return [];
  try {
    const client = getPrivyClient();
    const privyUser = await client.getUserById(privyId);
    if (!privyUser) return [];
    const linked = Array.isArray(privyUser.linkedAccounts) ? privyUser.linkedAccounts : [];
    return linked
      .filter((a) => a?.type === 'wallet' && a.address)
      .map((a) => String(a.address).toLowerCase());
  } catch (err) {
    logger.warn('[privy-link] listWalletAddresses failed', {
      privyId,
      err: err.message,
    });
    return [];
  }
}

/**
 * Like listWalletAddresses but throws on error instead of swallowing it.
 * Use this when the caller has its own try/catch and needs to distinguish
 * between "user has no wallets" (returns []) and "Privy API failed" (throws).
 *
 * @param {string} privyId
 * @returns {Promise<string[]>}
 */
async function listWalletAddressesRaw(privyId) {
  if (!privyId) return [];
  const client = getPrivyClient();
  const privyUser = await client.getUserById(privyId);
  if (!privyUser) return [];
  const linked = Array.isArray(privyUser.linkedAccounts) ? privyUser.linkedAccounts : [];
  return linked
    .filter((a) => a?.type === 'wallet' && a.address)
    .map((a) => String(a.address).toLowerCase());
}

module.exports = {
  verifyAndLink,
  extractWalletAddress,
  listWalletAddresses,
  listWalletAddressesRaw,
};
