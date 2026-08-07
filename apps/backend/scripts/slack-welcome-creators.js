#!/usr/bin/env node
/**
 * slack-welcome-creators.js
 *
 * Daily Slack onboarding batch. Runs from host crontab at 05:10 America/Bogota:
 *
 *   10 5 * * * docker exec pnptv-bot node apps/backend/scripts/slack-welcome-creators.js \
 *              >> /opt/pnptvapp/logs/slack-welcome.log 2>&1
 *
 * Delegates to services/creatorOnboardingService.js — the real logic lives
 * there because 2257 approval also fires it live. Idempotent via
 * users.slack_onboarded_at + slack_day3_nudged_at + slack_day7_nudged_at.
 *
 * Passes:
 *   --dry-run    count what would happen, do nothing
 *
 * Anything that used to live inline in this script (message blocks, DB gate,
 * per-creator pacing) is now in creatorOnboardingService.runDailyBatch().
 */

'use strict';

const path = require('path');
const backendPath = path.join(__dirname, '..');

try { require('dotenv').config({ path: path.join(backendPath, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(backendPath, '../../.env.production'), override: true }); } catch {}

const { initializePostgres } = require(path.join(backendPath, 'config/postgres'));
const onboarding = require(path.join(backendPath, 'services/creatorOnboardingService'));

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await initializePostgres();

  const started = Date.now();
  const stats = await onboarding.runDailyBatch({ dryRun: DRY_RUN });
  const durSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `[slack-welcome-creators] done in ${durSec}s — ` +
    `onboarded: ${stats.onboarded ?? 0}, ` +
    `day-3 nudges: ${stats.day3 ?? 0}, ` +
    `day-7 nudges: ${stats.day7 ?? 0}, ` +
    `errors: ${stats.errors ?? 0}` +
    (stats.skipped ? ` (skipped: ${stats.skipped})` : '') +
    (DRY_RUN ? ' [DRY-RUN]' : '')
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('[slack-welcome-creators] fatal:', err);
  process.exit(1);
});
