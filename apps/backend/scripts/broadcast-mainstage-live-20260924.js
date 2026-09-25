#!/usr/bin/env node
'use strict';

/**
 * broadcast-mainstage-live-20260924.js
 *
 * Mass DM — Santino & Lex are on Main Stage tonight.
 * Sent as Santino to all non-banned users with a telegram ID.
 *
 * Usage:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     $(docker exec pnptv-bot printenv | grep -E '^(POSTGRES_|REDIS_|BOT_TOKEN)' | sed 's/^/-e /') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-mainstage-live-20260924.js --dry-run
 *
 * Live: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN   = process.argv.includes('--dry-run');
const BATCH_ID  = 'mainstage-live-20260924';
const SENDER_ID = '8599671840'; // Santino

const HERO_IMAGE = 'https://pnptv.app/uploads/avatars/8599671840-1782620624815.webp';
const CTA_URL    = 'https://pnptv.app/main-stage';

const MESSAGE = `🔴 We're live on Main Stage — RIGHT NOW.

Santino & Lex are on and the room is heating up. Come party with us.

👉 ${CTA_URL}

— Santino`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT id, telegram
    FROM users
    WHERE telegram IS NOT NULL AND telegram != ''
      AND tier != 'banned'
    ORDER BY created_at ASC
  `);

  // CC Santino — self-send guard in sendSystemDM skips him,
  // so we handle his copy separately at the end.
  const SANTINO_IN_LIST = users.some(u => u.id === SENDER_ID);
  if (!SANTINO_IN_LIST) users.unshift({ id: SENDER_ID, telegram: SENDER_ID });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔴 Main Stage Live — Santino & Lex');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── Sample message ──\n');
    console.log(MESSAGE);
    console.log(`\nHero image : ${HERO_IMAGE}`);
    console.log(`CTA        : ${CTA_URL}`);
    console.log(`\nFirst 5 recipients:`);
    users.slice(0, 5).forEach(u => console.log(`  ${u.id} (tg: ${u.telegram})`));
    console.log('\n-- DRY RUN complete --\n');
    process.exit(0);
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const u of users) {
    // Self-send guard: sendSystemDM already skips sender===recipient,
    // but skip dedup check too so we don't log a false "already sent".
    const isSelf = u.id === SENDER_ID;

    if (!isSelf) {
      const { rows: already } = await query(
        `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
        [`${BATCH_ID}%`, u.id]
      );
      if (already.length > 0) { skipped++; continue; }
    }

    try {
      if (!isSelf) {
        await sendSystemDM(SENDER_ID, u.id, MESSAGE, query, {
          mediaUrl:  HERO_IMAGE,
          mediaType: 'image',
        });
        await query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [BATCH_ID, u.id]
        );
      }
      sent++;
      if (sent % 200 === 0) console.log(`  … ${sent} sent`);
    } catch (err) {
      console.error(`  ✗ ${u.id}: ${err.message}`);
      errors++;
    }

    await sleep(80);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Sent    : ${sent}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
