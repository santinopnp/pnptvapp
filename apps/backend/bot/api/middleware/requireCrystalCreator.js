'use strict';

/**
 * requireCrystalCreator
 *
 * Express middleware that verifies the authenticated user has an active
 * Crystal Creator subscription. Designed to be chained after requireSessionAuth.
 *
 * Gate: crystal_creator_active_until IS NOT NULL AND
 *         (= 'infinity'::timestamptz OR > NOW())
 *
 * On failure: 403 JSON with code 'CRYSTAL_ONLY'.
 */

const crystalReplayService = require('../../../services/crystalReplayService');
const logger = require('../../../utils/logger');

async function requireCrystalCreator(req, res, next) {
  const userId = req.session?.user?.id;

  if (!userId) {
    // requireSessionAuth should have already caught this — guard defensively.
    return res.status(401).json({
      success: false,
      error:   'Authentication required.',
      code:    'UNAUTHORIZED',
    });
  }

  try {
    const active = await crystalReplayService.isCrystalActive(userId);
    if (!active) {
      logger.info('[requireCrystalCreator] access denied — no active Crystal subscription', {
        userId,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        error:   'An active Crystal Creator subscription is required to access this feature.',
        code:    'CRYSTAL_ONLY',
      });
    }
    return next();
  } catch (err) {
    logger.error('[requireCrystalCreator] DB error', { userId, error: err.message });
    return res.status(500).json({
      success: false,
      error:   'Service temporarily unavailable.',
      code:    'SERVER_ERROR',
    });
  }
}

module.exports = requireCrystalCreator;
