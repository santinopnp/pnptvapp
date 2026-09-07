'use strict';

/**
 * slackSupportService.js
 *
 * Bidirectional Slack support bridge for PNPtv!
 *
 * When Cristina AI escalates a ticket to human, this service:
 *   1. Posts the ticket to #support-human (SLACK_SUPPORT_HUMAN_CHANNEL)
 *   2. Stores the Slack thread_ts against the support_topics row
 *   3. Receives team replies via Slack Events API and forwards to the user
 *   4. Marks tickets resolved when a team member adds a ✅ reaction
 *
 * All Slack calls are best-effort — never throw, never block user responses.
 *
 * Env vars:
 *   SLACK_BOT_TOKEN            — Slack bot OAuth token (xoxb-…)
 *   SLACK_SUPPORT_HUMAN_CHANNEL — Slack channel ID for human escalations
 */

const { getPool } = require('../config/postgres');
const logger = require('../utils/logger');
const zohoDesk = require('./zohoDeskService');

const SLACK_API = 'https://slack.com/api';

// Fire-and-forget mirror to Zoho Desk — never blocks Slack path.
async function _mirrorTicketToDesk(userId, ticket, bodyExcerpt) {
  if (!zohoDesk.isConfigured()) return;
  try {
    const pool = getPool();
    const u = await pool.query(
      'SELECT email, first_name, last_name, username FROM users WHERE id = $1',
      [userId]
    );
    const user = u.rows[0] || {};
    const contactId = await zohoDesk.upsertContact({
      email: user.email || null,
      firstName: user.first_name || null,
      lastName: user.last_name || user.username || null,
      pnptvId: userId,
    });
    const deskTicketId = await zohoDesk.createTicket({
      contactId,
      subject: ticket.thread_name || `Support — ${userId}`,
      description: bodyExcerpt || '(no content)',
      priority: ticket.priority || 'medium',
      category: ticket.category || null,
      language: ticket.language || 'es',
    });
    await pool.query(
      'UPDATE support_topics SET desk_ticket_id = $1 WHERE user_id = $2',
      [deskTicketId, userId]
    );
    logger.info('[slackSupportService] mirrored to Zoho Desk', { userId, deskTicketId });
  } catch (err) {
    logger.warn('[slackSupportService] Desk mirror failed', { userId, error: err.response?.data || err.message });
  }
}

async function _mirrorCommentToDesk(userId, content) {
  if (!zohoDesk.isConfigured()) return;
  try {
    const pool = getPool();
    const r = await pool.query('SELECT desk_ticket_id FROM support_topics WHERE user_id = $1', [userId]);
    const deskId = r.rows[0]?.desk_ticket_id;
    if (!deskId) return;
    await zohoDesk.addComment(deskId, content, 'agent');
  } catch (err) {
    logger.warn('[slackSupportService] Desk comment mirror failed', { userId, error: err.response?.data || err.message });
  }
}

async function _mirrorStatusToDesk(userId, status) {
  if (!zohoDesk.isConfigured()) return;
  try {
    const pool = getPool();
    const r = await pool.query('SELECT desk_ticket_id FROM support_topics WHERE user_id = $1', [userId]);
    const deskId = r.rows[0]?.desk_ticket_id;
    if (!deskId) return;
    await zohoDesk.updateStatus(deskId, status);
  } catch (err) {
    logger.warn('[slackSupportService] Desk status mirror failed', { userId, error: err.response?.data || err.message });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _botToken() {
  return process.env.SLACK_BOT_TOKEN || null;
}

/**
 * Thin fetch wrapper for Slack Web API calls.
 * Returns the parsed response body. Never throws — logs and returns {} on error.
 * @param {string} method — Slack API method name (e.g. 'chat.postMessage')
 * @param {Object} body — JSON payload
 * @returns {Promise<Object>}
 */
async function _slackPost(method, body) {
  const token = _botToken();
  if (!token) {
    logger.warn('[slackSupportService] SLACK_BOT_TOKEN not set — skipping post');
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
      logger.warn(`[slackSupportService] Slack ${method} failed`, {
        error: data.error,
        warning: data.warning,
      });
    }
    return data;
  } catch (err) {
    logger.warn('[slackSupportService] fetch error', { error: err.message });
    return {};
  }
}

function _priorityEmoji(priority) {
  const map = { critical: '🚨', high: '🔴', medium: '🟡', low: '🟢' };
  return map[priority] || '⚪';
}

function _truncate(text, max) {
  if (!text) return '_(no content)_';
  const str = String(text);
  return str.length <= max ? str : str.slice(0, max) + '…';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Escalates a support ticket to #support-human in Slack.
 * Idempotent — if the ticket already has a slack_thread_ts, returns it immediately.
 *
 * @param {Object} ticket — row from support_topics
 * @param {string} ticket.user_id
 * @param {string} ticket.thread_name    — display name used for the Telegram forum topic
 * @param {string} [ticket.category]
 * @param {string} [ticket.priority]
 * @param {string} [ticket.language]
 * @param {string} [ticket.slack_thread_ts]
 * @param {Date|string} ticket.created_at
 * @returns {Promise<string|null>} — the Slack thread_ts, or null on failure
 */
async function escalateToSlack(ticket) {
  const channel = process.env.SLACK_SUPPORT_HUMAN_CHANNEL;
  if (!channel) {
    logger.warn('[slackSupportService] SLACK_SUPPORT_HUMAN_CHANNEL not set — skipping escalation');
    return null;
  }

  const pool = getPool();
  const userId = ticket.user_id;

  // --- Idempotency check: re-query in case caller's in-memory object is stale ---
  let existingTs = ticket.slack_thread_ts || null;
  if (!existingTs) {
    try {
      const r = await pool.query('SELECT slack_thread_ts FROM support_topics WHERE user_id = $1', [userId]);
      existingTs = r.rows[0]?.slack_thread_ts || null;
    } catch (err) {
      logger.warn('[slackSupportService] idempotency check failed', { userId, error: err.message });
    }
  }

  if (existingTs) {
    logger.debug('[slackSupportService] ticket already escalated', { userId, thread_ts: existingTs });
    return existingTs;
  }

  // --- Load last user message for body excerpt ---
  let bodyExcerpt = '_(no messages)_';
  try {
    const msgResult = await pool.query(
      `SELECT content FROM support_ticket_messages
       WHERE user_id = $1 AND sender_type = 'user'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (msgResult.rows[0]) {
      bodyExcerpt = _truncate(msgResult.rows[0].content, 500);
    }
  } catch (err) {
    logger.warn('[slackSupportService] could not load last message', { userId, error: err.message });
  }

  const priority = ticket.priority || 'medium';
  const priorityEmoji = _priorityEmoji(priority);
  const category = ticket.category || 'general';
  const language = ticket.language || 'es';
  const openedAt = ticket.created_at
    ? new Date(ticket.created_at).toLocaleString('en-US', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
    : 'unknown';

  // --- Build Block Kit message ---
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${priorityEmoji} Human support needed — ${ticket.thread_name || userId}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*User ID:*\n\`${userId}\`` },
        { type: 'mrkdwn', text: `*Priority:*\n${priorityEmoji} ${priority.toUpperCase()}` },
        { type: 'mrkdwn', text: `*Category:*\n${category}` },
        { type: 'mrkdwn', text: `*Language:*\n${language}` },
        { type: 'mrkdwn', text: `*Opened at:*\n${openedAt}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Latest user message:*\n>${bodyExcerpt.replace(/\n/g, '\n>')}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Reply in this thread to send a message back to the user. React with ✅ to mark the ticket resolved.',
        },
      ],
    },
  ];

  const fallbackText = `${priorityEmoji} Support escalation [${priority.toUpperCase()}] — User ${userId} | ${category}`;

  // --- Post to Slack ---
  const response = await _slackPost('chat.postMessage', {
    channel,
    text: fallbackText,
    blocks,
  });

  if (!response.ok || !response.ts) {
    logger.error('[slackSupportService] postMessage failed — could not escalate', { userId, error: response.error });
    return null;
  }

  const threadTs = response.ts;

  // --- Persist thread_ts ---
  try {
    await pool.query(
      'UPDATE support_topics SET slack_thread_ts = $1 WHERE user_id = $2',
      [threadTs, userId]
    );
    logger.info('[slackSupportService] ticket escalated to Slack', { userId, thread_ts: threadTs });
  } catch (err) {
    logger.error('[slackSupportService] failed to persist slack_thread_ts', { userId, error: err.message });
    // Non-fatal — Slack message is already posted; we just can't route replies without the ts
  }

  _mirrorTicketToDesk(userId, ticket, bodyExcerpt);

  return threadTs;
}

/**
 * Handles a Slack Events API message event from #support-human.
 * Looks up the ticket by slack_thread_ts and forwards the team reply to the user.
 *
 * @param {Object} event — Slack event object (type: 'message')
 */
async function handleTeamReply(event) {
  // Only handle replies inside a thread (thread_ts != ts means it IS a reply)
  const threadTs = event.thread_ts;
  if (!threadTs || !event.text) return;

  // Skip bot messages and subtypes (edits, deletes, etc.)
  if (event.bot_id || event.subtype) return;

  const pool = getPool();

  let userId, ticketUserId;
  try {
    const r = await pool.query(
      'SELECT user_id FROM support_topics WHERE slack_thread_ts = $1',
      [threadTs]
    );
    if (!r.rows[0]) return; // Not a thread we own
    userId = r.rows[0].user_id;
    ticketUserId = userId;
  } catch (err) {
    logger.warn('[slackSupportService] handleTeamReply DB lookup failed', { error: err.message });
    return;
  }

  const replyText = event.text.trim();
  if (!replyText) return;

  logger.info('[slackSupportService] forwarding team reply to user', { userId });

  // --- Persist the agent reply message ---
  try {
    const SupportTicketMessageModel = require('../models/supportTicketMessageModel');
    await SupportTicketMessageModel.create({
      userId: ticketUserId,
      senderType: 'agent',
      senderName: 'Support Team',
      content: replyText,
    });
  } catch (err) {
    logger.warn('[slackSupportService] could not persist team reply', { userId, error: err.message });
  }

  // --- Push to web widget via Socket.IO ---
  try {
    const io = require('./socketSingleton').get();
    if (io) {
      io.to(`user:${userId}`).emit('support:reply', {
        ticketId: null, // support_topics is keyed by user_id, not a separate id
        userId,
        text: replyText,
        from: 'support',
        senderName: 'Support Team',
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.warn('[slackSupportService] socket emit failed', { userId, error: err.message });
  }

  // --- Update last agent message timestamp ---
  try {
    const SupportTopicModel = require('../models/supportTopicModel');
    await SupportTopicModel.updateLastAgentMessage(userId);
  } catch (err) {
    logger.warn('[slackSupportService] could not update last_agent_message_at', { userId, error: err.message });
  }

  _mirrorCommentToDesk(userId, replyText);
}

/**
 * Handles a Slack reaction_added event.
 * If the reaction is ✅ (white_check_mark) on a root support message,
 * marks the corresponding ticket as resolved.
 *
 * @param {Object} event — Slack event object (type: 'reaction_added')
 */
async function handleResolveReaction(event) {
  if (event.reaction !== 'white_check_mark') return;
  if (!event.item || event.item.type !== 'message') return;

  // The reaction is on the root message (ts), which is the thread_ts we stored
  const messageTs = event.item.ts;

  const pool = getPool();

  let userId;
  try {
    const r = await pool.query(
      'SELECT user_id FROM support_topics WHERE slack_thread_ts = $1',
      [messageTs]
    );
    if (!r.rows[0]) return; // Reaction is on some other message
    userId = r.rows[0].user_id;
  } catch (err) {
    logger.warn('[slackSupportService] handleResolveReaction DB lookup failed', { error: err.message });
    return;
  }

  logger.info('[slackSupportService] resolving ticket via Slack reaction', { userId });

  try {
    const SupportTopicModel = require('../models/supportTopicModel');
    await SupportTopicModel.updateStatus(userId, 'resolved');
    await SupportTopicModel.updateResolutionTime(userId);
  } catch (err) {
    logger.warn('[slackSupportService] could not update ticket status to resolved', { userId, error: err.message });
    return;
  }

  _mirrorStatusToDesk(userId, 'resolved');

  // Notify web widget of status change
  try {
    const io = require('./socketSingleton').get();
    if (io) {
      io.to(`user:${userId}`).emit('support:statusChange', {
        status: 'resolved',
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.warn('[slackSupportService] socket statusChange emit failed', { userId, error: err.message });
  }

  // Post a confirmation back to the Slack thread (best-effort)
  const channel = process.env.SLACK_SUPPORT_HUMAN_CHANNEL;
  if (channel) {
    await _slackPost('chat.postMessage', {
      channel,
      thread_ts: messageTs,
      text: '✅ Ticket marked as *resolved* by the support team.',
    });
  }
}

// ── BullMQ queue wrappers ────────────────────────────────────────────────────
// escalateToSlack is queued (fire-and-forget after ticket creation).
// handleTeamReply and handleResolveReaction are called FROM Slack webhooks —
// those need to remain synchronous so the HTTP response is sent promptly.
let _queueSvc = null;
function _qs() {
  if (!_queueSvc) {
    try { _queueSvc = require('./queueService'); } catch (_) {}
  }
  return _queueSvc;
}

async function escalateToSlackQueued(...args) {
  const qs = _qs();
  if (qs && qs._makeSlackShim) {
    return qs._makeSlackShim('slack_support', 'escalateToSlack')(...args);
  }
  return escalateToSlack(...args);
}

module.exports = {
  escalateToSlack: escalateToSlackQueued,
  handleTeamReply,
  handleResolveReaction,
  // Direct original — used ONLY by the BullMQ worker to avoid infinite loops
  _direct_escalateToSlack: escalateToSlack,
};
