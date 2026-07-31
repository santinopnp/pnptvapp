'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

/**
 * callDiagnosticsService — read-only health snapshot of the Book-a-Call funnel.
 * Powers the /admin/call-diagnostics page. All queries are bounded and safe.
 */

async function _pendingCallPayments() {
  const { rows } = await query(
    `SELECT p.id, p.user_id, u.username, p.provider, p.amount, p.created_at,
            EXTRACT(EPOCH FROM (NOW() - p.created_at))/60 AS age_minutes,
            p.metadata->>'creatorId'   AS creator_id,
            cu.username                AS creator_username,
            p.metadata->>'durationMinutes' AS duration
     FROM payments p
     LEFT JOIN users u  ON u.id  = p.user_id
     LEFT JOIN users cu ON cu.id = p.metadata->>'creatorId'
     WHERE p.metadata->>'type' = 'call_package'
       AND p.status = 'pending'
       AND p.created_at < NOW() - INTERVAL '30 minutes'
     ORDER BY p.created_at ASC
     LIMIT 100`
  );
  return rows.map(r => ({
    ...r,
    age_minutes: Math.round(Number(r.age_minutes)),
    amount: Number(r.amount),
  }));
}

async function _abandonedCheckoutsLast7d() {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.username, u.first_name,
            COUNT(*) AS abandoned,
            MAX(p.created_at) AS last_attempt,
            SUM(p.amount) AS total_usd
     FROM payments p
     JOIN users u ON u.id = p.user_id
     WHERE p.metadata->>'type' = 'call_package'
       AND p.status = 'expired'
       AND p.created_at > NOW() - INTERVAL '7 days'
     GROUP BY u.id, u.username, u.first_name
     HAVING COUNT(*) >= 2
     ORDER BY abandoned DESC, last_attempt DESC
     LIMIT 50`
  );
  return rows.map(r => ({ ...r, abandoned: Number(r.abandoned), total_usd: Number(r.total_usd) }));
}

async function _creatorsWithoutAvailability() {
  const { rows } = await query(
    `SELECT u.id AS creator_id, u.username, u.first_name,
            COUNT(DISTINCT cp.id) AS active_packages,
            MIN(cp.price_usd) AS min_price
     FROM users u
     JOIN call_packages cp ON cp.creator_id = u.id AND cp.is_active = TRUE
     WHERE NOT EXISTS (
       SELECT 1 FROM creator_availability_schedules cas
       WHERE cas.creator_id = u.id AND cas.is_active = TRUE
     )
     GROUP BY u.id, u.username, u.first_name
     ORDER BY active_packages DESC, u.username ASC
     LIMIT 100`
  );
  return rows.map(r => ({ ...r, active_packages: Number(r.active_packages), min_price: Number(r.min_price) }));
}

async function _stuckBookings() {
  const { rows } = await query(
    `SELECT b.id, b.user_id AS member_id, u.username, b.performer_id AS creator_id, cu.username AS creator_username,
            b.status, b.start_time_utc, b.created_at,
            EXTRACT(EPOCH FROM (NOW() - b.created_at))/60 AS age_minutes,
            b.payment_id, p.status AS payment_status, p.provider AS payment_provider
     FROM bookings b
     LEFT JOIN users u  ON u.id = b.user_id
     LEFT JOIN users cu ON cu.id = b.performer_id::text
     LEFT JOIN payments p ON p.id = b.payment_id
     WHERE b.status IN ('held', 'awaiting_payment')
       AND b.created_at < NOW() - INTERVAL '30 minutes'
     ORDER BY b.created_at ASC
     LIMIT 100`
  );
  return rows.map(r => ({ ...r, age_minutes: Math.round(Number(r.age_minutes)) }));
}

async function _totals() {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*) FROM users u WHERE u.role IN ('creator','model')
          AND EXISTS (SELECT 1 FROM call_packages cp WHERE cp.creator_id=u.id AND cp.is_active=TRUE)) AS creators_with_packages,
       (SELECT COUNT(DISTINCT cas.creator_id) FROM creator_availability_schedules cas WHERE cas.is_active=TRUE) AS creators_with_availability,
       (SELECT COUNT(*) FROM payments WHERE metadata->>'type'='call_package' AND status='completed' AND created_at > NOW() - INTERVAL '7 days') AS completed_last_7d,
       (SELECT COUNT(*) FROM payments WHERE metadata->>'type'='call_package' AND status='expired' AND created_at > NOW() - INTERVAL '7 days') AS expired_last_7d,
       (SELECT COUNT(*) FROM call_credits WHERE quantity_used + quantity_scheduled < quantity_total) AS unused_credits`
  );
  const r = rows[0] || {};
  return {
    creators_with_packages: Number(r.creators_with_packages || 0),
    creators_with_availability: Number(r.creators_with_availability || 0),
    completed_last_7d: Number(r.completed_last_7d || 0),
    expired_last_7d: Number(r.expired_last_7d || 0),
    unused_credits: Number(r.unused_credits || 0),
  };
}

async function getCallDiagnostics() {
  const [totals, pendingPayments, abandonedUsers, creatorsNoAvail, stuckBookings] = await Promise.all([
    _totals(),
    _pendingCallPayments(),
    _abandonedCheckoutsLast7d(),
    _creatorsWithoutAvailability(),
    _stuckBookings(),
  ]);

  const conversion7d = totals.completed_last_7d + totals.expired_last_7d > 0
    ? (totals.completed_last_7d / (totals.completed_last_7d + totals.expired_last_7d)) * 100
    : null;

  return {
    generated_at: new Date().toISOString(),
    totals: { ...totals, conversion_rate_7d: conversion7d },
    pending_payments: pendingPayments,
    abandoned_users_7d: abandonedUsers,
    creators_without_availability: creatorsNoAvail,
    stuck_bookings: stuckBookings,
  };
}

module.exports = { getCallDiagnostics };
