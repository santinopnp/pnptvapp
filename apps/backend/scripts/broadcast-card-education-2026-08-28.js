#!/usr/bin/env node
'use strict';

/**
 * broadcast-card-education-2026-08-28.js
 *
 * One-shot educational DM to all active users teaching two card-payment
 * routes:
 *   1. MoonPay (direct card on any plan)
 *   2. Bitcoin via Banxa (copy BTC → paste at checkout.banxa.com)
 *
 * In-app DM only (no Telegram, no email). No invoice creation — this is
 * pure education pointing to /subscribe and /lifetime100.
 *
 * Dedup batch: card-education-2026-08-28
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-card-education-2026-08-28.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-card-education-2026-08-28.js
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN       = process.argv.includes('--dry-run');
const BATCH_ID      = 'card-education-2026-08-28';
const SYSTEM_SENDER = '8552451957';
const DM_DELAY_MS   = 40;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function dmText(lang) {
  if (isEs(lang)) {
    return `💳 *¿Nuevo en cripto? Aquí 2 formas fáciles de pagar con tu tarjeta en PNPtv:*

*Opción 1 — MoonPay (más rápido)*
En cualquier plan, toca "💳 Pagar" → elige MoonPay → paga con tu tarjeta de crédito o débito. Listo en minutos.

*Opción 2 — Bitcoin vía Banxa*
Toca "Pagar con Cripto" → elige BTC → copia la dirección BTC → abre checkout.banxa.com → pégala como destino → paga con tu tarjeta. Tu plan se activa solo.

Ambas funcionan en todo el mundo. Cualquier tarjeta, cualquier país. Empieza aquí:
👉 https://pnptv.app/subscribe
👉 https://pnptv.app/lifetime100

¿Algún problema? Escríbenos aquí y te ayudamos. 🖤

— PNPtv`;
  }
  return `💳 *New to crypto? Here are 2 easy ways to pay with your card on PNPtv:*

*Option 1 — MoonPay (fastest)*
On any plan, tap "💳 Pay" → pick MoonPay → pay with your credit or debit card. Done in minutes.

*Option 2 — Bitcoin via Banxa*
Tap "Pay with Crypto" → pick BTC → copy the BTC address shown → open checkout.banxa.com → paste it as the destination → pay with your card. Your plan activates automatically.

Both work worldwide. Any card, any country. Go here to start:
👉 https://pnptv.app/subscribe
👉 https://pnptv.app/lifetime100

Any issues? Reply here and we'll help. 🖤

— PNPtv`;
}

async function main() {
  await initializePostgres();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Card-payment education DM broadcast');
  console.log(`  Batch : ${BATCH_ID}`);
  console.log(`  Mode  : in-app DM only`);
  if (DRY_RUN) console.log('  DRY RUN — nothing will be sent');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id       AS user_id,
      u.username,
      u.language
    FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.batch_id = $1
          AND bd.user_id = u.id::text
      )
    ORDER BY u.id
  `, [BATCH_ID]);

  console.log(`  Found ${targets.length} user(s)\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  const stats = { dm: 0, failed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const { user_id, username, language } = targets[i];
    const lang = language || 'es';

    if (i % 200 === 0 || i === targets.length - 1) {
      console.log(`[${i + 1}/${targets.length}] user=${user_id} @${username || 'anon'} lang=${lang}`);
    }

    if (DRY_RUN) continue;

    try {
      await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
      stats.dm++;
    } catch (err) {
      stats.failed++;
      console.warn(`  ✗ DM failed for ${user_id}: ${err.message}`);
    }

    try {
      // PRIVATE dedup table — never insert into user-facing `notifications`.
      await query(`
        INSERT INTO broadcast_dedup (batch_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [BATCH_ID, String(user_id)]);
    } catch (err) {
      // dedup failure is non-fatal
    }

    await sleep(DM_DELAY_MS);
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  if (DRY_RUN) {
    console.log(`   DRY RUN — would have processed ${targets.length} user(s)`);
  } else {
    console.log(`   In-app DMs sent : ${stats.dm}`);
    console.log(`   Failures        : ${stats.failed}`);
  }
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
