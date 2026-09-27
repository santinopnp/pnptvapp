#!/usr/bin/env node
'use strict';

/**
 * Broadcast: stranded-funds check.
 *
 * Draft only — asks every user with a Privy wallet to reply if they ever sent
 * USDC or ETH to a wallet address they don't see in the app anymore. This is
 * how we surface the 22 orphaned wallets ($771 total, mostly small) whose
 * owners we can't identify from the DB.
 *
 * NOT SENT until Santino approves the copy. Force-includes Santino for
 * verification.
 *
 * Usage:
 *   docker run --rm -e ... node broadcast-wallet-stranded-funds-check-2026-09-27.js --dry-run
 *   docker run --rm -e ... node broadcast-wallet-stranded-funds-check-2026-09-27.js
 */

const path  = require('path');
const fs    = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN = process.argv.includes('--dry-run');

const CAMPAIGN      = 'wallet-stranded-check-v1';
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const WALLET_URL    = 'https://pnptv.app/wallet';
const HERO_URL      = 'https://pnptv.app/videos/rush-marketing-vertical-en.jpg';

const EXCLUDED_IDS = [
  SYSTEM_SENDER,
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91', // Lex
];

function dmBody(name) {
  return `Hey ${name} — quick check.

We recently updated our wallet system. If, at any point, you sent USDC or ETH to a wallet address that no longer appears in your PNPtv wallet, those funds are safe — but they're sitting at your OLD address and won't show up in the app.

Reply to this DM with:
  1. The old wallet address (starts with 0x…)
  2. Roughly when you sent the funds

We'll walk you through moving them to your current wallet — takes 5 minutes and we cover any gas.

Nothing to do if this doesn't ring a bell. Your current wallet is safe and up-to-date.
${WALLET_URL}`.trim();
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` STRANDED-FUNDS CHECK — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const excludedPlaceholders = EXCLUDED_IDS.map((_, i) => `$${i + 1}`).join(',');
  const { rows: users } = await query(`
    SELECT u.id, u.username, u.first_name
      FROM users u
     WHERE u.privy_id IS NOT NULL
       AND u.is_deleted = false
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND u.id::text NOT IN (${excludedPlaceholders})
     ORDER BY u.created_at DESC
  `, EXCLUDED_IDS);

  console.log(` Users with linked Privy wallet: ${users.length}\n`);
  const stats = { sent: 0, err: 0 };

  for (const u of users) {
    const first = String(u.first_name || '').trim().split(/\s+/)[0];
    const name = (first && first.length >= 2 && !/^\d+$/.test(first))
      ? first : (u.username || 'there');
    const body = dmBody(name);
    if (DRY_RUN) {
      console.log(` [DRY] → @${u.username || u.id}`);
      continue;
    }
    try {
      await sendSystemDM(SYSTEM_SENDER, u.id, body, query, { mediaUrl: HERO_URL, mediaType: 'image' });
      stats.sent++;
      console.log(` ✓ @${u.username || u.id}`);
    } catch (err) {
      stats.err++;
      console.warn(` ✗ @${u.username || u.id}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  if (!DRY_RUN) {
    // Force-include Santino for verification
    try {
      await sendSystemDM(SYSTEM_SENDER, SANTINO_ID, dmBody('Santino'), query, { mediaUrl: HERO_URL, mediaType: 'image' });
      console.log('\n[CC] Santino verification DM sent');
    } catch (err) {
      console.warn('[CC] Santino DM failed:', err.message);
    }
    const summary = `[${CAMPAIGN}] Complete.\nSent: ${stats.sent}\nErrors: ${stats.err}`;
    try { await sendSystemDM(SYSTEM_SENDER, SANTINO_ID, summary, query); } catch {}
  }

  console.log(`\n Sent: ${stats.sent} · Errors: ${stats.err}\n`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
