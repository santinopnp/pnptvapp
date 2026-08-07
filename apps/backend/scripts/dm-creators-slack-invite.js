#!/usr/bin/env node
/**
 * dm-creators-slack-invite.js
 *
 * Sends the Slack workspace invite link via Telegram DM to all active
 * creators who aren't yet in the Slack workspace (slack_member_id IS NULL)
 * but have a reachable Telegram ID.
 *
 * Bilingual (ES/EN) based on users.language.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/dm-creators-slack-invite.js "<invite_url>" --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/dm-creators-slack-invite.js "<invite_url>"
 */

'use strict';

const path = require('path');
const backendPath = path.join(__dirname, '..');

try { require('dotenv').config({ path: path.join(backendPath, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(backendPath, '../../.env.production'), override: true }); } catch {}

const { getPool, initializePostgres } = require(path.join(backendPath, 'config/postgres'));
const { Telegram } = require('telegraf');

const DRY_RUN = process.argv.includes('--dry-run');
const inviteUrl = process.argv.find(a => a.startsWith('https://join.slack.com/'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!inviteUrl) {
  console.error('[ERROR] Missing Slack invite URL. Pass it as first arg.');
  console.error('  Example: node dm-creators-slack-invite.js "https://join.slack.com/t/pnptvespacio/shared_invite/..."');
  process.exit(1);
}

const MESSAGE_ES = `Hola {name} 👋

Como parte de la Fase 1 de creadores, te estamos dando acceso a nuestro <b>espacio de Slack</b> — es donde vas a recibir:

• Notificaciones de pagos y bookings
• Anuncios del equipo
• Tu propio canal privado <b>#ext-{handle}</b> para hablar directamente con nosotros
• Comunidad con el resto de creadores

<b>Únete aquí:</b>
{link}

Usa el mismo email que tienes en PNPtv! para que el sistema te reconozca automáticamente y te agregue a tu canal privado.

Cualquier duda escríbenos a support@pnptv.app

— El equipo de PNPtv! 🏳️‍🌈`;

const MESSAGE_EN = `Hi {name} 👋

As part of Creator Phase 1, we're giving you access to our <b>Slack workspace</b> — that's where you'll receive:

• Payment and booking notifications
• Team announcements
• Your own private channel <b>#ext-{handle}</b> to talk directly with us
• Community with the rest of the creators

<b>Join here:</b>
{link}

Use the same email you have on PNPtv! so the system auto-recognizes you and adds you to your private channel.

Any questions? Write us at support@pnptv.app

— The PNPtv! team 🏳️‍🌈`;

async function run() {
  if (!process.env.BOT_TOKEN) {
    console.error('[ERROR] BOT_TOKEN not set. Aborting.');
    process.exit(1);
  }

  await initializePostgres();
  const pool = getPool();
  const telegram = new Telegram(process.env.BOT_TOKEN);

  const { rows: creators } = await pool.query(`
    SELECT id, username, first_name, telegram, language
      FROM users
     WHERE creator_status = 'active'
       AND slack_member_id IS NULL
       AND username NOT LIKE 'deleted_%'
       AND telegram IS NOT NULL
       AND telegram != ''
     ORDER BY username
  `);

  console.log(`\n=== Creator Slack Invite DM ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===`);
  console.log(`Invite: ${inviteUrl}`);
  console.log(`Sending to ${creators.length} creators without Slack account\n`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < creators.length; i++) {
    const c = creators[i];
    const name = c.first_name || c.username;
    const handleForChan = (c.username || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-{2,}/g, '-').slice(0, 76);
    const isSpanish = !c.language || c.language === 'es' || c.language.startsWith('es');
    const text = (isSpanish ? MESSAGE_ES : MESSAGE_EN)
      .replace('{name}', name)
      .replace('{handle}', handleForChan)
      .replace('{link}', inviteUrl);
    const prefix = `[${i + 1}/${creators.length}] @${c.username}`;

    if (DRY_RUN) {
      console.log(`${prefix} — [DRY] ${isSpanish ? 'ES' : 'EN'} → ${c.telegram}`);
      sent++;
      continue;
    }

    try {
      await telegram.sendMessage(c.telegram, text, { parse_mode: 'HTML', disable_web_page_preview: false });
      console.log(`${prefix} — sent (${isSpanish ? 'ES' : 'EN'})`);
      sent++;
    } catch (err) {
      console.error(`${prefix} — FAILED: ${err.message}`);
      failed++;
    }

    await sleep(350);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Sent:    ${sent}`);
  console.log(`  Failed:  ${failed}`);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
