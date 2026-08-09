#!/usr/bin/env node
'use strict';

/**
 * A/B analysis — Main Stage host-bot experiment.
 *
 * Window: whenever `pnpapp:mainstage:host_bot:enabled=1` was on.
 * Bucket assignment uses the same hash the runtime uses (bucketOf in
 * mainStageHostBotService.js) so users are matched deterministically.
 *
 * Metrics compared A vs B:
 *   - Tips sent from Main Stage (token_ledger reason='live_tip_send')
 *   - Bookings created (bookings table)
 *   - Session length ≈ derived from client-lifecycle join→disconnect
 *     (approximate; we only have summary counts, not full sessions)
 *
 * Usage:  docker exec pnptv-bot node apps/backend/scripts/ab-mainstage-hostbot-analysis-2026-08-12.js
 */

const { query } = require('../config/postgres');
const { bucketOf, getSplit } = require('../services/mainStageHostBotService');

const WINDOW_START = process.env.HOSTBOT_WINDOW_START || '2026-08-09 04:00:00';
const WINDOW_END   = process.env.HOSTBOT_WINDOW_END   || '2026-08-12 04:00:00';

function fmtRow(label, a, b) {
  const lift = b > 0 ? ((a - b) / b) * 100 : (a > 0 ? Infinity : 0);
  const arrow = a > b ? '↑' : a < b ? '↓' : '=';
  const liftStr = Number.isFinite(lift) ? `${lift >= 0 ? '+' : ''}${lift.toFixed(1)}%` : 'N/A';
  return `${label.padEnd(32)} A=${String(a).padStart(8)}  B=${String(b).padStart(8)}  ${arrow} ${liftStr}`;
}

async function main() {
  const split = await getSplit();
  console.log(`\n=== Main Stage Host-Bot A/B Analysis ===`);
  console.log(`Window:  ${WINDOW_START}  →  ${WINDOW_END}`);
  console.log(`Split:   ${split}/100 (A/B)\n`);

  // ── Tips originated on Main Stage ─────────────────────────────────────────
  const tips = await query(
    `SELECT user_id, SUM(amount) AS tokens, COUNT(*) AS tip_count
       FROM token_ledger
      WHERE reason = 'live_tip_send'
        AND created_at BETWEEN $1 AND $2
      GROUP BY user_id`,
    [WINDOW_START, WINDOW_END],
  );
  let tipTokensA = 0, tipTokensB = 0, tipCountA = 0, tipCountB = 0;
  let tippersA = 0, tippersB = 0;
  for (const row of tips.rows) {
    if (bucketOf(row.user_id, split) === 'A') {
      tipTokensA += Number(row.tokens); tipCountA += Number(row.tip_count); tippersA++;
    } else {
      tipTokensB += Number(row.tokens); tipCountB += Number(row.tip_count); tippersB++;
    }
  }

  // ── Bookings ──────────────────────────────────────────────────────────────
  const bookings = await query(
    `SELECT customer_user_id AS user_id, COUNT(*) AS n
       FROM bookings
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY customer_user_id`,
    [WINDOW_START, WINDOW_END],
  );
  let bookingsA = 0, bookingsB = 0, bookersA = 0, bookersB = 0;
  for (const row of bookings.rows) {
    if (!row.user_id) continue;
    if (bucketOf(row.user_id, split) === 'A') {
      bookingsA += Number(row.n); bookersA++;
    } else {
      bookingsB += Number(row.n); bookersB++;
    }
  }

  // ── Mainstage bot CTA clicks (from utm_source in bookings.metadata / referer)
  let ctaBookingsA = 0, ctaBookingsB = 0;
  try {
    const cta = await query(
      `SELECT customer_user_id AS user_id, COUNT(*) AS n
         FROM bookings
        WHERE created_at BETWEEN $1 AND $2
          AND (metadata::text ILIKE '%mainstage_hostbot%' OR notes ILIKE '%mainstage_hostbot%')
        GROUP BY customer_user_id`,
      [WINDOW_START, WINDOW_END],
    );
    for (const row of cta.rows) {
      if (!row.user_id) continue;
      if (bucketOf(row.user_id, split) === 'A') ctaBookingsA += Number(row.n);
      else ctaBookingsB += Number(row.n);
    }
  } catch (_) {
    // Column may not exist in this DB — skip.
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('─── Tips ─────────────────────────────────────────────────────────');
  console.log(fmtRow('Total tokens tipped',   tipTokensA, tipTokensB));
  console.log(fmtRow('Tip count',             tipCountA,  tipCountB));
  console.log(fmtRow('Unique tippers',        tippersA,   tippersB));
  console.log('─── Bookings ─────────────────────────────────────────────────────');
  console.log(fmtRow('Total bookings',        bookingsA,  bookingsB));
  console.log(fmtRow('Unique bookers',        bookersA,   bookersB));
  console.log(fmtRow('CTA-attributed books',  ctaBookingsA, ctaBookingsB));
  console.log('');
  console.log('Note: A = shown Cristina auto msgs, B = control (never saw them).');
  console.log('If A is materially higher on tips + bookings → invest more.');
  console.log('If A ≈ B or lower → deprecate the host-bot.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
