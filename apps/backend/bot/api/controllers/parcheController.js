'use strict';

const parcheService = require('../../../services/parcheService');
const logger = require('../../../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleError(res, err) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  if (status >= 500) logger.error('[parcheController]', { error: err.message, code });
  return res.status(status).json({ success: false, error: err.message, code });
}

// ── Public ────────────────────────────────────────────────────────────────────

async function getPublicInfo(req, res) {
  try {
    const parche = await parcheService.getPublicInfo(req.params.slug);
    return res.json({ success: true, parche });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listActiveParches(req, res) {
  try {
    const parches = await parcheService.getActiveListings();
    return res.json({ success: true, parches });
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Creator ───────────────────────────────────────────────────────────────────

async function getMyParches(req, res) {
  try {
    const parches = await parcheService.getMyParches(req.session.user.id);
    return res.json({ success: true, parches });
  } catch (err) {
    return handleError(res, err);
  }
}

async function createParche(req, res) {
  try {
    const { name, description, locationCity, slug } = req.body;
    const parche = await parcheService.createParche(req.session.user.id, { name, description, locationCity, slug });
    return res.status(201).json({ success: true, parche });
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateParche(req, res) {
  try {
    const { name, description, locationCity } = req.body;
    const parche = await parcheService.updateParche(req.params.parcheId, req.session.user.id, { name, description, locationCity });
    return res.json({ success: true, parche });
  } catch (err) {
    return handleError(res, err);
  }
}

async function setOpen(req, res) {
  try {
    const isOpen = Boolean(req.body.isOpen);
    await parcheService.setOpen(req.params.parcheId, req.session.user.id, isOpen);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function inviteCreator(req, res) {
  try {
    const { handle } = req.body;
    if (!handle || !handle.trim()) {
      return res.status(400).json({ success: false, error: 'handle is required', code: 'MISSING_HANDLE' });
    }
    const parche = await parcheService.inviteCreator(req.params.parcheId, req.session.user.id, handle.trim());
    return res.json({ success: true, parche });
  } catch (err) {
    return handleError(res, err);
  }
}

async function respondToInvite(req, res) {
  try {
    const accept = Boolean(req.body.accept);
    const parche = await parcheService.respondToInvite(req.params.parcheId, req.session.user.id, accept);
    return res.json({ success: true, parche });
  } catch (err) {
    return handleError(res, err);
  }
}

async function leaveParche(req, res) {
  try {
    await parcheService.leaveParche(req.params.parcheId, req.session.user.id);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function createPackage(req, res) {
  try {
    const { title, description, durationMinutes, priceUsd } = req.body;
    const pkg = await parcheService.createPackage(req.params.parcheId, req.session.user.id, {
      title, description, durationMinutes, priceUsd,
    });
    return res.status(201).json({ success: true, package: pkg });
  } catch (err) {
    return handleError(res, err);
  }
}

async function updatePackage(req, res) {
  try {
    const { title, description, priceUsd } = req.body;
    await parcheService.updatePackage(req.params.packageId, req.session.user.id, { title, description, priceUsd });
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function deactivatePackage(req, res) {
  try {
    await parcheService.deactivatePackage(req.params.packageId, req.session.user.id);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

// ── Booking ───────────────────────────────────────────────────────────────────

async function checkout(req, res) {
  try {
    const { parcheId, packageId, scheduledAt, buyerNote, provider } = req.body;
    if (!parcheId || !packageId) {
      return res.status(400).json({ success: false, error: 'parcheId and packageId are required', code: 'MISSING_FIELDS' });
    }
    const result = await parcheService.createBooking(parcheId, packageId, req.session.user.id, {
      scheduledAt, buyerNote, provider,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getLiveKitToken(req, res) {
  try {
    const result = await parcheService.getLiveKitToken(req.params.bookingId, req.session.user.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  getPublicInfo,
  listActiveParches,
  getMyParches,
  createParche,
  updateParche,
  setOpen,
  inviteCreator,
  respondToInvite,
  leaveParche,
  createPackage,
  updatePackage,
  deactivatePackage,
  checkout,
  getLiveKitToken,
};
