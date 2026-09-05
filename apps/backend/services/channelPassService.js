'use strict';

/**
 * channelPassService.js
 *
 * Creator Channel Pass — monthly subscription to a specific creator's content.
 * Primary purchase rail: Ru$h wallet (debit via tokenLedgerService).
 * Fiat/crypto rails: stub returning NOT_IMPLEMENTED_YET (wire webhook then remove).
 *
 * Reuses:
 *   creator_subscriptions  (migration 088) — one row per creator+subscriber pair (UNIQUE)
 *   user_entitlements      (migration 133) — add_on_id='creator-subscription'
 *   creator_earnings       (migration 088) — 70/30 split, 'holding' status
 *   tokenLedgerService     — debit Ru$h inside the same pg transaction
 *   zohoBooksService       — fire-and-forget revenue log
 *   slackCreatorNotifyService — fire-and-forget Slack ping to #ext-<handle>
 */

const { getClient, query } = require('../config/postgres');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');
const tokenLedger = require('./tokenLedgerService');
const zohoBooks = require('./zohoBooksService');
const slackCreatorNotify = require('./slackCreatorNotifyService');
const { CREATOR_REVENUE_RATE, PLATFORM_COMMISSION_RATE, EARNINGS_HOLD_HOURS } = require('../config/monetizationConfig');

// 1 USD = 6 Ru$h (platform rate)
const RUSH_PER_USD = 6;
// Redis TTL for entitlement cache (60 s — warm reads for video gate)
const ENTITLEMENT_CACHE_TTL = 60;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve creator row: channel_pass_enabled, channel_pass_price_usd, username, email.
 * Returns null if creator not found.
 */
async function _getCreatorPassRow(creatorId) {
  const { rows } = await query(
    `SELECT id, username, email,
            channel_pass_enabled,
            channel_pass_price_usd
     FROM users
     WHERE id = $1::text`,
    [String(creatorId)]
  );
  return rows[0] || null;
}

/**
 * Query the active pass subscription row for a (subscriber, creator) pair.
 * Returns null if none.
 */
async function _getActiveSub(userId, creatorId, client) {
  const fn = client
    ? (sql, params) => client.query(sql, params)
    : (sql, params) => query(sql, params);
  const { rows } = await fn(
    `SELECT id, started_at, expires_at, status
     FROM creator_subscriptions
     WHERE subscriber_id = $1::text
       AND creator_id    = $2::text
     LIMIT 1`,
    [String(userId), String(creatorId)]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Get public info about a creator's Channel Pass.
 * If viewerId is given, also checks whether they have an active pass.
 *
 * @param {string} creatorId
 * @param {string|null} viewerId
 * @returns {Promise<{
 *   enabled: boolean,
 *   price_usd: number|null,
 *   price_rush: number|null,
 *   is_active: boolean,
 *   expires_at: Date|null,
 *   started_at: Date|null,
 * }>}
 */
async function getCreatorPassInfo(creatorId, viewerId = null) {
  const creator = await _getCreatorPassRow(creatorId);
  if (!creator) {
    return { enabled: false, price_usd: null, price_rush: null, is_active: false, expires_at: null, started_at: null };
  }

  const price_usd = creator.channel_pass_price_usd ? parseFloat(creator.channel_pass_price_usd) : null;
  const price_rush = price_usd !== null ? Math.ceil(price_usd * RUSH_PER_USD) : null;

  let is_active = false;
  let expires_at = null;
  let started_at = null;

  if (viewerId) {
    const sub = await _getActiveSub(viewerId, creatorId, null);
    if (sub && sub.status === 'active' && sub.expires_at > new Date()) {
      is_active = true;
      expires_at = sub.expires_at;
      started_at = sub.started_at;
    }
  }

  return {
    enabled: creator.channel_pass_enabled === true,
    price_usd,
    price_rush,
    is_active,
    expires_at,
    started_at,
  };
}

/**
 * Purchase a Channel Pass with Ru$h tokens.
 * Runs inside a single pg transaction: debit → upsert subscription → upsert entitlement → insert earnings.
 *
 * @param {{ userId: string, creatorId: string }} opts
 * @returns {Promise<{ success: true, expires_at: Date, new_balance: number, subscription_id: string }>}
 * @throws {{ code: 'PASS_NOT_ENABLED'|'SELF_SUBSCRIBE'|'INSUFFICIENT_FUNDS' }}
 */
async function purchaseWithRush({ userId, creatorId }) {
  userId = String(userId);
  creatorId = String(creatorId);

  if (userId === creatorId) {
    throw { code: 'SELF_SUBSCRIBE', message: 'You cannot subscribe to your own channel.' };
  }

  const creator = await _getCreatorPassRow(creatorId);
  if (!creator || !creator.channel_pass_enabled || !creator.channel_pass_price_usd) {
    throw { code: 'PASS_NOT_ENABLED', message: 'This creator has not enabled Channel Pass.' };
  }

  const price_usd = parseFloat(creator.channel_pass_price_usd);
  const amount_rush = Math.ceil(price_usd * RUSH_PER_USD);
  const price_usd_cents = Math.round(price_usd * 100);

  // Determine existing sub for extend-vs-new logic (outside tx — read-only).
  const existingSub = await _getActiveSub(userId, creatorId, null);
  const now = new Date();
  const isExtension = existingSub &&
    existingSub.status === 'active' &&
    existingSub.expires_at > now;

  const newExpiresAt = isExtension
    ? new Date(existingSub.expires_at.getTime() + 30 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime()      + 30 * 24 * 60 * 60 * 1000);

  const startedAt = isExtension ? existingSub.started_at : now;

  const client = await getClient();
  let subscription_id;
  let new_balance;

  try {
    await client.query('BEGIN');

    // Debit Ru$h — this will throw { code: 'INSUFFICIENT_FUNDS' } if short.
    const ledger = await tokenLedger.debit({
      userId,
      amount: amount_rush,
      reason: 'membership_purchase',
      sourceType: 'channel_pass',
      sourceId: creatorId,
      allowGifted: false,
      externalClient: client,
    });
    new_balance = ledger.balance_after;

    // Upsert creator_subscriptions.
    // UNIQUE(creator_id, subscriber_id) — ON CONFLICT updates expires_at + status.
    const subRes = await client.query(
      `INSERT INTO creator_subscriptions
         (creator_id, subscriber_id, status, price_usd, started_at, expires_at, auto_renew, payment_id)
       VALUES ($1::text, $2::text, 'active', $3, $4, $5, false, NULL)
       ON CONFLICT (creator_id, subscriber_id) DO UPDATE
         SET status     = 'active',
             price_usd  = EXCLUDED.price_usd,
             expires_at = $5,
             auto_renew = false,
             cancelled_at = NULL
       RETURNING id, expires_at, started_at`,
      [creatorId, userId, price_usd, startedAt, newExpiresAt]
    );
    const sub = subRes.rows[0];
    subscription_id = sub.id;

    // Upsert user_entitlements.
    // UNIQUE NULLS NOT DISTINCT (user_id, add_on_id, creator_id) — safe ON CONFLICT.
    await client.query(
      `INSERT INTO user_entitlements
         (user_id, add_on_id, creator_id, source_plan_id, source_payment_id,
          is_lifetime, is_consumed, granted_at, expires_at)
       VALUES ($1::text, 'creator-subscription', $2::text, NULL, NULL,
               false, false, NOW(), $3)
       ON CONFLICT (user_id, add_on_id, creator_id) DO UPDATE
         SET expires_at       = EXCLUDED.expires_at,
             is_consumed      = false,
             updated_at       = NOW()`,
      [userId, creatorId, newExpiresAt]
    );

    // Insert creator_earnings (70/30, holding for EARNINGS_HOLD_HOURS).
    const amountCreator  = parseFloat((price_usd * CREATOR_REVENUE_RATE).toFixed(2));
    const amountPlatform = parseFloat((price_usd * PLATFORM_COMMISSION_RATE).toFixed(2));
    await client.query(
      `INSERT INTO creator_earnings
         (creator_id, subscription_id, amount_gross, amount_creator, amount_platform,
          status, is_tip, period_month, available_at, metadata)
       VALUES ($1::text, $2::uuid, $3, $4, $5,
               'holding', false, date_trunc('month', NOW()),
               NOW() + ($6 || ' hours')::interval,
               $7::jsonb)`,
      [
        creatorId,
        subscription_id,
        price_usd,
        amountCreator,
        amountPlatform,
        String(EARNINGS_HOLD_HOURS),
        JSON.stringify({ source: 'channel_pass', subscriber_id: userId }),
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // Re-throw INSUFFICIENT_FUNDS and our own codes transparently.
    if (err && (err.code === 'INSUFFICIENT_FUNDS' || err.code === 'PASS_NOT_ENABLED' || err.code === 'SELF_SUBSCRIBE')) {
      throw err;
    }
    logger.error('[channelPassService] purchaseWithRush tx error', { userId, creatorId, error: err.message });
    throw { code: 'INTERNAL_ERROR', message: 'Channel pass purchase failed. Please try again.' };
  } finally {
    client.release();
  }

  // Invalidate entitlement cache for this viewer+creator pair.
  cache.del(`channel_pass:${userId}:${creatorId}`).catch(() => {});

  // Fire-and-forget: Zoho Books revenue log.
  const buyerRes = await query(
    `SELECT username, email FROM users WHERE id = $1::text LIMIT 1`,
    [userId]
  ).catch(() => ({ rows: [] }));
  const buyer = buyerRes.rows[0] || {};
  zohoBooks.logRevenue({
    buyerUserId:    userId,
    buyerEmail:     buyer.email || null,
    buyerUsername:  buyer.username || null,
    sku:            `Channel Pass — @${creator.username || creatorId}`,
    priceCents:     price_usd_cents,
    provider:       'wallet_rush',
    reference:      `channel_pass:${subscription_id}`,
    notes:          `Subscriber @${buyer.username || userId} → @${creator.username || creatorId}`,
  }).catch((e) => logger.warn('[channelPassService] zohoBooks fire-and-forget failed', { error: e.message }));

  // Fire-and-forget: Slack ping to creator's #ext-<handle> channel.
  _postChannelPassSlackPing({
    creatorId,
    subscriberUsername: buyer.username || userId,
    priceUsd:   price_usd,
    expiresAt:  newExpiresAt,
  }).catch((e) => logger.warn('[channelPassService] Slack ping fire-and-forget failed', { error: e.message }));

  return { success: true, expires_at: newExpiresAt, new_balance, subscription_id };
}

/**
 * Purchase a Channel Pass via fiat / crypto hosted-link providers.
 * wallet_usdc is stubbed alongside the others because `initiateWalletCheckout`
 * from walletCheckoutService ties entitlement fulfillment to a webhook confirmation
 * path that also needs the channel-pass fulfillment branch wired in webhookController.
 * All four providers return NOT_IMPLEMENTED_YET until that wiring is complete.
 *
 * @param {{ userId: string, creatorId: string, provider: string }} opts
 * @returns {Promise<{ code: 'NOT_IMPLEMENTED_YET', detail: string }>}
 */
async function purchaseWithFiat({ userId, creatorId, provider }) {
  logger.warn('[channelPassService] purchaseWithFiat stub called', { userId, creatorId, provider });
  return {
    code: 'NOT_IMPLEMENTED_YET',
    detail: `Wire the ${provider} webhook handler to call fulfillChannelPassFromPayment(), then remove this stub.`,
  };
}

/**
 * Fast entitlement check — Redis-cached for 60 s.
 * Returns true if userId holds an active (non-expired) Channel Pass for creatorId.
 *
 * @param {string} userId
 * @param {string} creatorId
 * @returns {Promise<boolean>}
 */
async function checkActiveEntitlement(userId, creatorId) {
  if (!userId || !creatorId) return false;
  const cacheKey = `channel_pass:${userId}:${creatorId}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached !== null) return cached === '1';
  } catch (_) { /* Redis failure falls through to DB */ }

  try {
    const { rows } = await query(
      `SELECT 1 FROM user_entitlements
       WHERE user_id    = $1::text
         AND add_on_id  = 'creator-subscription'
         AND creator_id = $2::text
         AND is_consumed = false
         AND (is_lifetime = true OR (expires_at IS NOT NULL AND expires_at > NOW()))
       LIMIT 1`,
      [String(userId), String(creatorId)]
    );
    const result = rows.length > 0;
    cache.set(cacheKey, result ? '1' : '0', ENTITLEMENT_CACHE_TTL).catch(() => {});
    return result;
  } catch (err) {
    logger.error('[channelPassService] checkActiveEntitlement DB error', { userId, creatorId, error: err.message });
    return false;
  }
}

/**
 * Update a creator's Channel Pass settings.
 * Enforces: price must be 5–50, enabled=true requires priceUsd.
 *
 * @param {{ creatorId: string, enabled: boolean, priceUsd: number|null }} opts
 * @returns {Promise<{ enabled: boolean, price_usd: number|null }>}
 */
async function setCreatorPassSettings({ creatorId, enabled, priceUsd }) {
  creatorId = String(creatorId);
  const isEnabled = Boolean(enabled);

  if (isEnabled) {
    const price = parseFloat(priceUsd);
    if (!Number.isFinite(price) || price < 5 || price > 50) {
      throw { code: 'INVALID_PRICE', message: 'Price must be between $5.00 and $50.00 when Channel Pass is enabled.' };
    }
    await query(
      `UPDATE users
       SET channel_pass_enabled = true,
           channel_pass_price_usd = $2
       WHERE id = $1::text`,
      [creatorId, price]
    );
    return { enabled: true, price_usd: price };
  } else {
    await query(
      `UPDATE users
       SET channel_pass_enabled = false
       WHERE id = $1::text`,
      [creatorId]
    );
    return { enabled: false, price_usd: null };
  }
}

/**
 * List all Channel Pass subscriptions for a user (for MySubscriptions page).
 *
 * @param {string} userId
 * @returns {Promise<Array<{
 *   subscription_id: string,
 *   creator_id: string,
 *   creator_username: string,
 *   creator_avatar: string|null,
 *   price_usd: number,
 *   started_at: Date,
 *   expires_at: Date,
 *   status: string,
 *   days_left: number,
 * }>>}
 */
async function listUserPasses(userId) {
  const { rows } = await query(
    `SELECT
       cs.id            AS subscription_id,
       cs.creator_id,
       cs.price_usd,
       cs.started_at,
       cs.expires_at,
       cs.status,
       cs.cancelled_at,
       u.username       AS creator_username,
       u.photo_file_id  AS creator_avatar,
       GREATEST(0, EXTRACT(EPOCH FROM (cs.expires_at - NOW())) / 86400)::int AS days_left
     FROM creator_subscriptions cs
     JOIN users u ON u.id = cs.creator_id
     WHERE cs.subscriber_id = $1::text
     ORDER BY cs.expires_at DESC`,
    [String(userId)]
  );
  return rows.map((r) => ({
    subscription_id:  r.subscription_id,
    creator_id:       r.creator_id,
    creator_username: r.creator_username,
    creator_avatar:   r.creator_avatar || null,
    price_usd:        parseFloat(r.price_usd),
    started_at:       r.started_at,
    expires_at:       r.expires_at,
    status:           r.status,
    days_left:        r.days_left || 0,
  }));
}

/**
 * Cancel a Channel Pass subscription.
 * Sets auto_renew=false + cancelled_at=NOW(). Access continues until expires_at.
 *
 * @param {{ userId: string, subscriptionId: string }} opts
 * @returns {Promise<{ expires_at: Date }>}
 */
async function cancelPass({ userId, subscriptionId }) {
  const { rows } = await query(
    `UPDATE creator_subscriptions
     SET auto_renew   = false,
         cancelled_at = NOW()
     WHERE id          = $1::uuid
       AND subscriber_id = $2::text
       AND status        = 'active'
     RETURNING expires_at`,
    [subscriptionId, String(userId)]
  );
  if (!rows[0]) {
    throw { code: 'NOT_FOUND', message: 'Active subscription not found.' };
  }
  return { expires_at: rows[0].expires_at };
}

// ---------------------------------------------------------------------------
// Slack ping helper (fire-and-forget only — never throws)
// ---------------------------------------------------------------------------

/**
 * Post a Channel Pass activation message to the creator's #ext-<handle> channel.
 * Uses slackCreatorNotifyService._postToCreator pattern via notifyNewSubscriber
 * with a custom message shape adapted for Channel Pass.
 *
 * @param {{ creatorId: string, subscriberUsername: string, priceUsd: number, expiresAt: Date }} opts
 */
async function _postChannelPassSlackPing({ creatorId, subscriberUsername, priceUsd, expiresAt }) {
  try {
    const expiresStr = expiresAt instanceof Date
      ? expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : String(expiresAt);

    // notifyNewSubscriber posts to the creator's slack_channel_id via _postToCreator.
    // We pass a custom subscriberUsername to override the display text.
    await slackCreatorNotify.notifyNewSubscriber(creatorId, {
      subscriberUsername: `@${subscriberUsername} (Channel Pass $${priceUsd}/mo — access until ${expiresStr})`,
    });
  } catch (err) {
    logger.warn('[channelPassService] SLACK_PING_STUB channel_pass_activated', {
      creatorId,
      subscriberUsername,
      error: err.message,
    });
  }
}

module.exports = {
  getCreatorPassInfo,
  purchaseWithRush,
  purchaseWithFiat,
  checkActiveEntitlement,
  setCreatorPassSettings,
  listUserPasses,
  cancelPass,
};
