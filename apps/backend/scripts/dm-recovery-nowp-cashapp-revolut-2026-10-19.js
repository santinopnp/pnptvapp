#!/usr/bin/env node
'use strict';

/**
 * dm-recovery-nowp-cashapp-revolut-2026-10-19.js
 *
 * Targeted in-app DM to users who started a NowPayments checkout in the last
 * 7 days but never completed it — explains how to pay using CashApp or Revolut.
 *
 * Audience : unique users from dash_subscription_orders with status
 *            pending/expired in the last 7 days, excluding Santino's own account.
 * Channel  : in-app DM only (sendSystemDM), sent as Santino.
 * Dedup    : nowp-recovery-cashapp-revolut-2026-10-19% (broadcast_dedup LIKE)
 *
 * DRY RUN (default):
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/dm-recovery-nowp-cashapp-revolut-2026-10-19.js
 *
 * LIVE:
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/dm-recovery-nowp-cashapp-revolut-2026-10-19.js --live
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY        = !process.argv.includes('--live');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const SANTINO_ID = '8599671840';
const CAMPAIGN   = 'nowp-recovery-cashapp-revolut-2026-10-19';
const DM_DELAY   = 80;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  const subscribeUrl = `${WEBAPP_URL}/subscribe`;

  if (isEs(lang)) return `Hey — tu pago cripto no se completó, pero no te preocupés, es fácil de intentar de nuevo.

La forma más rápida es con CashApp o Revolut:

📱 Con CashApp:
→ Abrí Cash App → tocá la pestaña Bitcoin (₿)
→ Tocá "Enviar Bitcoin"
→ Andá a pnptv.app/subscribe → elegí "Pagar con Crypto" → copiá la dirección BTC
→ Pegá la dirección en Cash App → ingresá el monto exacto → Confirmar

📱 Con Revolut:
→ Abrí Revolut → buscá "Bitcoin" en la barra de búsqueda
→ Tocá Bitcoin → tocá "Enviar" → "Enviar a dirección cripto"
→ Andá a pnptv.app/subscribe → elegí "Pagar con Crypto" → copiá la dirección BTC
→ Pegá la dirección en Revolut → ingresá el monto exacto → Confirmar

👉 ${subscribeUrl}

¿Necesitás ayuda? Respondé acá.

— Santino`;

  return `Hey — your crypto payment didn't go through, but it's easy to retry.

The fastest way is with CashApp or Revolut:

📱 With CashApp:
→ Open Cash App → tap the Bitcoin tab (₿)
→ Tap "Send Bitcoin"
→ Go to pnptv.app/subscribe → choose "Pay with Crypto" → copy the BTC address
→ Paste the address in Cash App → enter the exact amount shown → Confirm

📱 With Revolut:
→ Open Revolut → search "Bitcoin" in the top search bar
→ Tap Bitcoin → tap "Send" → "Send to crypto address"
→ Go to pnptv.app/subscribe → choose "Pay with Crypto" → copy the BTC address
→ Paste the address in Revolut → enter the exact amount shown → Confirm

👉 ${subscribeUrl}

Need help? Reply here.

— Santino`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  // ── Audience: unique users with pending/expired NowPayments last 7 days ──
  const { rows } = await query(`
    SELECT DISTINCT ON (dso.user_id)
      dso.user_id     AS id,
      u.language,
      u.username,
      dso.plan_id     AS last_plan,
      dso.usd_amount  AS last_amount,
      dso.created_at  AS last_attempt
    FROM dash_subscription_orders dso
    JOIN users u ON u.id::text = dso.user_id
    WHERE dso.created_at > NOW() - INTERVAL '7 days'
      AND dso.status IN ('pending', 'expired')
      AND dso.user_id != $1
      AND u.deleted_at IS NULL
      AND COALESCE(u.tier, 'free') != 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.user_id = dso.user_id
          AND bd.batch_id LIKE $2
      )
    ORDER BY dso.user_id, dso.created_at DESC
  `, [SANTINO_ID, `${CAMPAIGN}%`]);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — Recovery DM: CashApp / Revolut instructions');
  console.log(`  Campaign  : ${CAMPAIGN}`);
  console.log(`  Audience  : ${rows.length} users`);
  console.log(`  Mode      : ${DRY ? 'DRY RUN — pass --live to send' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (rows.length > 0) {
    console.log('Target users:');
    rows.forEach(r => console.log(`  ${r.id}  ${r.username || '(no handle)'}  last: ${r.last_plan} $${r.last_amount}  @ ${String(r.last_attempt).slice(0, 16)}`));
  }

  if (DRY) {
    console.log('\n── EN copy ──\n');
    console.log(dmText('en'));
    console.log('\n── ES copy ──\n');
    console.log(dmText('es'));
    console.log('\n-- DRY RUN complete. Pass --live to send. --\n');
    process.exit(0);
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  let ok = 0, fail = 0;

  for (const u of rows) {
    const lang = u.language || 'en';
    try {
      await sendSystemDM(SANTINO_ID, u.id, dmText(lang), query);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [`${CAMPAIGN}-dm`, u.id]
      );
      ok++;
      console.log(`  ✓ ${u.id}  ${u.username || ''}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${u.id} — ${e.message}`);
    }
    await sleep(DM_DELAY);
  }

  console.log(`\n✓ Done — sent: ${ok}  failed: ${fail}\n`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
