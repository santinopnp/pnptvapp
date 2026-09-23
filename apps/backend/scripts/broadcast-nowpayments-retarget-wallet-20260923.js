#!/usr/bin/env node
'use strict';

/**
 * broadcast-nowpayments-retarget-wallet-20260923.js
 *
 * Targeted DM to the 9 users who opened a NowPayments crypto payment
 * in the last 48h but never completed it. Invites them to use the
 * PNPtv Wallet (USDC on Base) instead — simpler, instant, no popup.
 *
 * User list extracted from NowPayments GET /payment/ (last 48h, status=waiting).
 * Order ID patterns: pnptv-nowp-{telegramId}, pnptv-nowp-retarget-{telegramId},
 * np-yearly50-{telegramId}. No brand names in user-facing copy.
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv ... \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-nowpayments-retarget-wallet-20260923.js --dry-run
 *
 * Live: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN   = process.argv.includes('--dry-run');
const BATCH_ID  = 'nowp-retarget-wallet-20260923';
const SENDER_ID = '8599671840'; // Santino

// Telegram IDs extracted from NowPayments order IDs (last 48h, all waiting)
const TARGET_TELEGRAMS = [
  '6832782141', // 3 attempts — pnptv-nowp-retarget
  '6370769205', // 4 attempts — multiple orders
  '8100480687', // 1 attempt  — pnptv-nowp
  '7190974943', // 1 attempt  — pnptv-nowp-retarget
  '6155503951', // 1 attempt  — np-yearly50
  '1305615283', // 1 attempt  — np-yearly50 (es)
  '5522476251', // 1 attempt  — np-yearly50
  '8206669935', // 1 attempt  — np-yearly50
  '6331271048', // 1 attempt  — np-yearly50
];

const GUIDE_URL = 'https://pnptv.app/how-to-pay.html';
const SUB_URL   = 'https://pnptv.app/subscribe';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function dmText(lang) {
  if (lang === 'es') {
    return `💎 *Una forma más fácil de activar PRIME*

Santino aquí. Si intentaste pagar con crypto y no fue, tenemos algo más directo para vos.

*Con tu billetera PNPtv (USDC):*
1. Abrí la app → tocá 💎 → Crear tu billetera
2. Enviá USDC desde Coinbase, MetaMask o cualquier billetera que use la red Base
3. Andá a Suscribirse → pagá — acceso inmediato, sin ventanas emergentes

Guía completa: ${GUIDE_URL}

👉 ${SUB_URL}

— Santino`;
  }
  return `💎 *An easier way to get PRIME*

Santino here. If you tried paying with crypto and it didn't go through, we have something simpler.

*With your PNPtv Wallet (USDC):*
1. Open the app → tap 💎 → Create your wallet
2. Send USDC from Coinbase, MetaMask, or any wallet on the Base network
3. Go to Subscribe → pay — instant access, no popup windows

Full guide: ${GUIDE_URL}

👉 ${SUB_URL}

— Santino`;
}

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT u.id, u.telegram,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.telegram = ANY($1::text[])
      AND u.tier != 'banned'
  `, [TARGET_TELEGRAMS]);

  // Always include Santino
  if (!users.some(u => u.id === SENDER_ID)) {
    users.unshift({ id: SENDER_ID, telegram: SENDER_ID, lang: 'en' });
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  NowPayments retarget → PNPtv Wallet');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Targets   : ${users.length} users`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── Users ──');
    users.forEach(u => console.log(`  ${u.id} (tg: ${u.telegram}) [${u.lang}]`));
    console.log('\n── EN sample ──\n');
    console.log(dmText('en'));
    console.log('\n── ES sample ──\n');
    console.log(dmText('es'));
    console.log('\n-- DRY RUN complete --\n');
    process.exit(0);
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { console.log(`  skip ${u.id} (already sent)`); skipped++; continue; }

    try {
      await sendSystemDM(SENDER_ID, u.id, dmText(u.lang), query);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      console.log(`  ✓ sent to ${u.id} [${u.lang}]`);
      sent++;
    } catch (err) {
      console.error(`  ✗ ${u.id}: ${err.message}`);
      errors++;
    }
    await sleep(300);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Sent    : ${sent}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
