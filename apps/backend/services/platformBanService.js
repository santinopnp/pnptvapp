const { query } = require('../config/postgres');
const logger = require('../utils/logger');

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

  static async isIpBanned(ip) {
    return false;
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
