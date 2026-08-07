#!/usr/bin/env node
'use strict';

/**
 * dm-streams-sunset-2026-08.js
 *
 * One-shot DM to the 3 creators who actually streamed during the PNP Live
 * experiment (Jul 31 – Aug 9 2026). The experiment got 0 completions from
 * 57 eligible creators; the feature is being deprecated.
 *
 * Recipients (from DB):
 *   MR8502            ee09336c-9442-4c30-9e88-f739ee799415  lang=en
 *   SantinoFurioso    8599671840                             lang=es
 *   Elevenminutos     1966945732                             lang=en
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/dm-streams-sunset-2026-08.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/dm-streams-sunset-2026-08.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const DmService = require(path.join(BACKEND, 'services/dmService'));

const DRY_RUN   = process.argv.includes('--dry-run');
const SENDER_ID = '8552451957'; // @pnptv / PNPtv! News

const MSG_EN = [
  "Hey — we're retiring the live streaming feature while we focus on what's growing fastest: private calls, exclusive content, and Ru$h 💎.",
  "",
  "Your streams were the only ones that ran — we appreciate you testing it. Nothing else on your account changes.",
  "",
  "— PNPtv! Team",
].join('\n');

const MSG_ES = [
  "Hey — estamos retirando la función de streams en vivo para enfocarnos en lo que más está creciendo: llamadas privadas, contenido exclusivo y Ru$h 💎.",
  "",
  "Tus streams fueron los únicos que corrieron — te lo agradecemos. Nada más en tu cuenta cambia.",
  "",
  "— Equipo PNPtv!",
].join('\n');

const RECIPIENTS = [
  { id: 'ee09336c-9442-4c30-9e88-f739ee799415', username: 'MR8502',         lang: 'en' },
  { id: '8599671840',                            username: 'SantinoFurioso', lang: 'es' },
  { id: '1966945732',                            username: 'Elevenminutos',  lang: 'en' },
];

async function main() {
  console.log(`\n=== Streams sunset DM ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  const { rows: senderRows } = await query(
    'SELECT id, username, first_name FROM users WHERE id = $1',
    [SENDER_ID]
  );
  if (!senderRows.length) throw new Error(`Sender not found: ${SENDER_ID}`);
  console.log(`Sender: ${senderRows[0].first_name} (@${senderRows[0].username}, id=${SENDER_ID})\n`);

  for (const recipient of RECIPIENTS) {
    const { rows } = await query(
      'SELECT id, username, first_name, language FROM users WHERE id = $1::text',
      [recipient.id]
    );

    if (!rows.length) {
      console.warn(`[WARN] Recipient not found in DB: ${recipient.username} (${recipient.id}) — skipping`);
      continue;
    }

    const user = rows[0];
    const lang = (user.language || recipient.lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
    const dmText = lang === 'es' ? MSG_ES : MSG_EN;

    console.log(`Recipient: ${user.first_name || user.username} (@${user.username}, id=${user.id}, lang=${lang})`);
    console.log(`--- message (${dmText.length} chars) ---\n${dmText}\n---`);

    if (DRY_RUN) {
      console.log('[DRY] Would send. Skipping.\n');
      continue;
    }

    const result = await DmService.sendMessage(
      SENDER_ID,
      user.id,
      { content: dmText },
      { isAdmin: true }
    );

    console.log(`Sent. message_id=${result?.id}\n`);
  }

  console.log(`=== Done ===`);
  process.exit(0);
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
