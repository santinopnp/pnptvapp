#!/usr/bin/env node
'use strict';

/**
 * Cancel the Kobton1 + Santino + Lex joint booking created earlier today.
 * Booking was courtesy (price_cents=0, no payment_id, no credit_id) so there
 * is no actual credit/refund to issue — but we notify all 3 parties.
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const KOBTON_ID   = '5951629484';
const SANTINO_UID = '8599671840';
const LEX_UID     = '7246621722';
const SYSTEM_ID   = '8552451957';

const B1 = 'd043eb0a-d11b-480a-9543-d00328f49096'; // Santino booking
const B2 = 'b63a603c-e312-49e2-b4cd-892446338e4d'; // Lex booking

async function main() {
  // Verify booking state (courtesy = no credit/payment attached)
  const check = await query(
    `SELECT id, status, price_cents, credit_id, payment_id
       FROM bookings WHERE id IN ($1, $2)`,
    [B1, B2]
  );

  const cancel = await query(
    `UPDATE bookings
        SET status = 'cancelled',
            cancelled_at = NOW(),
            cancelled_by = 'admin',
            cancel_reason = 'Cancelled at buyer request — courtesy booking, no charge to reverse',
            updated_at = NOW()
      WHERE id IN ($1, $2)
        AND status = 'confirmed'
      RETURNING id, status`,
    [B1, B2]
  );

  // Notify all 3
  const noteBuyer = `Your joint call with Lex + Santino on Sat Aug 2 at 12:00 AM (midnight) has been cancelled.

This was a courtesy booking so there is no charge to reverse. If you paid tokens or credits for a different call and expect a refund, reply to this message and we'll look into it right away.`;

  const notePerformer = (name) => `The joint call with ${name} + Kobton1 scheduled for Sat Aug 2 at 12:00 AM has been cancelled. No further action needed.`;

  await sendSystemDM(SYSTEM_ID, KOBTON_ID,   noteBuyer,               query);
  await sendSystemDM(SYSTEM_ID, SANTINO_UID, notePerformer('Lex'),    query);
  await sendSystemDM(SYSTEM_ID, LEX_UID,     notePerformer('Santino'), query);

  console.log(JSON.stringify({
    pre_cancel: check.rows,
    cancelled: cancel.rows,
    dms_sent:  [KOBTON_ID, SANTINO_UID, LEX_UID],
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('cancel fatal:', err);
  process.exit(1);
});
