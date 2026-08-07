'use strict';

/**
 * slackService.js
 *
 * Low-level Slack API wrapper — workspace member lookups, channel creation,
 * and invite operations for Phase 0 creator onboarding.
 *
 * Uses native fetch (Node.js 18) matching the pattern in all other Slack
 * services in this codebase. Does NOT use @slack/web-api.
 *
 * All functions throw on real Slack API errors (not "already_in_channel" or
 * "users_not_found"). Callers (especially the backfill script) should wrap
 * calls in try/catch.
 *
 * Required env vars:
 *   SLACK_BOT_TOKEN              — xoxb-… bot token
 *   SLACK_WORKSPACE_ID           — Slack workspace ID (T-…) — used for audit only
 *   SLACK_CHANNEL_UPDATES        — channel ID for #pnptv-updates
 *   SLACK_CHANNEL_LOUNGE         — channel ID for #creator-lounge
 *   SLACK_CHANNEL_TRAINING       — channel ID for #creator-training
 */

const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';

function _token() {
  return process.env.SLACK_BOT_TOKEN || null;
}

// Creator shared channels (IDs, not names — faster and more reliable).
// Build the list lazily so changes to env vars after module load are picked up.
function _sharedChannels() {
  return [
    process.env.SLACK_CHANNEL_UPDATES,
    process.env.SLACK_CHANNEL_LOUNGE,
    process.env.SLACK_CHANNEL_TRAINING,
  ].filter(Boolean);
}

/**
 * Internal fetch wrapper.
 * Throws if token missing or network fails.
 * Returns the Slack JSON response object (may have ok: false).
 */
async function _slackCall(method, body) {
  const token = _token();
  if (!token) throw new Error('[slackService] SLACK_BOT_TOKEN not configured');

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  const data = await res.json().catch(() => ({ ok: false, error: 'invalid_json_response' }));
  return data;
}

/**
 * Look up a Slack member ID by email address.
 * Returns the member ID string or null if the user is not in the workspace.
 * Throws on unexpected Slack API errors.
 *
 * @param {string} email
 * @returns {Promise<string|null>}
 */
async function lookupMemberByEmail(email) {
  const token = _token();
  if (!token) throw new Error('[slackService] SLACK_BOT_TOKEN not configured');
  // users.lookupByEmail is a GET endpoint — email must be a query param, not a JSON body
  const url = `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'invalid_json_response' }));
  if (data.ok) return data.user?.id || null;
  if (data.error === 'users_not_found') return null;
  throw new Error(`[slackService] users.lookupByEmail failed: ${data.error}`);
}

/**
 * Create a private channel named ext-<handle>.
 * If the channel already exists, returns its ID.
 *
 * Channel names are lower-cased and non-alphanumeric chars replaced with hyphens
 * to comply with Slack naming rules (max 80 chars, no spaces, no uppercase).
 *
 * @param {string} handle — creator's username (without @)
 * @returns {Promise<string>}  channel ID
 */
async function createExtChannel(handle) {
  const name = `ext-${handle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-{2,}/g, '-').slice(0, 76)}`;

  const createData = await _slackCall('conversations.create', {
    name,
    is_private: true,
  });

  if (createData.ok) return createData.channel.id;

  if (createData.error === 'name_taken') {
    // Channel exists — find it by listing public channels
    // We use conversations.list with a name prefix filter (Slack doesn't support exact match).
    let cursor = undefined;
    do {
      const listData = await _slackCall('conversations.list', {
        types: 'public_channel',
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });

      if (!listData.ok) {
        throw new Error(`[slackService] conversations.list failed: ${listData.error}`);
      }

      const found = (listData.channels || []).find(c => c.name === name);
      if (found) return found.id;

      cursor = listData.response_metadata?.next_cursor;
    } while (cursor);

    throw new Error(`[slackService] Channel "${name}" reported as taken but not found in list`);
  }

  throw new Error(`[slackService] conversations.create failed: ${createData.error}`);
}

/**
 * Invite a member to a channel.
 * No-ops silently if the member is already in the channel.
 * Throws on other errors.
 *
 * @param {string} channelId
 * @param {string} memberId
 * @returns {Promise<void>}
 */
async function inviteToChannel(channelId, memberId) {
  const data = await _slackCall('conversations.invite', {
    channel: channelId,
    users: memberId,
  });

  if (data.ok) return;
  if (data.error === 'already_in_channel') return;

  throw new Error(`[slackService] conversations.invite failed (channel=${channelId}): ${data.error}`);
}

/**
 * Full Phase 0 onboarding flow for a single creator.
 *
 * 1. Look up the creator in the Slack workspace by email.
 * 2. If found: create #ext-<handle>, invite them to shared + ext channels.
 * 3. If not found: return { memberId: null, channelId: null } so the caller
 *    can log that they need to send a manual join link.
 *
 * @param {string} email   — creator's PNPtv email address
 * @param {string} handle  — creator's username (for channel naming)
 * @returns {Promise<{ memberId: string|null, channelId: string|null }>}
 */
async function inviteCreatorToWorkspace(email, handle) {
  const memberId = await lookupMemberByEmail(email);

  if (!memberId) {
    // Creator not yet in Slack workspace — caller must send them an invite link.
    return { memberId: null, channelId: null };
  }

  const channelId = await createExtChannel(handle);

  // Invite to creator shared channels + their personal ext channel
  const allChannels = [..._sharedChannels(), channelId];

  for (const ch of allChannels) {
    try {
      await inviteToChannel(ch, memberId);
    } catch (invErr) {
      logger.warn(`[slackService] inviteToChannel failed — skipping (channel=${ch})`, {
        error: invErr.message,
        memberId,
        handle,
      });
    }
  }

  return { memberId, channelId };
}

/**
 * Store slack_member_id and slack_channel_id on a user record.
 * Separate from inviteCreatorToWorkspace so the backfill script can update
 * in batches without mixing concerns.
 *
 * @param {object} dbQuery  — query function (pool.query or pg query)
 * @param {string} userId   — users.id (UUID)
 * @param {string} memberId — Slack member ID (U…)
 * @param {string} channelId — Slack channel ID (C…)
 * @returns {Promise<void>}
 */
async function saveCreatorSlackIds(dbQuery, userId, memberId, channelId) {
  await dbQuery(
    `UPDATE users
        SET slack_member_id  = $2,
            slack_channel_id = $3,
            updated_at       = NOW()
      WHERE id = $1`,
    [String(userId), memberId, channelId]
  );
}

module.exports = {
  lookupMemberByEmail,
  createExtChannel,
  inviteToChannel,
  inviteCreatorToWorkspace,
  saveCreatorSlackIds,
};
