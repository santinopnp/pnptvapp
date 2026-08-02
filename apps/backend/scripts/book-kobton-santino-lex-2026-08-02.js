#!/usr/bin/env node
'use strict';

/**
 * One-shot joint booking: Kobton1 + Santino + Lex.
 * 60 min, 2026-08-02 05:00:00 UTC (midnight Central US / Colombia local time).
 * Courtesy — price_cents = 0. Two bookings rows (schema is 1 performer per row)
 * with a shared meeting_url stored in client_notes so the 3 join the same room.
 *
 * Sends 3 tailored system DMs from @pnptv (id 8552451957) so all parties get
 * push + in-app notification.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/book-kobton-santino-lex-2026-08-02.js
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const KOBTON_ID    = '5951629484';
const SANTINO_UID  = '8599671840';
const LEX_UID      = '7246621722';
const SYSTEM_ID    = '8552451957'; // @pnptv / PNPtv! News
const START_UTC    = '2026-08-02 05:00:00+00'; // midnight Sat→Sun in CT/COT
const DURATION_MIN = 60;

async function main() {
  // Resolve performer_id for each creator
  const perfRes = await query(
    `SELECT id, user_id FROM performers WHERE user_id IN ($1, $2)`,
    [SANTINO_UID, LEX_UID]
  );
  const santinoPerf = perfRes.rows.find(r => r.user_id === SANTINO_UID)?.id;
  const lexPerf     = perfRes.rows.find(r => r.user_id === LEX_UID)?.id;
  if (!santinoPerf || !lexPerf) {
    throw new Error(`Missing performer rows — santino=${santinoPerf}, lex=${lexPerf}`);
  }

  // Shared LiveKit room name — deterministic + easy to type manually if needed
  const roomName = `joint-kobton-founders-${Date.now().toString(36)}`;
  const sharedNote = `Joint founders call (Santino + Lex) with Kobton1 — courtesy. Room: ${roomName}`;

  // Insert two bookings (one per performer) at the same slot
  const b1 = await query(
    `INSERT INTO bookings
       (user_id, performer_id, call_type, duration_minutes, price_cents, currency,
        start_time_utc, end_time_utc, status, rules_accepted_at, client_notes)
     VALUES ($1, $2, 'video', $3, 0, 'USD',
             $4::timestamptz, $4::timestamptz + ($3::int * INTERVAL '1 minute'),
             'confirmed', NOW(), $5)
     RETURNING id, start_time_utc`,
    [KOBTON_ID, santinoPerf, DURATION_MIN, START_UTC, sharedNote]
  );
  const b2 = await query(
    `INSERT INTO bookings
       (user_id, performer_id, call_type, duration_minutes, price_cents, currency,
        start_time_utc, end_time_utc, status, rules_accepted_at, client_notes)
     VALUES ($1, $2, 'video', $3, 0, 'USD',
             $4::timestamptz, $4::timestamptz + ($3::int * INTERVAL '1 minute'),
             'confirmed', NOW(), $5)
     RETURNING id, start_time_utc`,
    [KOBTON_ID, lexPerf, DURATION_MIN, START_UTC, sharedNote]
  );

  const iso = new Date(b1.rows[0].start_time_utc).toISOString();

  // Tailored DMs
  const dmKobton = `🎉 Your private call is confirmed!

📅 Sat Aug 2 · 🕛 12:00 AM (midnight, Central US / Colombia time)
⏱ 60 min · 💬 Video call
👥 With Santino AND Lex (PNPtv founders) — courtesy joint session

The call room will open in your PNPtv dashboard 5 min before the start. Any questions, just reply.`;

  const dmSantino = `📅 Joint founders call scheduled

You + Lex are hosting **Kobton1** (@KOBTON1) — 60 min video call, courtesy.
🕛 Sat Aug 2 · 12:00 AM Colombia time (midnight)

Booking id: ${b1.rows[0].id}
Room: ${roomName}

Lex is auto-added — you'll both enter the same LiveKit room. Reply if you need to reschedule.`;

  const dmLex = `📅 Joint founders call scheduled

You + Santino are hosting **Kobton1** (@KOBTON1) — 60 min video call, courtesy.
🕛 Sat Aug 2 · 12:00 AM Colombia time (midnight)

Booking id: ${b2.rows[0].id}
Room: ${roomName}

Santino is auto-added — you'll both enter the same LiveKit room. Reply if you need to reschedule.`;

  await sendSystemDM(SYSTEM_ID, KOBTON_ID,   dmKobton,  query);
  await sendSystemDM(SYSTEM_ID, SANTINO_UID, dmSantino, query);
  await sendSystemDM(SYSTEM_ID, LEX_UID,     dmLex,     query);

  console.log(JSON.stringify({
    santino_booking: b1.rows[0].id,
    lex_booking:     b2.rows[0].id,
    starts_utc:      iso,
    room:            roomName,
    dms_sent:        [KOBTON_ID, SANTINO_UID, LEX_UID],
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('booking fatal:', err);
  process.exit(1);
});
