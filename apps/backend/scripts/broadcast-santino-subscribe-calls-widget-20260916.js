#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-subscribe-calls-widget-20260916.js
 *
 * Personal message from Santino to ALL users announcing that
 * subscribing and booking calls is now easier via the 💎 diamond widget.
 *
 * Target  : all active non-banned users
 * Sender  : 8599671840 (SantinoFurioso)
 * Dedup   : broadcast_dedup, batch_id 'santino-subscribe-calls-widget-20260916'
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
 *     node apps/backend/scripts/broadcast-santino-subscribe-calls-widget-20260916.js --dry-run
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
const BATCH_ID      = 'santino-subscribe-calls-widget-20260916';
const SYSTEM_SENDER = '8599671840';
const DM_DELAY_MS   = 40;
const CTA_URL       = 'https://pnptv.app/subscribe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function pushPayload(lang) {
  if (isEs(lang)) {
    return {
      title: '💎 Pagá con tarjeta — tocá el diamante',
      body:  'Suscribite o reservá una llamada en segundos, desde donde estés en la app.',
      url:   CTA_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💎 Pay with card — tap the diamond',
    body:  'Subscribe or book a call in seconds, right where you are in the app.',
    url:   CTA_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
}

function dmText(lang) {
  if (isEs(lang)) {
    return `💎 *Suscribirte y reservar llamadas ahora es más fácil*

Hola — soy Santino. Pagar membresías y llamadas privadas ahora es muy simple. Solo tocá el widget 💎 — se adapta a donde estés en la app y te muestra las opciones correctas ahí mismo.

En la página de suscripción gestiona tu membresía. En el perfil de un creador o en Live, te lleva directo a reservar una llamada. Sin pasos extra, pagá con tarjeta en segundos.

Explorá: pnptv.app/subscribe · pnptv.app/live · o el perfil de tu creador favorito

— Santino`;
  }
  return `💎 *Subscribing and booking calls just got easier*

Hey — Santino here. Paying for memberships and private calls is now seamless. Just tap the 💎 diamond widget — it adapts to where you are in the app and shows you the right options right there.

On the subscribe page it handles your membership. On a creator's profile or on Live it takes you straight to booking a call. No extra steps, pay with card in seconds.

Explore: pnptv.app/subscribe · pnptv.app/live · or any creator's profile

— Santino`;
}

async function main() {
  await initializePostgres();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Subscribe + calls widget — all users (Santino)');
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
    WHERE COALESCE(u.is_active, true) = true
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.batch_id = $1 AND bd.user_id = u.id
      )
    ORDER BY u.created_at ASC
  `, [BATCH_ID]);

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
