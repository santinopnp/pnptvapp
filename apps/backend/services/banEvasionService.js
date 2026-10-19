'use strict';

/**
 * banEvasionService.js
 *
 * Uses the platform's own banned cases (platform_bans) as the rule base to
 * find accounts that look like a banned person coming back:
 *
 *   identity   same Telegram / X / pnptv id as a ban that isn't blocking it
 *   email      same inbox under another alias (gmail dots, +tags)
 *   ip         seen on an IP the banned account used (known_ips or the
 *              evidence.observed_ips snapshot taken at ban time)
 *
 * Like suspiciousMembersScanService, this NEVER bans anyone. It only returns
 * links with the evidence that produced them so a moderator can decide.
 * IPs shared by many accounts (mobile carrier NAT, VPN exits, venue Wi-Fi)
 * are dropped so they don't drag innocent members into review.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const { normalizeEmail, normalizedEmailSql } = require('./platformBanService');

const IP_WINDOW_DAYS = 90;
// An IP used by more distinct accounts than this is treated as a shared
// network and ignored as evidence.
const SHARED_IP_MAX_USERS = 8;

const MATCH_WEIGHTS = { identity: 3, email_alias: 3, shared_ip: 2 };

// Every IP tied to an active ban: explicit hard-ban IPs + IPs observed at ban time.
const BANNED_IPS_CTE = `
  banned_ips AS (
    SELECT pb.id AS ban_id, ip
      FROM platform_bans pb, unnest(COALESCE(pb.known_ips, '{}')) AS ip
     WHERE pb.is_active = true
    UNION
    SELECT pb.id AS ban_id, ip
      FROM platform_bans pb,
           jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(pb.evidence->'observed_ips') = 'array'
                  THEN pb.evidence->'observed_ips' ELSE '[]'::jsonb END
           ) AS ip
     WHERE pb.is_active = true
  )`;

function _cleanIp(ip) {
  return ip ? String(ip).replace(/^::ffff:/, '') : null;
}

async function _loadUser(userId) {
  const { rows } = await query(
    `SELECT id, username, email, telegram, pnptv_id, x_id,
            terms_accepted_ip, content_disclaimer_accepted_ip, privacy_accepted_ip
       FROM users
      WHERE id::text = $1
      LIMIT 1`,
    [String(userId)]
  );
  return rows[0] || null;
}

async function _userIps(user) {
  const accountIds = [user.id, user.pnptv_id].filter(Boolean).map(String);
  const { rows } = await query(
    `SELECT DISTINCT ip_address FROM user_access_logs
      WHERE user_id = ANY($1::text[])
        AND created_at > NOW() - ($2 || ' days')::interval`,
    [accountIds, String(IP_WINDOW_DAYS)]
  ).catch(() => ({ rows: [] }));
  return [...new Set([
    ...rows.map(r => r.ip_address),
    user.terms_accepted_ip,
    user.content_disclaimer_accepted_ip,
    user.privacy_accepted_ip,
  ].map(_cleanIp).filter(Boolean))];
}

/**
 * Of the given IPs, return the ones used by more than SHARED_IP_MAX_USERS
 * distinct accounts in the window (shared networks).
 */
async function _sharedNetworkIps(ips) {
  if (!ips.length) return new Set();
  const { rows } = await query(
    `SELECT ip_address FROM user_access_logs
      WHERE ip_address = ANY($1::text[])
        AND created_at > NOW() - ($2 || ' days')::interval
      GROUP BY ip_address
     HAVING COUNT(DISTINCT user_id) > $3`,
    [ips, String(IP_WINDOW_DAYS), SHARED_IP_MAX_USERS]
  ).catch(() => ({ rows: [] }));
  return new Set(rows.map(r => r.ip_address));
}

/**
 * Find active bans this user is linked to.
 *
 * @returns {Promise<{user: object, links: Array<{
 *   banId, bannedUserId, bannedUsername, reason, bannedAt,
 *   matches: Array<{type: 'identity'|'email_alias'|'shared_ip', detail: string}>,
 *   weight: number
 * }>} | null>} null when the user doesn't exist.
 */
async function findBanLinks(userId) {
  const user = await _loadUser(userId);
  if (!user) return null;

  const ownIds = [user.id, user.telegram, user.pnptv_id].filter(Boolean).map(String);
  const otherIds = [user.telegram, user.pnptv_id, user.x_id].filter(Boolean).map(String);
  const email = normalizeEmail(user.email);
  const ips = await _userIps(user);

  const { rows } = await query(
    `WITH ${BANNED_IPS_CTE}
     SELECT pb.id, pb.user_id, pb.username, pb.reason, pb.banned_at,
            (pb.telegram_id = ANY($2::text[]) OR pb.pnptv_id = ANY($2::text[])
              OR pb.x_id = ANY($2::text[]))                              AS identity_match,
            ($3::text IS NOT NULL AND pb.email IS NOT NULL
              AND ${normalizedEmailSql('pb.email')} = $3)                AS email_match,
            ARRAY(SELECT DISTINCT bi.ip FROM banned_ips bi
                   WHERE bi.ban_id = pb.id AND bi.ip = ANY($4::text[])) AS shared_ips
       FROM platform_bans pb
      WHERE pb.is_active = true
        -- the user's own ban is not "evasion"
        AND NOT (COALESCE(pb.user_id, '') = ANY($1::text[])
                 OR COALESCE(pb.telegram_id, '') = ANY($1::text[]))
        AND (
          pb.telegram_id = ANY($2::text[]) OR pb.pnptv_id = ANY($2::text[])
          OR pb.x_id = ANY($2::text[])
          OR ($3::text IS NOT NULL AND pb.email IS NOT NULL
              AND ${normalizedEmailSql('pb.email')} = $3)
          OR EXISTS (SELECT 1 FROM banned_ips bi
                      WHERE bi.ban_id = pb.id AND bi.ip = ANY($4::text[]))
        )
      ORDER BY pb.banned_at DESC
      LIMIT 20`,
    [ownIds, otherIds, email, ips]
  );

  const allSharedIps = [...new Set(rows.flatMap(r => r.shared_ips || []))];
  const noisyIps = await _sharedNetworkIps(allSharedIps);

  const links = [];
  for (const r of rows) {
    const matches = [];
    if (r.identity_match) matches.push({ type: 'identity', detail: 'same Telegram/X/pnptv id' });
    if (r.email_match) matches.push({ type: 'email_alias', detail: 'same inbox under another email alias' });
    const ipsHit = (r.shared_ips || []).filter(ip => !noisyIps.has(ip));
    if (ipsHit.length) {
      matches.push({ type: 'shared_ip', detail: `shared IP${ipsHit.length > 1 ? 's' : ''} ${ipsHit.slice(0, 3).join(', ')}` });
    }
    if (!matches.length) continue;
    links.push({
      banId: r.id,
      bannedUserId: r.user_id,
      bannedUsername: r.username,
      reason: r.reason,
      bannedAt: r.banned_at,
      matches,
      weight: Math.max(...matches.map(m => MATCH_WEIGHTS[m.type])),
    });
  }

  return {
    user: { id: user.id, username: user.username },
    links,
  };
}

/**
 * Cheap shortlist for the nightly scan: users seen in the window on an IP
 * tied to an active ban, or whose email is an alias of a banned email.
 * Banned accounts themselves are excluded. findBanLinks() then does the
 * precise per-user check (including the shared-network filter).
 */
async function findCandidateUserIds({ windowDays = 30 } = {}) {
  try {
    const { rows } = await query(
      `WITH ${BANNED_IPS_CTE},
       banned_accounts AS (
         SELECT user_id AS id FROM platform_bans WHERE is_active = true AND user_id IS NOT NULL
         UNION
         SELECT telegram_id FROM platform_bans WHERE is_active = true AND telegram_id IS NOT NULL
       ),
       ip_users AS (
         SELECT l.ip_address, l.user_id::text AS user_id
           FROM (SELECT DISTINCT ip FROM banned_ips) b
           JOIN user_access_logs l ON l.ip_address = b.ip
          WHERE l.created_at > NOW() - ($1 || ' days')::interval
          GROUP BY l.ip_address, l.user_id
       ),
       -- skip shared networks up front so a busy NAT IP doesn't flood the scan
       quiet_ips AS (
         SELECT ip_address FROM ip_users GROUP BY ip_address HAVING COUNT(*) <= $2
       ),
       candidates AS (
         SELECT user_id FROM ip_users
          WHERE ip_address IN (SELECT ip_address FROM quiet_ips)
         UNION
         SELECT u.id::text
           FROM users u
           JOIN platform_bans pb
             ON pb.is_active = true AND pb.email IS NOT NULL AND u.email IS NOT NULL
            AND ${normalizedEmailSql('u.email')} = ${normalizedEmailSql('pb.email')}
          WHERE u.is_deleted IS DISTINCT FROM true
       )
       SELECT DISTINCT c.user_id FROM candidates c
        WHERE c.user_id NOT IN (SELECT id FROM banned_accounts)`,
      [String(windowDays), SHARED_IP_MAX_USERS]
    );
    return rows.map(r => r.user_id);
  } catch (err) {
    logger.warn('[ban-evasion] candidate query failed', { error: err.message });
    return [];
  }
}

module.exports = {
  findBanLinks,
  findCandidateUserIds,
  SHARED_IP_MAX_USERS,
  MATCH_WEIGHTS,
};
