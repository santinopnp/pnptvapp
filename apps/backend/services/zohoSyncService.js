'use strict';

/**
 * zohoSyncService.js
 *
 * Syncs PNPtv creators → Zoho CRM Contacts. Called by:
 *   - Nightly cron (08:00 UTC = 03:00 America/Bogota) — delta mode
 *   - Manual one-shot: seed-zoho-contacts.js — full sweep
 *
 * Design notes:
 *   - Idempotent via Zoho upsert keyed by PNPtv_ID custom field.
 *   - Delta mode syncs users updated_at > NOW() - 25h + any creator with
 *     earnings activity in the last 25h (so earnings/subs stay fresh even
 *     when the user row doesn't change).
 *   - Legal package fields (Legal_Package_Version, Legal_Package_URL,
 *     Legal_Package_Acknowledged_At) added to schema 2026-08-09 —
 *     env vars LEGAL_PACKAGE_VERSION + LEGAL_PACKAGE_URL feed them.
 *   - Fire-and-forget style: failures are logged, not thrown, so a Zoho
 *     outage never crashes the bot.
 */

const cron = require('node-cron');
const { query } = require('../config/postgres');
const zoho = require('./zohoService');
const logger = require('../utils/logger');

const BASE_URL = process.env.WEBAPP_URL || 'https://pnptv.app';
const LEGAL_VERSION = process.env.LEGAL_PACKAGE_VERSION || 'v1.0-2026-08-07-DRAFT';
const LEGAL_URL = process.env.LEGAL_PACKAGE_URL || 'https://pnptv.app/docs/legal/creator/';
const BATCH_SIZE = 100;

function tierFor(row) {
  if (row.role === 'superadmin' || row.role === 'admin') return 'co_founder';
  if (row.role === 'star') return 'star';
  // Crystal Creator is a premium sub-tier of creator — surface it in the picklist
  // so segmentation ("all Crystal Creators") is a one-click filter in Zoho.
  if (row.crystal_creator_active) return 'crystal_creator';
  if (row.creator_status === 'approved' || row.creator_status === 'active' || row.role === 'creator' || row.performer_status === 'active') return 'creator';
  return null;
}

// Zoho v2 API rejects the entire record if it contains a custom field that
// doesn't exist in the module. The 6 tier fields below (Crystal_*, PNPtv_Fam*,
// Whale_Pig) must be created in Zoho CRM → Contacts BEFORE flipping this flag.
// See docs comment at bottom of file for the exact spec.
const TIER_FIELDS_READY = process.env.ZOHO_SYNC_TIER_FIELDS === '1';

/**
 * @param {object} opts
 * @param {boolean} [opts.delta=false] — when true, restrict to creators
 *   whose row changed OR who had earnings activity in the last 25h.
 */
async function _loadCreators({ delta = false, mode = 'creators' } = {}) {
  const deltaWhere = delta ? `
    AND (
      u.updated_at > NOW() - INTERVAL '25 hours'
      OR EXISTS (
        SELECT 1 FROM creator_earnings ce2
         WHERE ce2.creator_id = u.id AND ce2.created_at > NOW() - INTERVAL '25 hours'
      )
      OR EXISTS (
        SELECT 1 FROM creator_subscriptions cs2
         WHERE cs2.creator_id = u.id AND cs2.updated_at > NOW() - INTERVAL '25 hours'
      )
    )` : '';

  const scopeWhere = mode === 'all-with-email'
    ? `u.email IS NOT NULL AND u.email <> ''`
    : `(
      u.creator_status IN ('approved','active')
      OR u.role IN ('creator','admin','superadmin','star')
      OR p.status = 'active'
    )`;

  const { rows } = await query(`
    SELECT
      u.id, u.first_name, u.last_name, u.email, u.username,
      u.role, u.creator_status, u.creator_type, u.bio, u.city, u.country,
      u.slack_legal_ack_at,
      u.crystal_creator_active_until,
      u.crystal_creator_invited_at,
      u.is_pnptv_fam,
      u.pnptv_fam_since,
      u.is_whale_pig,
      u.application_submitted_at,
      u.application_reviewed_at,
      u.application_rejection_reason,
      u.creator_onboarded_at,
      u.creator_suspended_at,
      u.identity_verified,
      (
        u.crystal_creator_active_until IS NOT NULL
        AND (
          u.crystal_creator_active_until::text IN ('infinity','Infinity')
          OR u.crystal_creator_active_until > NOW()
        )
      ) AS crystal_creator_active,
      COALESCE(p.status, 'none') AS performer_status,
      COALESCE(SUM(ce.amount_creator) FILTER (
        WHERE ce.status IN ('available','paid_out','holding')
      ), 0)::numeric AS lifetime_earnings,
      COALESCE(SUM(ce.amount_creator) FILTER (
        WHERE ce.status IN ('available','paid_out','holding')
          AND ce.created_at >= date_trunc('month', NOW())
      ), 0)::numeric AS month_earnings,
      COALESCE(sub.active_count, 0) AS active_subs,
      EXISTS (
        SELECT 1 FROM creator_2257_records r
         WHERE r.user_id = u.id AND r.verification_status='approved'
      ) AS verified_2257,
      (
        SELECT (verified_at + INTERVAL '1 year')::date
          FROM creator_2257_records r
         WHERE r.user_id = u.id AND r.verification_status='approved'
         ORDER BY verified_at DESC LIMIT 1
      ) AS verify_expiry
    FROM users u
    LEFT JOIN performers p ON p.user_id = u.id
    LEFT JOIN creator_earnings ce ON ce.creator_id = u.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS active_count
        FROM creator_subscriptions cs
       WHERE cs.creator_id = u.id AND cs.status='active'
    ) sub ON true
    WHERE ${scopeWhere}
    ${deltaWhere}
    GROUP BY u.id, p.status, sub.active_count
    ORDER BY u.id
  `);
  return rows;
}

function _toZohoContact(row) {
  const tier = tierFor(row);
  const isCreator = tier === 'creator' || tier === 'star' || tier === 'co_founder';
  const c = {
    PNPtv_ID: String(row.id),
    First_Name: (row.first_name || '').slice(0, 40) || 'PNPtv',
    Last_Name: (row.last_name || row.username || row.first_name || 'Member').slice(0, 80),
    Email: row.email || null,
    Telegram_ID: String(row.id),
    Telegram_Handle: row.username || null,
    Creator_Tier: tier,
    Content_Types: row.creator_type || null,
    Total_Lifetime_Earnings_USD: Number(row.lifetime_earnings) || 0,
    Monthly_Earnings_USD: Number(row.month_earnings) || 0,
    Active_Subscribers: Number(row.active_subs) || 0,
    Verified_2257: !!row.verified_2257,
    Verification_Expires: row.verify_expiry
      ? new Date(row.verify_expiry).toISOString().slice(0, 10)
      : null,
    Is_Performer: row.performer_status === 'active',
    Profile_URL: `${BASE_URL}/profile/${row.id}`,
    Mailing_City: row.city || null,
    Mailing_Country: row.country || null,
    Description: (row.bio || '').slice(0, 32000) || null,
  };
  if (isCreator) {
    c.Legal_Package_Version = LEGAL_VERSION;
    c.Legal_Package_URL = LEGAL_URL;
    c.Legal_Package_Acknowledged_At = row.slack_legal_ack_at
      ? new Date(row.slack_legal_ack_at).toISOString()
      : null;
  }
  // Tier fields — only emitted when Zoho custom fields exist (env flag). Zoho
  // v2 rejects the whole record if it contains unknown fields, so keep off
  // until the fields are created in the workspace.
  if (TIER_FIELDS_READY) {
    const u = row.crystal_creator_active_until;
    const isInfinity = u && (String(u) === 'infinity' || String(u) === 'Infinity');
    c.Crystal_Creator = !!row.crystal_creator_active;
    c.Crystal_Active_Until = u && !isInfinity
      ? new Date(u).toISOString().slice(0, 10)  // Zoho Date field = YYYY-MM-DD
      : null;
    c.Crystal_Invited = !!row.crystal_creator_invited_at;
    c.PNPtv_Fam = !!row.is_pnptv_fam;
    c.PNPtv_Fam_Since = row.pnptv_fam_since
      ? new Date(row.pnptv_fam_since).toISOString()
      : null;
    c.Whale_Pig = !!row.is_whale_pig;

    // ── Creator application lifecycle (7 fields, added 2026-09-01) ─────────
    // Derived Application_Status collapses SQL creator_status + 2257 state
    // into a single Zoho picklist for segmentation:
    //   Applied → row exists in model_applications / creator_enrollments but
    //             not yet reviewed (creator_status='pending_review' or app row
    //             created after app_submitted_at with no reviewed_at)
    //   Under_Review → docs submitted + admin has started but not finalized
    //   Approved → creator_status='approved_hold' or 'active'
    //   Rejected → last review outcome was reject (application_rejection_reason set + not currently active)
    //   Suspended → creator_status='suspended'
    //   Not_Applied → default for non-applicants
    let applicationStatus = 'Not_Applied';
    if (row.creator_status === 'suspended') applicationStatus = 'Suspended';
    else if (row.creator_status === 'active' || row.creator_status === 'approved_hold') applicationStatus = 'Approved';
    else if (row.creator_status === 'pending_review') applicationStatus = 'Under_Review';
    else if (row.application_rejection_reason && !row.creator_status?.startsWith('app')) applicationStatus = 'Rejected';
    else if (row.application_submitted_at) applicationStatus = 'Applied';

    c.Application_Status = applicationStatus;
    c.Application_Submitted_At = row.application_submitted_at
      ? new Date(row.application_submitted_at).toISOString() : null;
    c.Application_Reviewed_At = row.application_reviewed_at
      ? new Date(row.application_reviewed_at).toISOString() : null;
    c.Application_Rejection_Reason = row.application_rejection_reason || null;

    // Documents_Status = simple projection of 2257 state
    let docsStatus = 'Missing';
    if (row.identity_verified === true) docsStatus = 'Approved';
    else if (row.verified_2257 === true) docsStatus = 'Approved';
    else if (row.application_submitted_at && !row.identity_verified) docsStatus = 'Pending';
    c.Documents_Status = docsStatus;

    c.Creator_Onboarded_At = row.creator_onboarded_at
      ? new Date(row.creator_onboarded_at).toISOString() : null;
    c.Creator_Suspended_At = row.creator_suspended_at
      ? new Date(row.creator_suspended_at).toISOString() : null;
  }
  return c;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.delta=false]
 * @param {boolean} [opts.dryRun=false] — log only, do not write
 * @returns {Promise<{total:number, batches:number, upserted:number, failed:number, errors:string[]}>}
 */
async function runSync({ delta = false, dryRun = false, mode = 'creators' } = {}) {
  if (!zoho.isConfigured()) {
    logger.warn('[zohoSync] skipped — Zoho not configured');
    return { total: 0, batches: 0, upserted: 0, failed: 0, errors: ['not configured'] };
  }

  const started = Date.now();
  const rows = await _loadCreators({ delta, mode });
  logger.info('[zohoSync] loaded users', { count: rows.length, delta, dryRun, mode });

  const stats = { total: rows.length, batches: 0, upserted: 0, failed: 0, errors: [] };
  if (rows.length === 0) {
    logger.info('[zohoSync] nothing to sync');
    return stats;
  }

  const contacts = rows.map(_toZohoContact);

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    stats.batches++;
    if (dryRun) {
      logger.info('[zohoSync] dry-run batch', { batchNum: stats.batches, size: batch.length });
      continue;
    }
    try {
      const results = await zoho.bulkUpsert('Contacts', batch, ['PNPtv_ID']);
      for (const r of results) {
        if (r.status === 'success') stats.upserted++;
        else {
          stats.failed++;
          stats.errors.push(`${r.code || 'ERR'}: ${JSON.stringify(r.details).slice(0, 100)}`);
        }
      }
    } catch (err) {
      stats.failed += batch.length;
      stats.errors.push(err.message);
      logger.error('[zohoSync] batch failed', { batchNum: stats.batches, error: err.message });
    }
  }

  const durationMs = Date.now() - started;
  logger.info('[zohoSync] complete', { ...stats, durationMs, delta, dryRun });
  return stats;
}

/**
 * Nightly delta sync — 08:00 UTC = 03:00 America/Bogota (low-traffic window).
 * No-op if Zoho isn't configured. Errors are logged, never thrown.
 */
function start() {
  if (!zoho.isConfigured()) {
    logger.warn('[zohoSync] scheduler not started — Zoho not configured');
    return;
  }
  cron.schedule('0 8 * * *', async () => {
    try { await runSync({ delta: true }); }
    catch (err) { logger.error('[zohoSync] nightly errored', { error: err.message }); }
  });
  logger.info('[zohoSync] nightly delta sync scheduled — 08:00 UTC (03:00 America/Bogota)');
}

/**
 * Sync ONE user immediately — called from activation hooks (Crystal pass
 * activated, Whale Pig / PNPtv Fam toggled) so Zoho reflects the change
 * within seconds instead of waiting for the nightly delta. Fire-and-forget:
 * failures are logged, never thrown.
 *
 * @param {string} userId
 */
async function syncOneUser(userId) {
  if (!zoho.isConfigured()) return;
  try {
    const { rows } = await query(`
      SELECT
        u.id, u.first_name, u.last_name, u.email, u.username,
        u.role, u.creator_status, u.creator_type, u.bio, u.city, u.country,
        u.slack_legal_ack_at,
        u.crystal_creator_active_until,
        u.crystal_creator_invited_at,
        u.is_pnptv_fam,
        u.pnptv_fam_since,
        u.is_whale_pig,
        u.application_submitted_at,
        u.application_reviewed_at,
        u.application_rejection_reason,
        u.creator_onboarded_at,
        u.creator_suspended_at,
        u.identity_verified,
        (
          u.crystal_creator_active_until IS NOT NULL
          AND (
            u.crystal_creator_active_until::text IN ('infinity','Infinity')
            OR u.crystal_creator_active_until > NOW()
          )
        ) AS crystal_creator_active,
        COALESCE(p.status, 'none') AS performer_status,
        COALESCE(SUM(ce.amount_creator) FILTER (WHERE ce.status IN ('available','paid_out','holding')), 0)::numeric AS lifetime_earnings,
        COALESCE(SUM(ce.amount_creator) FILTER (WHERE ce.status IN ('available','paid_out','holding') AND ce.created_at >= date_trunc('month', NOW())), 0)::numeric AS month_earnings,
        COALESCE(sub.active_count, 0) AS active_subs,
        EXISTS (SELECT 1 FROM creator_2257_records r WHERE r.user_id = u.id AND r.verification_status='approved') AS verified_2257,
        (SELECT (verified_at + INTERVAL '1 year')::date FROM creator_2257_records r WHERE r.user_id = u.id AND r.verification_status='approved' ORDER BY verified_at DESC LIMIT 1) AS verify_expiry
      FROM users u
      LEFT JOIN performers p ON p.user_id = u.id
      LEFT JOIN creator_earnings ce ON ce.creator_id = u.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS active_count FROM creator_subscriptions cs
         WHERE cs.creator_id = u.id AND cs.status='active'
      ) sub ON true
      WHERE u.id = $1
      GROUP BY u.id, p.status, sub.active_count
    `, [String(userId)]);
    if (!rows.length) return;
    const contact = _toZohoContact(rows[0]);
    const result = await zoho.upsertContactByPnptvId(String(userId), contact);
    logger.info('[zohoSync] single-user sync', { userId, action: result?.action || 'skipped' });
  } catch (err) {
    logger.warn('[zohoSync] single-user sync failed (non-fatal)', { userId, error: err.message });
  }
}

module.exports = { runSync, start, syncOneUser };
