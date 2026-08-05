'use strict';

/**
 * slackHangoutBridgeService.js
 *
 * Bidirectional Slack ↔ Hangout chat bridge.
 *
 * Hangout → Slack:
 *   When a member sends a message in a private/creator hangout, this service
 *   posts it to the creator's personal Slack channel (#ext-[handle]).
 *   Messages in the same group within 2h are threaded together.
 *
 * Slack → Hangout:
 *   When a creator replies in a Slack thread that originated from a hangout
 *   message, the reply is inserted into chat_messages and broadcast via Socket.IO.
 *
 * All functions are best-effort — they never throw. If SLACK_BOT_TOKEN is not
 * set or the creator has no slack_channel_id, they silently no-op.
 */

const { query } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _botToken() {
  return process.env.SLACK_BOT_TOKEN || null;
}

/**
 * Post a message to Slack. Returns the full API response (or {} on error).
 * @param {Object} body
 * @returns {Promise<Object>}
 */
async function _slackPost(body) {
  const token = _botToken();
  if (!token) return {};
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
      logger.warn('[slackHangoutBridge] chat.postMessage failed', {
        error: data.error,
        channel: body.channel,
      });
    }
    return data;
  } catch (err) {
    logger.warn('[slackHangoutBridge] fetch error', { error: err.message });
    return {};
  }
}

/**
 * Emoji for media types shown in Slack.
 * @param {string|null} mediaType
 * @returns {string}
 */
function _mediaEmoji(mediaType) {
  if (!mediaType) return '';
  if (mediaType === 'image') return '🖼️ ';
  if (mediaType === 'video') return '🎥 ';
  if (mediaType === 'audio') return '🎙️ ';
  return '📎 ';
}

// ---------------------------------------------------------------------------
// Hangout → Slack
// ---------------------------------------------------------------------------

/**
 * Notify the hangout creator's Slack channel of a new member message.
 *
 * @param {number} groupId
 * @param {Object} msg  — chat_messages row (id, content, media_url, media_type, etc.)
 * @param {Object} senderUser — { id, username, firstName, first_name }
 * @returns {Promise<void>}
 */
async function notifyHangoutMessage(groupId, msg, senderUser) {
  try {
    if (!_botToken()) return;

    // Only bridge private hangouts (is_public=false) or those with a creator channel assignment
    const { rows: groupRows } = await query(
      'SELECT creator_id, is_public, channel_id, name FROM hangout_groups WHERE id = $1',
      [groupId]
    );
    if (groupRows.length === 0) return;

    const group = groupRows[0];
    const isPrivateOrChannelled = !group.is_public || group.channel_id != null;
    if (!isPrivateOrChannelled) return;

    // Skip if the sender IS the creator (no need to echo their own messages back)
    const creatorId = String(group.creator_id || '');
    if (!creatorId) return;
    if (creatorId === String(senderUser.id || '')) return;

    // Resolve creator's Slack channel
    const { rows: creatorRows } = await query(
      'SELECT slack_channel_id FROM users WHERE id = $1',
      [creatorId]
    );
    const slackChannelId = creatorRows[0]?.slack_channel_id || null;
    if (!slackChannelId) return;

    const redis = getRedis();
    const threadKey = `slack:hangout:latest_thread:${groupId}`;

    // Check for an active recent thread in this hangout
    let threadTs = null;
    try {
      const cached = await redis.get(threadKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.channelId === slackChannelId) {
          // TTL is 7200s; if it exists the age is < 2h by definition
          threadTs = parsed.ts;
        }
      }
    } catch (_) {}

    // Build Block Kit message
    const senderName = senderUser.firstName || senderUser.first_name || senderUser.username || 'Member';
    const initial = (senderName[0] || '?').toUpperCase();
    const groupUrl = `${APP_PUBLIC_URL}/chat/${groupId}`;

    const contentText = msg.content ? msg.content.slice(0, 500) : null;
    const mediaEmoji = _mediaEmoji(msg.media_type);
    const displayText = mediaEmoji
      ? (contentText ? `${mediaEmoji}${contentText}` : `${mediaEmoji}[${msg.media_type}]`)
      : (contentText || '[message]');

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${senderName}* in <${groupUrl}|${group.name || `Hangout ${groupId}`}>:\n${displayText}`,
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open hangout', emoji: true },
          url: groupUrl,
          action_id: 'open_hangout',
        },
      },
    ];

    // For new thread root messages, add a header so the creator has context
    if (!threadTs) {
      blocks.unshift({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `:speech_balloon: *${initial}* New hangout message`,
          },
        ],
      });
    }

    const plainText = `${senderName}: ${displayText}`;
    const payload = {
      channel: slackChannelId,
      text: plainText,
      blocks,
      unfurl_links: false,
    };
    if (threadTs) {
      payload.thread_ts = threadTs;
    }

    const result = await _slackPost(payload);
    if (!result.ok || !result.ts) return;

    const newTs = result.ts;
    const actualChannel = result.channel || slackChannelId;

    // Store reverse-lookup key so Slack replies can be bridged back
    const reverseKey = `slack:hangout:thread:${actualChannel}:${newTs}`;
    await redis.set(reverseKey, JSON.stringify({ groupId, creatorId }), 'EX', 86400);

    // Update latest-thread pointer (2h TTL)
    await redis.set(
      threadKey,
      JSON.stringify({ ts: threadTs || newTs, channelId: actualChannel }),
      'EX',
      7200
    );
  } catch (err) {
    logger.warn('[slackHangoutBridge] notifyHangoutMessage error', { error: err.message, groupId });
  }
}

// ---------------------------------------------------------------------------
// Slack → Hangout
// ---------------------------------------------------------------------------

/**
 * Bridge a Slack thread reply back into the hangout as a creator message.
 *
 * @param {string} channelId   — Slack channel ID from the event
 * @param {string} text        — plain-text reply body
 * @param {string} threadTs    — thread_ts of the parent root message
 * @param {string|null} slackMemberId — Slack user ID of the replier
 * @returns {Promise<void>}
 */
async function bridgeSlackReplyToHangout(channelId, text, threadTs, slackMemberId) {
  try {
    const redis = getRedis();

    // Look up which hangout this thread belongs to
    const reverseKey = `slack:hangout:thread:${channelId}:${threadTs}`;
    const cached = await redis.get(reverseKey);
    if (!cached) return; // Not a hangout thread

    let parsed;
    try {
      parsed = JSON.parse(cached);
    } catch (_) {
      return;
    }

    const { groupId, creatorId } = parsed;
    if (!groupId || !creatorId) return;

    // Resolve the creator user record — match by slack_channel_id or slack_member_id
    const { rows: creatorRows } = await query(
      `SELECT id, first_name, username, slack_channel_id
       FROM users
       WHERE slack_channel_id = $1
          OR (slack_member_id IS NOT NULL AND slack_member_id = $2::text)
       LIMIT 1`,
      [channelId, slackMemberId || null]
    );

    if (creatorRows.length === 0) return;
    const creator = creatorRows[0];

    // Sanitize text — strip Slack mrkdwn artifacts like <URL|text> and <@UXXX>
    const cleanText = String(text || '')
      .replace(/<([^|>]+)\|([^>]+)>/g, '$2')  // <url|label> → label
      .replace(/<@[A-Z0-9]+>/g, '')            // <@UXXX> → ''
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1') // <#CXXX|name> → #name
      .trim()
      .slice(0, 2000);

    if (!cleanText) return;

    const room = `hangout:${groupId}`;

    // Insert as the creator's message
    const { rows: inserted } = await query(
      `INSERT INTO chat_messages
         (room, user_id, username, first_name, content, message_type)
       VALUES ($1, $2, $3, $4, $5, 'text')
       RETURNING id, room, user_id, username, first_name, photo_url, content,
                 media_url, media_type, media_mime, media_thumb_url,
                 media_width, media_height, media_metadata, reply_to_id, message_type, created_at`,
      [
        room,
        creator.id,
        creator.username || null,
        creator.first_name || null,
        cleanText,
      ]
    );

    if (inserted.length === 0) return;
    const newMsg = inserted[0];

    // Broadcast via Socket.IO
    try {
      const socketSingleton = require('./socketSingleton');
      const io = socketSingleton.get();
      if (io) {
        io.to(room).emit('chat:message', newMsg);
      }
    } catch (_) {}

    // Touch last_activity_at
    await query('UPDATE hangout_groups SET last_activity_at = NOW() WHERE id = $1', [groupId]);

    logger.debug('[slackHangoutBridge] bridged Slack reply to hangout', {
      groupId,
      creatorId: creator.id,
      msgId: newMsg.id,
    });
  } catch (err) {
    logger.warn('[slackHangoutBridge] bridgeSlackReplyToHangout error', {
      error: err.message,
      channelId,
      threadTs,
    });
  }
}

module.exports = {
  notifyHangoutMessage,
  bridgeSlackReplyToHangout,
};
