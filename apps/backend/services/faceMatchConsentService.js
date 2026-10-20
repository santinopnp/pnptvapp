'use strict';

/**
 * faceMatchConsentService.js
 *
 * Optional consent to face matching (biometric data) on uploaded photos and
 * videos. Ley 1581 de 2012 and GDPR treat biometrics as sensitive data:
 * consent must be explicit, freely given and revocable, so declining NEVER
 * bans or restricts an account beyond media uploads and going live.
 *
 * users.face_match_consent is the current state used by the upload gate;
 * face_match_consent_events is the append-only proof of each grant/withdraw.
 */

const { query, getPool, invalidateCacheForTables } = require('../config/postgres');
const logger = require('../utils/logger');

// Bump when the face matching wording in the Privacy Policy changes materially.
// Members who consented to an older version are asked again.
const FACE_MATCH_CONSENT_VERSION = '2026-10-20';

const CONSENT_REQUIRED_CODE = 'FACE_MATCH_CONSENT_REQUIRED';

/**
 * @param {string} userId
 * @returns {Promise<{ consented: boolean, consentedAt: string|null, version: string|null, currentVersion: string }>}
 */
async function getStatus(userId) {
  const { rows } = await query(
    `SELECT face_match_consent, face_match_consented_at, face_match_consent_version
       FROM users WHERE id = $1`,
    [userId],
    { cache: false }
  );
  const u = rows[0];
  if (!u) throw Object.assign(new Error('User not found'), { status: 404 });

  return {
    consented: hasCurrentConsent(u),
    consentedAt: u.face_match_consent ? u.face_match_consented_at : null,
    version: u.face_match_consent_version || null,
    currentVersion: FACE_MATCH_CONSENT_VERSION,
  };
}

function hasCurrentConsent(row) {
  return !!row?.face_match_consent && row.face_match_consent_version === FACE_MATCH_CONSENT_VERSION;
}

/**
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasConsent(userId) {
  if (!userId) return false;
  const { rows } = await query(
    'SELECT face_match_consent, face_match_consent_version FROM users WHERE id = $1',
    [userId],
    // Never cached: the gate must see a grant/withdrawal immediately, on every process.
    { cache: false }
  );
  return hasCurrentConsent(rows[0]);
}

async function _record(userId, action, { ip, userAgent } = {}) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const granted = action === 'grant';
    const { rowCount } = await client.query(
      `UPDATE users
          SET face_match_consent         = $2,
              face_match_consented_at    = CASE WHEN $2 THEN NOW() ELSE face_match_consented_at END,
              face_match_consent_version = CASE WHEN $2 THEN $3 ELSE face_match_consent_version END,
              face_match_withdrawn_at    = CASE WHEN $2 THEN NULL ELSE NOW() END,
              updated_at                 = NOW()
        WHERE id = $1`,
      [userId, granted, FACE_MATCH_CONSENT_VERSION]
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('User not found'), { status: 404 });
    }
    await client.query(
      `INSERT INTO face_match_consent_events (user_id, action, consent_version, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, FACE_MATCH_CONSENT_VERSION, ip || null, userAgent ? String(userAgent).slice(0, 512) : null]
    );
    await client.query('COMMIT');
    invalidateCacheForTables(['users']);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  logger.info(`[FaceMatchConsent] ${action}`, { userId, version: FACE_MATCH_CONSENT_VERSION });
}

async function grant(userId, meta) {
  await _record(userId, 'grant', meta);
  return getStatus(userId);
}

/**
 * Withdrawal pauses media uploads and going live. No facial templates are
 * stored yet; when the face matcher is integrated it must purge this user's
 * templates here, as the Privacy Policy promises deletion on withdrawal.
 */
async function withdraw(userId, meta) {
  await _record(userId, 'withdraw', meta);
  return getStatus(userId);
}

module.exports = {
  FACE_MATCH_CONSENT_VERSION,
  CONSENT_REQUIRED_CODE,
  getStatus,
  hasConsent,
  grant,
  withdraw,
};
