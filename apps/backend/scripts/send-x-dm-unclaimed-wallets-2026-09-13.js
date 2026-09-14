'use strict';

/**
 * Send X DMs from @SantinoFurioso to users with unclaimed Privy wallet funds.
 * Uses X API v2 with OAuth 2.0 user context.
 *
 * Run: node send-x-dm-unclaimed-wallets-2026-09-13.js [--dry-run]
 */

const axios = require('axios');

const DRY_RUN = process.argv.includes('--dry-run');

const TARGETS = [
  {
    handle: 'SparkBlastFire',
    balance: '$120.31',
    plan_id: 'custom-prime-sparkblastfire',
    message: (h, b) =>
      `${b} is sitting in a PNPtv wallet RIGHT NOW waiting for you to claim it. ` +
      `We built a plan for your exact amount — Lifetime PRIME (never pay again) + 122 Ru$h 💎 for tips and private calls — ` +
      `all covered by the ${b} already in your wallet. ` +
      `Don't leave it there. Sign up at https://pnptv.app and it's yours instantly. Reply if you need help getting in.`,
  },
  {
    handle: 'sfb8te',
    balance: '$50.34',
    plan_id: 'custom-prime-sfb8te',
    message: (h, b) =>
      `You have ${b} sitting idle in a PNPtv wallet. That's a full year of PRIME — ` +
      `365 days of exclusive content, live streams, and private creator calls — ` +
      `and it's already paid for with your ${b}. ` +
      `All you have to do is finish signing up. Go to https://pnptv.app, connect your wallet, and your year starts immediately. ` +
      `Don't let it sit there. Reply if you need help.`,
  },
  {
    handle: 'dsfsdfsfsdf13',
    balance: '$38.37',
    plan_id: 'custom-prime-dsfsdfsfsdf13',
    message: (h, b) =>
      `${b} is in a PNPtv wallet with your name on it and it's going nowhere until you claim it. ` +
      `We made a plan for your exact balance: 46 days of PRIME + 81 Ru$h 💎 for tips and calls — ` +
      `every cent spent, zero wasted. ` +
      `Finish signing up at https://pnptv.app and it activates the second you connect your wallet. ` +
      `Seriously, don't leave this on the table. Reply if you need any help.`,
  },
  {
    handle: 'JordanHalverso3',
    balance: '$25.87',
    plan_id: 'custom-prime-jordan',
    message: (h, b) =>
      `Hey — ${b} is sitting in a PNPtv wallet you never finished claiming. ` +
      `We set up a plan for your exact amount: 31 days of PRIME + 5 Ru$h 💎. ` +
      `Exclusive content, live streams, private calls — all unlocked with money that's already yours. ` +
      `Sign up at https://pnptv.app right now, connect your wallet, it starts instantly. ` +
      `Don't leave it sitting there. Reply if you hit any issues.`,
  },
  {
    handle: 'RubAlo77',
    balance: '$21.48',
    plan_id: 'custom-prime-rubalo77',
    message: (h, b) =>
      `You started signing up for PNPtv and left ${b} behind in a wallet. ` +
      `We made a plan that uses every cent: 26 days of PRIME + 3 Ru$h 💎 for private calls and tips. ` +
      `It's already paid for — you just need to finish signing up. ` +
      `Go to https://pnptv.app now, connect your wallet, and it's active immediately. ` +
      `Don't walk away from ${b}. Reply if you need a hand.`,
  },
  {
    handle: 'ozekoz',
    balance: '$20.63',
    plan_id: 'custom-prime-ozekoz',
    message: (h, b) =>
      `${b} is waiting in a PNPtv wallet you never finished claiming — and we're not letting it go to waste. ` +
      `Custom plan built for you: 25 days of PRIME + 4 Ru$h 💎, all for exactly ${b}. ` +
      `Sign up at https://pnptv.app, connect your wallet, unlock everything immediately. ` +
      `This is your money. Come get it. Reply if you need help.`,
  },
  {
    handle: 'bbinphx2025',
    balance: '$16.53',
    plan_id: 'custom-prime-bbinphx2025',
    message: (h, b) =>
      `You left ${b} in a PNPtv wallet when you tried signing up. It's still there. ` +
      `We built a plan just for you: 20 days of PRIME + 3 Ru$h 💎 for exactly ${b} — not a cent wasted. ` +
      `Exclusive content, live streams, private creator calls all unlocked. ` +
      `Finish signing up at https://pnptv.app and it activates instantly. ` +
      `Don't leave ${b} behind. Reply and we'll walk you through it.`,
  },
  {
    handle: 'StarkKellen',
    balance: '$15.54',
    plan_id: 'custom-prime-starkkellen',
    message: (h, b) =>
      `${b} has been sitting in a PNPtv wallet since you tried signing up. Come claim it. ` +
      `We made a plan for your exact balance: 18 days of PRIME + 3 Ru$h 💎 — exclusive content, live streams, private calls. ` +
      `It's all covered by the ${b} already in your account. ` +
      `Sign up at https://pnptv.app now and it activates the moment you connect your wallet. ` +
      `Reply if you need any help — we've got you.`,
  },
  {
    handle: 'hifunfunfunfun',
    balance: '$3.51',
    plan_id: 'custom-prime-hifunfunfunfun',
    message: (h, b) =>
      `You left ${b} in a PNPtv wallet — it's small but it's yours and it shouldn't just sit there. ` +
      `We built a plan for your exact balance: 4 days of full PRIME access — exclusive content, live streams, private creator calls. ` +
      `Sign up at https://pnptv.app, connect your wallet, and those 4 days start immediately. ` +
      `Come get it. Reply if you need help.`,
  },
];

async function lookupUserId(handle, accessToken) {
  const res = await axios.get(`https://api.twitter.com/2/users/by/username/${handle}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  return res.data.data; // { id, name, username }
}

async function sendDM(recipientId, text, accessToken) {
  const res = await axios.post(
    `https://api.twitter.com/2/dm_conversations/with/${recipientId}/messages`,
    { text },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );
  return res.data;
}

async function main() {
  console.log(`\n🦋 X DM — Unclaimed Wallet Funds [${DRY_RUN ? 'DRY RUN' : 'LIVE'}]\n`);

  const accessToken = process.env.X_ACCESS_TOKEN;
  if (!accessToken) throw new Error('X_ACCESS_TOKEN not set');

  console.log(`📋 ${TARGETS.length} targets\n`);

  let sent = 0;
  let failed = 0;

  for (const target of TARGETS) {
    const msg = target.message(target.handle, target.balance);
    console.log(`\n🔍 @${target.handle} (${target.balance} | plan: ${target.plan_id})`);

    if (DRY_RUN) {
      console.log(`   MSG: ${msg}\n`);
      console.log(`   [DRY RUN — skipped]`);
      continue;
    }

    let user;
    try {
      user = await lookupUserId(target.handle, accessToken);
      console.log(`   Found: ${user.name} (${user.id})`);
    } catch (err) {
      console.log(`   ⚠️  Not found: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
      failed++;
      continue;
    }

    try {
      await sendDM(user.id, msg, accessToken);
      console.log(`   ✅ Sent`);
      sent++;
    } catch (err) {
      console.error(`   ❌ Failed: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n🏁 Done — sent: ${sent}, failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
