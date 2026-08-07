#!/usr/bin/env node
/**
 * slack-welcome-creators.js
 *
 * Posts a bilingual welcome / instructions message to each creator's
 * personal #ext-<handle> Slack channel. Idempotent — sets
 * users.slack_welcomed_at so re-runs skip already-welcomed creators.
 *
 * Safe to run daily from cron after slack-onboard-creators.js — any
 * newly connected creator gets welcomed the next morning.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/slack-welcome-creators.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/slack-welcome-creators.js
 */

'use strict';

const path = require('path');
const backendPath = path.join(__dirname, '..');

try { require('dotenv').config({ path: path.join(backendPath, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(backendPath, '../../.env.production'), override: true }); } catch {}

const { getPool, initializePostgres } = require(path.join(backendPath, 'config/postgres'));

const DRY_RUN = process.argv.includes('--dry-run');
const SLACK_API = 'https://slack.com/api';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CH_UPDATES  = process.env.SLACK_CHANNEL_UPDATES  || '';
const CH_LOUNGE   = process.env.SLACK_CHANNEL_LOUNGE   || '';
const CH_TRAINING = process.env.SLACK_CHANNEL_TRAINING || '';

function buildBlocks({ isSpanish, firstName, handle }) {
  const name = firstName || handle || 'Creator';
  const chUpdatesLink  = CH_UPDATES  ? `<#${CH_UPDATES}>`  : '#pnptv-updates';
  const chLoungeLink   = CH_LOUNGE   ? `<#${CH_LOUNGE}>`   : '#creator-lounge';
  const chTrainingLink = CH_TRAINING ? `<#${CH_TRAINING}>` : '#creator-training';

  if (isSpanish) {
    return {
      text: `👋 Bienvenido/a a Slack, ${name}!`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `👋 Bienvenido/a a Slack, ${name}!`, emoji: true } },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Este es tu canal privado en el espacio de creadores de PNPtv!. Aquí solo estás tú y el equipo — es tu línea directa con nosotros.`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📥 *Qué vas a recibir aquí (automático):*\n• 📅 Bookings nuevos y cancelaciones\n• 💎 Tips que recibas\n• ⭐ Nuevos suscriptores\n• ⏰ Recordatorios de tus llamadas privadas (1h y 15min antes)\n• 💸 Confirmaciones de payouts\n• 💬 Comentarios en tus videos\n• 🔴 Aviso cuando estás en vivo + reporte al final\n• 🪪 Alertas de vencimiento de tu verificación 2257`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🏢 *Los canales compartidos:*\n• ${chUpdatesLink} — anuncios oficiales del equipo\n• ${chLoungeLink} — comunidad con los otros creadores\n• ${chTrainingLink} — materiales de formación (Fase 1 arranca pronto)`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📱 *Recomendaciones:*\n• Descarga la app de Slack en tu celular — así no te pierdes las notificaciones\n• Activa notificaciones push para este canal\n• Puedes escribirnos aquí cualquier cosa: dudas, ideas, problemas — te leemos\n• Guarda este canal como favorito (⭐ arriba a la derecha)`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `PNPtv! • Cualquier duda: support@pnptv.app` }],
        },
      ],
    };
  }
  return {
    text: `👋 Welcome to Slack, ${name}!`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `👋 Welcome to Slack, ${name}!`, emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `This is your private channel in the PNPtv! creator workspace. Only you and the team are in here — it's your direct line to us.`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📥 *What you'll receive here (automatic):*\n• 📅 New bookings and cancellations\n• 💎 Tips you receive\n• ⭐ New subscribers\n• ⏰ Private call reminders (1h and 15min before)\n• 💸 Payout confirmations\n• 💬 Comments on your videos\n• 🔴 Live-stream start notice + end-of-session report\n• 🪪 2257 verification expiry alerts`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🏢 *Shared channels:*\n• ${chUpdatesLink} — official team announcements\n• ${chLoungeLink} — community with other creators\n• ${chTrainingLink} — training materials (Phase 1 starts soon)`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📱 *Tips:*\n• Download the Slack mobile app so you don't miss notifications\n• Enable push notifications for this channel\n• Feel free to write us anything here: questions, ideas, issues — we read it\n• Star this channel as favorite (⭐ top right)`,
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `PNPtv! • Any questions: support@pnptv.app` }],
      },
    ],
  };
}

async function postToChannel(token, channelId, text, blocks) {
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: channelId, text, blocks, unfurl_links: false }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));
  return data;
}

async function isChannelPrivate(token, channelId) {
  try {
    const url = `${SLACK_API}/conversations.info?channel=${encodeURIComponent(channelId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return null;
    return data.channel?.is_private === true;
  } catch {
    return null;
  }
}

async function run() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error('[ERROR] SLACK_BOT_TOKEN not set. Aborting.');
    process.exit(1);
  }

  await initializePostgres();
  const pool = getPool();

  // Only welcome creators who have ACTUALLY joined the workspace (slack_member_id set).
  // Pre-created empty channels (member_id null) are still PUBLIC and we don't want to
  // post creator-sensitive content until they're converted to private + joined.
  const { rows: creators } = await pool.query(`
    SELECT id, username, first_name, language, slack_channel_id
      FROM users
     WHERE creator_status = 'active'
       AND slack_channel_id IS NOT NULL
       AND slack_member_id  IS NOT NULL
       AND slack_welcomed_at IS NULL
     ORDER BY username
  `);

  console.log(`\n=== Slack Creator Welcome ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===`);
  console.log(`Creators to welcome: ${creators.length}\n`);

  if (creators.length === 0) {
    console.log('Nothing to do — every connected creator has been welcomed.');
    process.exit(0);
  }

  let sent = 0;
  let failed = 0;
  let skippedPublic = 0;

  for (let i = 0; i < creators.length; i++) {
    const c = creators[i];
    const isSpanish = !c.language || c.language === 'es' || c.language.startsWith('es');
    const handle = c.username || String(c.id);
    const { text, blocks } = buildBlocks({ isSpanish, firstName: c.first_name, handle });
    const prefix = `[${i + 1}/${creators.length}] @${handle} (${c.slack_channel_id})`;

    // Guard: skip channels that are still public — the welcome message claims
    // "only you and the team" and we won't send that lie into a public room.
    const priv = await isChannelPrivate(token, c.slack_channel_id);
    if (priv !== true) {
      console.warn(`${prefix} — SKIP: channel is not private (is_private=${priv}) — convert in Slack UI first`);
      skippedPublic++;
      await sleep(1100);
      continue;
    }

    if (DRY_RUN) {
      console.log(`${prefix} — [DRY] ${isSpanish ? 'ES' : 'EN'}`);
      sent++;
      await sleep(1100);
      continue;
    }

    try {
      const data = await postToChannel(token, c.slack_channel_id, text, blocks);
      if (data.ok) {
        await pool.query('UPDATE users SET slack_welcomed_at = NOW() WHERE id = $1', [String(c.id)]);
        console.log(`${prefix} — welcomed (${isSpanish ? 'ES' : 'EN'})`);
        sent++;
      } else {
        console.error(`${prefix} — FAILED: ${data.error}`);
        failed++;
      }
    } catch (err) {
      console.error(`${prefix} — ERROR: ${err.message}`);
      failed++;
    }

    await sleep(1100); // Slack Tier-2 rate limit safety
  }

  console.log(`\n=== Done ===`);
  console.log(`  Sent:            ${sent}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Skipped (public): ${skippedPublic}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
