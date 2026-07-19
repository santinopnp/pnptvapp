const { Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const UserModel = require('../../../models/userModel');
const WallOfFameModel = require('../../../models/wallOfFameModel');
const CultEventModel = require('../../../models/cultEventModel');
const CultEventService = require('../../../services/cultEventService');
const { cache, getRedis } = require('../../../config/redis');
const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');
const { getLanguage } = require('../../utils/helpers');
const SubscriptionService = require('../../../services/subscriptionService');
const { processHangoutMedia } = require('../../../services/hangoutMediaService');
const SocialPostService = require('../../../services/socialPostService');
const NotificationEmitter = require('../../../services/notificationEmitter');

const BADGE_HIGH_LEGEND = 'High Legend of the Cult';
const BADGE_TRIBUTE = 'Tribute of the Cult';
const BADGE_LOYAL = 'The Loyal Disciple';
const CULT_BADGES = [BADGE_HIGH_LEGEND, BADGE_TRIBUTE, BADGE_LOYAL];
const { EVENT_TYPES } = CultEventService;
let lastProcessedDateKey = null;

/**
 * Wall of Fame Handler - Cult Titles
 * Automatically posts photos/videos to Wall of Fame TOPIC with member info
 * Tracks daily cult titles based on interactions and activity
 * Deletes the original message from the group to avoid duplicates
 *
 * IMPORTANT RULES:
 * - Wall of Fame is a TOPIC in the GROUP (not a separate channel)
 * - Photos/videos posted to Wall of Fame topic are PERMANENT (NEVER deleted)
 * - Original user messages in general group are deleted (to avoid duplicates)
 * - Wall of Fame messages are excluded from /cleanupcommunity command
 * - Only bot messages in main GROUP are deleted, not Wall of Fame topic
 * - Daily titles are calculated from reactions and activity
 */

// Wall of Fame Topic ID in the group
// This is a topic within GROUP_ID where photos/videos are posted permanently
// Default: 3132 (from the community group structure)
const WALL_OF_FAME_TOPIC_ID = parseInt(process.env.WALL_OF_FAME_TOPIC_ID || '3132');
const GROUP_ID = process.env.GROUP_ID || '-1003291737499';
const WOF_APP_URL = 'https://pnptv.app/social';

function isTopicMissingError(err) {
  const desc = err?.response?.description || err?.message || '';
  return /thread not found|TOPIC_CLOSED|TOPIC_DELETED|message_thread_id/i.test(desc);
}

/**
 * Track Wall of Fame message IDs to exclude from cleanup
 * Maps: topicId => Set of message IDs that should NEVER be deleted
 * These are protected from /cleanupcommunity cleanup command
 */
const wallOfFameMessageIds = new Map();

// Cached Wall of Fame hangout group ID (resolved once from DB)
let cachedWofGroupId = null;

/**
 * Resolve the Wall of Fame hangout group ID, caching in memory.
 */
async function getWofGroupId() {
  if (cachedWofGroupId) return cachedWofGroupId;
  const { rows } = await query(
    'SELECT id FROM hangout_groups WHERE is_wall_of_fame = TRUE LIMIT 1'
  );
  if (rows.length > 0) {
    cachedWofGroupId = rows[0].id;
  }
  return cachedWofGroupId;
}

/**
 * Dual-post a Wall of Fame photo/video to the Social Feed as a WoF post.
 * Fire-and-forget: errors are logged but never affect the Telegram flow.
 * Posts are auto-published; users can request deletion from the social feed.
 *
 * @param {Object} ctx      - Telegraf context (for telegram.getFileLink)
 * @param {string} fileId   - Telegram file_id for the photo/video
 * @param {'image'|'video'} mediaType - Type of media
 * @param {Object} user     - User row from DB
 * @param {string} mimetype - Original mime type hint (e.g. 'image/jpeg')
 */
async function postToSocialFeed(ctx, fileId, mediaType, user, mimetype) {
  try {
    // Download the media from Telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(response.data);

    // Process media into /public/uploads/posts/
    const uploadDir = path.join(__dirname, '../../../../public/uploads/posts');
    await fs.mkdir(uploadDir, { recursive: true });

    let mediaUrl = null;

    if (mediaType === 'image') {
      const filename = `wof-${user.id}-${Date.now()}.webp`;
      const filePath = path.join(uploadDir, filename);
      await sharp(buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70, progressive: true })
        .toFile(filePath);
      mediaUrl = `/uploads/posts/${filename}`;
    } else {
      const ext = (mimetype || '').includes('webm') ? 'webm' : 'mp4';
      const filename = `wof-${user.id}-${Date.now()}.${ext}`;
      const filePath = path.join(uploadDir, filename);
      await fs.writeFile(filePath, buffer);
      mediaUrl = `/uploads/posts/${filename}`;
    }

    // Create a WoF social post
    const post = await SocialPostService.createPost(
      user.id,
      '', // WoF auto-posts have no text content
      mediaUrl,
      mediaType,
      null, // replyToId
      null, // repostOfId
      true  // isWof
    );

    // Emit via Socket.IO if available
    const { get: getIo } = require('../../../services/socketSingleton');
    const io = getIo();
    if (io) {
      io.emit('feed:new_post', {
        ...post,
        is_wof: true,
        author_id: user.id,
        author_username: user.username || null,
        author_first_name: user.firstName || user.first_name || null,
        author_photo: null,
        liked_by_me: false,
      });
    }

    logger.info('WoF posted to social feed', { userId: user.id, postId: post.id });
  } catch (err) {
    logger.warn('WoF social post failed (non-blocking)', { error: err.message });
  }
}

const getDateKey = (date = new Date()) => date.toISOString().split('T')[0];
const getMonthKey = (date = new Date()) => date.toISOString().slice(0, 7);

const getPreviousDateKey = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getDateKey(date);
};

const getSecondsUntilNextMonth = (date = new Date()) => {
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return Math.max(3600, Math.floor((nextMonth.getTime() - date.getTime()) / 1000));
};

async function maybeResetMonthlyBadges(currentDate) {
  if (currentDate.getUTCDate() !== 1) {
    return;
  }

  const monthKey = getMonthKey(currentDate);
  const lockKey = `wall_of_fame:monthly_reset:${monthKey}`;
  const lockTtl = getSecondsUntilNextMonth(currentDate);
  const acquired = await cache.setNX(lockKey, { processedAt: new Date().toISOString() }, lockTtl);
  if (!acquired) {
    return;
  }

  for (const badge of CULT_BADGES) {
    await UserModel.removeBadgeFromAll(badge);
  }
}

// ── Daily community WoF feature (hangout-popularity-driven) ─────────────────
// Picks the most active media poster from linked community hangouts,
// features their best media in the Telegram group + social feed + hangout chat,
// and awards +50 ranking points. Runs once per day via cron.

async function runDailyWofFeature(telegram) {
  const redis = getRedis();
  const dateKey = getDateKey();
  const lockKey = `wof:community:lock:${dateKey}`;

  if (redis) {
    const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
    if (!acquired) {
      logger.info('[WoF] Daily community feature already ran today', { dateKey });
      return;
    }
  }

  // Find most active media poster from community hangouts (last 24h, exclude system accounts)
  const COMMUNITY_ROOMS = ['hangout:88', 'hangout:87', 'hangout:123'];
  const SYSTEM_IDS = ['8552451957', '15b6d61e-e6cf-46d5-9152-628fa0b30e89'];

  const { rows: candidates } = await query(
    `SELECT cm.user_id, u.username, u.first_name, u.last_name,
            COUNT(*) AS media_count,
            MAX(cm.id) AS best_msg_id,
            MAX(cm.media_url) AS best_media_url,
            MAX(cm.media_type) AS media_type
       FROM chat_messages cm
       LEFT JOIN users u ON u.id::text = cm.user_id
      WHERE cm.room = ANY($1::text[])
        AND cm.media_url IS NOT NULL
        AND cm.media_type IN ('image','video')
        AND cm.media_url NOT LIKE '%telegram.org%'
        AND cm.is_deleted = false
        AND cm.user_id IS NOT NULL
        AND cm.user_id != ALL($2::text[])
        AND cm.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY cm.user_id, u.username, u.first_name, u.last_name
      ORDER BY media_count DESC, MAX(cm.created_at) DESC
      LIMIT 1`,
    [COMMUNITY_ROOMS, SYSTEM_IDS]
  );

  if (!candidates.length) {
    logger.info('[WoF] No community media posts in last 24h — skipping feature');
    return;
  }

  const winner = candidates[0];
  const displayName = winner.username ? `@${winner.username}` : (winner.first_name || 'Miembro');
  const APP_BASE_URL = 'https://pnptv.app';
  const mediaCount = parseInt(winner.media_count);

  const promoHTML =
    `🔥 <b>WALL OF FAME</b> 🐷💨\n\n` +
    `${displayName} just posted ${mediaCount > 1 ? `${mediaCount} times` : 'fire content'} in the hangout and we <b>had to</b> feature this — too hot not to 🌡️\n\n` +
    `This is the energy we live for here.\n\n` +
    `─────────────\n` +
    `🎥 <b>Want YOUR content on the Wall of Fame?</b>\n` +
    `Post in the hangout. The hottest content gets featured every day.\n\n` +
    `Ready to actually <b>earn</b> from your content?\n` +
    `👉 <a href="${APP_BASE_URL}/creators">Apply as a Creator / Performer</a>\n` +
    `Build your room. Keep <b>70%</b> of everything.\n` +
    `─────────────\n\n` +
    `The cult rewards those who show up. 💜\n\n` +
    `<a href="${APP_BASE_URL}/social">🏆 Wall of Fame in the app</a>\n\n` +
    `#WallOfFame #CloudyDays #PNPtv #LaPerrera`;

  const promoPlain =
    `🔥 WALL OF FAME 🐷💨\n\n` +
    `${displayName} just posted ${mediaCount > 1 ? `${mediaCount} times` : 'fire content'} in the hangout and we HAD to feature this — too hot not to 🌡️\n\n` +
    `This is the energy we live for here.\n\n` +
    `──────────────\n` +
    `🎥 Want YOUR content on the Wall of Fame?\n` +
    `Post in the hangout. The hottest content gets featured every day.\n\n` +
    `Ready to actually earn from your content?\n` +
    `👉 Apply as a Creator / Performer at ${APP_BASE_URL}/creators\n` +
    `Build your room. Keep 70% of everything.\n` +
    `──────────────\n\n` +
    `The cult rewards those who show up. 💜\n\n` +
    `#WallOfFame #CloudyDays #PNPtv #LaPerrera`;

  // 1. Award +50 ranking points in Cloudy Days group
  const CLOUDY_CHAT_ID = '-1003785445607';
  try {
    await query(
      `INSERT INTO group_points (telegram_chat_id, pnptv_user_id, telegram_user_id, username, points, reason)
       VALUES ($1, $2, $2, $3, 50, 'Wall of Fame daily feature')`,
      [CLOUDY_CHAT_ID, winner.user_id, winner.username || null]
    );
    logger.info('[WoF] +50 ranking points awarded', { userId: winner.user_id });
  } catch (err) {
    logger.warn('[WoF] Points award failed', { error: err.message });
  }

  // 2. Update wall_of_fame_daily_stats
  try {
    await query(
      `INSERT INTO wall_of_fame_daily_stats (date_key, user_id, photos_shared)
       VALUES ($1, $2, $3)
       ON CONFLICT (date_key, user_id) DO UPDATE
         SET photos_shared = wall_of_fame_daily_stats.photos_shared + EXCLUDED.photos_shared`,
      [dateKey, winner.user_id, mediaCount]
    );
  } catch (err) {
    logger.warn('[WoF] Stats update failed', { error: err.message });
  }

  // 3. Create promoted social post
  try {
    const SocialPostService = require('../../services/socialPostService');
    await SocialPostService.createPost(
      winner.user_id,
      `🔥 Featured on Wall of Fame — Community Hangout`,
      winner.best_media_url,
      winner.media_type || 'image',
      null, null, true  // isWof = true
    );
    // Promote it
    await query(
      `UPDATE social_posts SET is_promoted = true, updated_at = NOW()
        WHERE is_wof = true AND user_id = $1 AND created_at::date = $2::date`,
      [winner.user_id, dateKey]
    );
    logger.info('[WoF] Social post created and promoted', { userId: winner.user_id });
  } catch (err) {
    logger.warn('[WoF] Social post failed', { error: err.message });
  }

  // 4. Post to Telegram Cloudy Days group (with topic fallback)
  if (telegram) {
    try {
      const fullMediaUrl = `${APP_BASE_URL}${winner.best_media_url}`;
      const sendFn = winner.media_type === 'video'
        ? (opts) => telegram.sendVideo(Number(CLOUDY_CHAT_ID), { url: fullMediaUrl }, opts)
        : (opts) => telegram.sendPhoto(Number(CLOUDY_CHAT_ID), { url: fullMediaUrl }, opts);
      try {
        await sendFn({ caption: promoHTML, parse_mode: 'HTML', message_thread_id: WALL_OF_FAME_TOPIC_ID });
        logger.info('[WoF] Posted to Telegram WoF topic', { topicId: WALL_OF_FAME_TOPIC_ID });
      } catch (topicErr) {
        if (isTopicMissingError(topicErr)) {
          await telegram.sendMessage(Number(CLOUDY_CHAT_ID), promoHTML, {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          });
          logger.info('[WoF] Topic missing — posted to Cloudy Days general');
        }
      }
    } catch (err) {
      logger.warn('[WoF] Telegram post failed', { error: err.message });
    }
  }

  // 5. Post to community hangout chats
  const wofGroupId = await getWofGroupId();
  const hangoutRooms = [88, ...(wofGroupId ? [wofGroupId] : [])];
  for (const roomId of hangoutRooms) {
    try {
      const { rows: [msg] } = await query(
        `INSERT INTO chat_messages (room, user_id, username, first_name, content, media_url, media_type, message_type)
         VALUES ($1, '8552451957', 'pnptv', 'PNPtv! News', $2, $3, $4, 'system')
         RETURNING id`,
        [`hangout:${roomId}`, promoPlain, winner.best_media_url, winner.media_type || 'image']
      );
      // Emit via Socket.IO
      try {
        const { get: getIo } = require('../../services/socketSingleton');
        const io = getIo();
        if (io && msg) io.to(`hangout:${roomId}`).emit('chat:message', msg);
      } catch (_) {}
      logger.info('[WoF] Hangout announcement posted', { roomId, msgId: msg.id });
    } catch (err) {
      logger.warn('[WoF] Hangout post failed', { roomId, error: err.message });
    }
  }

  logger.info('[WoF] Daily community feature complete', {
    dateKey,
    winner: winner.username || winner.user_id,
    mediaCount,
  });
}

async function postWinnersToHangoutWoF(winners, dateKey) {
  try {
    const { rows: topics } = await query(
      'SELECT id FROM hangout_groups WHERE is_wall_of_fame = TRUE'
    );
    if (!topics.length) return;

    const [legendUser, activeUser, newMemberUser] = await Promise.all([
      winners.legendUserId ? UserModel.getById(winners.legendUserId) : Promise.resolve(null),
      winners.activeUserId ? UserModel.getById(winners.activeUserId) : Promise.resolve(null),
      winners.newMemberUserId ? UserModel.getById(winners.newMemberUserId) : Promise.resolve(null),
    ]);

    const displayName = (u) => u?.username ? `@${u.username}` : (u?.firstName || u?.first_name || 'Miembro');

    const lines = [`🏆 Ganadores del día / Daily Winners — ${dateKey}`];
    if (legendUser) lines.push(`🌟 High Legend of the Cult: ${displayName(legendUser)} · Premio: 3 días PRIME`);
    if (newMemberUser) lines.push(`🆕 Tribute of the Cult: ${displayName(newMemberUser)}`);
    if (activeUser) lines.push(`💪 The Loyal Disciple: ${displayName(activeUser)}`);

    const content = lines.join('\n');
    const { get: getIo } = require('../../../services/socketSingleton');
    const io = getIo();

    for (const { id: topicId } of topics) {
      const { rows: [msg] } = await query(
        `INSERT INTO chat_messages (room, user_id, username, first_name, photo_url, content, reply_to_id)
         VALUES ($1, '8552451957', 'pnptv', 'PNPtv! News', NULL, $2, NULL)
         RETURNING id, room, user_id, username, first_name, content, created_at`,
        [`hangout:${topicId}`, content]
      );
      if (io && msg) {
        io.to(`hangout:${topicId}`).emit('hangout:message', {
          id: msg.id,
          room: msg.room,
          user_id: msg.user_id,
          username: 'pnptv',
          first_name: 'PNPtv! News',
          photo_url: null,
          content,
          media_url: null,
          media_type: null,
          media_mime: null,
          media_thumb_url: null,
          media_width: null,
          media_height: null,
          media_metadata: null,
          reply_to_id: null,
          created_at: msg.created_at,
          is_deleted: false,
          message_type: 'text',
          meta: null,
          reactions: [],
        });
      }
    }
  } catch (err) {
    logger.warn('[WoF] Failed to post winners to hangout WoF topics', { error: err.message });
  }
}

// Posts the daily top-3 WoF winners to the gamification notification topic.
async function postWofTop3ToGamification(winners, dateKey) {
  try {
    const BusinessNotificationService = require('../../../services/businessNotificationService');
    const userIds = [winners.legendUserId, winners.activeUserId, winners.newMemberUserId].filter(Boolean);
    if (!userIds.length) return;

    const [legendUser, activeUser, newMemberUser] = await Promise.all([
      winners.legendUserId ? UserModel.getById(winners.legendUserId) : null,
      winners.activeUserId ? UserModel.getById(winners.activeUserId) : null,
      winners.newMemberUserId ? UserModel.getById(winners.newMemberUserId) : null,
    ]);

    const { rows: statsRows } = await query(
      `SELECT user_id, reactions_received, photos_shared
         FROM wall_of_fame_daily_stats
        WHERE date_key = $1 AND user_id = ANY($2::text[])`,
      [dateKey, userIds.map(String)]
    );
    const statsMap = Object.fromEntries(statsRows.map((r) => [String(r.user_id), r]));

    await BusinessNotificationService.notifyWofDailyTop3({
      dateKey,
      winners: {
        legendUser,    legendStats:    statsMap[String(winners.legendUserId)],
        activeUser,    activeStats:    statsMap[String(winners.activeUserId)],
        newMemberUser,
      },
    });
  } catch (err) {
    logger.warn('[WoF] gamification top3 notification failed', { error: err.message });
  }
}

// Promotes the top-3 WoF posts in the social feed:
//   1. Sets is_promoted=true on each winner's WoF social post from that day.
//   2. Creates one system announcement post mentioning all 3.
async function postWofTop3ToSocialFeed(winners, dateKey) {
  try {
    const userIds = [winners.legendUserId, winners.activeUserId, winners.newMemberUserId].filter(Boolean);
    if (!userIds.length) return;

    // Promote their WoF social posts from that day so the feed ranks them higher
    await query(
      `UPDATE social_posts SET is_promoted = true, updated_at = NOW()
        WHERE is_wof = true
          AND user_id = ANY($1::text[])
          AND created_at::date = $2::date`,
      [userIds.map(String), dateKey]
    );

    // Fetch user display names for the announcement post
    const users = (await Promise.all(userIds.map((id) => UserModel.getById(id)))).filter(Boolean);
    const medals = ['🥇', '🥈', '🥉'];
    const nameParts = users.map((u, i) => {
      const who = u.username ? `@${u.username}` : (u.firstName || u.first_name || 'Miembro');
      return `${medals[i]} ${who}`;
    });

    const content = [
      `📸 TOP WALL OF FAME — ${dateKey}`,
      '',
      '¡Los más activos del día en el Wall of Fame! 🔥',
      '',
      nameParts.join('\n'),
      '',
      'Sus fotos están destacadas en el feed. ¡Gracias por animar la comunidad! 💜',
    ].join('\n');

    const post = await SocialPostService.createPost('8552451957', content, null, null, null, null, false);

    const { get: getIo } = require('../../../services/socketSingleton');
    const io = getIo();
    if (io && post) {
      io.emit('feed:new_post', {
        ...post,
        author_id: '8552451957',
        author_username: 'pnptv',
        author_first_name: 'PNPtv! News',
        liked_by_me: false,
      });
    }
  } catch (err) {
    logger.warn('[WoF] top3 social feed post failed', { error: err.message });
  }
}

async function processDailyWinners(dateKey, telegram) {
  // FIX 18: Redis idempotency guard — prevent double-awards on crash-restart cycles
  const redis = getRedis();
  const lockKey = `wof:daily:lock:${dateKey}`;
  if (redis) {
    const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
    if (!acquired) {
      logger.info('[WallOfFame] Daily processing already done for', { dateKey });
      return;
    }
  }

  const existing = await WallOfFameModel.getDailyWinners(dateKey);
  if (existing) {
    return;
  }

  const winners = await WallOfFameModel.calculateDailyWinners(dateKey);
  await WallOfFameModel.setDailyWinners(dateKey, winners);

  if (!winners.legendUserId && !winners.activeUserId && !winners.newMemberUserId) {
    return;
  }

  await Promise.all([
    notifyLegendWinner(telegram, winners.legendUserId, dateKey),
    notifyNewMemberWinner(telegram, winners.newMemberUserId, dateKey),
    notifyActiveWinner(telegram, winners.activeUserId, dateKey),
  ]);
  postWinnersToHangoutWoF(winners, dateKey).catch(() => {});
  postWofTop3ToGamification(winners, dateKey).catch(() => {});
  postWofTop3ToSocialFeed(winners, dateKey).catch(() => {});
}

async function ensureDailyProcessing(currentDate, telegram) {
  await maybeResetMonthlyBadges(currentDate);

  const currentDateKey = getDateKey(currentDate);
  if (!lastProcessedDateKey) {
    lastProcessedDateKey = currentDateKey;
    await processDailyWinners(getPreviousDateKey(currentDateKey), telegram);
    return;
  }

  if (currentDateKey === lastProcessedDateKey) {
    return;
  }

  await processDailyWinners(getPreviousDateKey(currentDateKey), telegram);
  lastProcessedDateKey = currentDateKey;
}

async function notifyLegendWinner(telegram, userId, dateKey) {
  if (!userId) return;

  try {
    NotificationEmitter.emit({
      type: 'wof_winner', category: 'social', priority: 'high',
      targetUserId: String(userId), entityType: 'user', entityId: String(userId),
      message: `You won the ${BADGE_HIGH_LEGEND} title! Check your Telegram DMs for details.`,
      metadata: { badge: BADGE_HIGH_LEGEND, dateKey },
    });
    await UserModel.addBadge(userId, BADGE_HIGH_LEGEND);
    await sendWinnerMessage(telegram, userId, BADGE_HIGH_LEGEND, dateKey, {
      es: 'Has ganado 3 días PRIME por ser quien recibió más interacciones.',
      en: 'You earned 3 PRIME days for getting the most interactions.',
    }, EVENT_TYPES.PRIME);
    await announceWinner(telegram, userId, BADGE_HIGH_LEGEND, {
      es: 'Premio: 3 días PRIME gratis.',
      en: 'Prize: 3 FREE PRIME days.',
    });
  } catch (error) {
    logger.error('Error rewarding High Legend winner:', error);
  }
}

async function notifyNewMemberWinner(telegram, userId, dateKey) {
  if (!userId) return;

  try {
    NotificationEmitter.emit({
      type: 'wof_winner', category: 'social', priority: 'high',
      targetUserId: String(userId), entityType: 'user', entityId: String(userId),
      message: `You won the ${BADGE_TRIBUTE} title! Check your Telegram DMs for details.`,
      metadata: { badge: BADGE_TRIBUTE, dateKey },
    });
    await UserModel.addBadge(userId, BADGE_TRIBUTE);
    await sendWinnerMessage(telegram, userId, BADGE_TRIBUTE, dateKey, {
      es: 'Fuiste el Nuevo Miembro Destacado. Estás invitado al próximo hangout privado con Santino.',
      en: 'You were the Featured New Member. You are invited to the next private hangout with Santino.',
    }, EVENT_TYPES.SANTINO);
    await announceWinner(telegram, userId, BADGE_TRIBUTE, {
      es: 'Premio: invitación al próximo hangout privado con Santino.',
      en: 'Prize: invitation to the next private hangout with Santino.',
    });
  } catch (error) {
    logger.error('Error rewarding Tribute of the Cult winner:', error);
  }
}

async function notifyActiveWinner(telegram, userId, dateKey) {
  if (!userId) return;

  try {
    NotificationEmitter.emit({
      type: 'wof_winner', category: 'social', priority: 'high',
      targetUserId: String(userId), entityType: 'user', entityId: String(userId),
      message: `You won the ${BADGE_LOYAL} title! Check your Telegram DMs for details.`,
      metadata: { badge: BADGE_LOYAL, dateKey },
    });
    await UserModel.addBadge(userId, BADGE_LOYAL);
    await sendWinnerMessage(telegram, userId, BADGE_LOYAL, dateKey, {
      es: 'Fuiste el Miembro Activo Destacado. Estás invitado al próximo hangout privado con Lex.',
      en: 'You were the Featured Active Member. You are invited to the next private hangout with Lex.',
    }, EVENT_TYPES.LEX);
    await announceWinner(telegram, userId, BADGE_LOYAL, {
      es: 'Premio: invitación al próximo hangout privado con Lex.',
      en: 'Prize: invitation to the next private hangout with Lex.',
    });
  } catch (error) {
    logger.error('Error rewarding Loyal Disciple winner:', error);
  }
}

async function sendWinnerMessage(telegram, userId, badge, dateKey, extra, primaryEvent) {
  try {
    const user = await UserModel.getById(userId);
    const lang = user?.language || 'en';
    const monthKey = getMonthKey(new Date(`${dateKey}T00:00:00.000Z`));
    const keyboard = buildWinnerKeyboard(primaryEvent, monthKey, lang);
    const message = lang === 'es'
      ? `🏆 ¡Ganaste el título ${badge}!\n\n${extra.es}\n\n✅ Tu título se mantiene hasta el último día del mes.\n\n📅 Horarios oficiales (UTC):\n• Hangout con Lex: segundo sábado 20:00–22:00\n• Hangout con Santino: segundo sábado 22:00–00:00\n• The Meth Gala: último sábado desde las 20:00\n\n⚠️ Términos y condiciones:\n• Debes reclamar tu premio desde los botones abajo.\n• Si no se canjea antes de fin de mes, el premio expira.\n• Los premios son personales e intransferibles.\n• PNPtv no se responsabiliza por premios no reclamados.\n\n🎉 Con cualquier badge del culto tienes invitación a la Meth Gala.\n\nRevisa los botones para reclamar o registrarte.`
      : `🏆 You won the ${badge} title!\n\n${extra.en}\n\n✅ Your title remains active until the last day of this month.\n\n📅 Official times (UTC):\n• Lex hangout: 2nd Saturday 20:00–22:00\n• Santino hangout: 2nd Saturday 22:00–00:00\n• The Meth Gala: last Saturday from 20:00 onward\n\n⚠️ Terms & conditions:\n• Claim your prize using the buttons below.\n• Unclaimed prizes expire at month end.\n• Prizes are personal and non-transferable.\n• PNPtv is not responsible for unclaimed prizes.\n\n🎉 Any cult-title badge grants a Meth Gala invite.\n\nUse the buttons to claim or register.`;

    await telegram.sendMessage(userId, message, {
      ...keyboard,
    });
  } catch (error) {
    logger.debug('Could not send winner DM', { userId, error: error.message });
  }
}

function buildWinnerKeyboard(primaryEvent, monthKey, lang) {
  const buttons = [];

  if (primaryEvent === EVENT_TYPES.PRIME) {
    buttons.push([
      Markup.button.callback(
        lang === 'es' ? '✅ Activar PRIME 3 días' : '✅ Activate 3-Day PRIME',
        `cult_claim_prime_${monthKey}`
      ),
    ]);
  }

  if (primaryEvent === EVENT_TYPES.SANTINO) {
    buttons.push([
      Markup.button.callback(
        lang === 'es' ? '🗓️ Register for Santino\'s Hangout' : "🗓️ Register for Santino's Hangout",
        `cult_register_santino_${monthKey}`
      ),
    ]);
  }

  if (primaryEvent === EVENT_TYPES.LEX) {
    buttons.push([
      Markup.button.callback(
        lang === 'es' ? '🗓️ Register for Lex\'s Hangout' : "🗓️ Register for Lex's Hangout",
        `cult_register_lex_${monthKey}`
      ),
    ]);
  }

  buttons.push([
    Markup.button.callback(
      lang === 'es' ? '🎉 Register for The Meth Gala' : '🎉 Register for The Meth Gala',
      `cult_register_gala_${monthKey}`
    ),
  ]);

  return Markup.inlineKeyboard(buttons);
}

async function announceWinner(telegram, userId, badge, reward) {
  try {
    const user = await UserModel.getById(userId);
    const username = user?.username ? `@${user.username}` : (user?.firstName || 'Miembro');
    const message =
      `🔥 <b>WALL OF FAME</b> 🐷💨\n\n` +
      `🏆 ${username} — <b>${badge}</b>\n\n` +
      `${reward.es}\n${reward.en}\n\n` +
      `⏳ Title lasts until end of the month.\n` +
      `📌 <a href="${WOF_APP_URL}">Wall of Fame in the app</a>`;

    await telegram.sendMessage(GROUP_ID, message, { parse_mode: 'HTML' });
    try {
      await telegram.sendMessage(GROUP_ID, message, {
        parse_mode: 'HTML',
        message_thread_id: WALL_OF_FAME_TOPIC_ID,
      });
    } catch (topicErr) {
      if (isTopicMissingError(topicErr)) {
        await telegram.sendMessage(
          GROUP_ID,
          `📌 <a href="${WOF_APP_URL}">Ver Wall of Fame en la app / View Wall of Fame in the app</a>`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    }
  } catch (error) {
    logger.error('Error announcing cult winner:', error);
  }
}

/**
 * Register wall of fame handlers
 * @param {Telegraf} bot - Bot instance
 */
const registerWallOfFameHandlers = (bot) => {
  // Listen for photos/videos in groups
  bot.on(['photo', 'video'], async (ctx) => {
    try {
      // Only apply in groups
      if (!['group', 'supergroup'].includes(ctx.chat?.type)) {
        return;
      }

      // CRITICAL: Only process photos/videos from the TARGET group
      const chatIdStr = ctx.chat?.id?.toString();
      if (chatIdStr !== GROUP_ID) {
        return; // Not our target group, skip
      }

      // Skip if photo/video is already in Wall of Fame topic (prevent re-posting)
      const messageThreadId = ctx.message?.message_thread_id;
      if (messageThreadId && Number(messageThreadId) === WALL_OF_FAME_TOPIC_ID) {
        return; // Already in Wall of Fame, skip
      }

      // Skip if it's a forwarded message or reply
      if (ctx.message.forward_from || ctx.message.reply_to_message) {
        return;
      }

      const userId = ctx.from.id;
      const lang = getLanguage(ctx);
      const now = new Date();

      // Get user info
      const user = await UserModel.getById(userId);
      if (!user) {
        logger.warn('User not found for wall of fame', { userId });
        return;
      }

      await ensureDailyProcessing(now, ctx.telegram);

      const joinData = await cache.get(`group_joined_at:${userId}`);
      const joinedAt = joinData?.joinedAt ? new Date(joinData.joinedAt) : null;
      const isNewMember = joinedAt ? (now.getTime() - joinedAt.getTime()) <= 3 * 60 * 60 * 1000 : false;
      const groupIdValue = Number(GROUP_ID);

      // Build member info caption
      const caption = buildMemberInfoCaption(user, lang);
      const inlineKeyboard = buildMemberInlineKeyboard(user, userId, lang);

      // Prepare to forward to Wall of Fame
      const isPhoto = ctx.message.photo;
      const isVideo = ctx.message.video;

      try {
        if (isPhoto) {
          // Get the largest photo size
          const photo = ctx.message.photo[ctx.message.photo.length - 1];
          const fileId = photo.file_id;

          // Send photo to Wall of Fame TOPIC with member info
          const sentMessage = await ctx.telegram.sendPhoto(
            GROUP_ID,
            fileId,
            {
              caption,
              parse_mode: 'HTML',
              disable_notification: false,
              message_thread_id: WALL_OF_FAME_TOPIC_ID, // Post to the specific topic
              ...(inlineKeyboard ? inlineKeyboard : {}),
            }
          );

          // Track this Wall of Fame message so it's NEVER deleted
          trackWallOfFameMessage(WALL_OF_FAME_TOPIC_ID, sentMessage.message_id);
          await WallOfFameModel.recordPost({
            groupId: groupIdValue,
            messageId: sentMessage.message_id,
            userId,
            dateKey: getDateKey(now),
            isNewMember,
            createdAt: now,
          });

          logger.info('Photo posted to Wall of Fame TOPIC (PERMANENT)', {
            userId,
            username: user.username,
            groupId: ctx.chat.id,
            topicId: WALL_OF_FAME_TOPIC_ID,
            wallOfFameMessageId: sentMessage.message_id,
          });

          // Dual-post to social feed (fire-and-forget)
          postToSocialFeed(ctx, fileId, 'image', user, 'image/jpeg');
        } else if (isVideo) {
          const video = ctx.message.video;
          const fileId = video.file_id;

          // Send video to Wall of Fame TOPIC with member info
          const sentMessage = await ctx.telegram.sendVideo(
            GROUP_ID,
            fileId,
            {
              caption,
              parse_mode: 'HTML',
              disable_notification: false,
              duration: video.duration,
              message_thread_id: WALL_OF_FAME_TOPIC_ID, // Post to the specific topic
              ...(inlineKeyboard ? inlineKeyboard : {}),
            }
          );

          // Track this Wall of Fame message so it's NEVER deleted
          trackWallOfFameMessage(WALL_OF_FAME_TOPIC_ID, sentMessage.message_id);
          await WallOfFameModel.recordPost({
            groupId: groupIdValue,
            messageId: sentMessage.message_id,
            userId,
            dateKey: getDateKey(now),
            isNewMember,
            createdAt: now,
          });

          logger.info('Video posted to Wall of Fame TOPIC (PERMANENT)', {
            userId,
            username: user.username,
            groupId: ctx.chat.id,
            topicId: WALL_OF_FAME_TOPIC_ID,
            wallOfFameMessageId: sentMessage.message_id,
          });

          // Dual-post to social feed (fire-and-forget)
          postToSocialFeed(ctx, fileId, 'video', user, video.mime_type || 'video/mp4');
        }

        // Delete the original message from the group to avoid duplicates
        try {
          await ctx.deleteMessage();
          logger.info('Original message deleted from group', {
            userId,
            messageId: ctx.message.message_id,
            groupId: ctx.chat.id,
          });
        } catch (deleteError) {
          logger.warn('Failed to delete original message', {
            userId,
            messageId: ctx.message.message_id,
            error: deleteError.message,
          });
        }

        // Send confirmation to user in private chat
        try {
          const confirmMsg = lang === 'es'
            ? `✨ Tu foto/video ha sido publicado en el Muro de la Fama.\n\n🏆 Los títulos diarios se definen por interacciones y actividad.\n\n💫 ¡Sigue compartiendo contenido increíble!`
            : `✨ Your photo/video has been posted to the Wall of Fame.\n\n🏆 Daily titles are decided by interactions and activity.\n\n💫 Keep sharing amazing content!`;

          await ctx.telegram.sendMessage(userId, confirmMsg);
        } catch (dmError) {
          logger.debug('Could not send DM confirmation', { userId, error: dmError.message });
        }
      } catch (postError) {
        logger.error('Error posting to Wall of Fame', {
          userId,
          error: postError.message,
        });

        // Try to notify user of the error
        try {
          const errorMsg = lang === 'es'
            ? '❌ Hubo un error al publicar en el Muro de la Fama'
            : '❌ There was an error posting to the Wall of Fame';
          await ctx.telegram.sendMessage(userId, errorMsg);
        } catch (dmError) {
          logger.debug('Could not send error DM', { userId });
        }
      }
    } catch (error) {
      logger.error('Error in wallOfFame handler:', error);
    }
  });

  bot.on('message_reaction', async (ctx) => {
    try {
      const messageReaction = ctx.messageReaction;
      if (!messageReaction?.message) {
        return;
      }

      const chatIdStr = messageReaction.message.chat?.id?.toString();
      if (chatIdStr !== GROUP_ID) {
        return;
      }

      await ensureDailyProcessing(new Date(), ctx.telegram);

      const newReactions = messageReaction.new_reaction || [];
      const oldReactions = messageReaction.old_reaction || [];
      const delta = newReactions.length - oldReactions.length;
      if (delta === 0) {
        return;
      }

      await WallOfFameModel.incrementReactions({
        groupId: Number(GROUP_ID),
        messageId: messageReaction.message.message_id,
        delta,
      });
    } catch (error) {
      logger.error('Error tracking Wall of Fame reactions:', error);
    }
  });

  bot.action(/^cult_claim_prime_(\d{4}-\d{2})$/, async (ctx) => {
    try {
      const monthKey = ctx.match[1];
      const userId = ctx.from.id.toString();
      const currentMonthKey = getMonthKey(new Date());
      const user = await UserModel.getById(userId);
      const lang = user?.language || 'en';
      if (monthKey !== currentMonthKey) {
        await ctx.answerCbQuery(lang === 'es' ? 'Este premio ya expiró.' : 'This reward has expired.');
        return;
      }
      const existing = await CultEventModel.getRegistration({
        userId,
        eventType: EVENT_TYPES.PRIME,
        monthKey,
      });

      if (existing?.status === 'claimed') {
        await ctx.answerCbQuery(lang === 'es' ? 'PRIME ya fue activado.' : 'PRIME already activated.');
        return;
      }

      if (!existing) {
        await CultEventService.register({
          userId,
          eventType: EVENT_TYPES.PRIME,
          monthKey,
          eventAt: new Date(),
        });
      }

      const result = await SubscriptionService.addFreeTrial(userId, 3, 'cult_high_legend');
      if (result.success) {
        await CultEventModel.markClaimed({ userId, eventType: EVENT_TYPES.PRIME, monthKey });
        await ctx.answerCbQuery(lang === 'es' ? '¡PRIME activado! 🎉' : 'PRIME activated! 🎉');
      } else {
        await ctx.answerCbQuery(lang === 'es' ? 'Fallo al activar. Intenta de nuevo.' : 'Activation failed. Try again.');
      }
    } catch (error) {
      logger.error('Error activating PRIME claim:', error);
      await ctx.answerCbQuery('Error activating PRIME.');
    }
  });

  bot.action(/^cult_register_(santino|lex|gala)_(\d{4}-\d{2})$/, async (ctx) => {
    try {
      const eventKey = ctx.match[1];
      const monthKey = ctx.match[2];
      const userId = ctx.from.id.toString();
      const currentMonthKey = getMonthKey(new Date());
      const eventType = eventKey === 'santino'
        ? EVENT_TYPES.SANTINO
        : eventKey === 'lex'
          ? EVENT_TYPES.LEX
          : EVENT_TYPES.GALA;

      const user = await UserModel.getById(userId);
      const lang = user?.language || 'en';
      if (monthKey !== currentMonthKey) {
        await ctx.answerCbQuery(lang === 'es' ? 'Registro fuera de fecha.' : 'Registration period ended.');
        return;
      }

      const registration = await CultEventService.register({
        userId,
        eventType,
        monthKey,
      });

      if (!registration) {
        await ctx.answerCbQuery(lang === 'es' ? 'Registro fallido.' : 'Registration failed.');
        return;
      }

      const eventAt = new Date(registration.event_at);
      const dateStr = eventAt.toISOString().split('T')[0];
      const timeStr = `${eventAt.getUTCHours().toString().padStart(2, '0')}:00 UTC`;
      await ctx.answerCbQuery(lang === 'es' ? '¡Registrado!' : 'Registered!');
      await ctx.reply(
        lang === 'es'
          ? `✅ Registro confirmado\n\n📅 Fecha: ${dateStr}\n🕗 Hora: ${timeStr}\n\nTe enviaremos recordatorios 1 semana antes, 3 días antes y el día del evento.`
          : `✅ Registration confirmed\n\n📅 Date: ${dateStr}\n🕗 Time: ${timeStr}\n\nWe will send reminders 1 week before, 3 days before, and on the day.`,
      );
    } catch (error) {
      logger.error('Error registering cult event:', error);
      await ctx.answerCbQuery('Error registering.');
    }
  });
};

/**
 * Build member information caption for Wall of Fame
 * @param {Object} user - User object
 * @param {string} lang - Language code
 * @returns {string} HTML formatted caption
 */
function buildMemberInfoCaption(user, lang) {
  const label = lang === 'es' ? '👑 Miembro Destacado' : '👑 Featured Member';
  const nameLabel = lang === 'es' ? 'Nombre:' : 'Name:';
  const usernameLabel = lang === 'es' ? 'Usuario:' : 'Username:';
  const bioLabel = lang === 'es' ? 'Bio:' : 'Bio:';
  const lookingForLabel = lang === 'es' ? 'Buscando:' : 'Looking for:';
  const interestsLabel = lang === 'es' ? 'Intereses:' : 'Interests:';
  const socialLabel = lang === 'es' ? 'Redes Sociales:' : 'Social Media:';

  let caption = `<b>${label}</b>\n\n`;

  // Display name (firstName + lastName if available, fallback to username)
  const displayName = user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.firstName || user.username || 'Member';

  caption += `<b>${nameLabel}</b> ${displayName}\n`;

  if (user.username) {
    caption += `<b>${usernameLabel}</b> @${user.username}\n`;
  }

  if (user.bio) {
    caption += `<b>${bioLabel}</b> ${escapeHtml(user.bio)}\n`;
  }

  if (user.looking_for) {
    caption += `<b>${lookingForLabel}</b> ${escapeHtml(user.looking_for)}\n`;
  }

  if (Array.isArray(user.interests) && user.interests.length > 0) {
    const interests = user.interests.filter(Boolean).slice(0, 8).map((i) => escapeHtml(String(i)));
    if (interests.length > 0) {
      caption += `<b>${interestsLabel}</b> ${interests.join(', ')}\n`;
    }
  }

  // Add social media links if available
  const socialLinks = [];

  if (user.instagram) {
    socialLinks.push(`<a href="https://instagram.com/${escapeHtml(String(user.instagram).replace(/^@/, ''))}">📸 Instagram</a>`);
  }

  if (user.twitter) {
    socialLinks.push(`<a href="https://x.com/${escapeHtml(String(user.twitter).replace(/^@/, ''))}">𝕏 X</a>`);
  }

  if (user.tiktok) {
    socialLinks.push(`<a href="https://www.tiktok.com/@${escapeHtml(String(user.tiktok).replace(/^@/, ''))}">🎵 TikTok</a>`);
  }

  if (user.youtube) {
    const youtubeValue = String(user.youtube).trim();
    const youtubeUrl = youtubeValue.startsWith('http') ? youtubeValue : `https://www.youtube.com/@${youtubeValue.replace(/^@/, '')}`;
    socialLinks.push(`<a href="${escapeHtml(youtubeUrl)}">▶️ YouTube</a>`);
  }

  // FIX 11: Only build t.me URL if a real username is available (not a numeric Telegram ID)
  if (user.username) {
    socialLinks.push(`<a href="https://t.me/${escapeHtml(String(user.username).replace(/^@/, ''))}">✈️ Telegram</a>`);
  }

  if (socialLinks.length > 0) {
    caption += `\n<b>${socialLabel}</b>\n${socialLinks.join(' | ')}\n`;
  }

  caption += `\n✨ <i>${lang === 'es' ? 'Destacado en el Muro de la Fama' : 'Featured on Wall of Fame'}</i>`;

  return caption;
}

function buildMemberInlineKeyboard(user, userId, lang) {
  try {
    const keyboard = [];

    // Interests as callback buttons (shows alert)
    if (Array.isArray(user.interests) && user.interests.length > 0) {
      const interestButtons = user.interests
        .map((interest, index) => ({ interest, index }))
        .filter(({ interest }) => Boolean(interest))
        .slice(0, 6)
        .map(({ interest, index }) => Markup.button.callback(String(interest).slice(0, 24), `profile_interest_${userId}_${index}`));

      for (let i = 0; i < interestButtons.length; i += 2) {
        keyboard.push(interestButtons.slice(i, i + 2));
      }
    }

    const normalizeHandle = (value) => String(value || '').trim().replace(/^@/, '');
    const socialButtons = [];

    if (user.instagram) {
      socialButtons.push(Markup.button.url('Instagram', `https://instagram.com/${encodeURIComponent(normalizeHandle(user.instagram))}`));
    }
    if (user.twitter) {
      socialButtons.push(Markup.button.url('X', `https://x.com/${encodeURIComponent(normalizeHandle(user.twitter))}`));
    }
    if (user.tiktok) {
      socialButtons.push(Markup.button.url('TikTok', `https://www.tiktok.com/@${encodeURIComponent(normalizeHandle(user.tiktok))}`));
    }
    if (user.youtube) {
      const youtubeValue = String(user.youtube).trim();
      const youtubeUrl = youtubeValue.startsWith('http') ? youtubeValue : `https://www.youtube.com/@${encodeURIComponent(normalizeHandle(youtubeValue))}`;
      socialButtons.push(Markup.button.url('YouTube', youtubeUrl));
    }
    // FIX 11: Only build t.me URL button if user.username is a real handle (not a numeric Telegram ID)
    if (user.username) {
      socialButtons.push(Markup.button.url('Telegram', `https://t.me/${encodeURIComponent(normalizeHandle(user.username))}`));
    }

    for (let i = 0; i < socialButtons.length; i += 2) {
      keyboard.push(socialButtons.slice(i, i + 2));
    }

    if (keyboard.length === 0) return null;
    return Markup.inlineKeyboard(keyboard);
  } catch (error) {
    logger.error('Error building Wall of Fame inline keyboard:', error);
    return null;
  }
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Track a Wall of Fame message as permanent (NEVER to be deleted)
 * @param {string} channelId - Wall of Fame channel ID
 * @param {number} messageId - Message ID to track
 */
function trackWallOfFameMessage(channelId, messageId) {
  if (!wallOfFameMessageIds.has(channelId)) {
    wallOfFameMessageIds.set(channelId, new Set());
  }
  wallOfFameMessageIds.get(channelId).add(messageId);
  logger.debug('Wall of Fame message tracked (PERMANENT)', { channelId, messageId });
}

/**
 * Check if a message is a Wall of Fame message (should never be deleted)
 * @param {string} channelId - Channel ID
 * @param {number} messageId - Message ID
 * @returns {boolean} True if this is a Wall of Fame message
 */
function isWallOfFameMessage(channelId, messageId) {
  const fameMessages = wallOfFameMessageIds.get(channelId);
  return fameMessages ? fameMessages.has(messageId) : false;
}

/**
 * Get all tracked Wall of Fame messages
 * @returns {Map} Map of channel IDs to message ID sets
 */
function getWallOfFameMessages() {
  return wallOfFameMessageIds;
}

module.exports = {
  registerWallOfFameHandlers,
  buildMemberInfoCaption,
  trackWallOfFameMessage,
  isWallOfFameMessage,
  getWallOfFameMessages,
  runDailyWofFeature,
};
