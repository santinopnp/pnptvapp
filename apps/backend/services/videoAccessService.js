'use strict';

const logger = require('../utils/logger');
const { getPool, getClient, query } = require('../config/postgres');
const { cache, getRedis } = require('../config/redis');
const tokenLedger = require('./tokenLedgerService');
const zohoBooks = require('./zohoBooksService');
const { CREATOR_REVENUE_RATE, PLATFORM_COMMISSION_RATE, EARNINGS_HOLD_HOURS } = require('../config/monetizationConfig');

// 1 USD = 6 Ru$h (base rate)
const RUSH_PER_USD = 6;

function rushToCents(priceRush) {
  return Math.round((priceRush / RUSH_PER_USD) * 100);
}

function grantCacheKey(userId, videoId) {
  return `video_grant:${userId}:${videoId}`;
}

async function getPrices(videoId) {
  const { rows } = await query(
    `SELECT rent_price_rush, buy_price_rush FROM channel_videos WHERE id = $1`,
    [String(videoId)]
  );
  if (!rows[0]) return { rent_price_rush: null, buy_price_rush: null, rent_price_usd: null, buy_price_usd: null };
  const { rent_price_rush, buy_price_rush } = rows[0];
  return {
    rent_price_rush: rent_price_rush != null ? Number(rent_price_rush) : null,
    buy_price_rush:  buy_price_rush  != null ? Number(buy_price_rush)  : null,
    rent_price_usd:  rent_price_rush != null ? rushToCents(Number(rent_price_rush)) / 100 : null,
    buy_price_usd:   buy_price_rush  != null ? rushToCents(Number(buy_price_rush))  / 100 : null,
  };
}

async function hasActiveGrant(userId, videoId) {
  const cacheKey = grantCacheKey(userId, videoId);
  try {
    const cached = await cache.get(cacheKey);
    if (cached !== null) return cached;
  } catch (_) { /* Redis miss — fall through to DB */ }

  const { rows } = await query(
    `SELECT grant_type, expires_at FROM video_access_grants
     WHERE user_id = $1 AND video_id = $2 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [String(userId), String(videoId)]
  );
  const result = rows[0]
    ? { granted: true, grant_type: rows[0].grant_type, expires_at: rows[0].expires_at }
    : { granted: false, grant_type: null, expires_at: null };

  try { await cache.set(cacheKey, result, 60); } catch (_) { /* non-fatal */ }
  return result;
}

async function _invalidateGrantCache(userId, videoId) {
  try { await cache.del(grantCacheKey(userId, videoId)); } catch (_) { /* non-fatal */ }
}

async function purchase({ userId, videoId, grantType }) {
  if (!['rent', 'buy'].includes(grantType)) {
    const err = new Error('Invalid grant type');
    err.code = 'INVALID_GRANT_TYPE';
    throw err;
  }

  const { rows: videoRows } = await query(
    `SELECT cv.rent_price_rush, cv.buy_price_rush, cv.uploader_id,
            u.username AS creator_username
     FROM channel_videos cv
     JOIN users u ON u.id = cv.uploader_id
     WHERE cv.id = $1 AND cv.status = 'published'`,
    [String(videoId)]
  );
  if (!videoRows[0]) {
    const err = new Error('Video not found');
    err.code = 'VIDEO_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const video = videoRows[0];
  const priceRush = grantType === 'rent'
    ? (video.rent_price_rush != null ? Number(video.rent_price_rush) : null)
    : (video.buy_price_rush  != null ? Number(video.buy_price_rush)  : null);

  if (priceRush == null) {
    const err = new Error(`${grantType} not available for this video`);
    err.code = 'PRICE_NOT_SET';
    err.status = 400;
    throw err;
  }

  const priceUsdCents = rushToCents(priceRush);
  const creatorId = String(video.uploader_id);
  const creatorUsername = video.creator_username || null;

  if (grantType === 'buy') {
    const existing = await hasActiveGrant(userId, videoId);
    if (existing.granted && existing.grant_type === 'buy') {
      const err = new Error('Already owned');
      err.code = 'ALREADY_OWNED';
      err.status = 409;
      throw err;
    }
  }

  const client = await getClient();
  let grantId = null;
  let earningId = null;
  let ledgerResult = null;
  try {
    await client.query('BEGIN');

    ledgerResult = await tokenLedger.debit({
      userId: String(userId),
      amount: priceRush,
      reason: 'content_purchase',
      sourceType: 'video_grant',
      sourceId: String(videoId),
      actorId: String(userId),
      allowGifted: false,
      externalClient: client,
      metadata: { video_id: String(videoId), grant_type: grantType },
    });

    const expiresAt = grantType === 'rent'
      ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      : null;

    const { rows: grantRows } = await client.query(
      `INSERT INTO video_access_grants
         (user_id, video_id, grant_type, expires_at, price_rush, price_usd_cents, ledger_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [String(userId), String(videoId), grantType, expiresAt, priceRush, priceUsdCents, ledgerResult.ledger_id]
    );
    grantId = Number(grantRows[0].id);

    const grossUsd = priceUsdCents / 100;
    const amountCreator = Math.round(grossUsd * CREATOR_REVENUE_RATE * 100) / 100;
    const amountPlatform = Math.round((grossUsd - amountCreator) * 100) / 100;

    const { rows: earnRows } = await client.query(
      `INSERT INTO creator_earnings
         (creator_id, amount_gross, amount_creator, amount_platform, status, is_tip,
          period_month, available_at, metadata)
       VALUES ($1, $2, $3, $4, 'holding', false,
               date_trunc('month', NOW()),
               NOW() + ($5 || ' hours')::interval,
               $6::jsonb)
       RETURNING id`,
      [
        creatorId,
        grossUsd,
        amountCreator,
        amountPlatform,
        String(EARNINGS_HOLD_HOURS),
        JSON.stringify({
          source: 'video_grant',
          video_id: String(videoId),
          grant_type: grantType,
          grantee_user_id: String(userId),
        }),
      ]
    );
    earningId = earnRows[0].id;

    await client.query(
      `UPDATE video_access_grants SET earning_id = $1 WHERE id = $2`,
      [earningId, grantId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
  client.release();

  await _invalidateGrantCache(userId, videoId);

  setImmediate(() => {
    zohoBooks.logRevenue({
      buyerUserId: String(userId),
      sku: `Video ${grantType} — @${creatorUsername || creatorId}`,
      priceCents: priceUsdCents,
      provider: 'wallet_rush',
      reference: `video_grant:${grantId}`,
      notes: `video_id=${videoId}`,
    }).catch(() => {});
  });

  return {
    granted: true,
    grant_type: grantType,
    expires_at: grantType === 'rent' ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null,
    balance_after: ledgerResult.balance_after,
    new_grant_id: grantId,
  };
}

async function adminGrant({ userId, videoId, adminUserId, expiresAt = null, reason }) {
  const { rows } = await query(
    `INSERT INTO video_access_grants
       (user_id, video_id, grant_type, expires_at, price_rush, price_usd_cents,
        granted_by_user_id, metadata)
     VALUES ($1, $2, 'admin_grant', $3, 0, 0, $4, $5::jsonb)
     RETURNING *`,
    [String(userId), String(videoId), expiresAt || null, String(adminUserId), JSON.stringify({ reason: reason || '' })]
  );
  await _invalidateGrantCache(userId, videoId);
  return rows[0];
}

module.exports = { getPrices, hasActiveGrant, purchase, adminGrant };
