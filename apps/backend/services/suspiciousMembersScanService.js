'use strict';

/**
 * suspiciousMembersScanService.js
 *
 * Nightly scan (default 08:00 America/Bogota) that pulls quantitative
 * behavioral signals for the top-N users and posts a triage summary to the
 * Slack channel SLACK_CHANNEL_SUSPICIOUS_REVIEW. Human decides — this
 * service NEVER auto-bans, kicks, or silences.
 *
 * Design principles (learned from the 2026-08-09 CLOUDYDAYSPNPTV mislabel):
 *   - Signals are raw counts, not interpretations. The Slack post shows
 *     what triggered so a reviewer can judge, not "USER IS BAD".
 *   - Adult-platform context: dirty talk between consenting adults, PNP
 *     nicknames, and age-verification questions ("how old are you sir?")
 *     are baseline behavior — signals are calibrated to catch pattern,
 *     not vocabulary.
 *   - Lexicon signal is weight-1 (of a max total ~10) so it never
 *     dominates — per Santino approval 2026-08-09.
 *
 * Signals (all windowed to last N days unless noted):
 *   S1 Off-platform funnel ratio (creators only)
 *   S2 Blocked by others
 *   S3 User-reports received (any status)
 *   S4 DM velocity to strangers (24h window)
 *   S5 Slur/harassment lexicon in DMs [WEIGHT 1]
 *   S6 New account (<7d) + ≥3 hangouts created
 *   S7 Failed payment attempts ≥5 with zero successes
 *
 * Silencing: keys like `pnpapp:suspicious:silenced:<user_id>` skip a user
 * for the TTL — the Slack Slash Command interactive button sets this.
 */

const cron = require('node-cron');
const { query } = require('../config/postgres');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

const CHANNEL_ID = process.env.SLACK_CHANNEL_SUSPICIOUS_REVIEW || null;
const BOT_TOKEN  = process.env.SLACK_BOT_TOKEN || null;
const RUN_LOCK_KEY = 'pnpapp:suspicious:run_lock';   // one run per day per window
const SILENCE_PREFIX = 'pnpapp:suspicious:silenced:';

// Regexes for signal 1 (compiled once).
const OFF_PLATFORM_RE = /(telegram|@dougie|@dougiekyle|signal\.me|wa\.me|whatsapp|kik\b|snapchat|snap\.io)/i;
const ON_PLATFORM_RE  = /(pnptv|ru\$h|rush 💎|prime|main[- ]?stage)/i;

// Slur/harassment lexicon for signal 5 — deliberately tiny and centered on
// unambiguous slurs used against non-consenting recipients (not on dirty
// talk lexicon that lives inside kink hangouts by consent). Reviewers must
// still read context.
const LEX = /\b(faggot|kike|nigger|nigga|tranny|retard|kill yourself|kys\b|die in|nonce|paedo|pedo)\b/i;

async function _isSilenced(userId) {
  try { return !!(await cache.get(SILENCE_PREFIX + String(userId))); }
  catch { return false; }
}

/**
 * Signal 1: off-platform funnel ratio for creators.
 * Returns {offCount, onCount, ratioFlagged}.
 * ratioFlagged=true when off ≥ 10 and off/on ≥ 4 (or on == 0).
 */
async function _s1_offPlatformRatio(userId, windowDays) {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN content ~* $2 THEN 1 ELSE 0 END), 0)::int AS off_count,
       COALESCE(SUM(CASE WHEN content ~* $3 THEN 1 ELSE 0 END), 0)::int AS on_count
       FROM (
         SELECT content FROM direct_messages
           WHERE sender_id = $1 AND created_at > NOW() - ($4 || ' days')::interval
         UNION ALL
         SELECT content FROM social_posts
           WHERE user_id = $1 AND is_deleted = false AND created_at > NOW() - ($4 || ' days')::interval
       ) all_text`,
    [String(userId), OFF_PLATFORM_RE.source, ON_PLATFORM_RE.source, String(windowDays)]
  );
  const offCount = rows[0]?.off_count || 0;
  const onCount  = rows[0]?.on_count  || 0;
  const ratioFlagged = offCount >= 10 && (onCount === 0 || (offCount / Math.max(1, onCount)) >= 4);
  return { offCount, onCount, ratioFlagged };
}

async function _s2_blockedByOthers(userId, windowDays) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM blocked_users
       WHERE blocked_user_id = $1 AND blocked_at > NOW() - ($2 || ' days')::interval`,
    [String(userId), String(windowDays)]
  );
  return rows[0]?.n || 0;
}

async function _s3_reportsReceived(userId, windowDays) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM user_reports
       WHERE reported_user_id = $1 AND created_at > NOW() - ($2 || ' days')::interval`,
    [String(userId), String(windowDays)]
  );
  return rows[0]?.n || 0;
}

async function _s4_dmVelocityStrangers(userId) {
  // DMs in last 24h to unique recipients with whom the sender does NOT share
  // any hangout membership. Spam signal — normal community members almost
  // never DM 30+ strangers/day.
  const { rows } = await query(
    `SELECT COUNT(DISTINCT dm.recipient_id)::int AS n
       FROM direct_messages dm
      WHERE dm.sender_id = $1
        AND dm.created_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM hangout_group_members hgm1
           JOIN hangout_group_members hgm2 ON hgm1.group_id = hgm2.group_id
           WHERE hgm1.user_id = dm.sender_id
             AND hgm2.user_id = dm.recipient_id
        )`,
    [String(userId)]
  );
  return rows[0]?.n || 0;
}

async function _s5_lexiconHits(userId, windowDays) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM direct_messages
       WHERE sender_id = $1 AND created_at > NOW() - ($2 || ' days')::interval
         AND content ~* $3`,
    [String(userId), String(windowDays), LEX.source]
  );
  return rows[0]?.n || 0;
}

async function _s6_newAccountManyHangouts(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT (u.created_at > NOW() - INTERVAL '7 days') FROM users u WHERE u.id = $1) AS is_new,
       (SELECT COUNT(*)::int FROM hangout_groups WHERE creator_id = $1) AS hangout_count`,
    [String(userId)]
  );
  const r = rows[0] || {};
  const flag = r.is_new === true && (r.hangout_count || 0) >= 3;
  return { isNew: r.is_new === true, hangoutCount: r.hangout_count || 0, flag };
}

async function _s7_failedPayments(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM checkout_intents WHERE user_id = $1 AND status = 'failed') AS failed,
       (SELECT COUNT(*)::int FROM checkout_intents WHERE user_id = $1 AND status = 'confirmed') AS confirmed`,
    [String(userId)]
  );
  const r = rows[0] || {};
  const flag = (r.failed || 0) >= 5 && (r.confirmed || 0) === 0;
  return { failed: r.failed || 0, confirmed: r.confirmed || 0, flag };
}

/**
 * Compute signals for one user + return a score summary.
 * Weight sums to a rough 0-10 scale (S5 lexicon weighted 1 max).
 */
async function scanUser(userId, { windowDays = 30 } = {}) {
  const [meta, s1, s2, s3, s4, s5, s6, s7] = await Promise.all([
    query(`SELECT id, username, first_name, tier, creator_status, role FROM users WHERE id = $1`, [String(userId)]),
    _s1_offPlatformRatio(userId, windowDays),
    _s2_blockedByOthers(userId, windowDays),
    _s3_reportsReceived(userId, windowDays),
    _s4_dmVelocityStrangers(userId),
    _s5_lexiconHits(userId, windowDays),
    _s6_newAccountManyHangouts(userId),
    _s7_failedPayments(userId),
  ]);
  const user = meta.rows[0];
  if (!user) return null;
  const isCreator = user.creator_status === 'active';

  const signals = [];
  if (isCreator && s1.ratioFlagged) {
    signals.push({ key: 'off_platform_funnel', weight: 2, detail: `${s1.offCount} off-platform mentions vs ${s1.onCount} on-platform (creator)` });
  }
  if (s2 >= 5) {
    signals.push({ key: 'blocked_by_others', weight: 2, detail: `blocked by ${s2} users in ${windowDays}d` });
  }
  if (s3 >= 2) {
    signals.push({ key: 'reports_received', weight: 2, detail: `${s3} user reports received in ${windowDays}d` });
  }
  if (s4 >= 30) {
    signals.push({ key: 'dm_velocity_strangers', weight: 3, detail: `${s4} unique stranger recipients DMed in 24h` });
  }
  if (s5 >= 3) {
    signals.push({ key: 'lexicon_hits', weight: 1, detail: `${s5} slur/harassment lexicon hits in DMs (context required)` });
  }
  if (s6.flag) {
    signals.push({ key: 'new_account_many_hangouts', weight: 2, detail: `account <7d old + ${s6.hangoutCount} hangouts created` });
  }
  if (s7.flag) {
    signals.push({ key: 'failed_payments', weight: 1, detail: `${s7.failed} failed checkout attempts, 0 successful` });
  }

  const score = signals.reduce((a, s) => a + s.weight, 0);
  return { user, score, signals, windowDays };
}

/**
 * Bulk scan: find candidate user_ids that hit ANY signal threshold in a
 * cheap pre-filter query, then run per-user scan on the shortlist. This
 * keeps the whole-DB sweep to a couple of index scans instead of one
 * query per user.
 */
async function _candidateUsers({ windowDays }) {
  const { rows } = await query(
    `WITH candidates AS (
       -- s2 blocks
       SELECT blocked_user_id::text AS user_id FROM blocked_users
         WHERE blocked_at > NOW() - ($1 || ' days')::interval
         GROUP BY blocked_user_id HAVING COUNT(*) >= 5
       UNION
       -- s3 reports
       SELECT reported_user_id::text AS user_id FROM user_reports
         WHERE created_at > NOW() - ($1 || ' days')::interval
         GROUP BY reported_user_id HAVING COUNT(*) >= 2
       UNION
       -- s4 stranger DM velocity (loose pre-filter — full check per user later)
       SELECT sender_id::text AS user_id FROM direct_messages
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY sender_id HAVING COUNT(DISTINCT recipient_id) >= 30
       UNION
       -- s5 lexicon
       SELECT sender_id::text AS user_id FROM direct_messages
         WHERE created_at > NOW() - ($1 || ' days')::interval
           AND content ~* $2
         GROUP BY sender_id HAVING COUNT(*) >= 3
       UNION
       -- s6 new account + ≥3 hangouts
       SELECT u.id::text AS user_id FROM users u
         WHERE u.created_at > NOW() - INTERVAL '7 days'
           AND (SELECT COUNT(*) FROM hangout_groups WHERE creator_id = u.id) >= 3
       UNION
       -- s7 failed payments
       SELECT ci.user_id::text FROM checkout_intents ci
         GROUP BY ci.user_id
         HAVING COUNT(*) FILTER (WHERE status='failed') >= 5
            AND COUNT(*) FILTER (WHERE status='confirmed') = 0
       UNION
       -- s1 creator off-platform ratio pre-filter
       SELECT dm.sender_id::text AS user_id FROM direct_messages dm
         JOIN users u ON u.id::text = dm.sender_id::text
         WHERE u.creator_status = 'active'
           AND dm.created_at > NOW() - ($1 || ' days')::interval
           AND dm.content ~* $3
         GROUP BY dm.sender_id HAVING COUNT(*) >= 10
     )
     SELECT DISTINCT user_id FROM candidates`,
    [String(windowDays), LEX.source, OFF_PLATFORM_RE.source]
  );
  return rows.map(r => r.user_id);
}

async function runDailyScan({ windowDays = 30, dryRun = false } = {}) {
  const started = Date.now();
  logger.info('[suspicious] scan starting', { windowDays, dryRun });

  const candidates = await _candidateUsers({ windowDays });
  logger.info('[suspicious] candidate shortlist', { count: candidates.length });

  const flagged = [];
  for (const userId of candidates) {
    if (await _isSilenced(userId)) continue;
    const res = await scanUser(userId, { windowDays }).catch((err) => {
      logger.warn('[suspicious] per-user scan failed', { userId, error: err.message });
      return null;
    });
    if (res && res.score >= 2 && res.signals.length > 0) flagged.push(res);
  }
  flagged.sort((a, b) => b.score - a.score);
  const top = flagged.slice(0, 10);

  if (!dryRun) {
    try { await _postToSlack(top, { windowDays }); }
    catch (err) { logger.error('[suspicious] Slack post failed', { error: err.message }); }
  }

  const durationMs = Date.now() - started;
  logger.info('[suspicious] scan complete', {
    candidates: candidates.length, flagged: flagged.length, posted: top.length, durationMs,
  });
  return { candidates: candidates.length, flagged: flagged.length, top, durationMs };
}

async function _postToSlack(flaggedTop, { windowDays }) {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    logger.warn('[suspicious] Slack not configured — set SLACK_BOT_TOKEN + SLACK_CHANNEL_SUSPICIOUS_REVIEW');
    return;
  }
  if (flaggedTop.length === 0) {
    await _slackChatPostMessage({ text: `:white_check_mark: Suspicious scan clean — 0 flags today (window ${windowDays}d).` });
    return;
  }
  const header = `:rotating_light: *Suspicious scan* — ${flaggedTop.length} user${flaggedTop.length === 1 ? '' : 's'} flagged (window ${windowDays}d)`;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: header } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '_Signals are raw counts. Reviewer decides — no auto-actions._' }] },
    { type: 'divider' },
  ];
  for (const f of flaggedTop) {
    const nameLine = `*<https://pnptv.app/u/${encodeURIComponent(f.user.username || '')}|${f.user.username || f.user.id}>*` +
      `  · role ${f.user.role || '—'}${f.user.creator_status === 'active' ? ' · creator' : ''}` +
      ` · score *${f.score}*`;
    const sigLines = f.signals.map(s => `• \`${s.key}\` (w${s.weight}) — ${s.detail}`).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${nameLine}\n${sigLines}` },
    });
  }
  const fallback = `Suspicious scan: ${flaggedTop.length} flagged`;
  await _slackChatPostMessage({ text: fallback, blocks });
}

async function _slackChatPostMessage(payload) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: CHANNEL_ID, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Slack chat.postMessage ${res.status}: ${data.error || 'unknown'}`);
  }
}

/**
 * Register a daily cron: 08:00 America/Bogota (13:00 UTC). Idempotent
 * across restarts via a Redis day-lock so a container restart at 08:03
 * doesn't fire a duplicate scan.
 */
function start() {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    logger.warn('[suspicious] scheduler NOT started — SLACK_BOT_TOKEN or SLACK_CHANNEL_SUSPICIOUS_REVIEW missing');
    return;
  }
  cron.schedule('0 13 * * *', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const lockKey = `${RUN_LOCK_KEY}:${today}`;
    const acquired = await cache.setNX(lockKey, '1', 60 * 60 * 20).catch(() => false);
    if (!acquired) {
      logger.info('[suspicious] scan already ran today — skipping');
      return;
    }
    try { await runDailyScan({ windowDays: 30 }); }
    catch (err) { logger.error('[suspicious] daily scan errored', { error: err.message, stack: err.stack }); }
  });
  logger.info('[suspicious] daily scan scheduled — 08:00 America/Bogota (13:00 UTC)');
}

module.exports = {
  start,
  runDailyScan,
  scanUser,
};
