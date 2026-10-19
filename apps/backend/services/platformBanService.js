'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

// Max accounts allowed from one IP before registration is blocked.
const MAX_ACCOUNTS_PER_IP = 3;

// How far back (and how many) IPs from user_access_logs are snapshotted into
// a ban's evidence. Kept bounded: the table has millions of rows.
const OBSERVED_IP_WINDOW_DAYS = 90;
const OBSERVED_IP_LIMIT = 50;

const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

/**
 * Canonical mailbox for an email so aliases of one inbox compare equal:
 *   - lowercase + trim
 *   - drop "+tag" sub-addressing (all providers)
 *   - Gmail: drop dots in the local part, googlemail.com → gmail.com
 * Returns null for anything that isn't an email.
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf('@');
  if (at <= 0 || at === clean.length - 1) return null;
  let local = clean.slice(0, at).split('+')[0];
  let domain = clean.slice(at + 1);
  if (GMAIL_DOMAINS.includes(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  if (!local) return null;
  return `${local}@${domain}`;
}

/**
 * SQL twin of normalizeEmail() for a column reference. Lets us compare against
 * stored emails without a migration (platform_bans is small, so the
 * expression costs nothing).
 */
function normalizedEmailSql(col) {
  const lc = `lower(trim(${col}))`;
  return `(CASE WHEN split_part(${lc}, '@', 2) IN ('gmail.com', 'googlemail.com')
    THEN replace(split_part(split_part(${lc}, '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE split_part(split_part(${lc}, '@', 1), '+', 1) || '@' || split_part(${lc}, '@', 2) END)`;
}

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
        `SELECT id, user_id, telegram_id, username, reason FROM platform_bans
         WHERE is_active = true
           AND (
             user_id = ANY($1::text[])
             OR telegram_id = ANY($1::text[])
             OR email = ANY($1::text[])
             OR pnptv_id = ANY($1::text[])
             OR x_id = ANY($1::text[])
           )
         LIMIT 1`,
        [ids]
      ).catch(() => null);
      if (pb?.rows?.length > 0) return { ...pb.rows[0], group_id: 'global' };

      // Same inbox under another alias (john.doe+2@gmail.com for a banned
      // johndoe@gmail.com) — the same person coming back with a "new" email.
      const normalized = normalizeEmail(email);
      if (normalized) {
        const alias = await query(
          `SELECT id, user_id, telegram_id, username, reason FROM platform_bans
           WHERE is_active = true AND email IS NOT NULL
             AND ${normalizedEmailSql('email')} = $1
           LIMIT 1`,
          [normalized]
        ).catch(() => null);
        if (alias?.rows?.length > 0) {
          logger.warn('PlatformBanService: email alias of a banned account', { banId: alias.rows[0].id });
          return { ...alias.rows[0], group_id: 'global', matched_by: 'email_alias' };
        }
      }

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

  static async ban({ userId, reason, bannedBy, evidence } = {}) {
    try {
      const res = await query(
        `INSERT INTO banned_users (user_id, group_id, reason, banned_by, banned_at)
         VALUES ($1, 'global', $2, $3, NOW())
         ON CONFLICT (user_id, group_id) DO UPDATE SET reason = $2, banned_at = NOW()
         RETURNING *`,
        [String(userId), reason || 'Platform violation', bannedBy || 'system']
      ).catch(() => null);

      // Mirror into platform_bans with every identity vector we can find, so
      // the case can later be matched against other accounts (ban evasion).
      await PlatformBanService.recordBanCase({ userId, reason, bannedBy, evidence });

      return res?.rows?.[0] || { user_id: userId, group_id: 'global' };
    } catch (err) {
      logger.error('Error in PlatformBanService.ban:', err);
      return null;
    }
  }

  /**
   * Snapshot a banned account into platform_bans: its ids, email, username
   * and the IPs it was seen on. Observed IPs go into evidence.observed_ips —
   * NOT known_ips — because known_ips hard-blocks registration and a shared
   * mobile/VPN IP must not lock out innocent people. Observed IPs are only
   * used to flag linked accounts for human review (banEvasionService).
   *
   * Idempotent: if an active case already exists for the account it is left
   * as is. Never throws.
   */
  static async recordBanCase({ userId, reason, bannedBy, evidence } = {}) {
    if (!userId) return null;
    const id = String(userId);
    try {
      const existing = await query(
        `SELECT id FROM platform_bans
         WHERE is_active = true AND (user_id = $1 OR telegram_id = $1)
         LIMIT 1`,
        [id]
      );
      if (existing.rows.length > 0) return existing.rows[0];

      const userRes = await query(
        `SELECT id, username, email, telegram, pnptv_id, x_id, atproto_did,
                terms_accepted_ip, content_disclaimer_accepted_ip, privacy_accepted_ip
         FROM users
         WHERE id::text = $1 OR telegram::text = $1 OR pnptv_id::text = $1
         LIMIT 1`,
        [id]
      ).catch(() => ({ rows: [] }));
      const user = userRes.rows[0] || {};

      const accountIds = [id, user.id, user.pnptv_id].filter(Boolean).map(String);
      const ipRes = await query(
        `SELECT ip_address FROM user_access_logs
         WHERE user_id = ANY($1::text[])
           AND created_at > NOW() - ($2 || ' days')::interval
         GROUP BY ip_address
         ORDER BY MAX(created_at) DESC
         LIMIT $3`,
        [accountIds, String(OBSERVED_IP_WINDOW_DAYS), OBSERVED_IP_LIMIT]
      ).catch(() => ({ rows: [] }));

      const observedIps = [...new Set([
        ...ipRes.rows.map(r => r.ip_address),
        user.terms_accepted_ip,
        user.content_disclaimer_accepted_ip,
        user.privacy_accepted_ip,
      ].filter(Boolean).map(ip => String(ip).replace(/^::ffff:/, '')))];

      const telegramId = [user.telegram, id].map(v => (v == null ? '' : String(v)))
        .find(v => /^\d+$/.test(v)) || null;

      const inserted = await query(
        `INSERT INTO platform_bans
           (user_id, telegram_id, pnptv_id, email, username, x_id, atproto_did,
            reason, evidence, banned_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
         RETURNING id`,
        [
          user.id ? String(user.id) : id,
          telegramId,
          user.pnptv_id ? String(user.pnptv_id) : null,
          user.email || null,
          user.username || null,
          user.x_id ? String(user.x_id) : null,
          user.atproto_did || null,
          reason || 'Platform violation',
          JSON.stringify({ ...(evidence || {}), observed_ips: observedIps }),
          bannedBy || 'system',
        ]
      );
      return inserted.rows[0] || null;
    } catch (err) {
      logger.error('PlatformBanService.recordBanCase error:', { userId: id, error: err.message });
      return null;
    }
  }
}

PlatformBanService.normalizeEmail = normalizeEmail;
PlatformBanService.normalizedEmailSql = normalizedEmailSql;

module.exports = PlatformBanService;
