/**
 * One-off: re-send the 7-day compliance-started notice for the 3 creators whose
 * notification failed during the 2026-07-21 restore run (NotificationEmitter.emit
 * threw a FK violation because contentComplianceService.js used actorId:'system'
 * instead of actorId:null — fixed, but startComplianceClockIfNeeded is idempotent
 * so re-running it now would no-op; this calls the private notice method directly).
 * Their compliance_deadline was already set correctly by the restore run — only
 * the notification delivery is being retried here.
 */
const { query } = require('../config/postgres');
const ContentComplianceService = require('../services/contentComplianceService');

const CREATOR_IDS = ['5994313923', '7246621722', '50da5ca8-08fa-4a71-a6f0-cab5331391eb'];

async function main() {
  for (const creatorId of CREATOR_IDS) {
    const { rows } = await query(
      'SELECT username, creator_content_compliance_deadline FROM users WHERE id=$1',
      [creatorId]
    );
    const user = rows[0];
    if (!user?.creator_content_compliance_deadline) {
      console.log(`[SKIP] ${creatorId} — no deadline on file`);
      continue;
    }
    await ContentComplianceService._sendComplianceStartedNotice(creatorId, user.creator_content_compliance_deadline);
    console.log(`[SENT] ${creatorId} (${user.username}) — deadline ${user.creator_content_compliance_deadline}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
