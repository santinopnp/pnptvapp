'use strict';

/**
 * slack-onboard-creators.js  —  Phase 0 Creator Slack Onboarding
 *
 * Iterates all active creators with no Slack connection and invites them to:
 *   - The Slack workspace (via email lookup)
 *   - Shared creator channels (updates, lounge, training)
 *   - Their personal #ext-<handle> channel
 *
 * Stores slack_member_id + slack_channel_id on the users row.
 *
 * Run:
 *   docker exec pnptv-bot node apps/backend/scripts/slack-onboard-creators.js
 *   docker exec pnptv-bot node apps/backend/scripts/slack-onboard-creators.js --dry-run
 *
 * Required env vars (from .env.production):
 *   SLACK_BOT_TOKEN
 *   SLACK_CHANNEL_UPDATES   (optional — skipped if missing)
 *   SLACK_CHANNEL_LOUNGE    (optional)
 *   SLACK_CHANNEL_TRAINING  (optional)
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

// Load env from monorepo root
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { getPool, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const slackService = require(path.join(BACKEND, 'services/slackService'));

const DRY_RUN = process.argv.includes('--dry-run');
// 1 second between creators to stay well within Slack Tier-2 rate limits
const DELAY_MS = 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  await initializePostgres();
  const pool = getPool();

  if (!process.env.SLACK_BOT_TOKEN) {
    console.error('[ERROR] SLACK_BOT_TOKEN is not set. Aborting.');
    process.exit(1);
  }

  console.log(`\n=== Slack Creator Onboarding ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  // Fetch all active creators missing Slack connection
  const { rows: creators } = await pool.query(`
    SELECT id, username, email, first_name
      FROM users
     WHERE creator_status = 'active'
       AND slack_member_id IS NULL
     ORDER BY username
  `);

  if (creators.length === 0) {
    console.log('All active creators already have Slack connections. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${creators.length} active creators without Slack connection.\n`);

  let joined = 0;
  let notInWorkspace = 0;
  let errors = 0;

  for (let i = 0; i < creators.length; i++) {
    const creator = creators[i];
    const handle = creator.username || String(creator.id);
    const prefix = `[${i + 1}/${creators.length}] @${handle}`;

    if (!creator.email) {
      console.log(`${prefix} — SKIP: no email address`);
      notInWorkspace++;
      await sleep(DELAY_MS);
      continue;
    }

    try {
      if (DRY_RUN) {
        console.log(`${prefix} — [DRY] would invite ${creator.email}`);
        joined++;
      } else {
        const { memberId, channelId } = await slackService.inviteCreatorToWorkspace(
          creator.email,
          handle
        );

        if (!memberId) {
          console.log(`${prefix} — not in workspace (${creator.email})`);
          notInWorkspace++;
        } else {
          await slackService.saveCreatorSlackIds(
            (sql, params) => pool.query(sql, params),
            creator.id,
            memberId,
            channelId
          );
          console.log(`${prefix} — joined  (member=${memberId}, channel=${channelId})`);
          joined++;
        }
      }
    } catch (err) {
      console.error(`${prefix} — error: ${err.message}`);
      errors++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Joined:          ${joined}`);
  console.log(`  Not in workspace: ${notInWorkspace}`);
  console.log(`  Errors:           ${errors}`);
  console.log(`  Total:            ${creators.length}`);

  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
