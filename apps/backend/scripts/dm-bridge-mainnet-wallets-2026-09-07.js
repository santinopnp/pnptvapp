#!/usr/bin/env node
'use strict';

/**
 * dm-bridge-mainnet-wallets-2026-09-07.js
 *
 * Sends a personal DM from Santino to the small cohort of users who have
 * ETH or USDC on Ethereum mainnet (detected via Privy wallet audit).
 * Tells them their wallet already has a one-tap bridge button — open
 * pnptv.app, tap 💎, bridge it in 10-15 min.
 *
 * Targets (as of 2026-09-07 audit):
 *   KOBTON1         $122.00 USDC on ETH mainnet
 *   THEJURONGOTTER  $10.00 USDC on ETH mainnet
 *   CLOUDYPHAG      $1.57 USDC on ETH mainnet
 *
 * Read the audit JSON at runtime so the amount shown is accurate.
 * Dry-run: DM_BRIDGE_DRY_RUN=1 node <script>
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const PNPTV_ID    = '8552451957';
const DRY_RUN     = process.env.DM_BRIDGE_DRY_RUN === '1';

const LOG_DIR   = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, 'dm-bridge-mainnet-wallets-2026-09-07-sent.log');
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => {
  try { return new Set(fsSync.readFileSync(SENT_FILE, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
};
const markSent = (id) => { try { fsSync.appendFileSync(SENT_FILE, `${id}\n`); } catch {} };
const sleep    = (ms) => new Promise(r => setTimeout(r, ms));

// Users with mainnet funds + their balance for personalisation.
// Sorted by balance desc so the biggest holder gets messaged first.
const TARGETS = [
  { username: 'KOBTON1',        totalUsd: 122.00 },
  { username: 'THEJURONGOTTER', totalUsd:  10.00 },
  { username: 'CLOUDYPHAG',     totalUsd:   1.57 },
];

function buildMessage(name, totalUsd) {
  const displayName = name && name !== '-' ? ` ${name}` : '';
  const amount      = `$${totalUsd.toFixed(2)}`;

  const greeting = displayName.trim().length > 1 ? `Hey${displayName}` : 'Hey';

  return `${greeting} — PNPtv here 👋

You have ${amount} in your crypto wallet, but it's sitting on Ethereum mainnet — a different network than the one PNPtv uses. That means right now those funds can't be used on the platform.

Bridging fixes that. It moves your money from Ethereum mainnet to Base (the network PNPtv runs on), and once it's there you can use it for memberships, private calls, Ru$h 💎, anything on the site.

The best part: your PNPtv wallet already has a one-tap bridge built in. No third-party app needed.

Here's all you do:
1. Open pnptv.app
2. Tap the 💎 button (top right)
3. You'll see a "Bridge → Base" button with your ${amount} ready to move
4. Tap it and confirm — done in 10-15 min

👉 https://pnptv.app

Any questions, just reply here.

— PNPtv`;
}

async function main() {
  console.log(`\n[Bridge mainnet wallet DM — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}]\n`);

  await initializePostgres();
  const sent = loadSentSet();

  // Resolve user IDs + names for all targets in one query
  const usernames = TARGETS.map(t => t.username);
  const { rows } = await query(
    `SELECT id, username, first_name, language
     FROM users
     WHERE username = ANY($1::text[])`,
    [usernames]
  );

  const byUsername = new Map(rows.map(r => [r.username, r]));

  let successCount = 0;
  let skipCount    = 0;

  for (const target of TARGETS) {
    const user = byUsername.get(target.username);
    if (!user) {
      console.log(`  ⚠️  ${target.username} — not found in DB, skipping`);
      continue;
    }

    if (sent.has(user.id)) {
      console.log(`  ⏭  ${target.username} — already sent, skipping`);
      skipCount++;
      continue;
    }

    const name    = user.first_name || '';
    const message = buildMessage(name, target.totalUsd);

    console.log(`\n  → ${target.username} (${user.id}) — $${target.totalUsd}`);
    console.log(`     name: ${name || '(none)'}`);

    if (DRY_RUN) {
      console.log('     [DRY RUN] Message preview:\n');
      console.log(message.split('\n').map(l => '     ' + l).join('\n'));
      successCount++;
      continue;
    }

    try {
      await sendSystemDM(PNPTV_ID, user.id, message, query);
      markSent(user.id);
      console.log(`     ✓ sent`);
      successCount++;
    } catch (err) {
      console.error(`     ✗ failed: ${err.message}`);
    }

    await sleep(1500);
  }

  console.log(`\n  Done — sent: ${successCount}, skipped: ${skipCount}\n`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
