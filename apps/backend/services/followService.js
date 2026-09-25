'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

// Kept for backwards-compat — route now queries active Crystal Creators dynamically.
const SUGGESTED_FOLLOW_IDS = [];
const ENFORCED_FOLLOW_IDS = SUGGESTED_FOLLOW_IDS;

/**
 * @deprecated Following is now opt-in via the onboarding suggestion step.
 * Always returns false — no accounts are locked follows anymore.
 */
function isEnforcedFollow(_targetId) {
  return false;
}

/**
 * @deprecated No-op. Auto-following was replaced by the onboarding
 * "People you might want to follow" step (2026-09-24).
 */
async function enforceDefaultFollows(_userId) {
  logger.debug('enforceDefaultFollows: deprecated no-op called — skipping');
}

module.exports = { SUGGESTED_FOLLOW_IDS, ENFORCED_FOLLOW_IDS, isEnforcedFollow, enforceDefaultFollows };
