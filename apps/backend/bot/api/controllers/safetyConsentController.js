'use strict';

const faceMatchConsentService = require('../../../services/faceMatchConsentService');
const onboardingService = require('../../../services/onboardingService');
const logger = require('../../../utils/logger');

// Trust X-Forwarded-For set by Nginx Proxy Manager, as onboardingController does.
function _clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

function _meta(req) {
  return { ip: _clientIp(req), userAgent: req.headers['user-agent'] || null };
}

function _fail(res, err, label) {
  if (err.status === 404) return res.status(404).json({ error: 'user_not_found' });
  logger.error(`[SafetyConsent] ${label} error:`, err);
  return res.status(500).json({ error: 'internal_error' });
}

/**
 * GET /api/webapp/me/face-match-consent
 */
const getFaceMatchConsent = async (req, res) => {
  try {
    return res.json(await faceMatchConsentService.getStatus(req.session.user.id));
  } catch (err) {
    return _fail(res, err, 'getFaceMatchConsent');
  }
};

/**
 * POST /api/webapp/me/face-match-consent
 * Body: { consent: true } — explicit opt-in, never implied by another action.
 */
const grantFaceMatchConsent = async (req, res) => {
  if (req.body?.consent !== true) {
    return res.status(400).json({ error: 'explicit_consent_required' });
  }
  try {
    return res.json(await faceMatchConsentService.grant(req.session.user.id, _meta(req)));
  } catch (err) {
    return _fail(res, err, 'grantFaceMatchConsent');
  }
};

/**
 * DELETE /api/webapp/me/face-match-consent
 */
const withdrawFaceMatchConsent = async (req, res) => {
  try {
    return res.json(await faceMatchConsentService.withdraw(req.session.user.id, _meta(req)));
  } catch (err) {
    return _fail(res, err, 'withdrawFaceMatchConsent');
  }
};

/**
 * GET /api/webapp/me/policy-update
 */
const getPolicyUpdate = async (req, res) => {
  try {
    return res.json(await onboardingService.getPolicyUpdateStatus(req.session.user.id));
  } catch (err) {
    return _fail(res, err, 'getPolicyUpdate');
  }
};

/**
 * POST /api/webapp/me/policy-update/accept
 */
const acceptPolicyUpdate = async (req, res) => {
  try {
    return res.json(await onboardingService.acceptPolicyUpdate(req.session.user.id, _clientIp(req)));
  } catch (err) {
    return _fail(res, err, 'acceptPolicyUpdate');
  }
};

module.exports = {
  getFaceMatchConsent,
  grantFaceMatchConsent,
  withdrawFaceMatchConsent,
  getPolicyUpdate,
  acceptPolicyUpdate,
};
