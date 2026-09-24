#!/usr/bin/env node
'use strict';

/**
 * resend-postcall-survey-60d.js
 *
 * Re-sends the post-call survey prompt (with new tip CTA + 15-min reward copy)
 * to members who completed a call in the last 60 days but never submitted a survey.
 *
 * Usage:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     $(docker exec pnptv-bot printenv | grep -E '^(POSTGRES_|REDIS_|BOT_TOKEN|APP_URL|NODE_ENV)' | sed 's/^/-e /') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/resend-postcall-survey-60d.js --dry-run
 *
 * Live: remove --dry-run
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const DRY_RUN     = process.argv.includes('--dry-run');
const BATCH_SIZE  = 20;
const BATCH_DELAY = 1500; // ms between batches

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { initializePostgres, getPool } = require(path.join(BACKEND, 'config/postgres'));
  const { initializeRedis }             = require(path.join(BACKEND, 'config/redis'));

  await initializePostgres();
  await initializeRedis();

  const pool = getPool();

  // Find completed bookings in the last 60 days that have no survey
  const { rows } = await pool.query(`
    SELECT
      b.id          AS booking_id,
      b.user_id     AS member_id,
      cc.id         AS credit_id,
      u_c.username  AS creator_username,
      COALESCE(prf.display_name, u_c.first_name, u_c.username) AS creator_display_name
    FROM bookings b
    JOIN call_credits cc ON cc.id = b.credit_id
    JOIN performers   prf ON prf.id = b.performer_id
    JOIN users        u_c ON u_c.id = prf.user_id
    WHERE b.status    = 'completed'
      AND b.end_time_utc >= NOW() - INTERVAL '60 days'
      AND NOT EXISTS (
        SELECT 1 FROM call_booking_surveys cbs WHERE cbs.credit_id = cc.id
      )
    ORDER BY b.end_time_utc DESC
  `);

  console.log(`[resend-survey-60d] Found ${rows.length} completed calls without surveys`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN ===');
    console.log(`Would re-send survey prompt to ${rows.length} members`);
    rows.slice(0, 5).forEach((r, i) => {
      console.log(`  [${i + 1}] booking=${r.booking_id} member=${r.member_id} creator=@${r.creator_username}`);
    });
    if (rows.length > 5) console.log(`  ... and ${rows.length - 5} more`);
    console.log('=== Remove --dry-run to send ===\n');
    process.exit(0);
  }

  const callNotificationService = require(path.join(BACKEND, 'services/callNotificationService'));

  let sent = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await callNotificationService.sendPostCallSurveyPrompt(
        String(row.member_id),
        row.booking_id,
        row.creator_display_name || 'the creator',
        row.creator_username || null
      );
      sent++;
    } catch (err) {
      failed++;
      console.warn(`[resend-survey-60d] failed for booking ${row.booking_id}: ${err.message}`);
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`[resend-survey-60d] progress: ${i + 1}/${rows.length} (sent=${sent}, failed=${failed})`);
      await sleep(BATCH_DELAY);
    }
  }

  console.log(`[resend-survey-60d] done — total=${rows.length} sent=${sent} failed=${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[resend-survey-60d] fatal:', err);
  process.exit(1);
});
