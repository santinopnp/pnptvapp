/**
 * One-shot: notify users with unused Santino call credits that he's online now.
 * Run: docker run --rm --env-file ... pnptv-bot node apps/backend/scripts/notify-santino-call-credits.js
 */
require('dotenv').config({ path: '/opt/pnptvapp/.env' });
require('dotenv').config({ path: '/opt/pnptvapp/.env.production', override: true });

const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const BOOKING_URL = 'https://pnptv.app/SantinoFurioso';

// Users with unused/partial call credits with Santino (queried 2026-09-12)
const targets = [
  { telegram: '8261112227', username: 'CLOUDYDAYSUPERGAY', duration: 60, creditId: 21 },
  { telegram: '5060931278', username: 'AVERYPARTIES',      duration: 30, creditId: 18 },
  { telegram: '6371807728', username: 'KAPTAINKUM',        duration: 60, creditId: 17 },
  { telegram: '5951629484', username: 'KOBTON1',           duration: 60, creditId: 15 }, // unused
  // credit 11 (KOBTON1 partial, qty_scheduled=1) — skipping, likely already in a booking flow
];

async function main() {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const bot = new Telegraf(BOT_TOKEN);

  for (const t of targets) {
    const msg =
      `Hey! 🔥 Santino is online *right now* and ready for your ${t.duration}-minute private call.\n\n` +
      `You already paid — all you need to do is pick your time.\n\n` +
      `👉 [Book your session now](${BOOKING_URL})`;

    try {
      await bot.telegram.sendMessage(t.telegram, msg, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: `📅 Book My ${t.duration}-Min Call`, url: BOOKING_URL }
          ]]
        }
      });
      console.log(`✅ Sent to ${t.username} (${t.telegram})`);
    } catch (err) {
      console.error(`❌ Failed ${t.username} (${t.telegram}): ${err.message}`);
    }

    // small delay between sends
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
