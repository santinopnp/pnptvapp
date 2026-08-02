#!/usr/bin/env node
'use strict';

/**
 * One-shot DM to Chase (CHASETHECLOUDS, id 8162853364) with Slack invite
 * + manual testing instructions in English (iPhone Safari focus).
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const CHASE_ID   = '8162853364';
const SYSTEM_ID  = '8552451957';
const SLACK_URL  = 'https://join.slack.com/share/enQtMTE3MjEwMDU2MjA2NDMtNTU0YjMzYjQyYmM3YmJkMWEwZjllMGU4YmY1ZGJkYTZkNzY3NDIwOGYyNWE4MTI2Yzk1NjE5OWZlMzMxN2RkMw';

const MSG = `Hey Chase 👋 — the PNPtv co-founders want your help testing a bunch of new stuff we just shipped, before we open it wider.

*How to join Slack*
Accept the invite here: ${SLACK_URL}

Once you're in, look at the left sidebar for the channel *#testing-chase-the-clouds* — that's our dedicated channel for you. Drop all your feedback there (in a thread on the checklist message Carlos will pin at the top). If you can't get into Slack for any reason, just reply to THIS message with the same info.

*What to test (please do it on your iPhone in Safari, not Chrome iOS)*

📱 *1. Bottom nav* — tap each of the 5 icons. Do they open the right page?

📱 *2. Feed*
  • Scroll the feed. Any weird spacing or missing images?
  • Find a post with more than one photo. Can you swipe between them? Does the counter (1/2, 2/2…) show?
  • Tap a photo — does it open fullscreen? Can you pinch to zoom?

📱 *3. Founders Live announcement*
  Open: https://pnptv.app/social/post/10443
  • Do you see the full 7-slide carousel WITHOUT tapping "View more"?
  • Is there a "View event" button?
  • Tap it — does it open the event page?

📱 *4. Event share page*
  Open: https://pnptv.app/events/b3bdc8b4-7bf8-470e-a695-a59e1dde4a7c
  • Does it load with cover image and time?
  • Try "Open hangout" — drops you into PNPtv Community?

📱 *5. Share a hangout*
  Enter any hangout. Look at the top-right of the chat header.
  • Do you see a share icon (arrow-out-of-box)?
  • Tap it — does the iOS share sheet pop up? Or "Link copied" message?

📱 *6. Any creator profile with photos/videos*
  • Tap a photo — opens fullscreen?
  • Swipe between them — smooth?

📱 *7. Wallet (don't buy anything, just look)*
  • Do you see your token balance?
  • Look at any creator's subscription or call price — the token amount should match the USD price shown (6 tokens per $1).

*How to report*
For each item above, in the Slack thread say:
  ✅ (works)
  ❌ (broken + short description)
  ⚠️ (weird + optional screenshot)

Bunch them together in one message, no need to send one per item. Take your time.

Thanks a ton — you get early access to everything we ship next 🍸

— PNPtv Team`;

(async () => {
  await sendSystemDM(SYSTEM_ID, CHASE_ID, MSG, query);
  console.log(JSON.stringify({ sent_to: CHASE_ID, chars: MSG.length }));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
