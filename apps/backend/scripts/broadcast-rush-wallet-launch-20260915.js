#!/usr/bin/env node
'use strict';

/**
 * broadcast-rush-wallet-launch-20260915.js
 *
 * Push notification + in-app DM announcing the new Ru$h 💎 wallet checkout —
 * users can now buy Ru$h directly with USDC from their Base wallet, no card
 * or crypto exchange needed.
 *
 * Strategy:
 *  - Push to all active users (subscribed to push)
 *  - In-app DM to all active users (bilingual EN/ES)
 *  - CTA deep-links to /?buy_rush=1 which auto-opens BuyTokensModal on arrival
 *
 * Dedup batch: rush-wallet-launch-20260915
 *
 * Usage (DRY RUN — default):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-rush-wallet-launch-20260915.js --dry-run
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
const BATCH_ID      = 'rush-wallet-launch-20260915';
const SYSTEM_SENDER = '8552451957';
const DM_DELAY_MS   = 40;
const CTA_URL       = 'https://pnptv.app/?buy_rush=1';
const SANTINO_ID    = '8599671840';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function pushPayload(lang) {
  if (isEs(lang)) {
    return {
      title: '💎 Tu billetera, directo en PNPtv',
      body: 'Compra Ru$h con USDC al instante — sin tarjeta, sin pasos extra.',
      url: CTA_URL,
      tag: BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💎 Your wallet, right inside PNPtv',
    body: 'Buy Ru$h with USDC instantly — no card, no extra steps.',
    url: CTA_URL,
    tag: BATCH_ID,
    notifType: 'promo',
  };
}

function dmText(lang) {
  if (isEs(lang)) {
    return `💎 *¡Ya puedes comprar Ru$h directo con tu wallet!*

Conecta tu billetera Base/USDC y convierte tus fondos en Ru$h al instante — sin tarjeta, sin pasos extra.

*¿Qué puedes hacer con Ru$h?*
→ Tips a tus creadores favoritos
→ Desbloquear contenido exclusivo
→ Membresías y llamadas privadas

👉 ${CTA_URL}

Si nunca has comprado antes, solo toca el botón y te guiamos desde cero. 🖤

— PNPtv`;
  }
  return `💎 *You can now buy Ru$h straight from your wallet!*

Connect your Base/USDC wallet and convert funds to Ru$h instantly — no card, no extra steps.

*What can you do with Ru$h?*
→ Tip your favorite creators
→ Unlock exclusive content
→ Memberships and private calls

👉 ${CTA_URL}

First time? Just tap the button and we'll walk you through it. 🖤

— PNPtv`;
}

async function main() {
  await initializePostgres();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Ru$h wallet launch broadcast');
  console.log(`  Batch   : ${BATCH_ID}`);
  console.log(`  Mode    : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log(`  CTA URL : ${CTA_URL}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Fetch all eligible users (not banned, not already sent)
  const { rows: targets } = await query(`
    SELECT
      u.id,
      u.username,
      COALESCE(u.language, 'en') AS language
    FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.batch_id = $1 AND bd.user_id = u.id
      )
    ORDER BY u.created_at ASC
  `, [BATCH_ID]);

  // Always include Santino for verification
  const hasSantino = targets.some(t => t.id === SANTINO_ID);
  if (!hasSantino) targets.unshift({ id: SANTINO_ID, username: 'santino', language: 'en' });

  console.log(`\nTargets: ${targets.length} users\n`);
  if (DRY_RUN) {
    console.log('Sample (first 5):');
    targets.slice(0, 5).forEach(u => console.log(`  [${u.language}] ${u.username || u.id}`));
    console.log('\n-- DRY RUN complete. Re-run without --dry-run to send. --\n');
    process.exit(0);
  }

  let dmSent = 0, pushSent = 0, errors = 0;

  // Batch push by language
  const enIds = targets.filter(u => !isEs(u.language)).map(u => u.id);
  const esIds = targets.filter(u => isEs(u.language)).map(u => u.id);

  await PushNotificationService.initialize();

  if (!SKIP_PUSH) {
    for (const [langKey, ids] of [['en', enIds], ['es', esIds]]) {
      if (!ids.length) continue;
      try {
        const n = await PushNotificationService.sendToUsers(ids, pushPayload(langKey));
        pushSent += n;
        console.log(`[PUSH ${langKey}] delivered ${n}/${ids.length}`);
      } catch (err) {
        console.error(`[PUSH ${langKey}] error: ${err.message}`);
      }
    }
  } else {
    console.log('[PUSH] skipped (--skip-push)');
  }

  // Per-user in-app DM + dedup log
  for (const user of targets) {
    try {
      const text = dmText(user.language);
      await sendSystemDM(SYSTEM_SENDER, user.id, text, query);
      dmSent++;
      await query(
        'INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [BATCH_ID, user.id]
      );
    } catch (err) {
      errors++;
      console.error(`  ERROR ${user.id} (${user.username}): ${err.message}`);
    }
    await sleep(DM_DELAY_MS);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Push sent : ${pushSent}`);
  console.log(`  DMs sent  : ${dmSent}`);
  console.log(`  Errors    : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
