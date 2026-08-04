'use strict';

/**
 * adminCreatorBalanceController.js
 *
 * Admin-only endpoints for viewing and managing a creator's balance ledger:
 * - view creator_earnings + totals + recent creator_payouts
 * - manual credit / debit of earnings (with reason)
 * - void an earnings row
 * - release holding earnings early
 * - view + append admin notes (stored in metadata)
 *
 * Every action writes an audit trail row into subscription_audit_log.
 */

const logger = require('../../../utils/logger');
const { query, getClient } = require('../../../config/postgres');

const authAdmin = (req, res) => {
  const u = req.session?.user;
  if (!u) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const role = (u.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') { res.status(403).json({ error: 'Admin only' }); return null; }
  return u;
};

async function audit(adminId, targetUserId, action, metadata) {
  try {
    await query(
      `INSERT INTO subscription_audit_log (subscription_id, actor_id, action, metadata, created_at)
       VALUES (NULL, $1, $2, $3::jsonb, now())`,
      [String(adminId), `creator_balance.${action}`, JSON.stringify({ targetUserId: String(targetUserId), ...(metadata || {}) })]
    );
  } catch (err) {
    logger.warn('adminCreatorBalance.audit failed (non-fatal)', { err: err.message });
  }
}

// GET /api/webapp/admin/creators/:id/balance — totals + last 50 ledger rows + last 20 payouts
async function getBalance(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const creatorId = String(req.params.id);

  const [totals, earnings, payouts, withdrawReqs] = await Promise.all([
    query(
      `SELECT
         COALESCE(SUM(amount_creator) FILTER (WHERE status='available'),0)   AS available_usd,
         COALESCE(SUM(amount_creator) FILTER (WHERE status='holding'),0)     AS holding_usd,
         COALESCE(SUM(amount_creator) FILTER (WHERE status='pending'),0)     AS pending_usd,
         COALESCE(SUM(amount_creator) FILTER (WHERE status='paid_out'),0)    AS paidout_usd,
         COALESCE(SUM(amount_creator) FILTER (WHERE status='void'),0)        AS void_usd,
         COALESCE(SUM(amount_creator) FILTER (WHERE status='in_payout'),0)   AS inpayout_usd,
         COUNT(*) AS row_count
       FROM creator_earnings WHERE creator_id = $1`,
      [creatorId]
    ),
    query(
      `SELECT id, amount_gross, amount_creator, amount_platform, status,
              subscription_id, source_payment_id, is_tip, created_at, available_at, paid_at, metadata
       FROM creator_earnings
       WHERE creator_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [creatorId]
    ),
    query(
      `SELECT id, amount_usd, method, status, created_at, completed_at, notes, address, currency
       FROM creator_payouts
       WHERE creator_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [creatorId]
    ),
    query(
      `SELECT id, amount_usd, destination_currency, destination_address, status,
              earning_ids, requested_at, reviewed_at, completed_at, admin_notes, deny_reason
       FROM creator_withdraw_requests
       WHERE creator_id = $1
       ORDER BY requested_at DESC LIMIT 20`,
      [creatorId]
    ),
  ]);

  return res.json({
    success: true,
    creator_id: creatorId,
    totals: totals.rows[0],
    earnings: earnings.rows,
    payouts: payouts.rows,
    withdraw_requests: withdrawReqs.rows,
  });
}

// POST /api/webapp/admin/creators/:id/credit — { amountUsd, reason, isTip? }
async function creditManual(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const creatorId = String(req.params.id);
  const amountUsd = parseFloat(req.body?.amountUsd);
  const reason = String(req.body?.reason || '').trim();
  const isTip = !!req.body?.isTip;

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: 'amountUsd must be > 0' });
  if (!reason) return res.status(400).json({ error: 'reason required' });

  const { rows } = await query(
    `INSERT INTO creator_earnings (creator_id, amount_gross, amount_creator, amount_platform, status, available_at, period_month, is_tip, metadata)
     VALUES ($1, $2, $2, 0, 'available', now(), date_trunc('month', CURRENT_DATE), $3, $4::jsonb)
     RETURNING id, amount_creator, status`,
    [creatorId, amountUsd, isTip, JSON.stringify({ admin_credit: true, reason, actor: String(admin.id) })]
  );
  await audit(admin.id, creatorId, 'credit_manual', { amountUsd, reason, earningId: rows[0].id });
  return res.json({ success: true, earning: rows[0] });
}

// POST /api/webapp/admin/creators/:id/void/:earningId — { reason }
async function voidEarning(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const creatorId = String(req.params.id);
  const earningId = String(req.params.earningId);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'reason required' });

  const { rows } = await query(
    `UPDATE creator_earnings
       SET status = 'void',
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE id = $1 AND creator_id = $2
       AND status IN ('pending','holding','available')
     RETURNING id, amount_creator, status`,
    [earningId, creatorId, JSON.stringify({ voided_by: String(admin.id), void_reason: reason, voided_at: new Date().toISOString() })]
  );
  if (!rows.length) return res.status(404).json({ error: 'Earning not found or not voidable' });
  await audit(admin.id, creatorId, 'void', { earningId, reason, amount: rows[0].amount_creator });
  return res.json({ success: true, earning: rows[0] });
}

// POST /api/webapp/admin/creators/:id/release-hold/:earningId — flip holding → available now
async function releaseHold(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const creatorId = String(req.params.id);
  const earningId = String(req.params.earningId);
  const reason = String(req.body?.reason || 'admin_early_release').trim();

  const { rows } = await query(
    `UPDATE creator_earnings
       SET status = 'available', available_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE id = $1 AND creator_id = $2 AND status = 'holding'
     RETURNING id, amount_creator, status`,
    [earningId, creatorId, JSON.stringify({ released_by: String(admin.id), release_reason: reason, released_at: new Date().toISOString() })]
  );
  if (!rows.length) return res.status(404).json({ error: 'Earning not found or not in holding' });
  await audit(admin.id, creatorId, 'release_hold', { earningId, reason, amount: rows[0].amount_creator });
  return res.json({ success: true, earning: rows[0] });
}

// POST /api/webapp/admin/creators/:id/note — { note }; appended to a synthetic metadata blob
async function addNote(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const creatorId = String(req.params.id);
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(400).json({ error: 'note required' });
  await audit(admin.id, creatorId, 'note', { note });
  return res.json({ success: true });
}

// GET /api/webapp/admin/creators/:id/audit — recent audit rows for this creator
async function getAudit(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const creatorId = String(req.params.id);
  const { rows } = await query(
    `SELECT id, actor_id, action, metadata, created_at
     FROM subscription_audit_log
     WHERE action LIKE 'creator_balance.%'
       AND (metadata->>'targetUserId' = $1)
     ORDER BY created_at DESC LIMIT 100`,
    [creatorId]
  );
  return res.json({ success: true, audit: rows });
}

// GET /api/webapp/admin/creators/withdraw-requests?status=pending
async function listWithdrawRequests(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const status = req.query.status ? String(req.query.status) : null;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE wr.status = $1`; }
  const { rows } = await query(
    `SELECT wr.id, wr.creator_id, u.username, u.first_name,
            wr.amount_usd, wr.destination_currency, wr.destination_address,
            wr.status, wr.earning_ids, wr.admin_notes, wr.deny_reason,
            wr.requested_at, wr.reviewed_at, wr.completed_at
     FROM creator_withdraw_requests wr
     LEFT JOIN users u ON u.id = wr.creator_id
     ${where}
     ORDER BY wr.requested_at DESC LIMIT 200`,
    params
  );
  return res.json({ success: true, requests: rows });
}

// POST /api/webapp/admin/creators/withdraw-requests/:reqId/approve — { notes? }
async function approveWithdrawRequest(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const reqId = String(req.params.reqId);
  const notes = String(req.body?.notes || '').trim();

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: wrRows } = await client.query(
      `SELECT id, creator_id, earning_ids, status FROM creator_withdraw_requests
       WHERE id = $1 FOR UPDATE`,
      [reqId]
    );
    if (!wrRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Request not found' }); }
    if (wrRows[0].status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: `Cannot approve — status is ${wrRows[0].status}` }); }

    // Move earnings into in_payout status so they can't be double-spent
    if (wrRows[0].earning_ids && wrRows[0].earning_ids.length) {
      await client.query(
        `UPDATE creator_earnings SET status = 'in_payout'
         WHERE id = ANY($1::uuid[]) AND creator_id = $2 AND status = 'available'`,
        [wrRows[0].earning_ids, wrRows[0].creator_id]
      );
    }

    await client.query(
      `UPDATE creator_withdraw_requests
         SET status = 'approved', reviewed_at = now(), reviewed_by = $2, admin_notes = COALESCE($3, admin_notes)
       WHERE id = $1`,
      [reqId, String(admin.id), notes || null]
    );
    await client.query('COMMIT');
    await audit(admin.id, wrRows[0].creator_id, 'approve_withdraw', { reqId, notes });
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('approveWithdrawRequest error', { err: err.message });
    return res.status(500).json({ error: 'Failed to approve request' });
  } finally { client.release(); }
}

// POST /api/webapp/admin/creators/withdraw-requests/:reqId/deny — { reason }
async function denyWithdrawRequest(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const reqId = String(req.params.reqId);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'reason required' });

  const { rows } = await query(
    `UPDATE creator_withdraw_requests
       SET status = 'denied', reviewed_at = now(), reviewed_by = $2, deny_reason = $3
     WHERE id = $1 AND status IN ('pending','approved')
     RETURNING creator_id`,
    [reqId, String(admin.id), reason]
  );
  if (!rows.length) return res.status(404).json({ error: 'Request not found or not deniable' });
  await audit(admin.id, rows[0].creator_id, 'deny_withdraw', { reqId, reason });
  return res.json({ success: true });
}

// POST /api/webapp/admin/creators/withdraw-requests/:reqId/mark-paid — { payoutId?, notes? }
async function markWithdrawPaid(req, res) {
  const admin = authAdmin(req, res); if (!admin) return;
  const reqId = String(req.params.reqId);
  const payoutId = req.body?.payoutId ? String(req.body.payoutId) : null;
  const notes = String(req.body?.notes || '').trim();

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: wrRows } = await client.query(
      `SELECT id, creator_id, earning_ids, status FROM creator_withdraw_requests
       WHERE id = $1 FOR UPDATE`,
      [reqId]
    );
    if (!wrRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Request not found' }); }
    if (!['approved', 'processing'].includes(wrRows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot mark paid — status is ${wrRows[0].status}` });
    }

    if (wrRows[0].earning_ids && wrRows[0].earning_ids.length) {
      await client.query(
        `UPDATE creator_earnings SET status = 'paid_out', paid_at = now()
         WHERE id = ANY($1::uuid[]) AND creator_id = $2 AND status = 'in_payout'`,
        [wrRows[0].earning_ids, wrRows[0].creator_id]
      );
    }

    await client.query(
      `UPDATE creator_withdraw_requests
         SET status = 'paid', completed_at = now(),
             payout_id = COALESCE($2, payout_id),
             admin_notes = COALESCE(NULLIF($3,''), admin_notes)
       WHERE id = $1`,
      [reqId, payoutId, notes]
    );
    await client.query('COMMIT');
    await audit(admin.id, wrRows[0].creator_id, 'mark_paid_withdraw', { reqId, payoutId, notes });
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('markWithdrawPaid error', { err: err.message });
    return res.status(500).json({ error: 'Failed to mark paid' });
  } finally { client.release(); }
}

module.exports = {
  getBalance,
  creditManual,
  voidEarning,
  releaseHold,
  addNote,
  getAudit,
  listWithdrawRequests,
  approveWithdrawRequest,
  denyWithdrawRequest,
  markWithdrawPaid,
};
