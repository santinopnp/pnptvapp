'use strict';
/**
 * One-shot: cancel booking 54341f1c-1dc1-41ef-a174-7cbd26118a75 (CLOUDYDAYSUPERGAY)
 * and verify the credit is fully returned so he can rebook.
 */

require('dotenv').config({ path: '/opt/pnptvapp/.env' });
require('dotenv').config({ path: '/opt/pnptvapp/.env.production', override: true });

const { query } = require('../config/postgres');
const CallBookingService = require('../services/CallBookingService');

const BOOKING_ID = '54341f1c-1dc1-41ef-a174-7cbd26118a75';
const REASON     = 'Admin reset — booking details error reported by member; credit returned for rebooking';

async function main() {
  console.log('=== reset-booking-cloudydaysupergay-20260914 ===\n');

  // Pre-check
  const { rows: pre } = await query(
    `SELECT b.id, b.status, b.credit_id,
            cc.quantity_total, cc.quantity_used, cc.quantity_scheduled, cc.status AS credit_status
     FROM bookings b
     LEFT JOIN call_credits cc ON cc.id = b.credit_id
     WHERE b.id = $1`,
    [BOOKING_ID]
  );
  if (pre.length === 0) { console.error('Booking not found'); process.exit(1); }
  console.log('Before:', pre[0]);

  if (pre[0].status === 'cancelled') {
    console.log('Booking is already cancelled — nothing to do.');
    process.exit(0);
  }

  // Cancel (unreserves credit automatically)
  await CallBookingService.cancelBooking(BOOKING_ID, REASON, null, null);
  console.log('\nCancelled successfully.\n');

  // Post-check
  const { rows: post } = await query(
    `SELECT b.id, b.status, b.cancel_reason, b.cancelled_at,
            cc.quantity_total, cc.quantity_used, cc.quantity_scheduled, cc.status AS credit_status
     FROM bookings b
     LEFT JOIN call_credits cc ON cc.id = b.credit_id
     WHERE b.id = $1`,
    [BOOKING_ID]
  );
  console.log('After:', post[0]);

  const credit = post[0];
  const available = credit.quantity_total - credit.quantity_used - credit.quantity_scheduled;
  console.log(`\nCredits available for rebooking: ${available}`);
  if (available > 0) {
    console.log('✓ Credit is free — member can rebook.');
  } else {
    console.error('✗ Credit still locked — investigate manually.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
