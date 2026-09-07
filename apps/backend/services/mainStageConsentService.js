'use strict';

const crypto = require('crypto');
const { query } = require('../config/postgres');

const CURRENT_TERMS_VERSION = process.env.MAIN_STAGE_TERMS_VERSION || '2026-05-01';
const CURRENT_PRIVACY_VERSION = process.env.MAIN_STAGE_PRIVACY_VERSION || '2026-05-01';
const EMAIL_HASH_PEPPER = process.env.MAIN_STAGE_EMAIL_HASH_PEPPER || '';

function hashGuestEmail(email) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  return crypto.createHmac('sha256', EMAIL_HASH_PEPPER).update(normalized).digest('hex');
}

async function getLatestConsentForUser(userId) {
  const { rows } = await query(
    `SELECT *
       FROM main_stage_consents
      WHERE user_id = $1::text
      ORDER BY accepted_at DESC, id DESC
      LIMIT 1`,
    [String(userId)]
  );
  return rows[0] || null;
}

async function recordUserConsent({ userId, ip, userAgent, ageConfirmed }) {
  await query(
    `INSERT INTO main_stage_consents
      (user_id, terms_version, privacy_version, age_confirmed, ip, user_agent)
     VALUES ($1::text, $2, $3, $4, $5, $6)`,
    [
      String(userId),
      CURRENT_TERMS_VERSION,
      CURRENT_PRIVACY_VERSION,
      Boolean(ageConfirmed),
      ip || null,
      userAgent || null,
    ]
  );
}

async function recordGuestConsent({ guestIdentity, guestDisplayName, guestEmail, inviteId, ip, userAgent, ageConfirmed }) {
  const emailHash = hashGuestEmail(guestEmail);
  await query(
    `INSERT INTO main_stage_consents
      (guest_identity, guest_display_name, guest_email, guest_email_hash, invite_id, terms_version, privacy_version, age_confirmed, ip, user_agent)
     VALUES ($1::text, $2, NULL, $3, $4, $5, $6, $7, $8, $9)`,
    [
      String(guestIdentity),
      guestDisplayName || null,
      emailHash,
      inviteId || null,
      CURRENT_TERMS_VERSION,
      CURRENT_PRIVACY_VERSION,
      Boolean(ageConfirmed),
      ip || null,
      userAgent || null,
    ]
  );
}

async function withdrawConsent({ userId }) {
  await query(
    `DELETE FROM main_stage_consents WHERE user_id = $1::text`,
    [String(userId)]
  );
}

async function withdrawGuestConsent({ guestIdentity }) {
  await query(
    `DELETE FROM main_stage_consents WHERE guest_identity = $1::text`,
    [String(guestIdentity)]
  );
}

function buildJoinCheck(latestConsent) {
  const ageConfirmed = Boolean(latestConsent?.age_confirmed);
  const termsAccepted = latestConsent?.terms_version === CURRENT_TERMS_VERSION;
  const privacyAccepted = latestConsent?.privacy_version === CURRENT_PRIVACY_VERSION;
  return {
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    ageConfirmed,
    termsAccepted,
    privacyAccepted,
    requiresAgeVerification: !ageConfirmed,
    requiresTermsAcceptance: !termsAccepted,
    requiresPrivacyAcceptance: !privacyAccepted,
    canJoin: ageConfirmed && termsAccepted && privacyAccepted,
  };
}

module.exports = {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  getLatestConsentForUser,
  recordUserConsent,
  recordGuestConsent,
  withdrawConsent,
  withdrawGuestConsent,
  buildJoinCheck,
};
