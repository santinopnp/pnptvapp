'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

// Max accounts allowed from one IP before registration is blocked.
const MAX_ACCOUNTS_PER_IP = 3;

class PlatformBanService {
  static async isBanned({ userId, telegramId, pnptvId, email, xId } = {}) {
    try {
      const ids = [userId, telegramId, pnptvId, email, xId].filter(Boolean).map(String);
      if (!ids.length) return null;

      // Check banned_users (fast path — covers accounts still in users table)
      const res = await query(
        `SELECT * FROM banned_users WHERE user_id = ANY($1::text[]) AND group_id = 'global' LIMIT 1`,
        [ids]
      ).catch(() => null);
      if (res?.rows?.length > 0) return res.rows[0];

      // Check platform_bans — catches hard-deleted accounts, Telegram-only bans, and
      // bans entered via the admin panel that weren't mirrored to banned_users.
      const pb = await query(
        `SELECT user_id, telegram_id AS user_id, username, reason FROM platform_bans
         WHERE is_active = true
           AND (
             user_id = ANY($1::text[])
             OR telegram_id = ANY($1::text[])
             OR email = ANY($1::text[])
             OR pnptv_id = ANY($1::text[])
           )
         LIMIT 1`,
        [ids]
      ).catch(() => null);
      if (pb?.rows?.length > 0) return { ...pb.rows[0], group_id: 'global' };

      return null;
    } catch (err) {
      logger.error('Error in PlatformBanService.isBanned:', err);
      return null;
    }
  }

  /**
   * Returns the matching platform_bans row if the IP is explicitly banned,
   * or a synthetic object if the IP has exceeded the per-IP account cap.
   * Returns null if the IP is clean.
   */
  static async isIpBanned(ip) {
    if (!ip) return null;
    // Strip IPv6-mapped IPv4 prefix (e.g. "::ffff:1.2.3.4" → "1.2.3.4")
    const cleanIp = ip.replace(/^::ffff:/, '');
    try {
      // 1. Explicit IP ban in platform_bans.known_ips
      const explicit = await query(
        `SELECT user_id, username, reason FROM platform_bans
         WHERE is_active = true AND $1 = ANY(known_ips)
         LIMIT 1`,
        [cleanIp]
      ).catch(() => null);
      if (explicit?.rows?.length > 0) {
        return { ...explicit.rows[0], group_id: 'global', ip: cleanIp };
      }

      // 2. Per-IP registration cap — block if ≥ MAX_ACCOUNTS_PER_IP accounts already exist
      const countRes = await query(
        `SELECT COUNT(*) AS cnt FROM users
         WHERE (
           terms_accepted_ip = $1
           OR content_disclaimer_accepted_ip = $1
           OR privacy_accepted_ip = $1
         )
         AND is_deleted IS DISTINCT FROM true`,
        [cleanIp]
      ).catch(() => null);
      const count = parseInt(countRes?.rows?.[0]?.cnt || '0', 10);
      if (count >= MAX_ACCOUNTS_PER_IP) {
        logger.warn('PlatformBanService: IP registration cap exceeded', { ip: cleanIp, count });
        return {
          group_id: 'global',
          reason: `IP ${cleanIp} has ${count} existing accounts (cap: ${MAX_ACCOUNTS_PER_IP})`,
          ip: cleanIp,
        };
      }

      return null;
    } catch (err) {
      logger.error('PlatformBanService.isIpBanned error:', err);
      return null;
    }
  }

  static async ban({ userId, reason, bannedBy, duration } = {}) {
    try {
      const res = await query(
        `INSERT INTO banned_users (user_id, group_id, reason, banned_by, banned_at)
         VALUES ($1, 'global', $2, $3, NOW())
         ON CONFLICT (user_id, group_id) DO UPDATE SET reason = $2, banned_at = NOW()
         RETURNING *`,
        [String(userId), reason || 'Platform violation', bannedBy || 'system']
      ).catch(() => null);
      return res?.rows?.[0] || { user_id: userId, group_id: 'global' };
    } catch (err) {
      logger.error('Error in PlatformBanService.ban:', err);
      return null;
    }
  }
}

module.exports = PlatformBanService;
