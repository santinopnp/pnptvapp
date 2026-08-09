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
  return 'creator';
}

/**
 * @param {object} opts
 * @param {boolean} [opts.delta=false] — when true, restrict to creators
 *   whose row changed OR who had earnings activity in the last 25h.
 */
async function _loadCreators({ delta = false } = {}) {
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

  const { rows } = await query(`
    SELECT
      u.id, u.first_name, u.last_name, u.email, u.username,
      u.role, u.creator_status, u.creator_type, u.bio, u.city, u.country,
      u.slack_legal_ack_at,
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
    WHERE (
      u.creator_status IN ('approved','active')
      OR u.role IN ('creator','admin','superadmin','star')
      OR p.status = 'active'
    )
    ${deltaWhere}
    GROUP BY u.id, p.status, sub.active_count
    ORDER BY u.id
  `);
  return rows;
}

function _toZohoContact(row) {
  return {
    PNPtv_ID: String(row.id),
    First_Name: (row.first_name || '').slice(0, 40) || 'PNPtv',
    Last_Name: (row.last_name || row.username || row.first_name || 'Creator').slice(0, 80),
    Email: row.email || null,
    Telegram_ID: String(row.id),
    Telegram_Handle: row.username || null,
    Creator_Tier: tierFor(row),
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
    // Legal package fields — schema added 2026-08-09
    Legal_Package_Version: LEGAL_VERSION,
    Legal_Package_URL: LEGAL_URL,
    Legal_Package_Acknowledged_At: row.slack_legal_ack_at
      ? new Date(row.slack_legal_ack_at).toISOString()
      : null,
  };
}

/**
 * @param {object} opts
 * @param {boolean} [opts.delta=false]
 * @param {boolean} [opts.dryRun=false] — log only, do not write
 * @returns {Promise<{total:number, batches:number, upserted:number, failed:number, errors:string[]}>}
 */
async function runSync({ delta = false, dryRun = false } = {}) {
  if (!zoho.isConfigured()) {
    logger.warn('[zohoSync] skipped — Zoho not configured');
    return { total: 0, batches: 0, upserted: 0, failed: 0, errors: ['not configured'] };
  }

  const started = Date.now();
  const rows = await _loadCreators({ delta });
  logger.info('[zohoSync] loaded creators', { count: rows.length, delta, dryRun });

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

module.exports = { runSync, start };
