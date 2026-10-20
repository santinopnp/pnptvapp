'use strict';

/**
 * antiLeakageGuard.js
 *
 * One real-time check for outgoing user text (DMs, chat rooms, forwards):
 *   1. a sender under a strike-2 24h mute is refused;
 *   2. block-tier anti-leakage content (off-platform payment or services,
 *      competitor platforms, paid meetups, scams) is refused and a strike is
 *      logged on the warn → mute → ban ladder (services/warningService.js).
 *
 * Admins are exempt so support can name platforms when triaging. Other
 * forbidden categories are left to each surface's existing handling, and
 * flag-only signals are picked up by the background policy scanner.
 */

const { assertCleanText } = require('./contentModerationFilter');
const WarningService = require('./warningService');
const logger = require('../utils/logger');

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.text
 * @param {string} p.sourceType  anti_leakage_strikes.source_type value
 * @param {string} [p.sourceRef]
 * @param {boolean} [p.isAdmin]
 * @returns {Promise<{ ok: true } | { ok: false, status: number, body: object }>}
 */
async function checkOutgoingText({ userId, text, sourceType, sourceRef = null, isAdmin = false }) {
  if (isAdmin || !text) return { ok: true };

  if (await WarningService.isAntiLeakageMuted(userId)) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: 'Your account is temporarily muted (24h) for repeated off-platform solicitation. Messaging will resume automatically.',
        code: 'ANTI_LEAKAGE_MUTED',
      },
    };
  }

  try {
    assertCleanText(text, 'message');
  } catch (err) {
    if (err?.code !== 'FORBIDDEN_CONTENT' || !err.isAntiLeakage) return { ok: true };
    // Fire-and-forget: the strike never delays or breaks the response.
    WarningService.logAntiLeakageStrike({
      userId: String(userId),
      sourceType,
      sourceRef: sourceRef != null ? String(sourceRef) : null,
      evidenceText: text,
      matchedTerms: err.terms || [],
    }).catch((e) => logger.error('anti-leakage strike log failed', { userId, sourceType, error: e.message }));
    return {
      ok: false,
      status: 400,
      body: { success: false, error: err.message, code: 'LEAKAGE_DETECTED', categories: err.categories },
    };
  }
  return { ok: true };
}

module.exports = { checkOutgoingText };
