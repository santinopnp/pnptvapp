'use strict';

/**
 * 2257 Enforcement Readiness Check
 *
 * Pre-flight audit for the Aug 15 9am auto-suspend cron.
 * Prints:
 *   1. Full table of unverified creators (username, deadline, 2257 status, email)
 *   2. Count that would be suspended if the cron ran right now
 *   3. Pending/submitted records needing manual admin review before enforcement
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/check-2257-enforcement-readiness.js
 */

const { Pool } = require('pg');

const ENFORCEMENT_TIME = new Date('2026-08-15T09:00:00Z');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  max: 3,
});

function pad(str, len) {
  const s = String(str == null ? '' : str);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function fmtDate(val) {
  if (!val) return 'none';
  const d = new Date(val);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const client = await pool.connect();
  try {
    // ── 1. Full unverified creator table ─────────────────────────────────────
    const { rows: allUnverified } = await client.query(`
      SELECT
        u.username,
        u.email,
        u.identity_verification_required_by AS deadline,
        COALESCE(d.verification_status, 'no_record') AS status_2257
      FROM users u
      LEFT JOIN creator_2257_records d ON d.user_id = u.id
      WHERE u.creator_status IN ('active','approved')
        AND u.identity_verified = false
      ORDER BY u.identity_verification_required_by ASC NULLS LAST, d.verification_status
    `);

    console.log('\n========================================');
    console.log('  2257 ENFORCEMENT READINESS — Aug 15');
    console.log(`  Generated: ${new Date().toISOString()}`);
    console.log('========================================\n');

    console.log(`SECTION 1: All unverified creators (${allUnverified.length} total)\n`);
    console.log(
      pad('USERNAME', 28) +
      pad('DEADLINE', 12) +
      pad('2257 STATUS', 14) +
      'EMAIL'
    );
    console.log('-'.repeat(90));

    for (const row of allUnverified) {
      const deadlineFmt = fmtDate(row.deadline);
      const flag =
        row.deadline && new Date(row.deadline) < ENFORCEMENT_TIME ? ' !!!' : '    ';
      console.log(
        pad(row.username, 28) +
        pad(deadlineFmt + flag, 12 + 4) +
        pad(row.status_2257, 14) +
        (row.email || '(no email)')
      );
    }

    // ── 2. Would-be-suspended count ──────────────────────────────────────────
    const { rows: suspendNow } = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM users
      WHERE creator_status IN ('active','approved')
        AND identity_verified = false
        AND identity_verification_required_by IS NOT NULL
        AND identity_verification_required_by < NOW()
    `);

    const { rows: suspendByAug15 } = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM users
      WHERE creator_status IN ('active','approved')
        AND identity_verified = false
        AND identity_verification_required_by IS NOT NULL
        AND identity_verification_required_by < $1
    `, [ENFORCEMENT_TIME.toISOString()]);

    console.log('\n========================================');
    console.log('SECTION 2: Suspension impact\n');
    console.log(`  Would be suspended if cron ran RIGHT NOW:     ${suspendNow[0].cnt}`);
    console.log(`  Would be suspended when cron runs Aug 15 9am: ${suspendByAug15[0].cnt}`);
    console.log('========================================');

    // ── 3. Pending/submitted — need manual admin action ───────────────────────
    const { rows: needsReview } = await client.query(`
      SELECT
        u.username,
        u.email,
        d.verification_status,
        d.submitted_at,
        d.resubmission_count,
        u.identity_verification_required_by AS deadline
      FROM creator_2257_records d
      JOIN users u ON u.id = d.user_id
      WHERE d.verification_status IN ('pending','submitted')
        AND u.creator_status IN ('active','approved')
        AND u.identity_verified = false
        AND u.identity_verification_required_by IS NOT NULL
        AND u.identity_verification_required_by < $1
      ORDER BY u.identity_verification_required_by ASC, d.submitted_at ASC
    `, [ENFORCEMENT_TIME.toISOString()]);

    console.log(`\nSECTION 3: URGENT — Pending/submitted records caught by Aug-15 cron (${needsReview.length})`);
    console.log('These creators SUBMITTED but have NOT been reviewed yet.');
    console.log('They will be auto-suspended unless an admin approves or rejects before Aug 15.\n');

    if (needsReview.length === 0) {
      console.log('  (none — all pending/submitted records have deadlines after Aug 15)');
    } else {
      console.log(
        pad('USERNAME', 24) +
        pad('STATUS', 12) +
        pad('SUBMITTED', 12) +
        pad('DEADLINE', 12) +
        pad('RESUB#', 8) +
        'EMAIL'
      );
      console.log('-'.repeat(100));
      for (const row of needsReview) {
        console.log(
          pad(row.username, 24) +
          pad(row.verification_status, 12) +
          pad(fmtDate(row.submitted_at), 12) +
          pad(fmtDate(row.deadline), 12) +
          pad(row.resubmission_count, 8) +
          (row.email || '(no email)')
        );
      }
      console.log(`\n  ACTION REQUIRED: Review these ${needsReview.length} record(s) at pnptv.app/admin/compliance-2257 before Aug 15.`);
    }

    console.log('\n========================================\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
