#!/usr/bin/env node
'use strict';

/**
 * broadcast-howto-pay-wallet-20260923.js
 *
 * Mass send explaining both crypto payment methods — PNPtv Wallet (USDC on Base)
 * and the any-crypto popup. Links to the how-to-pay landing page.
 * Audience: all non-banned users.
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-howto-pay-wallet-20260923.js --dry-run
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

const DRY_RUN   = process.argv.includes('--dry-run');
const SKIP_PUSH = process.argv.includes('--skip-push');
const BATCH_ID  = 'howto-pay-wallet-20260923';
const SENDER_ID = '8599671840'; // Santino
const CTA_URL   = 'https://pnptv.app/how-to-pay.html';
const SUB_URL   = 'https://pnptv.app/subscribe';
const VIDEO_URL = 'https://pnptv.app/promos/promo-1.mp4';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (lang === 'es') {
    return `💎 *Así se paga en PNPtv — guía completa*

Santino aquí. Dos formas de activar PRIME, ambas funcionando hoy mismo:

*Opción 1 — Billetera PNPtv (USDC):*
1. Abrí la app → tocá 💎 → "Crear mi billetera"
2. Cargá USDC en la red Base desde Coinbase, MetaMask o cualquier billetera compatible
3. Andá a Suscribirse → elegí tu plan → "Pagar con billetera"
4. Listo. Acceso inmediato.

*Opción 2 — Cualquier crypto:*
1. Andá a Suscribirse → elegí tu plan → "Pagar con crypto"
2. Se abre una ventana segura — elegí tu moneda
3. Enviá el monto exacto a la dirección que aparece
4. Tu PRIME se activa en minutos, automáticamente.

Guía completa paso a paso: ${CTA_URL}

👉 ${SUB_URL}

— Santino`;
  }
  return `💎 *How to pay on PNPtv — full guide*

Santino here. Two ways to unlock PRIME — both working right now:

*Option 1 — PNPtv Wallet (USDC):*
1. Open the app → tap 💎 → "Create my wallet"
2. Fund it with USDC on Base from Coinbase, MetaMask, or any compatible wallet
3. Go to Subscribe → pick your plan → "Pay with wallet"
4. Done. Instant access.

*Option 2 — Any crypto:*
1. Go to Subscribe → pick your plan → "Pay with crypto"
2. A secure window opens — pick your coin (BTC, ETH, LTC, DOGE, SOL…)
3. Send the exact amount shown
4. Your PRIME activates within minutes, automatically.

Full step-by-step guide: ${CTA_URL}

👉 ${SUB_URL}

— Santino`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '💎 Así se paga en PNPtv — guía completa',
      body:  'Billetera USDC o cualquier crypto. Dos formas, ambas funcionando hoy.',
      url:   CTA_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💎 How to pay on PNPtv — full guide',
    body:  'USDC wallet or any crypto. Two ways to get PRIME, both working today.',
    url:   CTA_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT
      id,
      telegram,
      CASE WHEN language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users
    WHERE tier != 'banned'
    ORDER BY created_at ASC
  `);

  // Ensure Santino is always in the audience (preview check)
  if (!users.some(u => u.id === SENDER_ID)) {
    users.unshift({ id: SENDER_ID, telegram: null, lang: 'en' });
  }

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [`${BATCH_ID}%`]
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — How to pay · Wallet + Crypto guide');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN sample ──\n');
    console.log(dmText('en'));
    console.log('\n── ES sample ──\n');
    console.log(dmText('es'));
    console.log(`\n... to ${users.length} users total`);
    console.log('\n── Push (EN) ──\n', pushPayload('en'));
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let dmOk = 0, pushOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    // In-app DM (only for users with Telegram — sendSystemDM route)
    if (u.telegram) {
      try {
        await sendSystemDM(SENDER_ID, u.id, dmText(u.lang), query, {
          mediaUrl:  VIDEO_URL,
          mediaType: 'video',
        });
        dmOk++;
      } catch (err) {
        console.error(`  ✗ DM ${u.id}: ${err.message}`);
        errors++;
      }
    }

    // Record dedup regardless of DM success to avoid retrying on push-only users
    await query(
      `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [BATCH_ID, u.id]
    );

    // Push (everyone)
    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    if ((dmOk + skipped) % 200 === 0 && dmOk + skipped > 0) {
      console.log(`  → ${dmOk} DMs, ${pushOk} push, ${skipped} skipped, ${errors} errors`);
    }

    await sleep(200);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  In-app DMs : ${dmOk}`);
  console.log(`  Push       : ${pushOk}`);
  console.log(`  Skipped    : ${skipped}`);
  console.log(`  Errors     : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
