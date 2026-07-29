#!/usr/bin/env node
'use strict';

/**
 * dm-micah-wall-clarification-2026-07-29.js
 *
 * One-shot DM from @pnptv (id 8552451957) to Micah (BOYCRANK, creator account
 * 3abe90fc-ec39-4e96-9553-996eb220bd86) clarifying that his Telegram is NOT
 * connected to PNPtv — every post visible on his /c/@boycrank wall was created
 * in the app itself. Follows the 2026-07-29 composer hint fix so future
 * creators see this upfront.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/dm-micah-wall-clarification-2026-07-29.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/dm-micah-wall-clarification-2026-07-29.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }  = require(path.join(BACKEND, 'config/postgres'));
const DmService  = require(path.join(BACKEND, 'services/dmService'));

const DRY_RUN     = process.argv.includes('--dry-run');
const SENDER_ID   = '8552451957'; // @pnptv / PNPtv! News
const MICAH_ID    = '3abe90fc-ec39-4e96-9553-996eb220bd86'; // BOYCRANK creator account

const DM_TEXT = [
  `Hey Micah — quick clarification from PNPtv.`,
  ``,
  `You mentioned that everything you post on Telegram ends up on the app. I audited your account and your Telegram channel is NOT connected to PNPtv in any way. Nothing you post on Telegram is being mirrored, copied, or bridged here — I confirmed this in the database.`,
  ``,
  `What's actually happening: every post you create from the PNPtv app itself shows up on your public wall at pnptv.app/c/@boycrank, alongside the community feed. It's the same content viewed from two places — the feed (chronological, everyone) and your wall (your profile, everyone can visit). Same posts, different windows into them.`,
  ``,
  `Sorry — that wasn't communicated clearly in the composer, and I understand why it felt like your Telegram was leaking through. I'm shipping a small hint under the post box today so this is obvious for you and every other creator going forward.`,
  ``,
  `If there are specific posts you'd like removed from your wall, reply here with the links (or open each post from your profile → ••• menu → Delete) and it's done.`,
  ``,
  `— PNPtv`,
].join('\n');

async function main() {
  console.log(`\n=== Micah wall clarification DM ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  const { rows: senderRows } = await query('SELECT id, username, first_name FROM users WHERE id = $1', [SENDER_ID]);
  if (!senderRows.length) throw new Error(`Sender not found: ${SENDER_ID}`);
  console.log(`Sender:    ${senderRows[0].first_name} (@${senderRows[0].username}, id=${SENDER_ID})`);

  const { rows: micahRows } = await query('SELECT id, username, first_name FROM users WHERE id = $1', [MICAH_ID]);
  if (!micahRows.length) throw new Error(`Recipient not found: ${MICAH_ID}`);
  console.log(`Recipient: ${micahRows[0].first_name} (@${micahRows[0].username}, id=${MICAH_ID})`);

  console.log(`\n--- DM body (${DM_TEXT.length} chars) ---\n${DM_TEXT}\n---\n`);

  if (DRY_RUN) {
    console.log('[DRY] Would send. Exiting without side effects.');
    process.exit(0);
  }

  const result = await DmService.sendMessage(
    SENDER_ID,
    MICAH_ID,
    { content: DM_TEXT },
    { isAdmin: true }
  );

  console.log(`✓ Sent. message_id=${result?.id}`);
  process.exit(0);
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
