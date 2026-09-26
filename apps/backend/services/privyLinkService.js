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

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { provisionCreatorWallet } = require('./payoutSplitService');

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

function extractWalletAddress(privyUser) {
  if (!privyUser) return null;
  const linked = Array.isArray(privyUser.linkedAccounts) ? privyUser.linkedAccounts : [];
  const embedded = linked.find(
    (a) => a?.type === 'wallet' && (a.walletClientType === 'privy' || a.walletClient === 'privy'),
  );
  if (embedded?.address) return String(embedded.address).toLowerCase();
  const anyWallet = linked.find((a) => a?.type === 'wallet' && a.address);
  return anyWallet ? String(anyWallet.address).toLowerCase() : null;
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

  await query(
    `UPDATE users
        SET privy_id         = $1,
            wallet_address   = COALESCE(NULLIF($2::text, ''), wallet_address),
            wallet_linked_at = COALESCE(wallet_linked_at, CASE WHEN $2::text <> '' THEN NOW() ELSE wallet_linked_at END)
      WHERE id = $3`,
    [privyId, walletAddress || '', pnptvUserId],
  );

  logger.info('[privy-link] linked', { pnptvUserId, privyId, walletAddress });

  // If this user is an active creator without a wallet, provision one now
  // that we have a privy_id to attach it to. Fire-and-forget.
  if (!walletAddress) {
    query(
      `SELECT 1 FROM users WHERE id = $1 AND creator_status = 'active' AND wallet_address IS NULL LIMIT 1`,
      [pnptvUserId],
    ).then(({ rowCount }) => {
      if (rowCount > 0) {
        provisionCreatorWallet(pnptvUserId).catch((e) =>
          logger.warn('[privy-link] wallet provision failed', { pnptvUserId, error: e.message })
        );
      }
    }).catch(() => {});
  }

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

const BASE_RPC    = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ETH_RPC     = process.env.ETH_RPC_URL  || 'https://ethereum-rpc.publicnode.com';
const USDC_BASE   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ETH    = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ETH_DUST    = BigInt('10000000000000'); // 0.00001 ETH
const USDC_DUST   = BigInt('1000');           // $0.001

async function _isWalletFunded(address) {
  if (!address) return false;
  const addr = address.toLowerCase();
  const data = '0x70a08231000000000000000000000000' + addr.slice(2);
  const post = (rpc, body) =>
    fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json()).then(j => BigInt(j.result || '0x0'));
  try {
    const [eb, ub, ee, ue] = await Promise.all([
      post(BASE_RPC, { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] }),
      post(BASE_RPC, { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: USDC_BASE, data }, 'latest'] }),
      post(ETH_RPC,  { jsonrpc: '2.0', id: 3, method: 'eth_getBalance', params: [addr, 'latest'] }),
      post(ETH_RPC,  { jsonrpc: '2.0', id: 4, method: 'eth_call', params: [{ to: USDC_ETH,  data }, 'latest'] }),
    ]);
    return eb > ETH_DUST || ub > USDC_DUST || ee > ETH_DUST || ue > USDC_DUST;
  } catch {
    return true; // RPC error → skip to be safe
  }
}

/**
 * Delete Privy users (and their embedded wallets) for PNPtv accounts that have
 * never made any crypto payment. Frees wallet slots on the free Privy tier.
 *
 * Safe: skips funded wallets (Base + Ethereum mainnet), users with any
 * token_purchase, completed checkout_intent, or successful gas topup.
 * Archives privy_id to deleted_privy_accounts before nulling the users row.
 *
 * @returns {Promise<{candidates: number, deleted: number, funded: number, errors: number}>}
 */
async function purgeUnusedWallets() {
  const appId     = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Missing PRIVY_APP_ID / PRIVY_APP_SECRET');

  const { rows } = await query(`
    SELECT u.id, u.privy_id, u.wallet_address
    FROM users u
    WHERE u.privy_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM token_purchases tp WHERE tp.user_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM gas_topups gt
        WHERE gt.user_id::text = u.id::text AND gt.status = 'success'
      )
      AND NOT EXISTS (
        SELECT 1 FROM checkout_intents ci
        WHERE ci.user_id = u.id AND ci.status = 'completed'
      )
  `);

  const authHeader = 'Basic ' + Buffer.from(`${appId}:${appSecret}`).toString('base64');
  let deleted = 0;
  let funded  = 0;
  let errors  = 0;

  for (const user of rows) {
    try {
      if (user.wallet_address && await _isWalletFunded(user.wallet_address)) {
        logger.warn('[privy-purge] skipping funded wallet', { privyId: user.privy_id, wallet: user.wallet_address });
        funded++;
        await new Promise((res) => setTimeout(res, 200));
        continue;
      }
      const r = await fetch(
        `https://auth.privy.io/api/v1/users/${encodeURIComponent(user.privy_id)}`,
        { method: 'DELETE', headers: { Authorization: authHeader, 'privy-app-id': appId } },
      );
      if (!r.ok && r.status !== 404) {
        const body = await r.text().catch(() => '');
        throw new Error(`Privy DELETE ${r.status}: ${body.slice(0, 200)}`);
      }
      await query(
        `INSERT INTO deleted_privy_accounts (pnptv_user_id, privy_id, wallet_address, reason)
         VALUES ($1, $2, $3, 'purge') ON CONFLICT (privy_id) DO NOTHING`,
        [String(user.id), user.privy_id, user.wallet_address || null],
      );
      await query(
        `UPDATE users SET privy_id = NULL, wallet_address = NULL, wallet_linked_at = NULL WHERE id = $1`,
        [user.id],
      );
      deleted++;
    } catch (err) {
      logger.error('[privy-purge] failed to delete wallet', { privyId: user.privy_id, err: err.message });
      errors++;
    }
    await new Promise((res) => setTimeout(res, 200));
  }

  logger.info('[privy-purge] completed', { candidates: rows.length, deleted, funded, errors });
  return { candidates: rows.length, deleted, funded, errors };
}

module.exports = {
  verifyAndLink,
  extractWalletAddress,
  listWalletAddresses,
  listWalletAddressesRaw,
  purgeUnusedWallets,
};
