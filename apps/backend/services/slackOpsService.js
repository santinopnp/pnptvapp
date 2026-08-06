'use strict';

/**
 * Slack Ops Notification Service
 *
 * Posts structured Block Kit messages to internal ops channels:
 *   #ops-payments  — payment success / failure / large refunds
 *   #ops-incidents — unhandled 5xx server errors
 *   #ops-creator   — new creator/model applications
 *
 * Required env vars (all optional — functions silently no-op if missing):
 *   SLACK_BOT_TOKEN
 *   SLACK_OPS_PAYMENTS_CHANNEL  — channel ID or name, e.g. C0123456789
 *   SLACK_OPS_INCIDENTS_CHANNEL
 *   SLACK_OPS_CREATOR_CHANNEL
 */

const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';

const _tok              = () => process.env.SLACK_BOT_TOKEN              || '';
const _paymentsChannel  = () => process.env.SLACK_OPS_PAYMENTS_CHANNEL   || '';
const _incidentsChannel = () => process.env.SLACK_OPS_INCIDENTS_CHANNEL  || '';
const _creatorChannel   = () => process.env.SLACK_OPS_CREATOR_CHANNEL    || '';

function _nowTs() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
}

async function _post(channel, text, blocks) {
  if (!_tok() || !channel) return; // silently noop if not configured
  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${_tok()}`,
      },
      body: JSON.stringify({ channel, text, blocks }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (!data.ok) {
      logger.warn('[slackOps] post failed', { error: data.error, channel });
    }
  } catch (e) {
    logger.warn('[slackOps] fetch error', { error: e.message });
  }
}

/**
 * Posts a payment success alert to #ops-payments.
 * @param {object} opts
 * @param {string} [opts.orderId]   order reference (NowPayments order_id)
 * @param {string} [opts.userId]
 * @param {string} [opts.username]
 * @param {number} [opts.amount]
 * @param {string} [opts.currency]
 * @param {string} [opts.plan]
 * @param {string} [opts.txId]      legacy alias for orderId
 * @param {string} [opts.provider]
 */
async function notifyPaymentSuccess(opts) {
  const channel = _paymentsChannel();
  if (!_tok() || !channel) return;
  try {
    const {
      orderId, userId, username, amount = 0,
      currency = 'USD', plan = 'unknown',
      txId, provider = 'NowPayments',
    } = opts || {};
    const orderRef = orderId || txId || 'N/A';
    const userLabel = username ? `@${username}` : (userId || 'N/A');
    const text = `✅ Payment received: ${currency} ${amount} for ${plan}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':white_check_mark: Payment Received', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Amount:*\n${currency} ${amount}` },
          { type: 'mrkdwn', text: `*Plan:*\n${plan}` },
          { type: 'mrkdwn', text: `*User:*\n${userLabel}` },
          { type: 'mrkdwn', text: `*Order ID:*\n\`${orderRef}\`` },
          { type: 'mrkdwn', text: `*Provider:*\n${provider}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyPaymentSuccess error', { error: e.message });
  }
}

/**
 * Posts a payment failure alert to #ops-payments.
 * @param {object} opts
 * @param {string} [opts.orderId]
 * @param {string} [opts.userId]
 * @param {string} [opts.username]
 * @param {number} [opts.amount]
 * @param {string} [opts.currency]
 * @param {string} [opts.txId]      legacy alias for orderId
 * @param {string} [opts.provider]
 * @param {string} [opts.reason]
 */
async function notifyPaymentFailed(opts) {
  const channel = _paymentsChannel();
  if (!_tok() || !channel) return;
  try {
    const {
      orderId, userId, username, amount = 0,
      currency = 'USD', txId,
      provider = 'NowPayments', reason = 'unknown',
    } = opts || {};
    const orderRef = orderId || txId || 'N/A';
    const userLabel = username ? `@${username}` : (userId || 'N/A');
    const text = `❌ Payment failed: Order ${orderRef}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':x: Payment Failed', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Reason:*\n${reason}` },
          { type: 'mrkdwn', text: `*Amount:*\n${currency} ${amount}` },
          { type: 'mrkdwn', text: `*User:*\n${userLabel}` },
          { type: 'mrkdwn', text: `*Order ID:*\n\`${orderRef}\`` },
          { type: 'mrkdwn', text: `*Provider:*\n${provider}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyPaymentFailed error', { error: e.message });
  }
}

/**
 * Posts a large-refund alert to #ops-payments.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {number} opts.amount
 * @param {string} opts.reason
 */
async function notifyLargeRefund(opts) {
  const channel = _paymentsChannel();
  if (!_tok() || !channel) return;
  try {
    const { userId, amount, reason } = opts;
    const text = `Large refund issued: $${amount} to user ${userId}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':rotating_light: Large Refund Issued', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*User:*\n${userId}` },
          { type: 'mrkdwn', text: `*Amount:*\n$${amount}` },
          { type: 'mrkdwn', text: `*Reason:*\n${reason || 'Not specified'}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyLargeRefund error', { error: e.message });
  }
}

/**
 * Posts an unhandled 5xx error alert to #ops-incidents.
 * Accepts both old shape (url, method, statusCode, message) and new shape
 * (route, method, errorMessage, userId, stack) — auto-detects.
 * @param {object} opts
 * @param {string} [opts.route]        route path (new shape)
 * @param {string} [opts.url]          legacy alias for route
 * @param {string} [opts.method]
 * @param {string} [opts.errorMessage] error text (new shape)
 * @param {string} [opts.message]      legacy alias for errorMessage
 * @param {string} [opts.userId]
 * @param {number} [opts.statusCode]   legacy field
 * @param {string} [opts.stack]
 */
async function notifyUnhandledError(opts) {
  const channel = _incidentsChannel();
  if (!_tok() || !channel) return;
  try {
    const {
      route, url, method = 'unknown',
      errorMessage, message, userId,
      statusCode, stack,
    } = opts || {};
    const routeLabel = route || url || 'unknown';
    const errorText = errorMessage || message || 'Unknown error';
    const text = `🚨 Unhandled Error on ${method} ${routeLabel}: ${errorText}`;
    const stackSnippet = String(stack || '').slice(0, 300);
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':rotating_light: Unhandled Error', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Route:*\n\`${method} ${routeLabel}\`` },
          { type: 'mrkdwn', text: `*Error:*\n${errorText.slice(0, 200)}` },
          ...(statusCode ? [{ type: 'mrkdwn', text: `*Status:*\n${statusCode}` }] : []),
          ...(userId ? [{ type: 'mrkdwn', text: `*User ID:*\n${userId}` }] : []),
        ],
      },
      ...(stackSnippet
        ? [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Stack (first 300 chars):*\n\`\`\`${stackSnippet}\`\`\`` },
            },
          ]
        : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Logs', emoji: true },
            url: 'https://dozzle.pnptv.app',
            action_id: 'view_logs',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔴 Check Redis', emoji: true },
            action_id: 'check_redis',
            value: 'check_redis',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📡 Re-register Webhook', emoji: true },
            action_id: 'reregister_webhook',
            value: 'reregister_webhook',
          },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyUnhandledError error', { error: e.message });
  }
}

/**
 * Posts a new creator application alert to #ops-creator.
 * Accepts both old shape (stageName, applicationType, applicationId) and new
 * shape (username, displayName, bio, appliedAt) — fields are merged.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} [opts.username]
 * @param {string} [opts.displayName]
 * @param {string} [opts.bio]
 * @param {string} [opts.appliedAt]
 * @param {string} [opts.stageName]         legacy alias for displayName
 * @param {string} [opts.applicationType]   legacy
 * @param {string} [opts.applicationId]     legacy
 */
async function notifyCreatorApplication(opts) {
  const channel = _creatorChannel();
  if (!_tok() || !channel) return;
  try {
    const {
      userId = 'N/A', username = '', displayName, stageName,
      bio = '', appliedAt, applicationType, applicationId,
    } = opts || {};
    const nameLabel = displayName || stageName || username || userId;
    const userLabel = username ? `@${username}` : '(none)';
    const reviewUrl = `https://pnptv.app/admin/creators/${userId}`;
    const text = `🎭 New creator application from ${nameLabel}`;
    const bioSnippet = String(bio || '').slice(0, 200);
    const fields = [
      { type: 'mrkdwn', text: `*Name:*\n${nameLabel}` },
      { type: 'mrkdwn', text: `*Username:*\n${userLabel}` },
      { type: 'mrkdwn', text: `*User ID:*\n${userId}` },
      ...(applicationType ? [{ type: 'mrkdwn', text: `*Type:*\n${applicationType}` }] : []),
      ...(applicationId ? [{ type: 'mrkdwn', text: `*Application ID:*\n${applicationId}` }] : []),
      ...(appliedAt ? [{ type: 'mrkdwn', text: `*Applied At:*\n${appliedAt}` }] : []),
    ];
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':performing_arts: New Creator Application', emoji: true },
      },
      { type: 'section', fields },
      ...(bioSnippet
        ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Bio:*\n${bioSnippet}` } }]
        : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review Application', emoji: true },
            url: reviewUrl,
            action_id: 'review_creator_application',
            style: 'primary',
          },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyCreatorApplication error', { error: e.message });
  }
}

/**
 * Posts a creator payout notification to #ops-payments.
 * @param {object} opts
 * @param {string} opts.creatorName
 * @param {number|string} opts.amount
 * @param {string} [opts.method]
 * @param {string} [opts.batchId]
 */
async function notifyTipPayout(opts) {
  const channel = _paymentsChannel();
  if (!_tok() || !channel) return;
  try {
    const {
      creatorName = 'Unknown',
      amount = 0,
      method = 'N/A',
      batchId = 'N/A',
    } = opts || {};
    const text = `💸 Payout processed: ${creatorName} — $${amount}`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':moneybag: Payout Processed', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Creator:*\n${creatorName}` },
          { type: 'mrkdwn', text: `*Amount:*\n$${amount} USD` },
          { type: 'mrkdwn', text: `*Method:*\n${method}` },
          { type: 'mrkdwn', text: `*Batch ID:*\n\`${batchId}\`` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyTipPayout error', { error: e.message });
  }
}

/**
 * Alert #ops-incidents AND admin DM when NowPayments JWT auth returns 403.
 * This means the NP account password was rotated and the API key is stale.
 * @param {object} opts
 * @param {string} [opts.route]
 * @param {string} [opts.timestamp]
 */
async function notifyNpJwt403(opts) {
  if (!_tok()) return;
  try {
    const {
      route = 'unknown',
      timestamp = _nowTs(),
    } = opts || {};
    const text = '🔑 NowPayments JWT 403 — password rotation needed';
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':key: NowPayments JWT 403 — Password Rotation Needed', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Route:*\n\`${route}\`` },
          { type: 'mrkdwn', text: `*Detected At:*\n${timestamp}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'NowPayments returned HTTP 403 on a JWT auth request. The NP account password has likely been rotated. Update `NOWPAYMENTS_EMAIL_PASSWORD` env var and redeploy.',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔑 Probe NP Auth', emoji: true },
            action_id: 'probe_np_auth',
            value: 'probe_np_auth',
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Probe Auth Docs', emoji: true },
            url: 'https://documenter.getpostman.com/view/7907941/2s93JqTRWT#2c8b97ab-ba57-4efd-80e2-1a09c26f3d5f',
            action_id: 'np_probe_auth_docs',
            style: 'danger',
          },
        ],
      },
    ];

    const incidentChannel = _incidentsChannel();
    const adminUserId = process.env.SLACK_ADMIN_DM_USER_ID || null;

    // Post to incidents channel
    if (_tok() && incidentChannel) {
      await _post(incidentChannel, text, blocks);
    }

    // DM admin directly via conversations.open
    if (_tok() && adminUserId) {
      try {
        const openRes = await fetch(`${SLACK_API}/conversations.open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${_tok()}`,
          },
          body: JSON.stringify({ users: adminUserId }),
        });
        const openData = await openRes.json().catch(() => ({}));
        if (openData.ok && openData.channel?.id) {
          await _post(openData.channel.id, text, blocks);
        } else {
          logger.warn('[slackOps] notifyNpJwt403: conversations.open failed', { error: openData.error });
        }
      } catch (dmErr) {
        logger.warn('[slackOps] notifyNpJwt403: DM failed', { error: dmErr.message });
      }
    }
  } catch (e) {
    logger.warn('[slackOps] notifyNpJwt403 error', { error: e.message });
  }
}

// ── BullMQ queue wrappers ────────────────────────────────────────────────────
// Each exported function is wrapped so it enqueues a job on the notifications
// queue. The worker in queueService.js calls the original function. Falls back
// to the direct call if the queue is unavailable.
let _queueSvc = null;
function _qs() {
  if (!_queueSvc) {
    try { _queueSvc = require('./queueService'); } catch (_) {}
  }
  return _queueSvc;
}

/**
 * Notify #ops-payments when a buyer lands on /nequinegocios and registers.
 * Admin must verify payment in Wompi dashboard and click "Grant Access" in the admin panel.
 */
async function notifyNequiPendingActivation(opts) {
  const channel = _paymentsChannel();
  if (!_tok() || !channel) return;
  try {
    const { email = 'unknown', wompiReference = 'N/A', wompiTransactionId = 'N/A', wompiStatus = 'N/A' } = opts || {};
    const text = `:nequi: Nequi Negocios: buyer registered — action required`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':nequi: Nequi Negocios — Buyer Registered', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'A buyer completed the Nequi Negocios flow. *Verify payment in Wompi dashboard, then grant access in the admin panel.*' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Email:*\n${email}` },
          { type: 'mrkdwn', text: `*Wompi Status:*\n${wompiStatus}` },
          { type: 'mrkdwn', text: `*Wompi Reference:*\n\`${wompiReference}\`` },
          { type: 'mrkdwn', text: `*Transaction ID:*\n\`${wompiTransactionId}\`` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open Admin Panel', emoji: true },
            url: 'https://pnptv.app/admin/meru-links',
            action_id: 'open_admin_meru',
          },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyNequiPendingActivation error', { error: e.message });
  }
}

/**
 * Posts a Ru$h → USD conversion alert to #ops-payments.
 * Fired when a creator converts their Ru$h token balance into creator_earnings.
 * @param {object} opts
 * @param {string} opts.creatorId
 * @param {string} opts.handle        creator @username or display name
 * @param {number} opts.rushAmount    Ru$h tokens debited
 * @param {number} opts.grossUsd      total USD value (rushAmount / 6)
 * @param {number} opts.creatorUsd    70% — goes to creator earnings
 * @param {number} opts.platformUsd   30% — platform keeps this
 */
async function notifyRushConversion(opts) {
  const channel = _paymentsChannel();
  if (!_tok() || !channel) return;
  try {
    const { creatorId = 'N/A', handle = 'unknown', rushAmount = 0, grossUsd = 0, creatorUsd = 0, platformUsd = 0 } = opts || {};
    const userLabel = handle ? `@${handle}` : creatorId;
    const text = `💎 Ru$h Withdrawal: ${userLabel} converted ${rushAmount} 💎 → $${Number(creatorUsd).toFixed(2)} USD earnings`;
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':gem: Ru$h → USD Withdrawal', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Creator:*\n${userLabel}` },
          { type: 'mrkdwn', text: `*Ru$h Converted:*\n${rushAmount} 💎` },
          { type: 'mrkdwn', text: `*Gross USD:*\n$${Number(grossUsd).toFixed(2)}` },
          { type: 'mrkdwn', text: `*Creator Earnings (70%):*\n$${Number(creatorUsd).toFixed(2)}` },
          { type: 'mrkdwn', text: `*Platform Cut (30% → you):*\n*$${Number(platformUsd).toFixed(2)}*` },
          { type: 'mrkdwn', text: `*Payout:*\nNext Monday batch` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${_nowTs()} ET>` }],
      },
    ];
    await _post(channel, text, blocks);
  } catch (e) {
    logger.warn('[slackOps] notifyRushConversion error', { error: e.message });
  }
}

function _wrap(fnName, origFn) {
  return async function (...args) {
    const qs = _qs();
    if (qs && qs._makeSlackShim) {
      return qs._makeSlackShim('slack_ops', fnName)(...args);
    }
    return origFn(...args);
  };
}

module.exports = {
  // Queued wrappers (used by callers)
  notifyPaymentSuccess: _wrap('notifyPaymentSuccess', notifyPaymentSuccess),
  notifyPaymentFailed: _wrap('notifyPaymentFailed', notifyPaymentFailed),
  notifyLargeRefund: _wrap('notifyLargeRefund', notifyLargeRefund),
  notifyTipPayout: _wrap('notifyTipPayout', notifyTipPayout),
  notifyUnhandledError: _wrap('notifyUnhandledError', notifyUnhandledError),
  notifyCreatorApplication: _wrap('notifyCreatorApplication', notifyCreatorApplication),
  notifyNpJwt403: _wrap('notifyNpJwt403', notifyNpJwt403),
  notifyNequiPendingActivation: _wrap('notifyNequiPendingActivation', notifyNequiPendingActivation),
  notifyRushConversion: _wrap('notifyRushConversion', notifyRushConversion),
  // Direct originals — used ONLY by the BullMQ worker to avoid infinite loops
  _direct_notifyPaymentSuccess: notifyPaymentSuccess,
  _direct_notifyPaymentFailed: notifyPaymentFailed,
  _direct_notifyLargeRefund: notifyLargeRefund,
  _direct_notifyTipPayout: notifyTipPayout,
  _direct_notifyUnhandledError: notifyUnhandledError,
  _direct_notifyCreatorApplication: notifyCreatorApplication,
  _direct_notifyNpJwt403: notifyNpJwt403,
  _direct_notifyRushConversion: notifyRushConversion,
};
