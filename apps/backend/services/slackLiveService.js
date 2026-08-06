'use strict';

/**
 * slackLiveService.js
 *
 * Slack ops notifications for PNP Live / Main Stage streaming events.
 * Posts to #ops-live (SLACK_OPS_LIVE_CHANNEL env var or hardcoded placeholder).
 *
 * All functions are best-effort: they never throw. If SLACK_BOT_TOKEN is not
 * set, operations log a warning and return immediately.
 */

const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';

// Channel can be overridden by tests or future config injection.
let _opsLiveChannel = process.env.SLACK_OPS_LIVE_CHANNEL || '';

/**
 * Override the ops-live channel — useful for tests or runtime injection.
 * @param {string} channelId
 */
function setOpsLiveChannel(channelId) {
  _opsLiveChannel = channelId;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _botToken() {
  return process.env.SLACK_BOT_TOKEN || null;
}

/**
 * Thin wrapper around Slack's chat.postMessage.
 * Mirrors the pattern in slackFeedbackService.js.
 * @param {string} method
 * @param {Object} body
 * @returns {Promise<Object>}
 */
async function _slackPost(method, body) {
  const token = _botToken();
  if (!token) {
    logger.warn('[slackLiveService] SLACK_BOT_TOKEN not set — skipping post');
    return {};
  }
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      logger.warn(`[slackLiveService] Slack ${method} failed`, {
        error: data.error,
        warning: data.warning,
      });
    }
    return data;
  } catch (err) {
    logger.warn('[slackLiveService] fetch error', { error: err.message });
    return {};
  }
}

function _nowTs() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Notify #ops-live that a stream went live.
 * @param {string} streamId  — channel ref, e.g. 'pnptv-santino'
 * @param {string} performerName
 * @returns {Promise<void>}
 */
async function notifyStreamLive(streamId, performerName) {
  if (!_botToken()) return;
  if (!_opsLiveChannel) return;
  const publicUrl = process.env.RESTREAMER_PUBLIC_URL || 'https://live.pnptv.app';
  const hlsUrl = `${publicUrl}/memfs/${streamId}.m3u8`;
  await _slackPost('chat.postMessage', {
    channel: _opsLiveChannel,
    text: `:red_circle: ${performerName} is LIVE — stream: ${streamId}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `:red_circle: ${performerName} is LIVE`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Stream ID:*\n\`${streamId}\`` },
          { type: 'mrkdwn', text: `*Started:*\n${_nowTs()}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*HLS URL:* <${hlsUrl}|${hlsUrl}>` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `PNPtv! Main Stage • ${_nowTs()}` },
        ],
      },
    ],
  });
}

/**
 * Notify #ops-live that a stream ended.
 * @param {string} streamId
 * @param {string} performerName
 * @param {number} durationMinutes
 * @returns {Promise<void>}
 */
async function notifyStreamEnd(streamId, performerName, durationMinutes) {
  if (!_botToken()) return;
  if (!_opsLiveChannel) return;
  await _slackPost('chat.postMessage', {
    channel: _opsLiveChannel,
    text: `:white_check_mark: ${performerName} ended stream after ${durationMinutes} min`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `:checkered_flag: ${performerName} ended stream`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Stream ID:*\n\`${streamId}\`` },
          { type: 'mrkdwn', text: `*Duration:*\n${durationMinutes} min` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `PNPtv! Main Stage • ${_nowTs()}` },
        ],
      },
    ],
  });
}

/**
 * Notify #ops-live of a stream health issue.
 * @param {string} streamId
 * @param {string} performerName
 * @param {string} issue — 'offline' | 'failed' | 'finished' | any state string
 * @returns {Promise<void>}
 */
async function notifyStreamHealth(streamId, performerName, issue) {
  if (!_botToken()) return;
  if (!_opsLiveChannel) return;
  const emoji = issue === 'offline' ? ':large_red_square:' : ':rotating_light:';
  const label = issue === 'finished' ? 'ended unexpectedly' : issue;
  await _slackPost('chat.postMessage', {
    channel: _opsLiveChannel,
    text: `${emoji} Stream health alert — ${performerName} (${streamId}): ${label}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} Stream Health Alert`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Stream ID:*\n\`${streamId}\`` },
          { type: 'mrkdwn', text: `*Performer:*\n${performerName}` },
          { type: 'mrkdwn', text: `*State:*\n\`${issue}\`` },
          { type: 'mrkdwn', text: `*Time:*\n${_nowTs()}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Check Restreamer UI → ingest processes for details.' },
        ],
      },
    ],
  });
}

/**
 * Notify #ops-live that a tip was received during a live stream.
 * @param {string} performerName
 * @param {string} tipperUsername
 * @param {number} amount — token amount
 * @param {string} [message] — optional tip message
 * @returns {Promise<void>}
 */
async function notifyTipReceived(performerName, tipperUsername, amount, message) {
  if (!_botToken()) return;
  if (!_opsLiveChannel) return;
  const fields = [
    { type: 'mrkdwn', text: `*Performer:*\n${performerName}` },
    { type: 'mrkdwn', text: `*Tipper:*\n${tipperUsername}` },
    { type: 'mrkdwn', text: `*Amount:*\n${amount} Ru$h` },
    { type: 'mrkdwn', text: `*Time:*\n${_nowTs()}` },
  ];
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `:gem: Live Tip Received`, emoji: true },
    },
    {
      type: 'section',
      fields,
    },
  ];
  if (message && message.trim()) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Message:* _"${message.trim().slice(0, 200)}"_`,
      },
    });
  }
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `PNPtv! Main Stage • ${_nowTs()}` },
    ],
  });
  await _slackPost('chat.postMessage', {
    channel: _opsLiveChannel,
    text: `:gem: ${tipperUsername} tipped ${amount} Ru$h to ${performerName}`,
    blocks,
  });
}

// ── BullMQ queue wrappers ────────────────────────────────────────────────────
let _queueSvc = null;
function _qs() {
  if (!_queueSvc) {
    try { _queueSvc = require('./queueService'); } catch (_) {}
  }
  return _queueSvc;
}

function _wrap(fnName, origFn) {
  return async function (...args) {
    const qs = _qs();
    if (qs && qs._makeSlackShim) {
      return qs._makeSlackShim('slack_live', fnName)(...args);
    }
    return origFn(...args);
  };
}

module.exports = {
  setOpsLiveChannel, // config setter — not queued
  // Queued wrappers (used by callers)
  notifyStreamLive: _wrap('notifyStreamLive', notifyStreamLive),
  notifyStreamEnd: _wrap('notifyStreamEnd', notifyStreamEnd),
  notifyStreamHealth: _wrap('notifyStreamHealth', notifyStreamHealth),
  notifyTipReceived: _wrap('notifyTipReceived', notifyTipReceived),
  // Direct originals — used ONLY by the BullMQ worker to avoid infinite loops
  _direct_notifyStreamLive: notifyStreamLive,
  _direct_notifyStreamEnd: notifyStreamEnd,
  _direct_notifyStreamHealth: notifyStreamHealth,
  _direct_notifyTipReceived: notifyTipReceived,
};
