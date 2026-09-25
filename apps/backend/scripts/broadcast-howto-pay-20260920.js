#!/usr/bin/env node
'use strict';

/**
 * broadcast-howto-pay-20260920.js
 *
 * Follow-up to the $50/year weekend promo broadcast.
 * Explains how to pay via crypto wallet (Privy) and via the crypto payment window.
 * Both methods are live today.
 *
 * Audience : all non-PRIME, non-banned users with Telegram
 * Channels : in-app DM (from Santino) + push
 * Hero      : https://pnptv.app/promos/promo-1.mp4
 * Dedup     : broadcast_dedup LIKE 'prime-howto-pay-20260920%'
 *
 * Run AFTER broadcast-yearly50-weekend-20260920.js completes.
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
 *     node apps/backend/scripts/broadcast-howto-pay-20260920.js --dry-run
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
const BATCH_ID  = 'prime-howto-pay-20260920';
const SENDER_ID = '8599671840'; // Santino
const CTA_URL   = 'https://pnptv.app/subscribe';
const VIDEO_URL = 'https://pnptv.app/promos/promo-1.mp4';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (lang === 'es') {
    return `💳 *Dos formas de activar PRIME ahora mismo — ambas funcionan hoy*

Santino aquí. Si intentaste pagar antes y no pudo ser, hoy está todo funcionando.

*Opción 1 — Con tu billetera crypto:*
1. Entrá a pnptv.app/subscribe
2. Elegí tu plan y tocá "Pay with wallet"
3. Conectá tu billetera y enviá USDC en la red Base
4. Listo — acceso inmediato

*Opción 2 — Con cualquier crypto:*
1. Entrá a pnptv.app/subscribe
2. Elegí tu plan y tocá "Pay with crypto"
3. Se abre una ventana de pago — enviá el monto exacto
4. En minutos tenés tu PRIME activo

Ambas opciones están funcionando perfectamente hoy.

👉 ${CTA_URL}

— Santino`;
  }
  return `💳 *Two ways to unlock PRIME right now — both working today*

Santino here. If you tried to pay before and it didn't go through, everything is working today.

*Option 1 — With your crypto wallet:*
1. Go to pnptv.app/subscribe
2. Pick your plan and tap "Pay with wallet"
3. Connect your wallet and send USDC on the Base network
4. Done — instant access

*Option 2 — With any crypto:*
1. Go to pnptv.app/subscribe
2. Pick your plan and tap "Pay with crypto"
3. A payment window opens — send the exact amount
4. Your PRIME is active within minutes

Both options are working perfectly today.

👉 ${CTA_URL}

— Santino`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '💳 Dos formas de activar PRIME — ambas funcionan hoy',
      body:  '¿Tuviste problemas antes? Hoy está todo resuelto.',
      url:   CTA_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💳 Two ways to unlock PRIME — both working today',
    body:  'Had trouble paying before? Everything is fixed today.',
    url:   CTA_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT id,
      CASE WHEN language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users
    WHERE tier NOT IN ('PRIME', 'banned')
      AND telegram IS NOT NULL AND telegram != ''
    ORDER BY created_at ASC
  `);

  const hasS = users.some(u => u.id === SENDER_ID);
  if (!hasS) users.unshift({ id: SENDER_ID, lang: 'en' });

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    ['prime-howto-pay-20260920%']
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — How to pay · Both methods working today');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN sample ──');
    console.log(dmText('en'));
    console.log('\n── ES sample ──');
    console.log(dmText('es'));
    console.log(`\n... to ${users.length} users total`);
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let dmOk = 0, pushOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      ['prime-howto-pay-20260920%', u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    try {
      await sendSystemDM(SENDER_ID, u.id, dmText(u.lang), query, {
        mediaUrl:  VIDEO_URL,
        mediaType: 'video',
      });
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      dmOk++;
    } catch (err) {
      console.error(`  ✗ DM ${u.id}: ${err.message}`);
      errors++;
    }

    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    if ((dmOk + skipped) % 100 === 0 && dmOk + skipped > 0) {
      console.log(`  → ${dmOk} sent, ${skipped} skipped, ${errors} errors`);
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
