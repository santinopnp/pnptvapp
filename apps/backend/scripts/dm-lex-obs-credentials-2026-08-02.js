#!/usr/bin/env node
'use strict';

/**
 * dm-lex-obs-credentials-2026-08-02.js
 *
 * One-shot DM from @pnptv (id 8552451957) to Lex (PNPLatinoBoy, id 7246621722)
 * with the exact OBS RTMP credentials for his channel. He reported OBS not
 * connecting; server-side is healthy, no PUBLISH attempts in the log — most
 * likely he's typing the URL/key wrong. This DM gives him the canonical values.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/dm-lex-obs-credentials-2026-08-02.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/dm-lex-obs-credentials-2026-08-02.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const DmService = require(path.join(BACKEND, 'services/dmService'));

const DRY_RUN   = process.argv.includes('--dry-run');
const SENDER_ID = '8552451957'; // @pnptv / PNPtv! News
const LEX_ID    = '7246621722';
const LEX_CHANNEL = 'pnplatinoboy';

// Stream token must be passed at runtime — never hardcoded.
// Fetch from env or from restreamer_settings before running.
const LEX_RTMP_TOKEN = process.env.LEX_RTMP_TOKEN;
if (!LEX_RTMP_TOKEN) {
  console.error('[FATAL] LEX_RTMP_TOKEN env var required. Export the current stream token before running.');
  process.exit(1);
}

const DM_TEXT = [
  `Hey Lex — te paso las credenciales exactas de OBS para tu canal. Borrá lo que tengas puesto y pegá esto tal cual:`,
  ``,
  `Service: Custom`,
  `Server: rtmp://live.pnptv.app/live`,
  `Stream Key: ${LEX_CHANNEL}?token=${LEX_RTMP_TOKEN}`,
  ``,
  `Pasos:`,
  `1) OBS → Settings → Stream`,
  `2) Borrá todo`,
  `3) Pegá los 3 valores de arriba`,
  `4) OK → Start Streaming`,
  ``,
  `Si te sigue diciendo "cannot connect" o "failed to connect":`,
  `• Probá con hotspot 4G del celu — algunos ISPs bloquean el puerto 1935 (RTMP)`,
  `• Chequeá que el firewall de Windows/Mac no esté bloqueando OBS`,
  `• Mandame el mensaje de error exacto que te sale y lo miro en vivo`,
  ``,
  `Estoy con los logs abiertos, así que apenas conectes lo veo del lado nuestro.`,
  ``,
  `— PNPtv`,
].join('\n');

async function main() {
  console.log(`\n=== Lex OBS credentials DM ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

  const { rows: senderRows } = await query('SELECT id, username, first_name FROM users WHERE id = $1', [SENDER_ID]);
  if (!senderRows.length) throw new Error(`Sender not found: ${SENDER_ID}`);
  console.log(`Sender:    ${senderRows[0].first_name} (@${senderRows[0].username}, id=${SENDER_ID})`);

  const { rows: lexRows } = await query('SELECT id, username, first_name, live_channel FROM users WHERE id = $1', [LEX_ID]);
  if (!lexRows.length) throw new Error(`Recipient not found: ${LEX_ID}`);
  const lex = lexRows[0];
  console.log(`Recipient: ${lex.first_name} (@${lex.username}, id=${LEX_ID}, live_channel=${lex.live_channel})`);

  console.log(`\n--- DM body (${DM_TEXT.length} chars) ---\n${DM_TEXT}\n---\n`);

  if (DRY_RUN) {
    console.log('[DRY] Would send. Exiting without side effects.');
    process.exit(0);
  }

  const result = await DmService.sendMessage(
    SENDER_ID,
    LEX_ID,
    { content: DM_TEXT },
    { isAdmin: true }
  );

  console.log(`✓ Sent. message_id=${result?.id}`);
  process.exit(0);
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
