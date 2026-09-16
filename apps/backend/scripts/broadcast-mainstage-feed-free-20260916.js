#!/usr/bin/env node
'use strict';

/**
 * broadcast-mainstage-feed-free-20260916.js
 *
 * In-app DM + push notification to all FREE users announcing that
 * the Main Stage and feed are now available to them.
 *
 * Target  : tier = 'free' (active, non-deleted, non-banned)
 * Sender  : 8552451957 (@pnptv)
 * Dedup   : broadcast_dedup, batch_id 'mainstage-feed-free-20260916'
 * Santino : always included for verification
 *
 * Usage (dry run — default):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-mainstage-feed-free-20260916.js --dry-run
 *
 * Live run: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const BATCH_ID      = 'mainstage-feed-free-20260916';
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const DM_DELAY_MS   = 40;
const CTA_URL       = 'https://pnptv.app/main-stage';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function pushPayload(lang) {
  if (isEs(lang)) {
    return {
      title: '🎬 El Main Stage está abierto',
      body:  'Transmisiones en vivo, explora el feed — la comunidad te espera.',
      url:   CTA_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '🎬 The Main Stage is open',
    body:  'Watch live, explore the feed — the community is live.',
    url:   CTA_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
}

function dmText(lang) {
  if (isEs(lang)) {
    return `🎬 *El Main Stage ya está disponible para ti*

¡Hola! El Main Stage ahora está abierto — podés ver transmisiones en vivo, explorar el feed y conectarte con la comunidad.

Entrá cuando quieras. La comunidad está activa.

👉 ${CTA_URL}

— PNPtv`;
  }
  return `🎬 *The Main Stage is now open for you*

Hey! The Main Stage is now available — watch live streams, explore the feed, and connect with the community.

Drop in anytime. The community is live.

👉 ${CTA_URL}

— PNPtv`;
}

async function main() {
  await initializePostgres();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Main Stage + Feed announcement — free users');
  console.log(`  Batch   : ${BATCH_ID}`);
  console.log(`  Mode    : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log(`  CTA URL : ${CTA_URL}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const { rows: targets } = await query(`
    SELECT
      u.id,
      u.username,
      COALESCE(u.language, 'en') AS language
    FROM users u
    WHERE COALESCE(u.tier, 'free') = 'free'
      AND COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.batch_id = $1 AND bd.user_id = u.id
      )
    ORDER BY u.created_at ASC
  `, [BATCH_ID]);

  // Always include Santino for verification
  const hasSantino = targets.some(t => t.id === SANTINO_ID);
  if (!hasSantino) targets.unshift({ id: SANTINO_ID, username: 'SantinoFurioso', language: 'en' });

  const enCount = targets.filter(u => !isEs(u.language)).length;
  const esCount = targets.filter(u =>  isEs(u.language)).length;
  console.log(`\nTargets : ${targets.length} users  (en: ${enCount}  es: ${esCount})\n`);

  if (DRY_RUN) {
    console.log('── EN sample ──');
    console.log(dmText('en'));
    console.log('\n── ES sample ──');
    console.log(dmText('es'));
    console.log('\n── Push (EN) ──');
    console.log(JSON.stringify(pushPayload('en'), null, 2));
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  // Push — batch by language
  if (!SKIP_PUSH) {
    const enIds = targets.filter(u => !isEs(u.language)).map(u => u.id);
    const esIds = targets.filter(u =>  isEs(u.language)).map(u => u.id);
    for (const [langKey, ids] of [['en', enIds], ['es', esIds]]) {
      if (!ids.length) continue;
      try {
        const n = await PushNotificationService.sendToUsers(ids, pushPayload(langKey));
        console.log(`[PUSH ${langKey}] delivered ${n}/${ids.length}`);
      } catch (err) {
        console.error(`[PUSH ${langKey}] error: ${err.message}`);
      }
    }
  } else {
    console.log('[PUSH] skipped (--skip-push)');
  }

  // In-app DM — per user
  let dmSent = 0, errors = 0;
  for (let i = 0; i < targets.length; i++) {
    const user = targets[i];
    try {
      await sendSystemDM(SYSTEM_SENDER, user.id, dmText(user.language), query);
      dmSent++;
      await query(
        'INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [BATCH_ID, user.id]
      );
    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`  ERROR ${user.id} (${user.username}): ${err.message}`);
    }
    if (i % 200 === 0 && i > 0) process.stdout.write(`\r  DM progress: ${i}/${targets.length} (sent ${dmSent}, err ${errors})`);
    await sleep(DM_DELAY_MS);
  }
  process.stdout.write('\n');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  DMs sent  : ${dmSent}`);
  console.log(`  Errors    : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
