#!/usr/bin/env node
'use strict';

/**
 * One-shot: DM the stranded-funds rescue instructions to KOBTON1 and CC Santino.
 * Not a broadcast — targeted single-user support message.
 */

const path = require('path');
const fs = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const SYSTEM_SENDER = '8552451957';   // @pnptv
const KOBTON1_ID    = '5951629484';
const SANTINO_ID    = '8599671840';

const OLD_WALLET = '0x750ED59c4133F1698efc2279689d7D368831b1a5';
const NEW_WALLET = '0x6c57fdbf3e09b2e9c2196262e365078117bdb3fb';
const USDC_ETH_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const BODY = `Hey — quick fix for the $322 USDC that isn't showing in your PNPtv wallet.

WHAT HAPPENED
When you connected your wallet a few weeks back, our system created two separate wallets for you on two separate blockchains. The USDC you bought with Revolut landed on the OLD wallet on Ethereum mainnet, but the PNPtv app now looks at your NEW wallet on the Base network. Same 0x address is not shared — they're two different addresses.

Your $322 is safe. Nobody moved it. It's sitting on the OLD address, waiting for you to pull it out and send it to your NEW address.

Your OLD address (where the $322 sits, on Ethereum mainnet):
    ${OLD_WALLET}

Your NEW address (what PNPtv now uses, on Base):
    ${NEW_WALLET}

You need to move the funds from OLD → NEW. Takes about 10 minutes.

────────────────────────────────
STEP 1 — Get the private key for the OLD wallet
────────────────────────────────
The OLD wallet was created by Privy (the wallet service PNPtv uses). You exported the private key back when the account existed. Check for it in:

  • A password manager entry from around August/September 2026
  • A screenshot on your phone
  • A note file titled something like "PNPtv wallet key" or "0x750E…"
  • Your MetaMask app — if you already imported it, skip to Step 3

The private key is a 64-character string starting with 0x (66 chars total).

If you can't find the private key, reply here — we have another path but it only works because you exported it while the account was alive.

────────────────────────────────
STEP 2 — Import into MetaMask
────────────────────────────────
1. Open MetaMask (install from metamask.io if you don't have it — mobile app is fine)
2. Tap your account icon (top right)
3. Tap "Add account or hardware wallet"
4. Tap "Import account"
5. Paste the private key from Step 1
6. Tap "Import"
7. Confirm the address matches: ${OLD_WALLET}

────────────────────────────────
STEP 3 — Switch to Ethereum mainnet and verify
────────────────────────────────
1. In MetaMask, tap the network selector at the top
2. Choose "Ethereum Mainnet"  (NOT Base, NOT Sepolia, NOT Arbitrum)
3. You should see about $322 in USDC
4. If you don't see USDC, tap "Import tokens" and paste:
       ${USDC_ETH_MAINNET}

If the $322 is there, continue. If not, screenshot and send it here — don't proceed.

────────────────────────────────
STEP 4 — Bridge USDC from Ethereum → Base with Circle's CCTP
────────────────────────────────
CCTP is Circle's official USDC bridge. Safest + cheapest route.

1. Open https://app.cctp.money
2. Connect MetaMask, pick the account you just imported (0x750E…)
3. Source chain: Ethereum
4. Destination chain: Base
5. Amount: full USDC balance
6. Destination address: your NEW wallet — ${NEW_WALLET}
   Double-check every character. Once sent, it can't be reversed.
7. Approve the two MetaMask popups:
       (a) Approve USDC spending
       (b) Burn on Ethereum
8. Wait ~15–20 minutes for Base to mint (CCTP has a soft-finality delay)

You'll need a tiny bit of ETH on the OLD wallet for gas — usually under $5. If you don't have enough, reply and I'll top it up from our treasury.

────────────────────────────────
STEP 5 — Verify in PNPtv
────────────────────────────────
1. Open https://pnptv.app/wallet
2. Refresh the page
3. Your USDC balance should show ~$322
4. That balance works on Ru$h purchases, tips, everything

────────────────────────────────
Reply here if any step doesn't work exactly as described — I'll help.`;

async function main() {
  console.log('Sending rescue DM to KOBTON1…');
  await sendSystemDM(SYSTEM_SENDER, KOBTON1_ID, BODY, query);
  console.log(`✓ DM sent to KOBTON1 (${KOBTON1_ID}) — ${BODY.length} chars`);

  const santinoBody = `[CC] Just DM'd KOBTON1 the rescue playbook for the $322 USDC on ${OLD_WALLET} (Ethereum L1). Steps: private-key export → MetaMask import → CCTP bridge to Base → verify in PNPtv wallet.`;
  await sendSystemDM(SYSTEM_SENDER, SANTINO_ID, santinoBody, query);
  console.log(`✓ CC sent to Santino (${SANTINO_ID})`);

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
