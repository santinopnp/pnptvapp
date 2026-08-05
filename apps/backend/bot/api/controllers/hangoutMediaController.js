'use strict';

/**
 * hangoutMediaController.js
 *
 * Handles media uploads for hangout group chats with per-hangout subdirectories.
 * Media is processed locally (thumbnails, compression) and then sent to the
 * hangout's Matrix room as the single source of truth.
 *
 *   POST /api/webapp/hangouts/groups/:id/media
 *     multipart body:
 *       - media   (File)   required  -- image (max 10 MB) or video (max 50 MB)
 *       - content (string) optional  -- caption text (max 500 chars)
 */

const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');
const { processHangoutMedia } = require('../../../services/hangoutMediaService');
const BlockedUser = require('../../../models/blockedUser');
const NotificationEmitter = require('../../../services/notificationEmitter');
const { getRedis } = require('../../../config/redis');

// ── Helpers ──────────────────────────────────────────────────────────────────

const authGuard = (req, res) => {
  const user = req.session?.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
};

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';

// ── POST /api/webapp/hangouts/groups/:id/media ──────────────────────────────

const uploadHangoutMedia = async (req, res) => {
  const user = authGuard(req, res);
  if (!user) return;

  const groupId = parseInt(req.params.id, 10);
  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Auto-join main group if not already a member
    await query(
      `INSERT INTO hangout_group_members (group_id, user_id, role)
       SELECT id, $1, 'member' FROM hangout_groups WHERE is_main = true
       ON CONFLICT DO NOTHING`,
      [user.id]
    );

    // Creator bypass: the hangout creator (or parent creator) can always upload media
    const { rows: [creatorBypassRow] } = await query(
      `SELECT 1 FROM hangout_groups h
       WHERE h.id = $1
         AND (h.creator_id = $2
              OR EXISTS (
                SELECT 1 FROM hangout_groups p
                WHERE p.id = h.parent_group_id AND p.creator_id = $2
              ))
       LIMIT 1`,
      [groupId, String(user.id)]
    );
    const isHangoutCreator = !!creatorBypassRow;

    // Membership check — PRIME co-founder hangout topics auto-join qualifying members
    const { rows: memberRows } = await query(
      'SELECT is_banned, is_muted, muted_until FROM hangout_group_members WHERE group_id=$1 AND user_id=$2',
      [groupId, user.id]
    );
    if (!isHangoutCreator && memberRows.length === 0) {
      const { rows: [grpInfo] } = await query(
        'SELECT parent_group_id FROM hangout_groups WHERE id = $1', [groupId]
      );
      const {
        SANTINO_PRIME_HANGOUT_GROUP_ID,
        LEX_PRIME_HANGOUT_GROUP_ID,
      } = require('../../../config/monetizationConfig');
      const gid = Number(groupId);
      const pid = grpInfo?.parent_group_id != null ? Number(grpInfo.parent_group_id) : null;
      const isPrimeRoom = gid === SANTINO_PRIME_HANGOUT_GROUP_ID || gid === LEX_PRIME_HANGOUT_GROUP_ID
        || pid === SANTINO_PRIME_HANGOUT_GROUP_ID || pid === LEX_PRIME_HANGOUT_GROUP_ID;
      if (isPrimeRoom) {
        const EntitlementAccessService = require('../../../services/entitlementAccessService');
        const qualifies = await EntitlementAccessService.hasQualifyingPrimeEntitlement(user.id);
        if (!qualifies) return res.status(403).json({ error: 'Not a member of this group' });
        await query(
          `INSERT INTO hangout_group_members (group_id, user_id, role)
           SELECT g.id, $2, 'member' FROM hangout_groups g
           WHERE g.id = COALESCE($3::int, $1) OR g.parent_group_id = COALESCE($3::int, $1)
           ON CONFLICT DO NOTHING`,
          [groupId, user.id, grpInfo?.parent_group_id ?? null]
        );
      } else {
        return res.status(403).json({ error: 'Not a member of this group' });
      }
    }
    if (memberRows[0]?.is_banned) {
      return res.status(403).json({ error: 'You are banned from this group' });
    }
    // Mute check
    if (memberRows[0]?.is_muted) {
      if (!memberRows[0].muted_until || new Date(memberRows[0].muted_until) > new Date()) {
        return res.status(403).json({ error: 'You are muted in this group' });
      }
    }

    // Resolve group settings — topics inherit read_only/slow_mode/allow_media from parent
    const { rows: groupSettingsRows } = await query(
      `SELECT creator_id, name, allow_media, is_read_only, slow_mode_seconds
       FROM hangout_groups
       WHERE id = COALESCE(
         (SELECT parent_group_id FROM hangout_groups WHERE id = $1 AND parent_group_id IS NOT NULL),
         $1
       )`,
      [groupId]
    );
    const isOwnerOrMod = await (async () => {
      const { rows: modRows } = await query(
        'SELECT role FROM hangout_group_members WHERE group_id=$1 AND user_id=$2',
        [groupId, user.id]
      );
      return modRows[0]?.role === 'owner' || modRows[0]?.role === 'admin';
    })();

    if (groupSettingsRows[0]?.is_read_only && !isOwnerOrMod) {
      return res.status(403).json({ error: 'This group is read-only' });
    }
    if (groupSettingsRows[0]?.allow_media === false) {
      return res.status(403).json({ error: 'Media uploads are disabled in this group' });
    }
    // Slow mode
    if ((groupSettingsRows[0]?.slow_mode_seconds || 0) > 0 && !isOwnerOrMod) {
      const { rows: lastMsgRows } = await query(
        `SELECT created_at FROM chat_messages WHERE room = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [`hangout:${groupId}`, user.id]
      );
      if (lastMsgRows.length > 0) {
        const elapsed = (Date.now() - new Date(lastMsgRows[0].created_at).getTime()) / 1000;
        if (elapsed < groupSettingsRows[0].slow_mode_seconds) {
          return res.status(429).json({ error: `Slow mode: wait ${Math.ceil(groupSettingsRows[0].slow_mode_seconds - elapsed)}s` });
        }
      }
    }

    // Block check: group creator blocked uploader OR uploader blocked group creator
    const creatorId = groupSettingsRows[0]?.creator_id;
    const groupName = groupSettingsRows[0]?.name || `Hangout ${groupId}`;
    if (creatorId && String(creatorId) !== String(user.id)) {
      const [blockedByCreator, blockedByUser] = await Promise.all([
        BlockedUser.isBlocked(creatorId, user.id),
        BlockedUser.isBlocked(user.id, creatorId),
      ]);
      if (blockedByCreator || blockedByUser) {
        return res.status(403).json({ error: 'Cannot upload media in this group' });
      }
    }

    // Process the media into per-hangout directory (thumbnails, compression)
    const mediaResult = await processHangoutMedia(req.file, groupId, user.id);
    const caption = (req.body?.content || '').trim().slice(0, 500) || null;

    // ── Insert into PG + broadcast via Socket.IO ──
    const isValidPhoto = (p) => p && typeof p === 'string' && (p.startsWith('/') || p.startsWith('http'));
    const photoResult = await query('SELECT photo_file_id FROM users WHERE id = $1', [user.id]);
    const rawPhoto = photoResult.rows[0]?.photo_file_id || user.photoUrl || null;
    const photoUrl = isValidPhoto(rawPhoto) ? rawPhoto : null;

    const room = `hangout:${groupId}`;
    const msgType = (req.body?.messageType === 'video_note' ? 'video_note' : null);
    const { rows: insertedRows } = await query(
      `INSERT INTO chat_messages (room, user_id, username, first_name, photo_url, content,
         media_url, media_type, media_mime, media_thumb_url, media_width, media_height, media_metadata, message_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, room, user_id, username, first_name, photo_url, content,
                 media_url, media_type, media_mime, media_thumb_url,
                 media_width, media_height, media_metadata, reply_to_id, message_type, created_at`,
      [
        room, user.id, user.username || null, user.firstName || user.first_name || null, photoUrl, caption,
        mediaResult.mediaUrl, mediaResult.mediaType, mediaResult.mediaMime,
        mediaResult.thumbUrl || null, mediaResult.width || null, mediaResult.height || null,
        mediaResult.metadata ? JSON.stringify(mediaResult.metadata) : null,
        msgType,
      ]
    );
    const msg = { ...insertedRows[0], photo_url: isValidPhoto(insertedRows[0].photo_url) ? insertedRows[0].photo_url : null };

    // Touch activity timestamp
    await query('UPDATE hangout_groups SET last_activity_at = NOW() WHERE id = $1', [groupId]);

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(room).emit('chat:message', msg);
    }

    // Slack hangout bridge — notify creator channel of member media (fire-and-forget)
    (async () => {
      try {
        const slackHangoutBridgeService = require('../../../services/slackHangoutBridgeService');
        await slackHangoutBridgeService.notifyHangoutMessage(groupId, msg, user);
      } catch (_) {}
    })();

    // ── Webapp → Telegram bridge: forward media to linked Telegram group ──
    (async () => {
      try {
        const { rows: tgRows } = await query(
          `SELECT COALESCE(p.telegram_chat_id, g.telegram_chat_id) AS tg_chat_id,
                  g.telegram_topic_id
           FROM hangout_groups g
           LEFT JOIN hangout_groups p ON p.id = g.parent_group_id
           WHERE g.id = $1
             AND COALESCE(p.telegram_chat_id, g.telegram_chat_id) IS NOT NULL`,
          [groupId]
        );
        if (tgRows.length === 0) return;
        const tgChatId = tgRows[0].tg_chat_id;
        const tgThreadId = tgRows[0].telegram_topic_id || undefined;
        const { getBotInstance } = require('../../core/bot');
        const bot = getBotInstance();
        if (!bot) return;
        const senderName = user.firstName || user.first_name || user.username || 'User';
        const mediaCaption = caption ? `${senderName}: ${caption}` : senderName;
        const fullMediaUrl = mediaResult.mediaUrl?.startsWith('/') ? `${APP_PUBLIC_URL}${mediaResult.mediaUrl}` : mediaResult.mediaUrl;

        let tgResult;
        if (mediaResult.mediaType === 'image' && fullMediaUrl) {
          tgResult = await bot.telegram.sendPhoto(tgChatId, fullMediaUrl, { caption: mediaCaption, message_thread_id: tgThreadId });
        } else if (mediaResult.mediaType === 'video' && fullMediaUrl) {
          tgResult = await bot.telegram.sendVideo(tgChatId, fullMediaUrl, { caption: mediaCaption, message_thread_id: tgThreadId });
        } else if (mediaResult.mediaType === 'audio' && fullMediaUrl) {
          tgResult = await bot.telegram.sendVoice(tgChatId, fullMediaUrl, { caption: mediaCaption, message_thread_id: tgThreadId });
        } else if (fullMediaUrl) {
          tgResult = await bot.telegram.sendMessage(tgChatId, `${senderName} sent a file: ${fullMediaUrl}`, { message_thread_id: tgThreadId });
        }
        // Store TG message ID so edits/deletes can be synced
        if (tgResult?.message_id && msg.id) {
          await query(
            `UPDATE chat_messages SET media_metadata = COALESCE(media_metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ source: 'webapp', telegramMsgId: tgResult.message_id, telegramChatId: String(tgChatId) }), msg.id]
          );
        }
      } catch (bridgeErr) {
        logger.warn('[App→TG Bridge] REST media forward failed', { error: bridgeErr.message, groupId });
      }
    })();

    // Push notifications to offline members (fire-and-forget)
    const firstName = user.firstName || user.first_name || null;
    (async () => {
      try {
        const membersResult = await query(
          'SELECT user_id FROM hangout_group_members WHERE group_id = $1 AND user_id != $2',
          [groupId, user.id]
        );
        const memberIds = membersResult.rows.map(r => r.user_id);
        if (memberIds.length === 0) return;

        const roomSockets = io ? await io.in(room).fetchSockets() : [];
        const onlineUserIds = new Set(roomSockets.map(s => String(s.data?.user?.id)).filter(Boolean));
        const offlineIds = memberIds.filter(id => !onlineUserIds.has(String(id)));
        if (offlineIds.length === 0) return;

        const redis = getRedis();
        const senderName = user.username || firstName || 'Someone';
        const preview = mediaResult.mediaType === 'video' ? 'sent a video' : mediaResult.mediaType === 'audio' ? 'sent a voice message' : 'sent a photo';

        await Promise.allSettled(offlineIds.map(async (targetId) => {
          const countKey = `hangout:unread:${groupId}:${targetId}`;
          const unread = await redis.incr(countKey);
          if (unread === 1) await redis.expire(countKey, 86400);

          const msgText = unread === 1
            ? `${senderName} ${preview}`
            : `${unread} new messages — ${senderName} ${preview}`;

          await NotificationEmitter.emit({
            type: 'group_message',
            category: 'hangouts',
            priority: 'normal',
            actorId: user.id,
            targetUserId: targetId,
            entityType: 'hangout',
            entityId: String(groupId),
            message: msgText,
            metadata: {
              groupId, groupName, senderId: user.id, senderName,
              unreadCount: unread, url: `/hangouts/${groupId}`,
              pushTitle: groupName, pushBody: msgText, pushTag: `hangout-${groupId}`,
            },
          });
        }));
      } catch (notifErr) {
        logger.warn('uploadHangoutMedia push notification error', { error: notifErr.message, groupId });
      }
    })();

    return res.status(201).json({
      success: true,
      message: msg,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.userMessage || err.message });
    }
    logger.error('uploadHangoutMedia error', err);
    return res.status(500).json({ error: 'Failed to upload media' });
  }
};

module.exports = {
  uploadHangoutMedia,
};
