'use strict';

/**
 * Analysis for ab-mainstage-lurker-push-2026-08-09
 *
 * Sent: 2026-08-09 02:22:50 UTC to 242 lurkers (treatment).
 * Control: 243 lurkers who got nothing.
 * Analysis window: T+48h (recommended: run 2026-08-11 after 02:22 UTC).
 * Safe to re-run — read-only.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/ab-mainstage-lurker-push-analysis-2026-08-09.js
 */

const { query } = require('../config/postgres');

const SEND_TIME = '2026-08-09 02:22:50+00';
const SEG_TREATMENT = '8b0b3ee5-04a4-46aa-b217-477dedd7f48d';
const SEG_CONTROL   = 'a6cf54d0-ad05-4d50-83db-d52e219ffbf9';

async function main() {
  console.log(`═══ A/B Analysis — Main Stage Lurker Push ═══`);
  console.log(`Send time: ${SEND_TIME}`);
  console.log(`Elapsed:   ${Math.round((Date.now() - new Date(SEND_TIME).getTime()) / 3600000)}h since send\n`);

  // Primary metric: % who touched Main Stage after send
  const primary = await query(`
    WITH t AS (SELECT user_id FROM segment_membership WHERE segment_id = $1),
         c AS (SELECT user_id FROM segment_membership WHERE segment_id = $2),
         t_touched AS (
           SELECT DISTINCT user_id FROM mainstage_cammer_stats
           WHERE user_id IN (SELECT user_id FROM t) AND last_seen_at > $3::timestamptz
         ),
         c_touched AS (
           SELECT DISTINCT user_id FROM mainstage_cammer_stats
           WHERE user_id IN (SELECT user_id FROM c) AND last_seen_at > $3::timestamptz
         )
    SELECT
      (SELECT COUNT(*) FROM t) AS treatment_size,
      (SELECT COUNT(*) FROM c) AS control_size,
      (SELECT COUNT(*) FROM t_touched) AS treatment_touched,
      (SELECT COUNT(*) FROM c_touched) AS control_touched,
      ROUND(100.0 * (SELECT COUNT(*) FROM t_touched) / NULLIF((SELECT COUNT(*) FROM t), 0), 2) AS treatment_pct,
      ROUND(100.0 * (SELECT COUNT(*) FROM c_touched) / NULLIF((SELECT COUNT(*) FROM c), 0), 2) AS control_pct
  `, [SEG_TREATMENT, SEG_CONTROL, SEND_TIME]);

  const p = primary.rows[0];
  const lift = p.control_pct > 0
    ? ((p.treatment_pct - p.control_pct) / p.control_pct * 100).toFixed(0)
    : 'inf';
  console.log('── PRIMARY: Main Stage entry ──');
  console.log(`Treatment: ${p.treatment_touched}/${p.treatment_size} = ${p.treatment_pct}%`);
  console.log(`Control:   ${p.control_touched}/${p.control_size} = ${p.control_pct}%`);
  console.log(`Lift:      ${lift === 'inf' ? '∞' : lift + '%'} (${(p.treatment_pct - p.control_pct).toFixed(2)} pp)\n`);

  // Secondary: cam-time per user (dose)
  const secondary = await query(`
    WITH t AS (SELECT user_id FROM segment_membership WHERE segment_id = $1),
         c AS (SELECT user_id FROM segment_membership WHERE segment_id = $2)
    SELECT
      'treatment' AS variant,
      ROUND(AVG(ms.total_seconds)::numeric, 1) AS avg_seconds_per_toucher,
      COUNT(*) FILTER (WHERE ms.total_seconds >= 600) AS crossed_10min_threshold
    FROM mainstage_cammer_stats ms
    JOIN t USING (user_id)
    WHERE ms.last_seen_at > $3::timestamptz
    UNION ALL
    SELECT
      'control',
      ROUND(AVG(ms.total_seconds)::numeric, 1),
      COUNT(*) FILTER (WHERE ms.total_seconds >= 600)
    FROM mainstage_cammer_stats ms
    JOIN c USING (user_id)
    WHERE ms.last_seen_at > $3::timestamptz
  `, [SEG_TREATMENT, SEG_CONTROL, SEND_TIME]);
  console.log('── SECONDARY: cam-time among touchers ──');
  for (const r of secondary.rows) {
    console.log(`${r.variant.padEnd(10)} avg=${r.avg_seconds_per_toucher || 0}s  10min_reached=${r.crossed_10min_threshold}`);
  }
  console.log('');

  // Business: bookings + tips in the window
  const business = await query(`
    WITH t AS (SELECT user_id FROM segment_membership WHERE segment_id = $1),
         c AS (SELECT user_id FROM segment_membership WHERE segment_id = $2)
    SELECT
      'bookings' AS metric,
      COUNT(*) FILTER (WHERE b.user_id IN (SELECT user_id FROM t)) AS treatment,
      COUNT(*) FILTER (WHERE b.user_id IN (SELECT user_id FROM c)) AS control
    FROM bookings b WHERE b.created_at > $3::timestamptz
    UNION ALL
    SELECT
      'pnp_tips_count',
      COUNT(*) FILTER (WHERE pt.user_id IN (SELECT user_id FROM t)),
      COUNT(*) FILTER (WHERE pt.user_id IN (SELECT user_id FROM c))
    FROM pnp_tips pt WHERE pt.created_at > $3::timestamptz
    UNION ALL
    SELECT
      'pnp_tips_ru$h',
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.user_id IN (SELECT user_id FROM t)), 0)::int,
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.user_id IN (SELECT user_id FROM c)), 0)::int
    FROM pnp_tips pt WHERE pt.created_at > $3::timestamptz
    UNION ALL
    SELECT
      'creator_tips_count',
      COUNT(*) FILTER (WHERE ct.payer_id IN (SELECT user_id FROM t)),
      COUNT(*) FILTER (WHERE ct.payer_id IN (SELECT user_id FROM c))
    FROM creator_tips ct WHERE ct.created_at > $3::timestamptz
    UNION ALL
    SELECT
      'creator_tips_usd',
      COALESCE(SUM(ct.amount_usd) FILTER (WHERE ct.payer_id IN (SELECT user_id FROM t)), 0)::int,
      COALESCE(SUM(ct.amount_usd) FILTER (WHERE ct.payer_id IN (SELECT user_id FROM c)), 0)::int
    FROM creator_tips ct WHERE ct.created_at > $3::timestamptz
  `, [SEG_TREATMENT, SEG_CONTROL, SEND_TIME]);

  console.log('── BUSINESS: downstream monetization ──');
  console.log('Metric               | Treatment | Control');
  console.log('---------------------|-----------|--------');
  for (const r of business.rows) {
    console.log(`${r.metric.padEnd(20)} | ${String(r.treatment).padEnd(9)} | ${r.control}`);
  }
  console.log('');

  console.log('══ END ══');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
