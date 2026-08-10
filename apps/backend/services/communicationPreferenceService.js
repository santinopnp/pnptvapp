'use strict';

/**
 * Communication Preference Service
 *
 * Implements the "anti-spam / respect people's facets" model (2026-08-09).
 * Users pick ONE preferred channel + ONE fallback. Broadcasts respect this
 * instead of blasting every channel a user is reachable on.
 *
 * Channels: 'bot' | 'x' | 'inApp' | 'email' | 'other'
 * Storage: users.preferred_channel + users.fallback_channel + users.other_channel_details
 * Migration: 365_communication_preferences.sql
 *
 * Legacy compat: this service also consults the existing
 * users.notification_preferences JSONB per-category toggles so a user who
 * explicitly turned OFF a category (e.g. announcements.bot = false) is respected
 * even if that channel is their preferred one — we fall through to fallback,
 * then silently drop if fallback is also opted out. This is intentional: opt-out
 * always wins over channel-preference.
 */

const { query } = require('../config/postgres');
const logger    = require('../utils/logger');

const VALID_CHANNELS = new Set(['bot', 'x', 'inApp', 'email', 'other']);

/**
 * Returns the effective channel(s) a user should receive a notification of
 * `category` (e.g. 'announcements') on, in priority order.
 *
 * Rules:
 *   1. Try user.preferred_channel. If the user's notification_preferences opt-out
 *      says NO for that channel+category, drop it.
 *   2. If preferred is dropped OR delivery on preferred fails, try fallback (same
 *      opt-out check).
 *   3. If both dropped/failed, the user does NOT get the message on any other
 *      channel. That is the whole point of the anti-spam model.
 *
 * @param {Object} user - Row from users table. Must include:
 *                        preferred_channel, fallback_channel, notification_preferences (JSONB).
 * @param {string} category - notification_preferences key ('announcements', 'dms', 'likes'...)
 * @returns {string[]} Ordered channel list (may be empty if user opted out of everything for this category).
 */
function getEffectiveChannels(user, category) {
  const prefs   = user.notification_preferences || {};
  const catPref = prefs[category] || {};

  const preferred = normalizeChannel(user.preferred_channel);
  const fallback  = normalizeChannel(user.fallback_channel);

  const result = [];
  for (const ch of [preferred, fallback]) {
    if (!ch) continue;
    if (result.includes(ch)) continue; // preferred and fallback identical

    // Opt-out check: only applies to channels we track in notification_preferences.
    // 'x' and 'other' aren't in the legacy JSONB yet — they pass through here.
    // 'inApp' key is exactly 'inApp' in JSONB.
    if (ch in catPref && catPref[ch] === false) continue;

    result.push(ch);
  }
  return result;
}

/**
 * Adds a SQL fragment to a SELECT that includes preferred + fallback + JSONB opt-outs
 * for the given category. Returns { fragment, name } — the caller SELECTs `${fragment} AS eff_channels`.
 *
 * Not currently used — callers can just SELECT the raw columns and use getEffectiveChannels() in JS.
 * Kept as a stub for future perf optimization (server-side filter).
 */
function getSqlFragmentForCategory(category) {
  return {
    fragment: `
      /* eff_channels for category='${category}' */
      (
        SELECT ARRAY(
          SELECT DISTINCT ch
          FROM (VALUES
            (u.preferred_channel, 1),
            (u.fallback_channel,  2)
          ) AS ord(ch, priority)
          WHERE ch IS NOT NULL
            AND COALESCE((u.notification_preferences->'${category}'->>ch)::boolean, true) = true
          ORDER BY priority
        )
      )`,
  };
}

function normalizeChannel(ch) {
  if (!ch) return null;
  const c = String(ch).trim();
  return VALID_CHANNELS.has(c) ? c : null;
}

/**
 * Whether a user has ever explicitly set their communication preferences.
 * Used by the frontend to decide whether to show the one-time gentle modal.
 */
async function hasUserChosen(userId) {
  try {
    const { rows } = await query(
      `SELECT comm_pref_set_at FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return !!rows[0]?.comm_pref_set_at;
  } catch (err) {
    logger.error('hasUserChosen failed', { userId, err: err.message });
    return false;
  }
}

/**
 * Persist user's choice from the onboarding modal or settings page.
 * Marks comm_pref_set_at so we don't re-prompt.
 */
async function saveUserChoice(userId, { preferred, fallback, otherDetails }) {
  const pref = normalizeChannel(preferred);
  const fb   = normalizeChannel(fallback);
  if (!pref || !fb) throw new Error('Both preferred and fallback channels are required');
  if ((pref === 'other' || fb === 'other') && !otherDetails) {
    throw new Error('other_channel_details is required when preferred or fallback is "other"');
  }

  await query(
    `UPDATE users
       SET preferred_channel     = $1,
           fallback_channel      = $2,
           other_channel_details = $3,
           comm_pref_set_at      = NOW(),
           updated_at            = NOW()
     WHERE id = $4`,
    [pref, fb, otherDetails || null, userId]
  );
}

module.exports = {
  VALID_CHANNELS,
  getEffectiveChannels,
  getSqlFragmentForCategory,
  hasUserChosen,
  saveUserChoice,
};
