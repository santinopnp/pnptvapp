'use strict';

const { getCreatorPayoutBalance, requestPayout, getPayoutHistory } = require('../../../services/nowpaymentsPayoutService');
const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');
const CreatorPayoutService = require('../../../services/creatorPayoutService');
const objectStorage = require('../../../services/objectStorageService');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

exports.getPayoutBalance = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const balance = await getCreatorPayoutBalance(userId);
    return res.json({ success: true, ...balance });
  } catch (err) {
    logger.error('[creatorPayoutController.getPayoutBalance]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch payout balance' });
  }
};

exports.requestPayout = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, error: 'Crypto wallet address is required' });
    }

    // Read the creator's chosen payout token from the latest approved
    // enrollment. Post-migration 326 this is a NowPayments currency code
    // (btc, usdttrc20, dash, …). Falls back to usdttrc20 for legacy rows.
    const { rows: enrRows } = await query(
      `SELECT payment_method FROM creator_enrollments
        WHERE user_id = $1 AND status = 'approved'
        ORDER BY reviewed_at DESC NULLS LAST, submitted_at DESC
        LIMIT 1`,
      [userId]
    );
    const currency = String(enrRows[0]?.payment_method || 'usdttrc20').toLowerCase();

    const payout = await requestPayout({ userId, address, currency });
    return res.json({
      success: true,
      payout: {
        id: payout.id,
        amount_usd: payout.amount_usd,
        currency: payout.currency,
        status: payout.status,
        nowpayments_payout_id: payout.nowpayments_payout_id,
        requested_at: payout.requested_at,
      },
    });
  } catch (err) {
    logger.error('[creatorPayoutController.requestPayout]', { error: err.message, code: err.code });
    // FIX 4: Only expose known safe error messages — never leak NowPayments internals
    const knownCodes = ['PAYOUT_IN_PROGRESS', 'INSUFFICIENT_BALANCE', 'BELOW_MINIMUM', 'INVALID_PAYOUT_METHOD', 'INVALID_ADDRESS', 'SERVICE_UNAVAILABLE'];
    const safeMessage = knownCodes.includes(err.code)
      ? err.message
      : 'Payout could not be processed. Please try again later or contact support.';
    const statusCode = err.code === 'PAYOUT_IN_PROGRESS' ? 409
      : (err.code === 'INSUFFICIENT_BALANCE' || err.code === 'BELOW_MINIMUM' || err.code === 'INVALID_PAYOUT_METHOD' || err.code === 'INVALID_ADDRESS') ? 400
      : 500;
    return res.status(statusCode).json({
      success: false,
      error: safeMessage,
      code: err.code || 'PAYOUT_FAILED',
    });
  }
};

exports.getPayoutHistory = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;

    const payouts = await getPayoutHistory(userId, limit, offset);
    return res.json({ success: true, payouts });
  } catch (err) {
    logger.error('[creatorPayoutController.getPayoutHistory]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch payout history' });
  }
};

// ── Weekly approval workflow ───────────────────────────────────────────────
// Deadline for creator approval: Monday 16:00 America/Bogota (21:00 UTC).

function deadlineIsoForWeek(weekStartYmd) {
  // Monday 21:00 UTC = 16:00 Bogota (UTC-5, no DST)
  return `${weekStartYmd}T21:00:00.000Z`;
}

exports.getPendingApproval = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const row = await CreatorPayoutService.getCreatorPendingApproval(userId);
    if (!row) return res.json({ success: true, approval: null });
    return res.json({
      success: true,
      approval: {
        id: row.id,
        weekStart: row.week_start,
        balanceUsd: Number(row.balance_usd),
        balanceCop: row.balance_cop != null ? Number(row.balance_cop) : null,
        usdCopRate: row.usd_cop_rate != null ? Number(row.usd_cop_rate) : null,
        method: row.payout_method_snapshot,
        methodOverride: row.approved_method_override,
        status: row.status,
        approvedAt: row.approved_at,
        createdAt: row.created_at,
        deadlineAt: deadlineIsoForWeek(
          new Date(row.week_start).toISOString().slice(0, 10)
        ),
      },
    });
  } catch (err) {
    logger.error('[creatorPayoutController.getPendingApproval]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch pending approval' });
  }
};

exports.approveWeekly = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    const { methodOverride } = req.body || {};
    if (methodOverride) {
      if (typeof methodOverride !== 'object' || !methodOverride.lane) {
        return res.status(400).json({ success: false, error: 'methodOverride requires { lane, ... }' });
      }
    }
    const row = await CreatorPayoutService.approveWeeklyProposal(id, userId, { methodOverride });
    return res.json({ success: true, approval: row });
  } catch (err) {
    if (err.code === 'NOT_APPROVABLE') {
      return res.status(409).json({ success: false, error: 'Not in a pending state' });
    }
    logger.error('[creatorPayoutController.approveWeekly]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to approve' });
  }
};

exports.rejectWeekly = async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    await CreatorPayoutService.rejectWeeklyProposal(id, userId);
    return res.json({ success: true });
  } catch (err) {
    if (err.code === 'NOT_REJECTABLE') {
      return res.status(409).json({ success: false, error: 'Not in a pending state' });
    }
    logger.error('[creatorPayoutController.rejectWeekly]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to reject' });
  }
};

// ── Admin endpoints ────────────────────────────────────────────────────────

function currentWeekStartBogota() {
  return CreatorPayoutService._mondayOfBogotaWeek();
}

exports.adminListWeekly = async (req, res) => {
  try {
    const weekStart = String(req.query.week_start || currentWeekStartBogota());
    const status = req.query.status ? String(req.query.status) : null;
    const country = req.query.country ? String(req.query.country) : null;
    const [rows, summary] = await Promise.all([
      CreatorPayoutService.getAdminWeeklyLedger({ weekStart, status, country }),
      CreatorPayoutService.getAdminWeeklySummary({ weekStart }),
    ]);
    return res.json({
      success: true,
      weekStart,
      deadlineAt: deadlineIsoForWeek(weekStart),
      summary,
      rows: rows.map((r) => ({
        id: r.id,
        creatorId: r.creator_id,
        username: r.username,
        firstName: r.first_name,
        email: r.email,
        country: r.country,
        language: r.language,
        balanceUsd: Number(r.balance_usd),
        balanceCop: r.balance_cop != null ? Number(r.balance_cop) : null,
        usdCopRate: r.usd_cop_rate != null ? Number(r.usd_cop_rate) : null,
        method: r.payout_method_snapshot,
        methodOverride: r.approved_method_override,
        status: r.status,
        approvedAt: r.approved_at,
        processedAt: r.processed_at,
        processedByAdminId: r.processed_by_admin_id,
        receiptUrl: r.receipt_url, // R2 object key (admin fetches presigned URL separately)
        txReference: r.tx_reference,
        adminNotes: r.admin_notes,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    logger.error('[creatorPayoutController.adminListWeekly]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to load ledger' });
  }
};

exports.adminExportWeeklyCsv = async (req, res) => {
  try {
    const weekStart = String(req.query.week_start || currentWeekStartBogota());
    const rows = await CreatorPayoutService.getAdminWeeklyLedger({
      weekStart,
      status: req.query.status ? String(req.query.status) : null,
      country: req.query.country ? String(req.query.country) : null,
    });
    const header = ['week_start','creator_id','username','email','country','balance_usd','balance_cop','method_lane','method_dest','status','approved_at','processed_at','tx_reference','receipt_url'];
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      const m = r.approved_method_override || r.payout_method_snapshot || {};
      const dest = m.address || m.handle || m.key || m.account || '';
      lines.push([
        weekStart, r.creator_id, r.username || '', r.email || '', r.country || '',
        Number(r.balance_usd).toFixed(2),
        r.balance_cop != null ? Number(r.balance_cop).toFixed(0) : '',
        m.lane || '', dest, r.status,
        r.approved_at || '', r.processed_at || '',
        r.tx_reference || '', r.receipt_url || '',
      ].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="weekly-payouts-${weekStart}.csv"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    logger.error('[creatorPayoutController.adminExportWeeklyCsv]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to export' });
  }
};

exports.adminMarkPaid = async (req, res) => {
  try {
    const adminId = req.session?.user?.id;
    const { id } = req.params;
    const txReference = (req.body?.tx_reference || req.body?.txReference || '').toString().trim();
    const adminNotes = (req.body?.admin_notes || req.body?.adminNotes || '').toString().trim();
    if (!txReference) {
      return res.status(400).json({ success: false, error: 'tx_reference is required' });
    }

    // Optional receipt upload — multer put the file on disk (see routes.js mount).
    let receiptKey = null;
    const file = req.file;
    if (file) {
      const ext = (path.extname(file.originalname || '') || '').toLowerCase().slice(0, 6) || '.bin';
      const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '.bin';
      receiptKey = `payouts/receipts/${id}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
      try {
        if (objectStorage.isConfigured()) {
          await objectStorage.uploadFile(file.path, receiptKey, file.mimetype);
        } else {
          // Disk-only fallback: move file into /uploads/payouts.
          const destDir = path.join(process.cwd(), 'apps/backend/uploads/payouts');
          fs.mkdirSync(destDir, { recursive: true });
          const target = path.join(destDir, path.basename(receiptKey));
          fs.copyFileSync(file.path, target);
          receiptKey = `/uploads/payouts/${path.basename(receiptKey)}`;
        }
      } finally {
        try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
      }
    }

    const approval = await CreatorPayoutService.adminMarkWeeklyPaid(id, adminId, {
      txReference,
      receiptUrl: receiptKey,
      adminNotes,
    });
    return res.json({ success: true, approval });
  } catch (err) {
    if (err.code === 'NOT_MARKABLE') {
      return res.status(409).json({ success: false, error: 'Row is not in approved state' });
    }
    logger.error('[creatorPayoutController.adminMarkPaid]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to mark paid' });
  }
};

exports.adminGetReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT receipt_url FROM creator_weekly_payout_approvals WHERE id = $1`,
      [id]
    );
    const receiptUrl = rows[0]?.receipt_url;
    if (!receiptUrl) return res.status(404).json({ success: false, error: 'No receipt' });

    // Disk-fallback path is public-relative.
    if (receiptUrl.startsWith('/uploads/')) {
      return res.json({ success: true, url: receiptUrl });
    }
    if (objectStorage.isConfigured()) {
      const url = await objectStorage.getPresignedUrl(receiptUrl, 3600);
      return res.json({ success: true, url });
    }
    return res.status(500).json({ success: false, error: 'Object storage not configured' });
  } catch (err) {
    logger.error('[creatorPayoutController.adminGetReceipt]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to get receipt URL' });
  }
};
