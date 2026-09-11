'use strict';
/**
 * Standalone featured-creator broadcast for FERBEARCDMX — 2026-09-07.
 * Creates its own Telegraf instance (no running bot needed).
 */

const { Telegraf } = require('telegraf');
const { getPool } = require('../config/postgres');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);

const CREATOR_ID = '5643392748';
const CREATOR_USERNAME = 'FERBEARCDMX';
const HERO_URL = 'https://pnptv.app/uploads/featured/ferbearcdmx-20260907.jpg';
const PROFILE_LINK = `https://pnptv.app/c/${encodeURIComponent(CREATOR_USERNAME)}`;

const CAPTION = `<b>Model of the day 💎</b>\n<b>FERBEARCDMX</b> (@FERBEARCDMX)\n\nMexico's wildest bear is here. Raw heat, bold moves, zero filter — all eyes on him today.`;
const INLINE = { inline_keyboard: [[{ text: '💎 Open profile', url: PROFILE_LINK }]] };

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1100;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pool = getPool();

  const { rows: audience } = await pool.query(
    `SELECT telegram
       FROM users
      WHERE telegram IS NOT NULL
        AND age_verified = TRUE
        AND terms_accepted = TRUE
        AND deleted_at IS NULL`
  );

  console.log(`Audience: ${audience.length} users`);

  let sent = 0, failed = 0, reusableFileId = null;

  for (let i = 0; i < audience.length; i++) {
    const u = audience[i];
    try {
      const media = reusableFileId || HERO_URL;
      const resp = await Promise.race([
        bot.telegram.sendPhoto(u.telegram, media, { caption: CAPTION, parse_mode: 'HTML', reply_markup: INLINE }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_20s')), 20000)),
      ]);
      if (!reusableFileId && resp.photo?.length) {
        reusableFileId = resp.photo[resp.photo.length - 1].file_id;
        console.log('Reusing file_id after first send');
      }
      sent++;
    } catch (err) {
      failed++;
      if (failed === 1) console.error('First error:', err.message);
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${audience.length} | sent=${sent} failed=${failed}`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`Done. sent=${sent} failed=${failed} total=${audience.length}`);
  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
