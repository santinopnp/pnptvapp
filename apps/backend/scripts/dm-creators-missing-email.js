#!/usr/bin/env node
/**
 * dm-creators-missing-email.js
 *
 * One-shot DM to active creators who have no email on file.
 * Email is required for Slack onboarding and platform notifications.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/dm-creators-missing-email.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/dm-creators-missing-email.js
 */

'use strict';

const path = require('path');
const backendPath = path.join(__dirname, '..');

try { require('dotenv').config({ path: path.join(backendPath, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(backendPath, '../../.env.production'), override: true }); } catch {}

const { Telegram } = require('telegraf');

const DRY_RUN = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Active creators with no email and a reachable Telegram ID.
// 3 skipped (no telegram either): ANTHONIOXZ2316_2, JRamico032, brian_covaleda
const RECIPIENTS = [
  { username: 'BANDITTHEWOLF',    telegramId: '7744780265' },
  { username: 'BRIAN_COVALEDA',   telegramId: '1934977293' },
  { username: 'CLOUDYDAYSPNPTV',  telegramId: '8500031395' },
  { username: 'HUDSONriVRsx',     telegramId: '2016884721' },
  { username: 'I_need_thats',     telegramId: '8436373325' },
  { username: 'JCBTN',            telegramId: '5935084902' },
  { username: 'KC95000',          telegramId: '7926587506' },
  { username: 'LUIS_SUBSLW',      telegramId: '8678902171' },
  { username: 'MOKO501',          telegramId: '6044736811' },
  { username: 'NEMSAJ',           telegramId: '5123002276' },
  { username: 'NOOELLL2',         telegramId: '8041255631' },
  { username: 'OLLITSACNIVEK',    telegramId: '8536930652' },
  { username: 'PROFESSOR395',     telegramId: '7742875708' },
  { username: 'SOTUME',           telegramId: '5867063315' },
  { username: 'WMCPHERSON',       telegramId: '7122345447' },
];

const MESSAGE = `Hola! 👋

Notamos que tu perfil de creador en PNPtv! no tiene un email registrado.

El email es <b>necesario</b> para:
• Recibir notificaciones importantes (bookings, pagos, vencimientos)
• Tu acceso al espacio de creadores en Slack
• Comunicaciones críticas de la plataforma

Por favor agrégalo en: <b>pnptv.app/settings</b>

Si tienes alguna duda escríbenos a support@pnptv.app

— El equipo de PNPtv! 🏳️‍🌈

---

Hi! 👋

We noticed your PNPtv! creator profile has no email address on file.

Email is <b>required</b> for:
• Important notifications (bookings, payments, expirations)
• Access to the creator Slack workspace
• Critical platform communications

Please add it at: <b>pnptv.app/settings</b>

Questions? Write us at support@pnptv.app

— The PNPtv! team`;

async function run() {
  if (!process.env.BOT_TOKEN) {
    console.error('[ERROR] BOT_TOKEN not set. Aborting.');
    process.exit(1);
  }

  const telegram = new Telegram(process.env.BOT_TOKEN);

  console.log(`\n=== DM: Creators Missing Email ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===`);
  console.log(`Sending to ${RECIPIENTS.length} creators\n`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < RECIPIENTS.length; i++) {
    const { username, telegramId } = RECIPIENTS[i];
    const prefix = `[${i + 1}/${RECIPIENTS.length}] @${username} (${telegramId})`;

    if (DRY_RUN) {
      console.log(`${prefix} — [DRY] would send DM`);
      sent++;
      continue;
    }

    try {
      await telegram.sendMessage(telegramId, MESSAGE, { parse_mode: 'HTML' });
      console.log(`${prefix} — sent`);
      sent++;
    } catch (err) {
      console.error(`${prefix} — FAILED: ${err.message}`);
      failed++;
    }

    await sleep(300);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Sent:    ${sent}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped (no telegram): 3 — ANTHONIOXZ2316_2, JRamico032, brian_covaleda`);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
