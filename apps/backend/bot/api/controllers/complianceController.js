'use strict';

const complianceService = require('../../../services/complianceService');
const contentReviewService = require('../../../services/contentReviewService');
const policyScanService = require('../../../services/policyScanService');
const logger = require('../../../utils/logger');

function _clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

function _adminId(req) {
  return req.session?.user?.id || req.user?.id;
}

function _fail(res, err, label) {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
  logger.error(`[Compliance] ${label} error:`, err);
  return res.status(500).json({ error: 'internal_error' });
}

/**
 * POST /api/public/removal-requests — no login: the person depicted is often
 * not a member. Body: { kind: 'ncii'|'complaint', name, email, contentUrls,
 * description?, isDepictedPerson?, goodFaith?, signature }
 */
const createRemovalRequest = async (req, res) => {
  try {
    const result = await complianceService.createRemovalRequest(req.body || {}, { ip: _clientIp(req) });
    if (result.error) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (err) {
    return _fail(res, err, 'createRemovalRequest');
  }
};

const listRemovalRequests = async (req, res) => {
  try {
    return res.json({ requests: await complianceService.listRemovalRequests(req.query) });
  } catch (err) {
    return _fail(res, err, 'listRemovalRequests');
  }
};

const resolveRemovalRequest = async (req, res) => {
  try {
    const request = await complianceService.resolveRemovalRequest(req.params.id, _adminId(req), req.body || {});
    return res.json({ request });
  } catch (err) {
    return _fail(res, err, 'resolveRemovalRequest');
  }
};

const listNcmecCases = async (req, res) => {
  try {
    return res.json({ cases: await complianceService.listNcmecCases(req.query) });
  } catch (err) {
    return _fail(res, err, 'listNcmecCases');
  }
};

const updateNcmecCase = async (req, res) => {
  try {
    const ncmecCase = await complianceService.updateNcmecCase(req.params.id, _adminId(req), req.body || {});
    return res.json({ case: ncmecCase });
  } catch (err) {
    return _fail(res, err, 'updateNcmecCase');
  }
};

const listContentReviews = async (req, res) => {
  try {
    return res.json({ reviews: await contentReviewService.listPending(req.query) });
  } catch (err) {
    return _fail(res, err, 'listContentReviews');
  }
};

const approveContentReview = async (req, res) => {
  try {
    return res.json({ review: await contentReviewService.approve(req.params.id, _adminId(req)) });
  } catch (err) {
    return _fail(res, err, 'approveContentReview');
  }
};

const rejectContentReview = async (req, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
    return res.json({ review: await contentReviewService.reject(req.params.id, _adminId(req), reason) });
  } catch (err) {
    return _fail(res, err, 'rejectContentReview');
  }
};

const listPolicyFlags = async (req, res) => {
  try {
    return res.json({ users: await policyScanService.listOpenByUser(req.query) });
  } catch (err) {
    return _fail(res, err, 'listPolicyFlags');
  }
};

const dismissPolicyFlag = async (req, res) => {
  try {
    return res.json({ flag: await policyScanService.dismissFlag(req.params.id, _adminId(req)) });
  } catch (err) {
    return _fail(res, err, 'dismissPolicyFlag');
  }
};

const confirmPolicyFlag = async (req, res) => {
  try {
    return res.json(await policyScanService.confirmFlag(req.params.id, _adminId(req)));
  } catch (err) {
    return _fail(res, err, 'confirmPolicyFlag');
  }
};

const dismissUserPolicyFlags = async (req, res) => {
  try {
    return res.json({ dismissed: await policyScanService.dismissAllForUser(req.params.userId, _adminId(req)) });
  } catch (err) {
    return _fail(res, err, 'dismissUserPolicyFlags');
  }
};

module.exports = {
  listPolicyFlags,
  dismissPolicyFlag,
  confirmPolicyFlag,
  dismissUserPolicyFlags,
  createRemovalRequest,
  listRemovalRequests,
  resolveRemovalRequest,
  listNcmecCases,
  updateNcmecCase,
  listContentReviews,
  approveContentReview,
  rejectContentReview,
};
