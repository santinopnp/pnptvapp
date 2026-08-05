'use strict';

/**
 * activate-paused-creators.js
 *
 * One-shot admin script:
 *  1. Sets creator_subscription_paused = FALSE for all active creators that have it set TRUE.
 *  2. Sends a Slack DM to each creator's personal channel (if connected).
 *  3. Falls back to Telegram DM for creators without Slack (using BOT_TOKEN).
 *
 * Run: docker exec pnptv-bot node apps/backend/scripts/activate-paused-creators.js [--dry-run]
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { getPool, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { notifyActivationReminder } = require(path.join(BACKEND, 'services/slackCreatorNotifyService'));
const { Telegram } = require('telegraf');
const logger = require(path.join(BACKEND, 'utils/logger'));

const DRY_RUN = process.argv.includes('--dry-run');
// --notify-only: skip DB update, send DMs only to creators activated in the last 30 min
const NOTIFY_ONLY = process.argv.includes('--notify-only');
const DELAY_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEs = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

const GUIDELINES_URL = 'https://pnptv.app/creator-terms';

function tgMsg(name, lang) {
  if (isEs(lang)) {
    return `<b>PNPtv! — Tu perfil de creador ya está activo 🎉</b>\n\n` +
      `Hola ${name}, tu perfil de creador está ahora activo — los usuarios pueden suscribirse a tu contenido.\n\n` +
      `<b>Próximos pasos importantes:</b>\n` +
      `• 📋 Lee nuestros <a href="${GUIDELINES_URL}">lineamientos de creadores</a>\n` +
      `• 📸 Sube fotos y videos exclusivos para tus suscriptores (¡ellos los están esperando!)\n` +
      `• 💬 Comparte tu perfil con tu audiencia en redes sociales\n\n` +
      `Accede a tu Studio desde pnptv.app/creators para empezar a publicar.\n\n` +
      `¿Preguntas? Escríbenos aquí.`;
  }
  return `<b>PNPtv! — Your creator profile is now active 🎉</b>\n\n` +
    `Hey ${name}, your creator profile is now active — fans can subscribe to your content.\n\n` +
    `<b>Important next steps:</b>\n` +
    `• 📋 Read our <a href="${GUIDELINES_URL}">creator guidelines</a>\n` +
    `• 📸 Upload exclusive photos and videos for your subscribers (they're waiting!)\n` +
    `• 💬 Share your profile with your audience on social media\n\n` +
    `Head to pnptv.app/creators to start publishing from your Studio.\n\n` +
    `Questions? Reply here.`;
}

async function run() {
  await initializePostgres();
  const pool = getPool();

  console.log(`[activate-paused-creators] ${DRY_RUN ? '--- DRY RUN ---' : 'LIVE RUN'}\n`);

  // 1. Fetch target creators
  const { rows: creators } = await pool.query(
    NOTIFY_ONLY
      ? `SELECT id, username, first_name, language, slack_channel_id, telegram
           FROM users
          WHERE creator_status = 'active'
            AND creator_subscription_paused = FALSE
            AND updated_at > NOW() - INTERVAL '30 minutes'
          ORDER BY username`
      : `SELECT id, username, first_name, language, slack_channel_id, telegram
           FROM users
          WHERE creator_status = 'active'
            AND creator_subscription_paused = TRUE
          ORDER BY username`
  );

  if (creators.length === 0) {
    console.log('No paused active creators found. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${creators.length} paused creators.\n`);

  // 2. Activate them all in one shot (skipped in --notify-only mode)
  if (!NOTIFY_ONLY) {
    if (!DRY_RUN) {
      const { rowCount } = await pool.query(`
        UPDATE users
           SET creator_subscription_paused = FALSE,
               updated_at = NOW()
         WHERE creator_status = 'active'
           AND creator_subscription_paused = TRUE
      `);
      console.log(`✓ Activated ${rowCount} creators.\n`);
    } else {
      console.log(`[DRY] Would activate ${creators.length} creators.\n`);
    }
  } else {
    console.log(`[NOTIFY-ONLY] Skipping DB update — sending DMs to ${creators.length} recently activated creators.\n`);
  }

  // 3. Send notifications — Slack first, Telegram DM as fallback
  const tg = process.env.BOT_TOKEN ? new Telegram(process.env.BOT_TOKEN) : null;

  let slackSent = 0, tgSent = 0, tgFailed = 0, skipped = 0;

  for (const creator of creators) {
    const name = creator.first_name || creator.username || 'there';
    const lang = isEs(creator.language) ? 'es' : 'en';
    const handle = `@${creator.username || creator.id}`;

    if (creator.slack_channel_id) {
      // Primary: Slack
      console.log(`[SLACK] ${handle} (${lang})`);
      if (!DRY_RUN) await notifyActivationReminder(creator.id, { lang });
      slackSent++;
    } else if (creator.telegram && tg) {
      // Fallback: Telegram DM
      console.log(`[TG:${creator.telegram}] ${handle} (${lang})`);
      if (!DRY_RUN) {
        try {
          await tg.sendMessage(creator.telegram, tgMsg(name, lang), {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          });
          console.log(`  ✓ sent`);
          tgSent++;
        } catch (err) {
          console.warn(`  ✗ ${err.message}`);
          tgFailed++;
        }
        await sleep(DELAY_MS);
      } else {
        tgSent++;
      }
    } else {
      console.log(`  — ${handle}: no Slack, no Telegram — skipping`);
      skipped++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Activated:     ${DRY_RUN ? '(dry)' : creators.length} creators`);
  console.log(`  Slack DMs:     ${slackSent}`);
  console.log(`  Telegram DMs:  ${tgSent} sent, ${tgFailed} failed`);
  console.log(`  No channel:    ${skipped}`);
  process.exit(0);
}

run().catch((err) => {
  logger.error('activate-paused-creators failed', { error: err.message });
  console.error(err);
  process.exit(1);
});
