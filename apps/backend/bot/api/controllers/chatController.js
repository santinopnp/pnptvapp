'use strict';

const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');
const { getRedis } = require('../../../config/redis');
const { processChatMedia } = require('../../../services/chatMediaService');
const mentionService = require('../../../services/mentionService');

const authGuard = (req, res) => {
  const user = req.session?.user;
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return user;
};

// Allowed community chat rooms — prevent arbitrary room creation/access
const ALLOWED_COMMUNITY_ROOMS = new Set(['general', 'prime']);

/**
 * Validate room access: community rooms via allowlist, hangout rooms via membership check.
 * @returns {string|null} validated room name or null if unauthorized
 */
const validateRoomAccess = async (roomParam, userId) => {
  const room = String(roomParam || 'general');

  // Hangout rooms require group membership
  const hangoutMatch = room.match(/^hangout:(\d+)$/);
  if (hangoutMatch) {
    const groupId = parseInt(hangoutMatch[1], 10);
    const { rows } = await query(
      'SELECT 1 FROM hangout_group_members WHERE group_id=$1 AND user_id=$2',
      [groupId, userId]
    );
    return rows.length > 0 ? room : null;
  }

  // Community rooms via allowlist
  return ALLOWED_COMMUNITY_ROOMS.has(room) ? room : null;
};

// ── Get chat history (REST fallback) ─────────────────────────────────────────
// Returns the 50 most recent messages for a room, optionally paginated via
// cursor (ISO timestamp). Media columns are included so clients can render
// photo/video attachments without a separate fetch.
const getChatHistory = async (req, res) => {
  const user = authGuard(req, res); if (!user) return;
  const room = await validateRoomAccess(req.params.room, user.id);
  if (!room) return res.status(403).json({ error: 'Access denied to this room' });
  const { cursor } = req.query;
  try {
    const { rows } = await query(
      `SELECT id, room, user_id, username, first_name, photo_url, content,
              media_url, media_type, media_mime, media_thumb_url,
              media_width, media_height, created_at
       FROM chat_messages
       WHERE room=$1 AND is_deleted=false
         ${cursor ? 'AND created_at < $2' : ''}
       ORDER BY created_at DESC LIMIT 50`,
      cursor ? [room, cursor] : [room]
    );
    return res.json({ success: true, messages: rows.reverse() });
  } catch (err) {
    logger.error('getChatHistory error', err);
    return res.status(500).json({ error: 'Failed to load chat history' });
  }
};

// ── Send a text message via REST (fallback when Socket.IO is unavailable) ────
const sendMessage = async (req, res) => {
  const user = authGuard(req, res); if (!user) return;
  const room = await validateRoomAccess(req.params.room, user.id);
  if (!room) return res.status(403).json({ error: 'Access denied to this room' });
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  try {
    const text = content.trim().slice(0, 2000);
    const { rows } = await query(
      `INSERT INTO chat_messages
         (room, user_id, username, first_name, photo_url, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, room, user_id, username, first_name, photo_url, content,
                 media_url, media_type, media_mime, media_thumb_url,
                 media_width, media_height, created_at`,
      [room, user.id, user.username || null, user.firstName || user.first_name || null, user.photoUrl || user.photo_url || null, text]
    );
    const msg = rows[0];
    // Parse @mentions and notify tagged users (non-blocking)
    setImmediate(() => {
      mentionService.createChatMentions(msg.id, user.id, text, room).catch(() => {});
    });
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${room}`).emit('chat:message', msg);
    }
    return res.json({ success: true, message: msg });
  } catch (err) {
    logger.error('chat sendMessage error', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

// ── Upload media and persist a media message in a community chat room ─────────
// POST /api/webapp/chat/:room/media
// Content-Type: multipart/form-data
// Field: media (required) — the image or video file
// Field: content (optional) — caption text (max 500 chars)
//
// Limits enforced by the multer middleware configured in routes.js:
//   images: 20 MB   videos: 100 MB
// Additional validation (mime type, processing) happens inside chatMediaService.
const sendMediaMessage = async (req, res) => {
  const user = authGuard(req, res); if (!user) return;
  const room = await validateRoomAccess(req.params.room, user.id);
  if (!room) return res.status(403).json({ error: 'Access denied to this room' });
  const caption = (req.body?.content || '').trim().slice(0, 500);

  try {
    const mediaResult = await processChatMedia(req.file, user.id);

    const firstName = user.firstName || user.first_name || null;
    const photoUrl = user.photoUrl || user.photo_url || null;

    const { rows } = await query(
      `INSERT INTO chat_messages
         (room, user_id, username, first_name, photo_url, content,
          media_url, media_type, media_mime, media_thumb_url,
          media_width, media_height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, room, user_id, username, first_name, photo_url, content,
                 media_url, media_type, media_mime, media_thumb_url,
                 media_width, media_height, created_at`,
      [
        room,
        user.id,
        user.username || null,
        firstName,
        photoUrl,
        caption || null,
        mediaResult.mediaUrl,
        mediaResult.mediaType,
        mediaResult.mediaMime,
        mediaResult.thumbUrl || null,
        mediaResult.width || null,
        mediaResult.height || null,
      ]
    );

    const msg = rows[0];

    // Broadcast to all room members via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${room}`).emit('chat:message', msg);
    }

    return res.status(201).json({ success: true, message: msg });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.userMessage || err.message });
    }
    logger.error('chat sendMediaMessage error', err);
    return res.status(500).json({ error: 'Failed to upload media' });
  }
};

// ── Translate a chat message on-demand ───────────────────────────────────────
// Cached per-message in chat_messages.translations[lang] so repeated views
// of the same translation don't re-hit Grok.
// POST /api/webapp/chat/messages/:msgId/translate  body: { targetLang }
const CHAT_TRANSLATE_DAILY_LIMIT = 100;
const CHAT_TRANSLATE_MAX_LEN = 2000;

const translateChatMessage = async (req, res) => {
  const user = authGuard(req, res); if (!user) return;
  const msgId = parseInt(req.params.msgId, 10);
  if (!Number.isFinite(msgId) || msgId <= 0) {
    return res.status(400).json({ error: 'Invalid message ID' });
  }
  const rawLang = req.body?.targetLang;
  if (!rawLang || typeof rawLang !== 'string' || !/^[a-zA-Z]{2,5}$/.test(rawLang)) {
    return res.status(400).json({ error: 'Invalid targetLang' });
  }
  const targetLang = rawLang.trim();

  try {
    // Per-user daily rate limit — Grok isn't free.
    try {
      const redis = getRedis();
      if (redis) {
        const rateKey = `translate:daily:${user.id}`;
        const count = await redis.incr(rateKey);
        if (count === 1) await redis.expire(rateKey, 86400);
        if (count > CHAT_TRANSLATE_DAILY_LIMIT) {
          return res.status(429).json({ error: 'Daily translation limit reached' });
        }
      }
    } catch (rateErr) {
      logger.warn('translateChatMessage rate limit check failed (allowing)', { error: rateErr.message });
    }

    const { rows } = await query(
      `SELECT id, room, user_id, content, is_deleted, translations
       FROM chat_messages WHERE id = $1`,
      [msgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    const msg = rows[0];

    // Access check: user must be a member of the message's room
    const validRoom = await validateRoomAccess(msg.room, user.id);
    if (!validRoom) return res.status(403).json({ error: 'Not authorized to translate this message' });

    if (msg.is_deleted) return res.status(410).json({ error: 'Message deleted' });
    if (!msg.content || !msg.content.trim()) {
      return res.status(400).json({ error: 'No text to translate' });
    }
    if (msg.content.length > CHAT_TRANSLATE_MAX_LEN) {
      return res.status(413).json({ error: 'Message too long to translate' });
    }

    const cached = msg.translations?.[targetLang];
    if (cached && typeof cached === 'string') {
      return res.json({ success: true, translatedText: cached, cached: true, targetLang });
    }

    const grokService = require('../../../services/grokService');
    const translated = await grokService.translateText(msg.content, targetLang);

    await query(
      `UPDATE chat_messages
       SET translations = jsonb_set(
         COALESCE(translations, '{}'::jsonb),
         ARRAY[$1],
         to_jsonb($2::text),
         true
       )
       WHERE id = $3`,
      [targetLang, translated, msgId]
    );

    return res.json({ success: true, translatedText: translated, cached: false, targetLang });
  } catch (err) {
    logger.error('translateChatMessage error', { error: err.message, msgId, targetLang });
    return res.status(500).json({ error: 'Failed to translate message' });
  }
};

// ── Translate arbitrary text (used by main-stage ephemeral chat, which has no DB id) ──
// POST /api/webapp/translate  body: { text, targetLang }
const translateTextDirect = async (req, res) => {
  const user = authGuard(req, res); if (!user) return;
  const rawText = req.body?.text;
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ error: 'Text required' });
  }
  const text = rawText.trim().slice(0, 2000);
  const rawLang = req.body?.targetLang;
  if (!rawLang || typeof rawLang !== 'string' || !/^[a-zA-Z]{2,5}$/.test(rawLang)) {
    return res.status(400).json({ error: 'Invalid targetLang' });
  }
  const targetLang = rawLang.trim();

  try {
    try {
      const redis = getRedis();
      if (redis) {
        const rateKey = `translate:daily:${user.id}`;
        const count = await redis.incr(rateKey);
        if (count === 1) await redis.expire(rateKey, 86400);
        if (count > CHAT_TRANSLATE_DAILY_LIMIT) {
          return res.status(429).json({ error: 'Daily translation limit reached' });
        }
      }
    } catch (rateErr) {
      logger.warn('translateTextDirect rate limit check failed (allowing)', { error: rateErr.message });
    }

    const grokService = require('../../../services/grokService');
    const translatedText = await grokService.translateText(text, targetLang);
    return res.json({ success: true, translatedText });
  } catch (err) {
    logger.error('translateTextDirect error', { error: err.message, targetLang });
    return res.status(500).json({ error: 'Failed to translate' });
  }
};

module.exports = { getChatHistory, sendMessage, sendMediaMessage, translateChatMessage, translateTextDirect };
