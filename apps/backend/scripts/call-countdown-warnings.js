#!/usr/bin/env node
'use strict';

/**
 * One-shot script: send countdown warning DMs to both parties of an in-progress
 * call at end - {10, 5, 4, 3, 2, 1} minutes.
 *
 * Reads BOOKING_ID from argv[2]. Sleeps until each warning window, then sends
 * DMs and exits cleanly. Safe to run detached via `docker exec -d`.
 *
 * Usage (from host):
 *   docker exec -d pnptv-bot node /app/apps/backend/scripts/call-countdown-warnings.js <bookingId>
 */

const bookingId = process.argv[2];
if (!bookingId) {
  console.error('Usage: node call-countdown-warnings.js <bookingId>');
  process.exit(1);
}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');
const logger = require('../utils/logger');

const SYSTEM_SENDER = process.env.SYSTEM_DM_SENDER_ID || '8552451957';
const WARNINGS_MIN = [10, 5, 4, 3, 2, 1];

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function main() {
  const { rows } = await query(
    `SELECT b.id, b.user_id, b.performer_id, b.start_time_utc, b.end_time_utc,
            um.first_name AS member_name, um.username AS member_username,
            uc.id AS creator_user_id, uc.first_name AS creator_name, uc.username AS creator_username
     FROM bookings b
     JOIN users um ON um.id = b.user_id
     LEFT JOIN performers p ON p.id = b.performer_id
     LEFT JOIN users uc ON uc.id = p.user_id
     WHERE b.id = $1`,
    [bookingId]
  );
  if (rows.length === 0) throw new Error(`Booking ${bookingId} not found`);
  const b = rows[0];
  const creatorUserId = b.creator_user_id;
  if (!creatorUserId) throw new Error(`Cannot resolve creator user for performer_id ${b.performer_id}`);

  const endMs = new Date(b.end_time_utc).getTime();
  const memberHandle = b.member_username ? `@${b.member_username}` : (b.member_name || 'your caller');
  const creatorHandle = b.creator_username ? `@${b.creator_username}` : (b.creator_name || 'the creator');

  console.log(`[countdown] booking=${bookingId} ends=${b.end_time_utc} member=${b.user_id} creator=${creatorUserId}`);

  for (const minLeft of WARNINGS_MIN) {
    const targetMs = endMs - minLeft * 60 * 1000;
    const waitMs = targetMs - Date.now();
    if (waitMs > 0) {
      console.log(`[countdown] sleeping ${Math.round(waitMs / 1000)}s until T-${minLeft}m warning`);
      await sleepMs(waitMs);
    } else if (waitMs < -30_000) {
      // Missed by more than 30s — skip this warning.
      console.log(`[countdown] skipping T-${minLeft}m (already ${Math.round(-waitMs / 1000)}s past)`);
      continue;
    }

    const enBody = `⏰ ${minLeft} minute${minLeft === 1 ? '' : 's'} left in your call with ${creatorHandle}. Wrap up gracefully — the room will close automatically at the end.`;
    const esBody = `⏰ ${minLeft} minuto${minLeft === 1 ? '' : 's'} restante${minLeft === 1 ? '' : 's'} en tu llamada con ${memberHandle}. Ve cerrando con calma — la sala se cierra automáticamente al final.`;

    try {
      await sendSystemDM(SYSTEM_SENDER, String(b.user_id), enBody, query);
      console.log(`[countdown] T-${minLeft}m → member ${b.user_id} OK`);
    } catch (err) {
      logger.warn('[call-countdown] member DM failed', { minLeft, memberId: b.user_id, error: err.message });
    }
    try {
      await sendSystemDM(SYSTEM_SENDER, String(creatorUserId), esBody, query);
      console.log(`[countdown] T-${minLeft}m → creator ${creatorUserId} OK`);
    } catch (err) {
      logger.warn('[call-countdown] creator DM failed', { minLeft, creatorId: creatorUserId, error: err.message });
    }
  }

  console.log('[countdown] all warnings dispatched, exiting');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[countdown] fatal', err);
    process.exit(1);
  });
