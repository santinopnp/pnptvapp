'use strict';

/**
 * spenderPingService
 *
 * Cross-cuts three related signals for the creator↔spender economy:
 *
 *  1. countOnlineSpenders()
 *       — how many token-holders are online right now. Feeds the
 *         ambient "🟢 N token-holders online" badge in the creator UI.
 *
 *  2. fanoutViewerOnline(viewerId)
 *       — a token-holding viewer just transitioned offline→online.
 *         Notify their "warm" creators (past tipper / DM'd / follows)
 *         via push + Telegram DM, subject to rate limits.
 *
 *  3. fanoutCreatorAvailable(creatorUserId)
 *       — a creator just flipped "available for calls". Notify their
 *         followers who hold enough tokens to actually book, subject
 *         to rate limits.
 *
 * All fanout is fire-and-forget. Never throws.
 *
 * Rate limits (per fanout):
 *   B: per-pair debounce 6h, per-creator daily cap 10
 *   C: per-pair debounce 12h, per-creator daily cap 25 (creator is
 *      the recipient of B, sender in C — different limits)
 */

const logger = require('../utils/logger');
const { query } = require('../config/postgres');
const { getRedis } = require('../config/redis');

const SPENDER_TOKEN_MIN = 30;    // >= 30 tokens = meaningful spender
const CALL_TOKEN_MIN = 30;       // followers with >=30 tokens get availability pings
const B_PAIR_DEBOUNCE_HOURS = 6;
const B_CREATOR_DAILY_CAP = 10;
const C_PAIR_DEBOUNCE_HOURS = 12;
const C_CREATOR_DAILY_CAP = 25;
const WARM_LOOKBACK_DAYS = 30;

// ─── 1. Live count ──────────────────────────────────────────────────────────

async function countOnlineSpenders() {
  try {
    const { rows } = await query(`
      SELECT u.id
        FROM users u
        JOIN user_token_wallets w ON w.user_id = u.id
       WHERE u.deleted_at IS NULL
         AND (u.tier IS NULL OR u.tier <> 'banned')
         AND u.role NOT IN ('creator','model','admin','superadmin')
         AND w.balance_tokens >= $1
    `, [SPENDER_TOKEN_MIN]);

    if (!rows.length) return { onlineNow: 0, totalPool: 0 };

    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const r of rows) pipeline.exists(`presence:online:${r.id}`);
    const results = await pipeline.exec();
    const onlineNow = results.reduce((n, [err, val]) => n + (!err && val === 1 ? 1 : 0), 0);
    return { onlineNow, totalPool: rows.length };
  } catch (err) {
    logger.warn('[spenderPingService] countOnlineSpenders failed', { error: err.message });
    return { onlineNow: 0, totalPool: 0 };
  }
}

// ─── shared: rate-limit check ───────────────────────────────────────────────

async function canPingPair(creatorId, viewerId, debounceHours, dailyCap) {
  const { rows: pairRows } = await query(
    `SELECT 1 FROM spender_online_pings
      WHERE creator_id = $1 AND viewer_id = $2
        AND sent_at > NOW() - ($3 || ' hours')::interval
      LIMIT 1`,
    [creatorId, viewerId, debounceHours]
  );
  if (pairRows.length > 0) return false;

  const { rows: capRows } = await query(
    `SELECT COUNT(*)::int AS c FROM spender_online_pings
      WHERE creator_id = $1
        AND sent_at > NOW() - INTERVAL '24 hours'`,
    [creatorId]
  );
  if ((capRows[0]?.c || 0) >= dailyCap) return false;

  return true;
}

async function logPing(creatorId, viewerId) {
  try {
    await query(
      `INSERT INTO spender_online_pings (creator_id, viewer_id) VALUES ($1, $2)`,
      [creatorId, viewerId]
    );
  } catch (err) {
    logger.warn('[spenderPingService] logPing failed', { creatorId, viewerId, error: err.message });
  }
}

// ─── delivery helpers ───────────────────────────────────────────────────────

async function deliverPush(userId, { title, body, url, tag }) {
  try {
    const PushSvc = require('./pushNotificationService');
    await PushSvc.sendToUser(userId, { title, body, url, tag });
  } catch (err) {
    logger.warn('[spenderPingService] push failed', { userId, error: err.message });
  }
}

async function deliverTelegram(userId, { type, message, entityType, entityId }) {
  try {
    const { sendNotificationViaTelegram } = require('./notificationBotDelivery');
    await sendNotificationViaTelegram(userId, { type, message, entityType, entityId });
  } catch (err) {
    logger.warn('[spenderPingService] telegram DM failed', { userId, error: err.message });
  }
}

// ─── 2. B: viewer came online → notify warm creators ────────────────────────

/**
 * Called when a token-holding viewer transitions offline→online.
 * Does NOT re-check transition — caller must gate that.
 */
async function fanoutViewerOnline(viewerId) {
  try {
    // Is this viewer a spender? If not, skip early.
    const { rows: walletRows } = await query(
      `SELECT balance_tokens FROM user_token_wallets WHERE user_id = $1`,
      [String(viewerId)]
    );
    const balance = walletRows[0]?.balance_tokens || 0;
    if (balance < SPENDER_TOKEN_MIN) return;

    const { rows: viewerRows } = await query(
      `SELECT id, COALESCE(NULLIF(first_name,''), NULL) AS first_name, role
         FROM users
        WHERE id = $1 AND deleted_at IS NULL
          AND (tier IS NULL OR tier <> 'banned')`,
      [String(viewerId)]
    );
    if (!viewerRows.length) return;
    // Creators aren't "viewers" — skip.
    if (['creator','model','admin','superadmin'].includes(viewerRows[0].role)) return;

    const viewerName = viewerRows[0].first_name || 'A member';

    // Find warm creators from three sources — follows, past tips, recent DMs.
    // Each source runs in its own try so a schema drift in one doesn't kill
    // the whole fanout (learned: creator_tips.payer_id vs tipper_id bug).
    const warmSet = new Set();
    const collect = async (label, sql, params) => {
      try {
        const { rows } = await query(sql, params);
        for (const r of rows) if (r.creator_id) warmSet.add(r.creator_id);
      } catch (err) {
        logger.warn(`[spenderPingService] warm-source "${label}" query failed — skipping`, { error: err.message });
      }
    };

    await collect('follows', `
      SELECT uf.following_id AS creator_id
        FROM user_follows uf
        JOIN users u ON u.id = uf.following_id
       WHERE uf.follower_id = $1
         AND u.deleted_at IS NULL
         AND (u.tier IS NULL OR u.tier <> 'banned')
         AND u.role IN ('creator','model')
    `, [String(viewerId)]);

    await collect('tips', `
      SELECT DISTINCT ct.creator_id
        FROM creator_tips ct
        JOIN users u ON u.id = ct.creator_id
       WHERE ct.payer_id = $1
         AND ct.status = 'completed'
         AND ct.created_at > NOW() - ($2 || ' days')::interval
         AND u.deleted_at IS NULL
         AND (u.tier IS NULL OR u.tier <> 'banned')
         AND u.role IN ('creator','model')
    `, [String(viewerId), WARM_LOOKBACK_DAYS]);

    await collect('dm_threads', `
      SELECT DISTINCT (CASE WHEN dt.user_a = $1 THEN dt.user_b ELSE dt.user_a END) AS creator_id
        FROM dm_threads dt
        JOIN users u ON u.id = (CASE WHEN dt.user_a = $1 THEN dt.user_b ELSE dt.user_a END)
       WHERE (dt.user_a = $1 OR dt.user_b = $1)
         AND dt.last_message_at > NOW() - ($2 || ' days')::interval
         AND u.deleted_at IS NULL
         AND (u.tier IS NULL OR u.tier <> 'banned')
         AND u.role IN ('creator','model')
    `, [String(viewerId), WARM_LOOKBACK_DAYS]);

    const warmRows = Array.from(warmSet).map(id => ({ creator_id: id }));

    if (!warmRows.length) return;

    logger.info('[spenderPingService] viewer online — warm-creator fanout candidates', {
      viewerId, balance, candidates: warmRows.length,
    });

    let sent = 0;
    for (const { creator_id } of warmRows) {
      if (!(await canPingPair(creator_id, viewerId, B_PAIR_DEBOUNCE_HOURS, B_CREATOR_DAILY_CAP))) continue;

      const title = 'A spender is online 💸';
      const body = `${viewerName} just logged in with ${balance} tokens to spend.`;
      const url = `/profile/${viewerId}`;
      await deliverPush(creator_id, {
        title, body, url,
        tag: `spender_online_${viewerId}`,
      });
      // type:'follow' — routes buildUrl() to /profile/{entityId}, matching
      // the push notification's deep link. 'system' would fall through to
      // the site root and break the profile CTA.
      await deliverTelegram(creator_id, {
        type: 'follow',
        message: `💸 ${viewerName} is online now — ${balance} tokens available to spend. Go say hi.`,
        entityType: 'profile',
        entityId: viewerId,
      });
      await logPing(creator_id, viewerId);
      sent++;
    }
    if (sent > 0) {
      logger.info('[spenderPingService] viewer online fanout done', { viewerId, sent });
    }
  } catch (err) {
    logger.warn('[spenderPingService] fanoutViewerOnline failed', { viewerId, error: err.message });
  }
}

// ─── 3. C: creator flipped available → notify wallet-holding followers ──────

async function fanoutCreatorAvailable(creatorUserId) {
  try {
    if (!creatorUserId) return;
    const { rows: creatorRows } = await query(
      `SELECT id, COALESCE(NULLIF(first_name,''), NULL) AS first_name
         FROM users
        WHERE id = $1 AND deleted_at IS NULL
          AND (tier IS NULL OR tier <> 'banned')
          AND role IN ('creator','model')`,
      [String(creatorUserId)]
    );
    if (!creatorRows.length) return;
    const creatorName = creatorRows[0].first_name || 'A creator';

    // Wallet-holding followers of this creator
    const { rows: candidates } = await query(`
      SELECT uf.follower_id AS viewer_id, w.balance_tokens
        FROM user_follows uf
        JOIN user_token_wallets w ON w.user_id = uf.follower_id
        JOIN users v ON v.id = uf.follower_id
       WHERE uf.following_id = $1
         AND w.balance_tokens >= $2
         AND v.deleted_at IS NULL
         AND (v.tier IS NULL OR v.tier <> 'banned')
    `, [String(creatorUserId), CALL_TOKEN_MIN]);

    if (!candidates.length) return;

    logger.info('[spenderPingService] creator available — wallet-follower fanout candidates', {
      creatorUserId, candidates: candidates.length,
    });

    let sent = 0;
    for (const { viewer_id, balance_tokens } of candidates) {
      // Reuse the same pings table with creator=viewer, viewer=creator swapped
      // is confusing — instead we key rate-limit on (viewer_id=recipient, creator_id=sender).
      // Semantically: recipient=viewer here. So (creator_id, viewer_id) → we'll
      // store it as (creator_id=creatorUserId, viewer_id=viewer_id) — same table,
      // treats "creator_id" as the CREATOR side of the pair regardless of direction.
      if (!(await canPingPair(creatorUserId, viewer_id, C_PAIR_DEBOUNCE_HOURS, C_CREATOR_DAILY_CAP))) continue;

      const title = `${creatorName} is available now 📞`;
      const body = `Book a private call — you have ${balance_tokens} tokens.`;
      const url = `/profile/${creatorUserId}`;
      await deliverPush(viewer_id, {
        title, body, url,
        tag: `creator_available_${creatorUserId}`,
      });
      // No TG DM for viewers on this path — going-live TG push already covers
      // creator activity; a second channel here would be noise for the viewer.
      await logPing(creatorUserId, viewer_id);
      sent++;
    }
    if (sent > 0) {
      logger.info('[spenderPingService] creator available fanout done', { creatorUserId, sent });
    }
  } catch (err) {
    logger.warn('[spenderPingService] fanoutCreatorAvailable failed', { creatorUserId, error: err.message });
  }
}

module.exports = {
  countOnlineSpenders,
  fanoutViewerOnline,
  fanoutCreatorAvailable,
  // exported for tests
  _constants: {
    SPENDER_TOKEN_MIN,
    CALL_TOKEN_MIN,
    B_PAIR_DEBOUNCE_HOURS,
    B_CREATOR_DAILY_CAP,
    C_PAIR_DEBOUNCE_HOURS,
    C_CREATOR_DAILY_CAP,
  },
};
