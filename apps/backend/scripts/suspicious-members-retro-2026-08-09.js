#!/usr/bin/env node
/**
 * suspicious-members-retro-2026-08-09.js  —  one-shot 90-day baseline
 *
 * Runs the suspicious-members scan with a 90d window (instead of the
 * daily 30d) so #suspicious-review gets a founding snapshot of every
 * user who's ever tripped a signal. Post is prefixed with [BASELINE 90d].
 *
 * Manual run only — do NOT crontab (per feedback_no_broadcast_crontab).
 *
 *   docker exec pnptv-bot node apps/backend/scripts/suspicious-members-retro-2026-08-09.js
 *   docker exec pnptv-bot node apps/backend/scripts/suspicious-members-retro-2026-08-09.js --dry-run
 */

'use strict';

const path = require('path');
const svcPath = path.join(__dirname, '..', 'services', 'suspiciousMembersScanService');
const svc = require(svcPath);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const windowDays = 90;

  console.log(`[retro] running 90d suspicious scan (dryRun=${dryRun})`);
  const result = await svc.runDailyScan({ windowDays, dryRun });
  console.log(`[retro] candidates=${result.candidates} flagged=${result.flagged} posted=${result.top.length} durationMs=${result.durationMs}`);

  if (dryRun) {
    console.log('\n=== TOP FLAGGED (dry run, not posted) ===');
    for (const f of result.top) {
      console.log(`\n${f.user.username || f.user.id}  score=${f.score}  role=${f.user.role} creator=${f.user.creator_status}`);
      for (const s of f.signals) {
        console.log(`  • ${s.key} (w${s.weight}) — ${s.detail}`);
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[retro] failed:', err.stack || err.message);
  process.exit(1);
});
