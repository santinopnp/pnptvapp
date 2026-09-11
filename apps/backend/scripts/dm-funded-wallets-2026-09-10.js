#!/usr/bin/env node
'use strict';

/**
 * dm-funded-wallets-2026-09-10.js
 *
 * One-shot targeted DM to the 3 users with funded Privy wallets on Base:
 *   - WN2129     (TG 6073558066) PRIME  — $7 ETH
 *   - CLOUDYPHAG (TG 8988169515) free   — $1.51 ETH
 *   - WHOREHE48  (no TG)         free   — $23.46 USDC  → push only
 *
 * Usage:
 *   node dm-funded-wallets-2026-09-10.js          → dry run
 *   node dm-funded-wallets-2026-09-10.js --live   → send
 */

const path  = require('path');
const https = require('https');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY       = !process.argv.includes('--live');
const BOT_TOKEN = process.env.BOT_TOKEN;
const sleep     = ms => new Promise(r => setTimeout(r, ms));

// ── Targets ───────────────────────────────────────────────────────────────────

const TG_TARGETS = [
  {
    username: 'WN2129',
    telegram: '6073558066',
    name: 'N',
    balance: '~$7 in ETH',
    isPrime: true,
  },
  {
    username: 'CLOUDYPHAG',
    telegram: '8988169515',
    name: 'N',
    balance: '~$1.51 in ETH',
    isPrime: false,
  },
];

const PUSH_TARGET = {
  userId: 'b32f8ae7-a0af-4b75-b692-a4784560fb85', // WHOREHE48
  name: 'Jorgie',
  balance: '$23.46 USDC',
};

// ── Copy ─────────────────────────────────────────────────────────────────────

function msgPrime(name, balance) {
  const hi = name && name.length > 1 ? `Hey ${name}` : 'Hey';
  return `${hi} 👋

You've got ${balance} sitting in your PNPtv! wallet on Base — ready to spend.

As a PRIME member you already have full access, so put that crypto to work:

💎 Buy Ru$h and tip your favorite creator live on Main Stage
📞 Book a private call — your ETH covers it directly
🔓 Unlock exclusive content from any creator

Everything's in your wallet — one tap away.`;
}

function msgFree(name, balance) {
  const hi = name && name.length > 1 ? `Hey ${name}` : 'Hey';
  return `${hi} 👋

You've got ${balance} sitting in your PNPtv! wallet on Base — and it's ready to use right now.

Here's what it unlocks:

🌟 PRIME membership — exclusive content, private calls, live streams, everything
💎 Ru$h 💎 to tip creators live during Main Stage
📞 A private call, booked directly from your wallet

Your crypto is already there. One tap to spend it.`;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function tgSend(chatId, text) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '💎 Open my wallet', url: 'https://pnptv.app/wallet' }]] },
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  await PushNotificationService.initialize();

  console.log('════════════════════════════════════════════');
  console.log('  Funded-wallet spend nudge  2026-09-10');
  console.log(`  MODE: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('════════════════════════════════════════════\n');

  // ── Telegram DMs ────────────────────────────────────────────────────────────
  for (const t of TG_TARGETS) {
    const text = t.isPrime ? msgPrime(t.name, t.balance) : msgFree(t.name, t.balance);
    console.log(`[TG] @${t.username} (${t.balance})`);
    if (DRY) {
      console.log(text);
      console.log('  [button] 💎 Open my wallet → https://pnptv.app/wallet\n');
      continue;
    }
    const res = await tgSend(t.telegram, text);
    if (res.ok) {
      console.log(`  ✓ sent`);
    } else {
      console.error(`  ✗ ${res.description || JSON.stringify(res)}`);
    }
    await sleep(500);
  }

  // ── Push for WHOREHE48 ──────────────────────────────────────────────────────
  console.log(`\n[PUSH] @WHOREHE48 / Jorgie (${PUSH_TARGET.balance})`);
  const pushOpts = {
    title: 'Your wallet has $23 ready to spend 💎',
    body: 'PRIME, Ru$h, calls — unlock it all with one tap.',
    url: '/wallet',
    icon: '/icon-192.png',
    tag: 'funded-wallet-nudge-whorehe48',
  };
  if (DRY) {
    console.log(`  title: "${pushOpts.title}"`);
    console.log(`  body:  "${pushOpts.body}"\n`);
  } else {
    const n = await PushNotificationService.sendToUsers([PUSH_TARGET.userId], pushOpts);
    console.log(`  ✓ push delivered: ${n}`);
  }

  console.log('\nDone.');
  process.exit(0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
