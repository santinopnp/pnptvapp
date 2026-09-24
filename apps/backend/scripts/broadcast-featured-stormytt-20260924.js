#!/usr/bin/env node
'use strict';

/**
 * broadcast-featured-stormytt-20260924.js
 *
 * Sends the "Model of the Day — Stormytt" Telegram photo blast directly
 * via the Bot API (Telegraf Telegram class, no running bot process needed).
 *
 * Usage:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     $(docker exec pnptv-bot printenv | grep -E '^(POSTGRES_|REDIS_|BOT_TOKEN|NODE_ENV)' | sed 's/^/-e /') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-featured-stormytt-20260924.js --dry-run
 *
 * Live: remove --dry-run
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const DRY_RUN     = process.argv.includes('--dry-run');
const BATCH_SIZE  = 25;
const BATCH_DELAY = 1100; // ms

const CREATOR_ID    = '7915648272';
const CREATOR_NAME  = 'Stormytt';
const CREATOR_USER  = 'stormytd';
const HERO_PATH     = '/uploads/covers/7915648272-1784825446729.webp';
const HERO_URL      = `https://pnptv.app${HERO_PATH}`;
const PROFILE_LINK  = `https://pnptv.app/c/stormytd`;
const PITCH_EN      = 'She commands the room and leaves you wanting more. Stormytt is bold, unapologetic, and exclusively yours on PNPtv.';

const CAPTION = `<b>Model of the day 💎</b>\n<b>${CREATOR_NAME}</b> (@${CREATOR_USER})\n\n${PITCH_EN}`;
const INLINE  = { inline_keyboard: [[{ text: '💎 Open profile', url: PROFILE_LINK }]] };

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const { initializePostgres, getPool } = require(path.join(BACKEND, 'config/postgres'));
  await initializePostgres();
  const pool = getPool();

  const { rows: audience } = await pool.query(`
    SELECT telegram
      FROM users
     WHERE telegram IS NOT NULL
       AND age_verified = TRUE
       AND terms_accepted = TRUE
       AND deleted_at IS NULL
  `);

  console.log(`[featured-stormytt] audience: ${audience.length} telegram users`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN ===');
    console.log(`Hero URL:    ${HERO_URL}`);
    console.log(`Caption:     ${CAPTION.replace(/<[^>]+>/g, '')}`);
    console.log(`CTA:         💎 Open profile → ${PROFILE_LINK}`);
    console.log(`Would send:  ${audience.length} TG messages`);
    console.log('=== Remove --dry-run to send ===\n');
    process.exit(0);
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('[featured-stormytt] BOT_TOKEN not set');
    process.exit(1);
  }

  // Use Telegraf's Telegram class directly — no bot process needed
  const { Telegram } = require('telegraf');
  const tg = new Telegram(BOT_TOKEN);

  // Convert webp → jpeg once, then reuse file_id after first successful send
  let photoInput;
  try {
    const axios = require('axios');
    const sharp = require('sharp');
    const resp = await axios.get(HERO_URL, { responseType: 'arraybuffer', timeout: 15000 });
    const jpeg = await sharp(Buffer.from(resp.data)).jpeg({ quality: 88 }).toBuffer();
    photoInput = { source: jpeg };
    console.log(`[featured-stormytt] hero converted to jpeg, ${jpeg.length} bytes`);
  } catch (err) {
    console.warn(`[featured-stormytt] webp→jpeg failed (${err.message}), will try URL directly`);
    photoInput = HERO_URL;
  }

  let sent = 0, failed = 0, reusableFileId = null;

  for (let i = 0; i < audience.length; i++) {
    const tgId = audience[i].telegram;
    try {
      const media = reusableFileId || photoInput;
      const resp = await tg.sendPhoto(tgId, media, {
        caption: CAPTION,
        parse_mode: 'HTML',
        reply_markup: INLINE,
      });
      if (!reusableFileId && Array.isArray(resp?.photo) && resp.photo.length) {
        reusableFileId = resp.photo[resp.photo.length - 1].file_id;
        console.log('[featured-stormytt] captured reusable file_id — fast path active');
      }
      sent++;
    } catch (err) {
      failed++;
      if (!String(err.message || '').includes('bot was blocked') && failed <= 3) {
        console.warn(`[featured-stormytt] send failed to ${tgId}: ${err.message}`);
      }
    }
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`[featured-stormytt] progress: ${i + 1}/${audience.length} (sent=${sent}, failed=${failed})`);
      await sleep(BATCH_DELAY);
    }
  }

  console.log(`[featured-stormytt] done — total=${audience.length} sent=${sent} failed=${failed}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[featured-stormytt] fatal:', err);
  process.exit(1);
});
