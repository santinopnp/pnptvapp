'use strict';

/**
 * PNPtv fam — curated leadership subset of Whale Pigs (see migration 376).
 * Public label: "PNP Fam". Internal DB name: is_pnptv_fam.
 *
 * Rules:
 *   - Every fam member is automatically a Whale Pig (DB trigger enforces).
 *   - Fam members get lifetime PRIME + pnp-member entitlements on promotion.
 *   - Lifetime entitlements are protected against revocation (DB trigger).
 *   - "Whale Pig" is an internal term; this module's public list must not
 *     mention it in the response.
 */

const { getPool } = require('../db');
const logger = require('../utils/logger');

const PNPTV_FAM_GRANT_SOURCE = 'pnptv_fam_grant';
const LIFETIME_ADD_ONS = ['prime', 'pnp-member'];

/**
 * Public list of PNPtv fam members. Safe for anonymous / public surfaces —
 * exposes only display fields, never mentions Whale Pig.
 */
async function listPnptvFam() {
  const { rows } = await getPool().query(
    `SELECT id, username, first_name, photo_file_id, bio, pnptv_fam_since
       FROM users
      WHERE is_pnptv_fam = TRUE
        AND is_active = TRUE
      ORDER BY pnptv_fam_since ASC NULLS LAST, LOWER(COALESCE(username, first_name, id))`
  );
  return rows.map(r => ({
    id: String(r.id),
    username: r.username || null,
    first_name: r.first_name || null,
    photo_url: r.photo_file_id || null,
    bio: r.bio || null,
    fam_since: r.pnptv_fam_since ? new Date(r.pnptv_fam_since).toISOString() : null,
  }));
}

/**
 * Promote a user to PNPtv fam. Flips the flag (which triggers is_whale_pig=TRUE
 * via DB trigger) and grants lifetime PRIME + pnp-member entitlements.
 * Idempotent — safe to call repeatedly.
 */
async function markPnptvFam(userId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE users
          SET is_pnptv_fam    = TRUE,
              pnptv_fam_since = COALESCE(pnptv_fam_since, NOW()),
              updated_at      = NOW()
        WHERE id = $1
        RETURNING id, username, is_pnptv_fam, is_whale_pig, pnptv_fam_since`,
      [String(userId)]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return null;
    }
    for (const addOn of LIFETIME_ADD_ONS) {
      await client.query(
        `INSERT INTO user_entitlements
           (user_id, add_on_id, is_lifetime, granted_at, grant_source, auto_renew)
         VALUES ($1, $2, TRUE, NOW(), $3, FALSE)
         ON CONFLICT (user_id, add_on_id, creator_id) DO UPDATE
           SET is_lifetime  = TRUE,
               expires_at   = NULL,
               is_consumed  = FALSE,
               grant_source = COALESCE(user_entitlements.grant_source, EXCLUDED.grant_source),
               auto_renew   = FALSE`,
        [String(userId), addOn, PNPTV_FAM_GRANT_SOURCE]
      );
    }
    await client.query('COMMIT');
    logger.info('[pnp-fam] promoted', { userId, entitlements: LIFETIME_ADD_ONS });
    return rows[0];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Demote a user from PNPtv fam (hides the public badge). Lifetime entitlements
 * are NOT revoked — access is permanent by design ("always a spot"), and the
 * DB trigger `trg_protect_lifetime_entitlements` guards against accidental
 * revocation anyway. Does NOT touch is_whale_pig — that stays a separate flag.
 */
async function unmarkPnptvFam(userId) {
  const { rows } = await getPool().query(
    `UPDATE users
        SET is_pnptv_fam = FALSE,
            updated_at   = NOW()
      WHERE id = $1
      RETURNING id, is_pnptv_fam, is_whale_pig`,
    [String(userId)]
  );
  if (!rows.length) return null;
  logger.info('[pnp-fam] demoted', { userId });
  return rows[0];
}

/**
 * Signup hook — called from findOrLinkUser / provisionAllServices. If the
 * user's username matches an unclaimed pending handle (case-insensitive),
 * promote them and mark the pending row claimed.
 * Safe to call on every login (idempotent — no-op after claim).
 */
async function resolvePendingHandleOnSignup(userId, username) {
  if (!userId || !username) return { promoted: false };
  const handle = String(username).trim().toLowerCase();
  if (!handle) return { promoted: false };

  const pool = getPool();
  const { rows: pending } = await pool.query(
    `SELECT handle FROM pnptv_fam_pending_handles
      WHERE handle = $1 AND claimed_at IS NULL
      LIMIT 1`,
    [handle]
  );
  if (!pending.length) return { promoted: false };

  await markPnptvFam(userId);
  await pool.query(
    `UPDATE pnptv_fam_pending_handles
        SET claimed_at = NOW(), claimed_by = $2
      WHERE handle = $1 AND claimed_at IS NULL`,
    [handle, String(userId)]
  );
  logger.info('[pnp-fam] pending handle claimed', { handle, userId });
  return { promoted: true, handle };
}

module.exports = {
  listPnptvFam,
  markPnptvFam,
  unmarkPnptvFam,
  resolvePendingHandleOnSignup,
  PNPTV_FAM_GRANT_SOURCE,
};
