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

module.exports = {
  verifyAndLink,
  extractWalletAddress,
  listWalletAddresses,
};
