'use strict';

/**
 * requireFaceMatchConsent
 *
 * Gates photo/video uploads and going live behind the member's optional face
 * matching consent (see services/faceMatchConsentService.js). Members without
 * consent keep full access to everything else — browsing, chat, text posts,
 * voice notes — so this must only wrap routes that ingest visual media.
 *
 * Not for legally required uploads (age verification, 2257 ID documents and
 * selfies), support attachments, or admin-only tooling.
 *
 * On failure: 403 JSON with code 'FACE_MATCH_CONSENT_REQUIRED'; the web app
 * answers it with the face matching prompt.
 */

const fs = require('fs');
const faceMatchConsentService = require('../../../services/faceMatchConsentService');
const logger = require('../../../utils/logger');

function _deny(res) {
  return res.status(403).json({
    success: false,
    error:   'Face matching consent is required to upload photos or videos or go live.',
    code:    faceMatchConsentService.CONSENT_REQUIRED_CODE,
  });
}

function _uploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

function _isVisual(file) {
  return /^(image|video)\//i.test(file?.mimetype || '');
}

async function requireFaceMatchConsent(req, res, next) {
  const userId = req.session?.user?.id || req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required.', code: 'UNAUTHORIZED' });
  }

  try {
    if (await faceMatchConsentService.hasConsent(userId)) return next();
    logger.info('[requireFaceMatchConsent] blocked — no consent', { userId, path: req.path });
    return _deny(res);
  } catch (err) {
    logger.error('[requireFaceMatchConsent] consent lookup failed — failing closed', { userId, error: err.message });
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' });
  }
}

/**
 * Variant for mixed-media endpoints (chat, DM, hangout) that also accept voice
 * notes. Must run AFTER multer: audio-only uploads pass without consent, and a
 * rejected upload's temp files are removed from disk.
 */
async function requireFaceMatchConsentForVisualMedia(req, res, next) {
  const files = _uploadedFiles(req);
  if (!files.some(_isVisual)) return next();

  let allowed = false;
  await requireFaceMatchConsent(req, res, () => { allowed = true; });
  if (allowed) return next();

  for (const f of files) {
    if (f.path) fs.promises.unlink(f.path).catch(() => {});
  }
}

module.exports = {
  requireFaceMatchConsent,
  requireFaceMatchConsentForVisualMedia,
};
