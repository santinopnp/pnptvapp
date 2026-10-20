'use strict';

/**
 * policyScanService.js
 *
 * Background sweep that runs every user-written text through scanText() no
 * matter which code path wrote it — DMs, chat rooms and hangouts, posts,
 * profiles, album captions, channel videos — and records suspicious ones in
 * policy_flags for Admin → Compliance Queue → Policy flags. It also catches
 * copy-paste blasts: one member sending the same text to many people.
 *
 * It only FLAGS. Strikes come from the real-time guard
 * (services/antiLeakageGuard.js) or from an admin confirming a flag, so a
 * look-back over old messages can never mass-mute members.
 *
 * Admin and superadmin authors are skipped (broadcasts, support replies).
 */

const crypto = require('crypto');
const { query } = require('../config/postgres');
const { scanText } = require('./contentModerationFilter');
const logger = require('../utils/logger');

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_SOURCE = 10;
const BACKFILL_DAYS = 30;
const BLAST_MIN_RECIPIENTS = 8;
const BLAST_MIN_LENGTH = 15;

const WEIGHTS = {
  scam: 12,
  paid_meetup: 10,
  off_platform_services: 10,
  off_platform_payment: 8,
  off_platform_competitor: 8,
  staff_impersonation: 6,
  copy_paste_blast: 5,
  content_sales: 4,
  contact_sharing: 3,
  external_link: 2,
};
const DEFAULT_BLOCK_WEIGHT = 10; // other block-tier categories (drug sales, CSAM language, …)
const CREATOR_MULTIPLIER = 2;

const NOT_ADMIN = `COALESCE(u.role, '') NOT IN ('admin', 'superadmin')`;

// Sources scanned by increasing id. `text` may combine several columns.
const ID_SOURCES = {
  dm: {
    table: 'direct_messages',
    sql: `SELECT m.id, m.sender_id AS user_id, m.recipient_id AS ref, m.content AS text,
                 (u.creator_status = 'active') AS is_creator
            FROM direct_messages m JOIN users u ON u.id = m.sender_id
           WHERE m.id > $1 AND m.content IS NOT NULL AND ${NOT_ADMIN}
           ORDER BY m.id LIMIT $2`,
  },
  chat: {
    table: 'chat_messages',
    sql: `SELECT m.id, m.user_id, m.room AS ref, m.content AS text,
                 (u.creator_status = 'active') AS is_creator
            FROM chat_messages m JOIN users u ON u.id = m.user_id
           WHERE m.id > $1 AND m.content IS NOT NULL AND ${NOT_ADMIN}
           ORDER BY m.id LIMIT $2`,
  },
  post: {
    table: 'social_posts',
    sql: `SELECT p.id, p.user_id, NULL AS ref, p.content AS text,
                 (u.creator_status = 'active') AS is_creator
            FROM social_posts p JOIN users u ON u.id = p.user_id
           WHERE p.id > $1 AND p.content IS NOT NULL AND ${NOT_ADMIN}
           ORDER BY p.id LIMIT $2`,
  },
  album_caption: {
    table: 'creator_media',
    sql: `SELECT c.id, c.creator_id AS user_id, NULL AS ref, c.caption AS text, true AS is_creator
            FROM creator_media c JOIN users u ON u.id = c.creator_id
           WHERE c.id > $1 AND c.caption IS NOT NULL AND ${NOT_ADMIN}
           ORDER BY c.id LIMIT $2`,
  },
};

// Sources scanned by last-modified time, since their text is edited in place.
const TS_SOURCES = {
  profile: {
    table: 'users',
    sql: `SELECT u.id, u.id AS user_id, NULL AS ref, u.updated_at::text AS ts,
                 concat_ws(' \n ', u.username, u.first_name, u.last_name, u.bio) AS text,
                 (u.creator_status = 'active') AS is_creator
            FROM users u
           WHERE u.updated_at > $1::timestamp AND ${NOT_ADMIN}
           ORDER BY u.updated_at LIMIT $2`,
  },
  channel_video: {
    table: 'channel_videos',
    sql: `SELECT v.id, v.uploader_id AS user_id, v.channel_id::text AS ref, v.updated_at::text AS ts,
                 concat_ws(' \n ', v.title, v.description) AS text, true AS is_creator
            FROM channel_videos v JOIN users u ON u.id = v.uploader_id
           WHERE v.updated_at > $1::timestamptz AND ${NOT_ADMIN}
           ORDER BY v.updated_at LIMIT $2`,
  },
};

function scoreHits(hits, isCreator) {
  const cats = [...new Set(hits.map((h) => h.category))];
  const base = cats.reduce(
    (sum, c) => sum + (WEIGHTS[c] ?? (hits.find((h) => h.category === c)?.tier === 'block' ? DEFAULT_BLOCK_WEIGHT : 1)),
    0
  );
  return isCreator ? base * CREATOR_MULTIPLIER : base;
}

function _hash(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 12);
}

async function _recordFlag({ userId, source, sourceId, ref, hits, isCreator, text, extraCategories = [] }) {
  const categories = [...new Set([...extraCategories, ...hits.map((h) => h.category)])];
  const tier = hits.some((h) => h.tier === 'block') ? 'block' : 'flag';
  const score = scoreHits(hits, isCreator) + extraCategories.reduce((s, c) => s + (WEIGHTS[c] || 0), 0);
  const { rowCount } = await query(
    `INSERT INTO policy_flags
       (user_id, source, source_id, source_ref, categories, tier, score, excerpt, matched_terms, is_creator)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     ON CONFLICT (source, source_id) DO NOTHING`,
    [
      String(userId), source, String(sourceId), ref != null ? String(ref).slice(0, 255) : null,
      categories, tier, score, String(text || '').slice(0, 500),
      JSON.stringify(hits.slice(0, 20).map((h) => ({ category: h.category, term: String(h.term).slice(0, 120), tier: h.tier }))),
      !!isCreator,
    ]
  );
  return rowCount;
}

async function _getCursor(source) {
  const { rows } = await query('SELECT last_id, last_ts FROM policy_scan_cursors WHERE source = $1', [source], { cache: false });
  return rows[0] || null;
}

async function _setCursor(source, { lastId = null, lastTs = null }) {
  await query(
    `INSERT INTO policy_scan_cursors (source, last_id, last_ts, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (source) DO UPDATE
       SET last_id = COALESCE(EXCLUDED.last_id, policy_scan_cursors.last_id),
           last_ts = COALESCE(EXCLUDED.last_ts, policy_scan_cursors.last_ts),
           updated_at = NOW()`,
    [source, lastId, lastTs]
  );
}

async function _scanRows(source, rows) {
  let flagged = 0;
  for (const row of rows) {
    const hits = scanText(row.text);
    if (!hits.length) continue;
    const sourceId = source === 'profile' || source === 'channel_video' ? `${row.id}:${_hash(row.text)}` : row.id;
    flagged += await _recordFlag({
      userId: row.user_id, source, sourceId, ref: row.ref, hits, isCreator: row.is_creator, text: row.text,
    });
  }
  return flagged;
}

async function _scanIdSource(source, cfg) {
  let cursor = await _getCursor(source);
  let lastId = cursor?.last_id;
  if (lastId == null) {
    // First run: look back BACKFILL_DAYS rather than the whole history.
    const { rows } = await query(
      `SELECT COALESCE(MIN(id) - 1, (SELECT COALESCE(MAX(id), 0) FROM ${cfg.table})) AS start
         FROM ${cfg.table} WHERE created_at > NOW() - ($1::int * INTERVAL '1 day')`,
      [BACKFILL_DAYS],
      { cache: false }
    );
    lastId = Number(rows[0]?.start || 0);
  }
  let scanned = 0;
  let flagged = 0;
  for (let i = 0; i < MAX_BATCHES_PER_SOURCE; i++) {
    const { rows } = await query(cfg.sql, [lastId, BATCH_SIZE], { cache: false });
    if (!rows.length) break;
    flagged += await _scanRows(source, rows);
    scanned += rows.length;
    lastId = Number(rows[rows.length - 1].id);
    await _setCursor(source, { lastId });
    if (rows.length < BATCH_SIZE) break;
  }
  if (cursor?.last_id == null && !scanned) await _setCursor(source, { lastId });
  return { scanned, flagged };
}

async function _scanTsSource(source, cfg) {
  const cursor = await _getCursor(source);
  let lastTs = cursor?.last_ts
    || new Date(Date.now() - BACKFILL_DAYS * 86400 * 1000).toISOString().replace('T', ' ').replace('Z', '');
  let scanned = 0;
  let flagged = 0;
  for (let i = 0; i < MAX_BATCHES_PER_SOURCE; i++) {
    const { rows } = await query(cfg.sql, [lastTs, BATCH_SIZE], { cache: false });
    if (!rows.length) break;
    flagged += await _scanRows(source, rows);
    scanned += rows.length;
    lastTs = rows[rows.length - 1].ts;
    await _setCursor(source, { lastTs });
    if (rows.length < BATCH_SIZE) break;
  }
  return { scanned, flagged };
}

/**
 * Same text (case and spacing ignored) sent by one member to many people in
 * the last 24 hours: classic scam / spam / funnel-off-platform behaviour.
 */
async function scanBlasts() {
  const { rows } = await query(
    `SELECT m.sender_id AS user_id,
            md5(lower(regexp_replace(m.content, '\\s+', ' ', 'g'))) AS text_hash,
            min(m.content) AS text,
            count(DISTINCT m.recipient_id)::int AS recipients,
            bool_or(u.creator_status = 'active') AS is_creator
       FROM direct_messages m JOIN users u ON u.id = m.sender_id
      WHERE m.created_at > NOW() - INTERVAL '24 hours'
        AND m.content IS NOT NULL AND length(m.content) >= $1
        AND ${NOT_ADMIN}
      GROUP BY m.sender_id, text_hash
     HAVING count(DISTINCT m.recipient_id) >= $2`,
    [BLAST_MIN_LENGTH, BLAST_MIN_RECIPIENTS],
    { cache: false }
  );
  let flagged = 0;
  const day = new Date().toISOString().slice(0, 10);
  for (const r of rows) {
    flagged += await _recordFlag({
      userId: r.user_id,
      source: 'dm_blast',
      sourceId: `blast:${r.user_id}:${r.text_hash.slice(0, 12)}:${day}`,
      ref: `${r.recipients} recipients in 24h`,
      hits: scanText(r.text),
      isCreator: r.is_creator,
      text: r.text,
      extraCategories: ['copy_paste_blast'],
    });
  }
  return { groups: rows.length, flagged };
}

/** One full sweep. Each source is isolated so one failure doesn't stop the rest. */
async function runScan() {
  const summary = {};
  for (const [source, cfg] of Object.entries(ID_SOURCES)) {
    try {
      summary[source] = await _scanIdSource(source, cfg);
    } catch (err) {
      logger.error('[PolicyScan] source failed', { source, error: err.message });
      summary[source] = { error: err.message };
    }
  }
  for (const [source, cfg] of Object.entries(TS_SOURCES)) {
    try {
      summary[source] = await _scanTsSource(source, cfg);
    } catch (err) {
      logger.error('[PolicyScan] source failed', { source, error: err.message });
      summary[source] = { error: err.message };
    }
  }
  try {
    summary.dm_blast = await scanBlasts();
  } catch (err) {
    logger.error('[PolicyScan] blast scan failed', { error: err.message });
    summary.dm_blast = { error: err.message };
  }
  logger.info('[PolicyScan] sweep complete', summary);
  return summary;
}

// ── Admin review ─────────────────────────────────────────────────────────────

/**
 * Open flags grouped by member, creators and highest scores first.
 */
async function listOpenByUser({ limit = 50 } = {}) {
  const { rows } = await query(
    `WITH open AS (
       SELECT * FROM policy_flags WHERE status = 'open'
     ), per_user AS (
       SELECT o.user_id, sum(o.score)::int AS total_score, count(*)::int AS flag_count,
              bool_or(o.is_creator) AS is_creator, max(o.created_at) AS last_at,
              (SELECT array_agg(DISTINCT c) FROM open o2, unnest(o2.categories) AS c
                WHERE o2.user_id = o.user_id) AS categories
         FROM open o
        GROUP BY o.user_id
     )
     SELECT pu.*, u.username, u.first_name, u.role, u.is_active,
            (SELECT count(*)::int FROM anti_leakage_strikes s
              WHERE s.user_id = pu.user_id AND s.cleared = false
                AND s.created_at > NOW() - INTERVAL '30 days') AS strikes_30d,
            (SELECT json_agg(f ORDER BY f.created_at DESC)
               FROM (SELECT id, source, source_ref, categories, tier, score, excerpt, matched_terms, created_at
                       FROM open o WHERE o.user_id = pu.user_id
                      ORDER BY created_at DESC LIMIT 10) f) AS flags
       FROM per_user pu JOIN users u ON u.id = pu.user_id
      ORDER BY pu.is_creator DESC, pu.total_score DESC, pu.last_at DESC
      LIMIT $1`,
    [Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)],
    { cache: false }
  );
  return rows;
}

async function _setStatus(where, params, status, adminId) {
  const { rows } = await query(
    `UPDATE policy_flags SET status = $${params.length + 1}, reviewed_by = $${params.length + 2}, reviewed_at = NOW()
      WHERE status = 'open' AND ${where}
      RETURNING *`,
    [...params, status, String(adminId)]
  );
  return rows;
}

async function dismissFlag(id, adminId) {
  const rows = await _setStatus('id = $1', [id], 'dismissed', adminId);
  if (!rows.length) throw Object.assign(new Error('Flag not found or already reviewed'), { status: 404 });
  return rows[0];
}

async function dismissAllForUser(userId, adminId) {
  return (await _setStatus('user_id = $1', [String(userId)], 'dismissed', adminId)).length;
}

/**
 * Confirms a flag as a real violation. Anti-leakage categories add a strike
 * on the normal ladder (warn → mute → ban/review).
 */
async function confirmFlag(id, adminId) {
  const rows = await _setStatus('id = $1', [id], 'actioned', adminId);
  if (!rows.length) throw Object.assign(new Error('Flag not found or already reviewed'), { status: 404 });
  const flag = rows[0];
  const { ANTI_LEAKAGE_CATEGORIES } = require('./contentModerationFilter');
  const leakageTerms = (flag.matched_terms || []).filter((t) => ANTI_LEAKAGE_CATEGORIES.has(t.category));
  let strike = null;
  if (leakageTerms.length) {
    const WarningService = require('./warningService');
    strike = await WarningService.logAntiLeakageStrike({
      userId: flag.user_id,
      sourceType: 'policy_review',
      sourceRef: `policy_flag:${flag.id}`,
      evidenceText: flag.excerpt || '',
      matchedTerms: leakageTerms,
      issuedBy: String(adminId),
    });
  }
  return { flag, strike };
}

module.exports = {
  WEIGHTS,
  BLAST_MIN_RECIPIENTS,
  scoreHits,
  runScan,
  scanBlasts,
  listOpenByUser,
  dismissFlag,
  dismissAllForUser,
  confirmFlag,
};
