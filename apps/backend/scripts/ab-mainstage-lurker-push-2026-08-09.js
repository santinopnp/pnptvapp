'use strict';

/**
 * A/B Test — Main Stage Lurker Push (2026-08-09)
 *
 * Hypothesis: sending a push notification to users who have push opt-in but
 * haven't been active on Main Stage (>=10min cam-time in last 30d) will
 * significantly increase Main Stage participation AND downstream monetization
 * (private call bookings + tips) vs a no-push control group.
 *
 * Design:
 *   - Cohort: users with push subs AND (no MS activity OR <10min in 30d)
 *     AND is_active=true, is_deleted=false, is_restricted=false
 *   - Assignment: deterministic 50/50 shuffle by SHA256(user_id + test_id)
 *     (reproducible; re-running the analysis gives same buckets)
 *   - Treatment: single push, deep-linked to /main-stage
 *   - Control: no push
 *   - Analysis window: 48h post-send
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/ab-mainstage-lurker-push-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/ab-mainstage-lurker-push-2026-08-09.js
 */

const crypto = require('crypto');
const { query } = require('../config/postgres');
const PushNotificationService = require('../services/pushNotificationService');
const logger = require('../utils/logger');

const AB_TEST_ID = 'mainstage_lurker_push_2026_08_09';

const COPY = {
  en: {
    title: "Someone's live on Main Stage",
    body: 'Come see who\'s on cam right now',
    url: '/main-stage',
  },
  es: {
    title: 'Alguien está en vivo en Main Stage',
    body: 'Ven a ver quién está en cámara ahora',
    url: '/main-stage',
  },
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // ── 1. Confirm Main Stage actually has activity NOW (don't lie in the push) ──
  const { rows: liveRows } = await query(
    `SELECT COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '15 minutes') AS active_15min
       FROM mainstage_cammer_stats`
  );
  const active15 = Number(liveRows[0]?.active_15min || 0);
  console.log(`[preflight] Main Stage cammers active in last 15 min: ${active15}`);
  if (active15 < 3) {
    console.log('[abort] Fewer than 3 active cammers — sending would misrepresent activity. Retry later.');
    process.exit(2);
  }

  // ── 2. Load eligible cohort ──
  const { rows: eligible } = await query(`
    WITH ms_active_30d AS (
      SELECT DISTINCT user_id FROM mainstage_cammer_stats
      WHERE last_seen_at > NOW() - INTERVAL '30 days'
        AND total_seconds >= 600
        AND user_id IS NOT NULL
    ),
    push_opted AS (
      SELECT DISTINCT user_id FROM push_subscriptions
    )
    SELECT u.id, COALESCE(u.language, 'en') AS language
    FROM users u
    WHERE u.is_deleted = false
      AND u.is_active = true
      AND u.is_restricted = false
      AND u.id IN (SELECT user_id FROM push_opted)
      AND u.id NOT IN (SELECT user_id FROM ms_active_30d)
    ORDER BY u.id
  `);
  console.log(`[cohort] Eligible lurkers: ${eligible.length}`);
  if (eligible.length === 0) {
    console.log('[abort] Empty cohort.');
    process.exit(0);
  }

  // ── 3. Idempotency — never double-run this test ──
  const SEGMENT_TREATMENT = `ab-${AB_TEST_ID}-treatment`;
  const SEGMENT_CONTROL   = `ab-${AB_TEST_ID}-control`;
  const { rows: existingSeg } = await query(
    `SELECT name FROM user_segments WHERE name IN ($1, $2)`,
    [SEGMENT_TREATMENT, SEGMENT_CONTROL]
  );
  if (existingSeg.length > 0) {
    console.log(`[abort] Segments already exist (${existingSeg.map(r => r.name).join(', ')}). Refusing to double-run.`);
    process.exit(3);
  }

  // ── 4. Deterministic 50/50 shuffle ──
  const shuffled = [...eligible].sort((a, b) => {
    const ha = crypto.createHash('sha256').update(a.id + AB_TEST_ID).digest('hex');
    const hb = crypto.createHash('sha256').update(b.id + AB_TEST_ID).digest('hex');
    return ha.localeCompare(hb);
  });
  const mid = Math.floor(shuffled.length / 2);
  const treatment = shuffled.slice(0, mid);
  const control = shuffled.slice(mid);
  console.log(`[split] treatment=${treatment.length}  control=${control.length}`);

  // ── 5. Persist assignments as 2 user_segments (treatment + control) ──
  let treatmentSegmentId = null;
  let controlSegmentId = null;
  if (!dryRun) {
    // Create parent segment rows (uses uuid_generate_v4 default for segment_id)
    const { rows: segT } = await query(
      `INSERT INTO user_segments (name, description, filters, actual_count, estimated_count, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $4, $5)
       RETURNING segment_id`,
      [SEGMENT_TREATMENT, `A/B test ${AB_TEST_ID} — treatment (received push)`,
       JSON.stringify({ ab_test_id: AB_TEST_ID, variant: 'treatment' }),
       treatment.length, '8599671840']
    );
    treatmentSegmentId = segT[0].segment_id;

    const { rows: segC } = await query(
      `INSERT INTO user_segments (name, description, filters, actual_count, estimated_count, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $4, $5)
       RETURNING segment_id`,
      [SEGMENT_CONTROL, `A/B test ${AB_TEST_ID} — control (no push)`,
       JSON.stringify({ ab_test_id: AB_TEST_ID, variant: 'control' }),
       control.length, '8599671840']
    );
    controlSegmentId = segC[0].segment_id;

    // Bulk-insert members
    const insertMembership = async (segId, users) => {
      for (let i = 0; i < users.length; i += 200) {
        const batch = users.slice(i, i + 200);
        const params = [];
        const placeholders = batch.map((u, idx) => {
          const base = idx * 2;
          params.push(segId, u.id);
          return `($${base + 1}, $${base + 2}, NOW())`;
        }).join(',');
        await query(
          `INSERT INTO segment_membership (segment_id, user_id, added_at) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
          params
        );
      }
    };
    await insertMembership(treatmentSegmentId, treatment);
    await insertMembership(controlSegmentId, control);
    console.log(`[persist] treatment segment ${treatmentSegmentId} (${treatment.length}), control segment ${controlSegmentId} (${control.length})`);
  } else {
    console.log('[persist] SKIPPED (dry-run)');
  }

  // ── 6. Send push to treatment group only ──
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const user of treatment) {
    const copy = COPY[user.language === 'es' ? 'es' : 'en'];
    if (dryRun) {
      console.log(`[DRY] would send to ${user.id} (${user.language}): "${copy.title}"`);
      continue;
    }
    try {
      const n = await PushNotificationService.sendToUser(user.id, copy);
      if (n > 0) sent++;
      else skipped++;
    } catch (err) {
      failed++;
      logger.error('[ab-mainstage-lurker-push] send failed', { userId: user.id, error: err.message });
    }
  }

  console.log('\n══ RESULT ══');
  console.log(`Cohort:      ${eligible.length}`);
  console.log(`Treatment:   ${treatment.length}`);
  console.log(`Control:     ${control.length}`);
  console.log(`Delivered:   ${sent}`);
  console.log(`No-op (0 subs at send-time): ${skipped}`);
  console.log(`Failed:      ${failed}`);
  console.log(`\nAnalysis: run the T+48h query with ab_test_id='${AB_TEST_ID}'`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
