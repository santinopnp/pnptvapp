'use strict';

/**
 * complianceService.js
 *
 * - Removal requests: TAKE IT DOWN Act (non-consensual intimate imagery,
 *   48-hour removal) and other complaints from depicted people (7 business
 *   days, card-network rules). See migrations/437_takedown_ncmec_legal_holds.sql.
 * - NCMEC cases: 18 U.S.C. § 2258A CyberTipline reporting + 1-year evidence
 *   preservation for apparent CSAM.
 * - Legal holds: accounts whose data the law requires us to keep (2257
 *   records, NCMEC evidence) cannot be hard-deleted.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const NCII_DEADLINE_HOURS = 48;
const COMPLAINT_DEADLINE_BUSINESS_DAYS = 7;
const NCMEC_PRESERVE_DAYS = 365;

const MAX_URLS = 20;
const MAX_TEXT = 4000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function addBusinessDays(from, days) {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function dueAtFor(kind, now = new Date()) {
  return kind === 'ncii'
    ? new Date(now.getTime() + NCII_DEADLINE_HOURS * 3600 * 1000)
    : addBusinessDays(now, COMPLAINT_DEADLINE_BUSINESS_DAYS);
}

function _clip(v, max = MAX_TEXT) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Validates and stores a public removal request.
 *
 * @returns {Promise<{ ok: true, id: string, dueAt: string } | { error: string }>}
 */
async function createRemovalRequest(body = {}, { ip } = {}) {
  const kind = body.kind === 'ncii' ? 'ncii' : body.kind === 'complaint' ? 'complaint' : null;
  if (!kind) return { error: 'invalid_kind' };

  const name = _clip(body.name, 200);
  const email = _clip(body.email, 320);
  const signature = _clip(body.signature, 200);
  const description = _clip(body.description);
  const urls = (Array.isArray(body.contentUrls) ? body.contentUrls : String(body.contentUrls || '').split(/\s+/))
    .map((u) => _clip(String(u), 2000))
    .filter(Boolean)
    .slice(0, MAX_URLS);

  if (!name) return { error: 'name_required' };
  if (!EMAIL_RE.test(email)) return { error: 'valid_email_required' };
  if (!urls.length) return { error: 'content_urls_required' };
  if (!signature) return { error: 'signature_required' };
  // TAKE IT DOWN Act § 3(a)(1)(B): the request must include a good-faith
  // statement that the depiction is not consensual.
  if (kind === 'ncii' && body.goodFaith !== true) return { error: 'good_faith_statement_required' };

  const dueAt = dueAtFor(kind);
  const { rows } = await query(
    `INSERT INTO removal_requests
       (kind, requester_name, requester_email, is_depicted_person, content_urls,
        description, signature, good_faith_statement, due_at, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, due_at`,
    [kind, name, email, body.isDepictedPerson === true, urls, description || null,
     signature, body.goodFaith === true, dueAt, ip || null]
  );

  logger.warn('[Compliance] removal request received', { id: rows[0].id, kind, dueAt: rows[0].due_at });
  return { ok: true, id: rows[0].id, dueAt: new Date(rows[0].due_at).toISOString() };
}

async function listRemovalRequests({ status = 'open', limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT *, (status = 'open' AND due_at < NOW()) AS overdue
       FROM removal_requests
      WHERE ($1::text = 'all' OR status = $1)
      ORDER BY (status = 'open') DESC, due_at ASC
      LIMIT $2`,
    [status, Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)]
  );
  return rows;
}

async function resolveRemovalRequest(id, adminId, { action, note } = {}) {
  if (!['removed', 'rejected'].includes(action)) {
    throw Object.assign(new Error('action must be removed or rejected'), { status: 400 });
  }
  const { rows } = await query(
    `UPDATE removal_requests
        SET status = $2, resolution_note = $3, resolved_by = $4, resolved_at = NOW()
      WHERE id = $1 AND status = 'open'
      RETURNING *`,
    [id, action, _clip(note) || null, String(adminId)]
  );
  if (!rows[0]) throw Object.assign(new Error('Request not found or already resolved'), { status: 404 });
  logger.info('[Compliance] removal request resolved', { id, action, adminId, late: new Date() > new Date(rows[0].due_at) });
  return rows[0];
}

/** Opens a case for every CSAM user report; never throws into the caller. */
async function openNcmecCase(report) {
  try {
    await query(
      `INSERT INTO ncmec_cases (user_report_id, reported_user_id, evidence_type, evidence_id)
       VALUES ($1, $2, $3, $4)`,
      [report.id != null ? String(report.id) : null, String(report.reported_user_id),
       report.evidence_type || null, report.evidence_id != null ? String(report.evidence_id) : null]
    );
    logger.error('[Compliance] NCMEC case opened — review and report to CyberTipline', {
      userReportId: report.id, reportedUserId: report.reported_user_id,
    });
  } catch (err) {
    logger.error('[Compliance] failed to open NCMEC case', { userReportId: report?.id, error: err.message });
  }
}

async function listNcmecCases({ status = 'pending_review', limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT * FROM ncmec_cases
      WHERE ($1::text = 'all' OR status = $1)
      ORDER BY created_at ASC
      LIMIT $2`,
    [status, Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)]
  );
  return rows;
}

async function updateNcmecCase(id, adminId, { status, cybertipReportId, notes } = {}) {
  if (!['reported', 'not_csam'].includes(status)) {
    throw Object.assign(new Error('status must be reported or not_csam'), { status: 400 });
  }
  if (status === 'reported' && !_clip(cybertipReportId, 64)) {
    throw Object.assign(new Error('cybertipReportId is required when reported'), { status: 400 });
  }
  const { rows } = await query(
    `UPDATE ncmec_cases
        SET status = $2::text,
            cybertip_report_id = $3,
            reported_at    = CASE WHEN $2::text = 'reported' THEN NOW() ELSE NULL END,
            preserve_until = CASE WHEN $2::text = 'reported' THEN NOW() + ($6::int * INTERVAL '1 day') ELSE NULL END,
            notes = COALESCE($4, notes),
            handled_by = $5
      WHERE id = $1 AND status = 'pending_review'
      RETURNING *`,
    [id, status, _clip(cybertipReportId, 64) || null, _clip(notes) || null, String(adminId), NCMEC_PRESERVE_DAYS]
  );
  if (!rows[0]) throw Object.assign(new Error('Case not found or already handled'), { status: 404 });
  logger.info('[Compliance] NCMEC case updated', { id, status, adminId });
  return rows[0];
}

/**
 * Reasons the law requires keeping this user's data. Empty array = no hold.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function getLegalHolds(userId) {
  const { rows } = await query(
    `SELECT
       EXISTS (SELECT 1 FROM creator_2257_records WHERE user_id = $1) AS has_2257,
       EXISTS (SELECT 1 FROM ncmec_cases
                WHERE reported_user_id = $1
                  AND (status = 'pending_review' OR (status = 'reported' AND preserve_until > NOW()))) AS has_ncmec`,
    [String(userId)],
    { cache: false }
  );
  const holds = [];
  if (rows[0]?.has_2257) holds.push('2257_records');
  if (rows[0]?.has_ncmec) holds.push('ncmec_evidence');
  return holds;
}

module.exports = {
  NCII_DEADLINE_HOURS,
  COMPLAINT_DEADLINE_BUSINESS_DAYS,
  addBusinessDays,
  dueAtFor,
  createRemovalRequest,
  listRemovalRequests,
  resolveRemovalRequest,
  openNcmecCase,
  listNcmecCases,
  updateNcmecCase,
  getLegalHolds,
};
