'use strict';

/**
 * slack-create-ext-channels.js  —  Pre-create #ext-<handle> channels for all active creators
 *
 * Creates a personal Slack channel (#ext-<handle>) for every active creator that
 * doesn't have one yet, and saves the channel ID to users.slack_channel_id.
 * Does NOT require creators to be in the Slack workspace.
 *
 * Run:
 *   docker exec pnptv-bot node apps/backend/scripts/slack-create-ext-channels.js
 *   docker exec pnptv-bot node apps/backend/scripts/slack-create-ext-channels.js --dry-run
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { getPool, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const SLACK_API = 'https://slack.com/api';
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 600; // stay under Tier-2 rate limit

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function token() {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error('SLACK_BOT_TOKEN not set');
  return t;
}

async function slackPost(method, body) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return res.json().catch(() => ({ ok: false, error: 'invalid_json_response' }));
}

async function createExtChannel(handle) {
  const name = `ext-${handle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-{2,}/g, '-').slice(0, 76)}`;

  const data = await slackPost('conversations.create', { name, is_private: false });
  if (data.ok) return { channelId: data.channel.id, name };

  if (data.error === 'name_taken') {
    // Find existing channel by paginating through list
    let cursor;
    do {
      const list = await slackPost('conversations.list', {
        types: 'public_channel',
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      if (!list.ok) throw new Error(`conversations.list failed: ${list.error}`);
      const found = (list.channels || []).find(c => c.name === name);
      if (found) return { channelId: found.id, name, existed: true };
      cursor = list.response_metadata?.next_cursor;
    } while (cursor);
    throw new Error(`Channel "${name}" reported name_taken but not found in list`);
  }

  throw new Error(`conversations.create failed: ${data.error}`);
}

async function run() {
  await initializePostgres();
  const pool = getPool();

  if (!process.env.SLACK_BOT_TOKEN) {
    console.error('[ERROR] SLACK_BOT_TOKEN not set. Aborting.');
    process.exit(1);
  }

  console.log(`\n=== Slack #ext channel pre-creation ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  const { rows: creators } = await pool.query(`
    SELECT id, username
      FROM users
     WHERE creator_status = 'active'
       AND slack_channel_id IS NULL
     ORDER BY username
  `);

  if (creators.length === 0) {
    console.log('All active creators already have a Slack channel. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${creators.length} creators needing channels.\n`);

  let created = 0, existed = 0, errors = 0;

  for (let i = 0; i < creators.length; i++) {
    const { id, username } = creators[i];
    const handle = username || String(id);
    const prefix = `[${i + 1}/${creators.length}] @${handle}`;

    if (DRY_RUN) {
      console.log(`${prefix} — [DRY] would create #ext-${handle.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 76)}`);
      created++;
      await sleep(DELAY_MS);
      continue;
    }

    try {
      const { channelId, name, existed: alreadyExisted } = await createExtChannel(handle);

      await pool.query(
        `UPDATE users SET slack_channel_id = $2, updated_at = NOW() WHERE id = $1`,
        [String(id), channelId]
      );

      if (alreadyExisted) {
        console.log(`${prefix} — existed  #${name} (${channelId})`);
        existed++;
      } else {
        console.log(`${prefix} — created  #${name} (${channelId})`);
        created++;
      }
    } catch (err) {
      console.error(`${prefix} — ERROR: ${err.message}`);
      errors++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Created:  ${created}`);
  console.log(`  Existed:  ${existed}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Total:    ${creators.length}`);

  process.exit(errors > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
