#!/usr/bin/env node
'use strict';

/**
 * dm-chris-keene-prime-status-2026-07-29.js
 *
 * One-shot DM from @pnptv (id 8552451957) to Chris Keene confirming his
 * chrisdkeene@gmail.com account is already lifetime100 / PRIME active (Meru
 * code AKYdxu redeemed 2026-07-12) and asking whether he needs any other
 * account merged into this one.
 *
 * Context: he reached out spelling his email `Chrisdkeene@gmil.com` (typo).
 * No account or Meru row exists under that typo — the real account is under
 * chrisdkeene@gmail.com.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/dm-chris-keene-prime-status-2026-07-29.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/dm-chris-keene-prime-status-2026-07-29.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }  = require(path.join(BACKEND, 'config/postgres'));
const DmService  = require(path.join(BACKEND, 'services/dmService'));

const DRY_RUN     = process.argv.includes('--dry-run');
const SENDER_ID   = '8552451957'; // @pnptv / PNPtv! News
const CHRIS_ID    = '5471080d-3f07-4537-b444-29206ef331e5';

const DM_TEXT = [
  `Hey Chris — quick update from PNPtv support.`,
  ``,
  `Good news: your account on chrisdkeene@gmail.com is already PRIME lifetime — no action needed. You paid via Meru (code AKYdxu) and it was redeemed on July 12. So you're fully unlocked: pnptv.app/subscribe already shows your PRIME status, and every gated area (private hangouts, exclusive posts, PNP Live) is open for you forever.`,
  ``,
  `Heads-up on the email you wrote us with — "Chrisdkeene@gmil.com" — that one has a typo (missing "a" in gmail). It doesn't exist in our system. Your real account is chrisdkeene@gmail.com and that's the one that's PRIME.`,
  ``,
  `One question so we can tidy things up: do you have any OTHER account on PNPtv that you'd like merged into this PRIME one? Sometimes people sign up twice — once with Telegram, once with email, or with two different email addresses — and end up with a "second" account that's still on the free tier. If that's you, reply here with:`,
  ``,
  `  • the other email or Telegram handle you used`,
  `  • or a screenshot of the other profile`,
  ``,
  `We'll merge them so everything (subscription, posts, DMs, tokens) lives under one account. If your PRIME one is the only one you use, just reply "all good" and we're done.`,
  ``,
  `— PNPtv`,
].join('\n');

async function main() {
  console.log(`\n=== Chris Keene PRIME status DM ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  const { rows: senderRows } = await query('SELECT id, username, first_name FROM users WHERE id = $1', [SENDER_ID]);
  if (!senderRows.length) throw new Error(`Sender not found: ${SENDER_ID}`);
  console.log(`Sender:    ${senderRows[0].first_name} (@${senderRows[0].username}, id=${SENDER_ID})`);

  const { rows: chrisRows } = await query('SELECT id, email, first_name, tier, plan_id FROM users WHERE id = $1', [CHRIS_ID]);
  if (!chrisRows.length) throw new Error(`Recipient not found: ${CHRIS_ID}`);
  const chris = chrisRows[0];
  console.log(`Recipient: ${chris.first_name} <${chris.email}> tier=${chris.tier} plan=${chris.plan_id} (id=${CHRIS_ID})`);

  console.log(`\n--- DM body (${DM_TEXT.length} chars) ---\n${DM_TEXT}\n---\n`);

  if (DRY_RUN) {
    console.log('[DRY] Would send. Exiting without side effects.');
    process.exit(0);
  }

  const result = await DmService.sendMessage(
    SENDER_ID,
    CHRIS_ID,
    { content: DM_TEXT },
    { isAdmin: true }
  );

  console.log(`✓ Sent. message_id=${result?.id}`);
  process.exit(0);
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
