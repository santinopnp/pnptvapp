#!/usr/bin/env node
'use strict';

/**
 * Targeted DMs to users who have connected a crypto wallet but haven't spent.
 *
 * Segment B (member → PRIME upsell): ELNANO2
 * Segment C (PRIME — activate Ru$h tips): XAXIER00, Chill_Party_bttm
 * + preview copy to SantinoFurioso
 *
 * Usage:
 *   docker cp apps/backend/scripts/dm-crypto-wallet-activate-2026-09-18.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/dm-crypto-wallet-activate-2026-09-18.js --dry-run
 *   docker exec pnptv-bot node /tmp/dm-crypto-wallet-activate-2026-09-18.js
 */

const path = require('path');
// Script runs from /tmp inside container; backend is always at /app/apps/backend
const BACKEND = '/app/apps/backend';
try { require('dotenv').config({ path: '/app/.env' }); } catch {}
try { require('dotenv').config({ path: '/app/.env.production', override: true }); } catch {}

const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram } = require('/app/node_modules/telegraf');

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_TG  = process.argv.includes('--skip-telegram');
const SKIP_DM  = process.argv.includes('--skip-dm');

const tg = new Telegram(process.env.BOT_TOKEN);
const SYSTEM_SENDER_ID = '8552451957'; // @pnptv / PNPtv! News
const TG_DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Messages ─────────────────────────────────────────────────────────────────

const MSG_B = {
  text:
    `💎 *Your wallet is ready — upgrade is one tap away*\n\n` +
    `You already have your crypto wallet connected to PNPtv. ` +
    `Add some USDC and unlock everything: exclusive live shows, ` +
    `private videos, and access your favorite creators up close.\n\n` +
    `You're literally one step away. 🔥`,
  button: { text: '🚀 Upgrade to PRIME', url: 'https://pnptv.app' },
};

const MSG_C = {
  text:
    `💎 *Your crypto wallet is live on PNPtv*\n\n` +
    `Next time Santino or your favorite creator goes live, ` +
    `send them some Ru$h 💎 — it's instant, one tap, and they see it in real time.\n\n` +
    `The easiest way to show love. Try it next show.`,
  button: { text: '💎 Open PNPtv', url: 'https://pnptv.app' },
};

// ── Targets ───────────────────────────────────────────────────────────────────

const TARGETS = [
  // Segment C preview — Santino sees what users receive
  {
    userId: '8599671840',
    telegram: 8599671840,
    label: 'SantinoFurioso (preview)',
    msg: MSG_C,
  },
  // Segment B: member → PRIME upsell
  {
    userId: '5524350758',
    telegram: 5524350758,
    label: 'ELNANO2 (member, Segment B)',
    msg: MSG_B,
  },
  // Segment C: PRIME, activate Ru$h tips
  {
    userId: '272444158',
    telegram: 272444158,
    label: 'XAXIER00 (PRIME, Segment C)',
    msg: MSG_C,
  },
  {
    userId: '7857923659',
    telegram: 7857923659,
    label: 'Chill_Party_bttm (PRIME, Segment C)',
    msg: MSG_C,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[dm-crypto-wallet] DRY_RUN=${DRY_RUN} SKIP_TG=${SKIP_TG} SKIP_DM=${SKIP_DM}`);
  console.log(`[dm-crypto-wallet] Sending to ${TARGETS.length} targets\n`);

  for (const t of TARGETS) {
    console.log(`→ ${t.label}`);

    // In-app system DM
    if (!SKIP_DM) {
      try {
        if (!DRY_RUN) {
          await sendSystemDM({
            senderId: SYSTEM_SENDER_ID,
            recipientId: t.userId,
            text: t.msg.text.replace(/\*/g, ''),
          });
        }
        console.log(`  ✓ in-app DM ${DRY_RUN ? '(dry)' : 'sent'}`);
      } catch (e) {
        console.error(`  ✗ in-app DM failed: ${e.message}`);
      }
    }

    // Telegram DM
    if (!SKIP_TG && t.telegram) {
      try {
        if (!DRY_RUN) {
          await tg.sendMessage(t.telegram, t.msg.text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: t.msg.button.text, url: t.msg.button.url }]],
            },
          });
        }
        console.log(`  ✓ Telegram DM ${DRY_RUN ? '(dry)' : 'sent'}`);
      } catch (e) {
        console.error(`  ✗ Telegram DM failed: ${e.message}`);
      }
    }

    await sleep(TG_DELAY_MS);
  }

  console.log('\n[dm-crypto-wallet] Done.');
}

main().catch((e) => { console.error('[dm-crypto-wallet] FATAL:', e); process.exit(1); });
