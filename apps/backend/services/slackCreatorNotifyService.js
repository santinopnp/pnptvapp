'use strict';

/**
 * slackCreatorNotifyService.js
 *
 * Sends per-creator notifications to their personal Slack channel (#ext-[handle]).
 * Notifications go to Slack ONLY — not in-app (company policy).
 *
 * All functions are best-effort: they never throw. If SLACK_BOT_TOKEN is not
 * set, or the creator hasn't connected Slack (slack_channel_id is null),
 * the function logs a debug note and returns immediately.
 *
 * Uses the same fetch-based pattern as slackLiveService.js (no @slack/web-api).
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';

// Channels the Slack API reported as unreachable. Memoized per process so we
// don't hammer Slack for the same dead channel on every notification.
const _deadChannels = new Set();

let _tokenDead = false;
let _tokenDeadLogged = false;
const FATAL_TOKEN_ERRORS = new Set(['account_inactive', 'invalid_auth', 'token_revoked', 'token_expired']);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _botToken() {
  return process.env.SLACK_BOT_TOKEN || null;
}

async function _clearStaleChannel(channelId) {
  if (!channelId) return;
  try {
    await query('UPDATE users SET slack_channel_id = NULL WHERE slack_channel_id = $1', [channelId]);
  } catch (_) {}
}

/**
 * Thin wrapper around Slack's chat.postMessage using native fetch.
 * Mirrors the pattern in slackLiveService.js.
 * @param {Object} body
 * @returns {Promise<Object>}
 */
async function _slackPost(body) {
  if (_tokenDead) return { ok: false, error: 'token_dead_cached' };
  const token = _botToken();
  if (!token) {
    logger.warn('[slackCreatorNotifyService] SLACK_BOT_TOKEN not set — skipping post');
    return {};
  }
  if (body?.channel && _deadChannels.has(body.channel)) {
    return { ok: false, error: 'dead_channel_cached' };
  }
  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      if (FATAL_TOKEN_ERRORS.has(data.error)) {
        _tokenDead = true;
        if (!_tokenDeadLogged) {
          _tokenDeadLogged = true;
          logger.warn('[slackCreatorNotifyService] Slack token is invalid — disabling all Slack calls for this process lifetime', { error: data.error });
        }
      } else if (body?.channel && (data.error === 'channel_not_found' || data.error === 'is_archived' || data.error === 'not_in_channel')) {
        const alreadyLogged = _deadChannels.has(body.channel);
        _deadChannels.add(body.channel);
        if (!alreadyLogged) {
          _clearStaleChannel(body.channel);
          logger.warn('[slackCreatorNotifyService] creator channel dead — nulled slack_channel_id + cached', {
            channel: body.channel,
            error: data.error,
          });
        }
      } else {
        logger.warn('[slackCreatorNotifyService] Slack chat.postMessage failed', {
          error: data.error,
          warning: data.warning,
          channel: body.channel,
        });
      }
    }
    return data;
  } catch (err) {
    logger.warn('[slackCreatorNotifyService] fetch error', { error: err.message });
    return {};
  }
}

/**
 * Resolve the personal Slack channel ID for a user.
 * Returns null if the creator hasn't connected Slack.
 * @param {string|number} userId
 * @returns {Promise<string|null>}
 */
async function getCreatorChannel(userId) {
  try {
    const { rows } = await query(
      'SELECT slack_channel_id FROM users WHERE id = $1',
      [String(userId)]
    );
    return rows[0]?.slack_channel_id || null;
  } catch (err) {
    logger.warn('[slackCreatorNotifyService] getCreatorChannel DB error', { userId, error: err.message });
    return null;
  }
}

/**
 * Post a message to a creator's personal Slack channel.
 * No-ops silently if channel not found.
 * @param {string|number} userId
 * @param {string} text  — plain-text fallback
 * @param {Array}  [blocks] — optional Block Kit blocks
 * @returns {Promise<void>}
 */
async function _postToCreator(userId, text, blocks) {
  if (!_botToken()) return;
  const channel = await getCreatorChannel(userId);
  if (!channel) {
    logger.debug('[slackCreatorNotifyService] creator has no Slack channel — skipping', { userId });
    return;
  }
  const payload = { channel, text, unfurl_links: false };
  if (blocks && blocks.length > 0) payload.blocks = blocks;
  await _slackPost(payload);
}

function _nowTs() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// ---------------------------------------------------------------------------
// Public notification functions — all best-effort (try/catch wrappers)
// ---------------------------------------------------------------------------

/**
 * Notify a creator that they have a new booking.
 * @param {string|number} creatorUserId
 * @param {{ bookerName: string, bookingTime: string, calLink: string }} opts
 * @returns {Promise<void>}
 */
async function notifyNewBooking(creatorUserId, opts) {
  try {
    const { bookerName, bookingTime, calLink } = opts || {};
    const text = `📅 New booking: *${bookerName}* at ${bookingTime}. View on Cal.com: ${calLink}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📅 New Booking', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Booker:*\n${bookerName}` },
          { type: 'mrkdwn', text: `*Time:*\n${bookingTime}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `<${calLink}|View on Cal.com>` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator that a booking was cancelled.
 * @param {string|number} creatorUserId
 * @param {{ bookerName: string, bookingTime: string }} opts
 * @returns {Promise<void>}
 */
async function notifyBookingCancelled(creatorUserId, opts) {
  try {
    const { bookerName, bookingTime } = opts || {};
    const text = `❌ Booking cancelled: *${bookerName}* removed from ${bookingTime}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '❌ Booking Cancelled', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Booker:*\n${bookerName}` },
          { type: 'mrkdwn', text: `*Slot:*\n${bookingTime}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator that they received a tip.
 * @param {string|number} creatorUserId
 * @param {{ tipperUsername: string, amount: number, message?: string }} opts
 * @returns {Promise<void>}
 */
async function notifyTipReceived(creatorUserId, opts) {
  try {
    const { tipperUsername, amount, message } = opts || {};
    const text = `💎 You received *${amount} Ru$h* from *${tipperUsername}*`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💎 Tip Received', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*From:*\n${tipperUsername}` },
          { type: 'mrkdwn', text: `*Amount:*\n${amount} Ru$h` },
        ],
      },
    ];
    if (message && String(message).trim()) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Message:* _"${String(message).trim().slice(0, 200)}"_` },
      });
    }
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
    });
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator of a new PRIME subscriber.
 * @param {string|number} creatorUserId
 * @param {{ subscriberUsername: string }} opts
 * @returns {Promise<void>}
 */
async function notifyNewSubscriber(creatorUserId, opts) {
  try {
    const { subscriberUsername } = opts || {};
    const text = `⭐ New PRIME subscriber: *${subscriberUsername}* just subscribed to you!`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⭐ New Subscriber', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${subscriberUsername}* just subscribed to your content!` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator that a call is starting soon.
 * @param {string|number} creatorUserId
 * @param {{ bookerName: string, startTime: string, joinLink: string }} opts
 * @returns {Promise<void>}
 */
async function notifyCallStartingSoon(creatorUserId, opts) {
  try {
    const { bookerName, startTime, joinLink } = opts || {};
    const text = `⏰ Your call with *${bookerName}* starts at ${startTime}. Join: ${joinLink}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⏰ Call Starting Soon', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*With:*\n${bookerName}` },
          { type: 'mrkdwn', text: `*Starts:*\n${startTime}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `<${joinLink}|Join now>` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator of a stream health warning.
 * @param {string|number} creatorUserId
 * @param {{ issue: string, droppedFramesPct?: number }} opts
 * @returns {Promise<void>}
 */
async function notifyStreamHealthWarning(creatorUserId, opts) {
  try {
    const { issue, droppedFramesPct } = opts || {};
    const text = `⚠️ Stream health warning: ${issue}. Check OBS bitrate settings.`;
    const fields = [
      { type: 'mrkdwn', text: `*Issue:*\n${issue}` },
    ];
    if (droppedFramesPct != null) {
      fields.push({ type: 'mrkdwn', text: `*Dropped Frames:*\n${droppedFramesPct}%` });
    }
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⚠️ Stream Health Warning', emoji: true },
      },
      { type: 'section', fields },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'Check OBS bitrate settings and your internet connection.' },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator that their ID verification is expiring.
 * @param {string|number} creatorUserId
 * @param {{ daysUntilExpiry: number, renewLink: string }} opts
 * @returns {Promise<void>}
 */
async function notify2257Expiring(creatorUserId, opts) {
  try {
    const { daysUntilExpiry, renewLink } = opts || {};
    const text = `🪪 Your ID verification expires in ${daysUntilExpiry} days. Renew: ${renewLink}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🪪 ID Verification Expiring', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Your 2257 ID verification expires in *${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}*. Renew before it expires to avoid content restrictions.`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `<${renewLink}|Renew now>` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator that a payout was processed.
 * @param {string|number} creatorUserId
 * @param {{ amount: number|string }} opts
 * @returns {Promise<void>}
 */
async function notifyPayoutProcessed(creatorUserId, opts) {
  try {
    const { amount } = opts || {};
    const formatted = typeof amount === 'number' ? amount.toFixed(2) : String(amount);
    const text = `💸 Payout of *$${formatted}* has been sent to your account.`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💸 Payout Sent', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `A payout of *$${formatted} USD* has been processed and sent to your account.` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

/**
 * Notify a creator of a new comment on their video.
 * @param {string|number} creatorUserId
 * @param {{ videoTitle: string, commentExcerpt: string, commenterName: string }} opts
 * @returns {Promise<void>}
 */
async function notifyNewVideoComment(creatorUserId, opts) {
  try {
    const { videoTitle, commentExcerpt, commenterName } = opts || {};
    const excerpt = String(commentExcerpt || '').trim().slice(0, 150);
    const text = `💬 New comment on *${videoTitle}* by ${commenterName}: "${excerpt}"`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '💬 New Video Comment', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Video:*\n${videoTitle}` },
          { type: 'mrkdwn', text: `*From:*\n${commenterName}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `_"${excerpt}"_` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }],
      },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
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
      return qs._makeSlackShim('slack_creator', fnName)(...args);
    }
    return origFn(...args);
  };
}

/**
 * Notify a creator that their subscription has been activated and remind them
 * to read the guidelines and upload exclusive content.
 * @param {string|number} creatorUserId
 * @param {{ lang?: 'es'|'en' }} opts
 * @returns {Promise<void>}
 */
async function notifyActivationReminder(creatorUserId, opts) {
  try {
    const isEs = (opts?.lang || 'es') === 'es';
    const text = isEs
      ? '🎉 ¡Tu perfil de creador ya está activo en PNPtv!! Recuerda leer los lineamientos y subir contenido exclusivo.'
      : '🎉 Your creator profile is now active on PNPtv!! Please read the guidelines and upload exclusive content.';
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '🎉 Perfil de Creador Activo', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: isEs
            ? 'Tu perfil de creador ya está *activo* — tus suscripciones están abiertas al público.'
            : 'Your creator profile is now *active* — subscriptions are open to the public.',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: isEs
            ? '📋 *Próximos pasos:*\n1. Lee los lineamientos: <https://pnptv.app/creator-terms|Creator Terms>\n2. Sube fotos y videos exclusivos para tus suscriptores\n3. ¡Comparte tu perfil con tu audiencia!'
            : '📋 *Next steps:*\n1. Read the guidelines: <https://pnptv.app/creator-terms|Creator Terms>\n2. Upload exclusive photos and videos for your subscribers\n3. Share your profile with your audience!',
        },
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }] },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

// ── Stream: going live ───────────────────────────────────────────────────────
async function notifyGoingLive(creatorUserId, opts) {
  try {
    const { channelRef = '' } = opts || {};
    const streamUrl = 'https://pnptv.app/live';
    const text = `🔴 You're LIVE! Go get 'em — the stage is yours.`;
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '🔴 You\'re LIVE!', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Your stream *${channelRef || 'PNP Live'}* is live on PNPtv!\n<${streamUrl}|Open stream> — share the link with your audience!`,
        },
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }] },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

// ── Stream: new viewer joined ────────────────────────────────────────────────
async function notifyNewViewer(creatorUserId, opts) {
  try {
    const { viewerUsername = 'Someone', viewerCount = 1, isFirst = false } = opts || {};
    const headerText = isFirst ? '🎉 First Viewer!' : `👥 ${viewerCount} Viewers Live`;
    const bodyText = isFirst
      ? `*${viewerUsername}* is your *first viewer* — they showed up for you! 🙌`
      : `*${viewerUsername}* just joined. You now have *${viewerCount} viewers* watching live!`;
    const text = isFirst ? `🎉 ${viewerUsername} is your first viewer!` : `👥 ${viewerCount} viewers live — ${viewerUsername} just joined.`;
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: bodyText } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }] },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

// ── Stream: end-of-session report with comparison ────────────────────────────
async function notifyStreamEndStats(creatorUserId, opts) {
  try {
    const { current = {}, previous = null } = opts || {};

    const durSec = Number(current.duration_seconds) || 0;
    const durMin = Math.round(durSec / 60);
    const durH   = Math.floor(durMin / 60);
    const durMrem = durMin % 60;
    const durLabel = durH > 0 ? `${durH}h ${durMrem}m` : `${durMrem}m`;

    const peak     = Number(current.peak_viewers) || 0;
    const unique   = Number(current.unique_viewers) || peak;
    const tipsUsd  = parseFloat(current.total_tips_usd || 0);
    const tipsRush = Number(current.total_tips_tokens) || 0;

    const prevDurMin  = previous ? Math.round((Number(previous.duration_seconds) || 0) / 60) : null;
    const prevPeak    = previous ? Number(previous.peak_viewers) || 0 : null;
    const prevTipsUsd = previous ? parseFloat(previous.total_tips_usd || 0) : null;

    function fmt(val, prev, unit = '') {
      if (prev === null) return '';
      const d = val - prev;
      const sign = d >= 0 ? '+' : '';
      const arrow = d > 0 ? ' ↑' : (d < 0 ? ' ↓' : '');
      return ` _(${sign}${unit}${Math.abs(d)}${arrow} vs last)_`;
    }

    const deltaDur  = prevDurMin  !== null ? durMin - prevDurMin   : null;
    const deltaPeak = prevPeak    !== null ? peak   - prevPeak     : null;
    const deltaTips = prevTipsUsd !== null ? tipsUsd - prevTipsUsd : null;

    // Motivational line
    const ups = [deltaDur > 0, deltaPeak > 0, deltaTips > 0].filter(Boolean).length;
    let motivation;
    if (ups === 3)            motivation = '🏆 *Triple win* — duration, viewers AND tips all up. You\'re on fire!';
    else if (ups === 2)       motivation = '📈 Two metrics up vs last session — momentum is building!';
    else if (tipsUsd > 20)   motivation = '💰 Great tip session — your audience loves what you do!';
    else if (peak >= 10 && !previous) motivation = '🎉 Solid start! Every legend builds their audience one show at a time.';
    else if (deltaPeak > 5)  motivation = '👥 Your audience is growing fast — keep showing up!';
    else if (ups === 0 && previous) motivation = '💪 Not every show peaks — the ones who stay consistent win. See you next time!';
    else                      motivation = '✨ Another show done. Your community is watching — keep going!';

    const statsLines = [
      `⏱ *Duration:* ${durLabel}${fmt(durMin, prevDurMin, '')}`,
      `👥 *Peak viewers:* ${peak} (${unique} unique)${fmt(peak, prevPeak, '')}`,
      `💰 *Tips:* ${tipsRush} Ru$h (~$${tipsUsd.toFixed(2)})${deltaTips !== null ? ` _(${deltaTips >= 0 ? '+' : ''}$${deltaTips.toFixed(2)} vs last)_` : ''}`,
    ].join('\n');

    const text = `📊 Session ended — ${durLabel}, ${peak} peak viewers, $${tipsUsd.toFixed(2)} in tips`;
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '📊 Session Report', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: statsLines } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: motivation } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `PNPtv! • ${_nowTs()}` }] },
    ];
    await _postToCreator(creatorUserId, text, blocks);
  } catch (_) {}
}

module.exports = {
  getCreatorChannel, // not queued — used for DB lookup, not Slack posting
  notifyActivationReminder,
  // Queued wrappers (used by callers)
  notifyNewBooking: _wrap('notifyNewBooking', notifyNewBooking),
  notifyBookingCancelled: _wrap('notifyBookingCancelled', notifyBookingCancelled),
  notifyTipReceived: _wrap('notifyTipReceived', notifyTipReceived),
  notifyNewSubscriber: _wrap('notifyNewSubscriber', notifyNewSubscriber),
  notifyCallStartingSoon: _wrap('notifyCallStartingSoon', notifyCallStartingSoon),
  notifyStreamHealthWarning: _wrap('notifyStreamHealthWarning', notifyStreamHealthWarning),
  notify2257Expiring: _wrap('notify2257Expiring', notify2257Expiring),
  notifyPayoutProcessed: _wrap('notifyPayoutProcessed', notifyPayoutProcessed),
  notifyNewVideoComment: _wrap('notifyNewVideoComment', notifyNewVideoComment),
  notifyGoingLive: _wrap('notifyGoingLive', notifyGoingLive),
  notifyNewViewer: _wrap('notifyNewViewer', notifyNewViewer),
  notifyStreamEndStats: _wrap('notifyStreamEndStats', notifyStreamEndStats),
  // Direct originals — used ONLY by the BullMQ worker to avoid infinite loops
  _direct_notifyNewBooking: notifyNewBooking,
  _direct_notifyBookingCancelled: notifyBookingCancelled,
  _direct_notifyTipReceived: notifyTipReceived,
  _direct_notifyNewSubscriber: notifyNewSubscriber,
  _direct_notifyCallStartingSoon: notifyCallStartingSoon,
  _direct_notifyStreamHealthWarning: notifyStreamHealthWarning,
  _direct_notify2257Expiring: notify2257Expiring,
  _direct_notifyPayoutProcessed: notifyPayoutProcessed,
  _direct_notifyNewVideoComment: notifyNewVideoComment,
  _direct_notifyGoingLive: notifyGoingLive,
  _direct_notifyNewViewer: notifyNewViewer,
  _direct_notifyStreamEndStats: notifyStreamEndStats,
};
