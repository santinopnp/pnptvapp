'use strict';
/**
 * One-shot DM to 4 users who paid for a call with Santino but never had it.
 * Notifies them of the 30-min bonus added to their credit.
 * Dedup key: dm_unfulfilled_calls_bonus_20260924
 */

const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN not set');
  process.exit(1);
}

const CAMPAIGN_KEY = 'dm_unfulfilled_calls_bonus_20260924';

const TARGETS = [
  { telegramId: 5951629484, username: 'KOBTON1',           creditId: 15, packageMin: 60 },
  { telegramId: 6371807728, username: 'KAPTAINKUM',        creditId: 17, packageMin: 60 },
  { telegramId: 5060931278, username: 'AVERYPARTIES',      creditId: 18, packageMin: 30 },
  { telegramId: 8261112227, username: 'CLOUDYDAYSUPERGAY', creditId: 21, packageMin: 60 },
];

const MESSAGE = `Hey papi 💋 Thank you so much for booking time with me — it means more than you know. I'm sorry we haven't connected yet and I really want to fix that. This weekend I'm stepping away from app stuff and focusing on what I actually love — spending time with you. Oh, and I just added 30 bonus minutes to your call as a thank you for your patience 🔥 When are you usually online? Let's finally make this happen.`;

async function main() {
  const bot = new Telegraf(BOT_TOKEN);

  for (const target of TARGETS) {
    const tag = `${CAMPAIGN_KEY}_${target.username}`;
    try {
      await bot.telegram.sendMessage(target.telegramId, MESSAGE);
      console.log(`✓ Sent to ${target.username} (${target.telegramId}) [credit #${target.creditId}, ${target.packageMin + 30} min effective]`);
    } catch (err) {
      console.error(`✗ Failed to send to ${target.username} (${target.telegramId}):`, err.message);
    }
    // Small delay to avoid Telegram rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
