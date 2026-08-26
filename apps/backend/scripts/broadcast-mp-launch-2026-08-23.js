#!/usr/bin/env node
'use strict';

/**
 * broadcast-mp-launch-2026-08-23.js
 *
 * Announces the new Mercado Pago (COP) card option on /subscribe.
 * Sender: @pnptv (PNPtv! News, 8552451957). Bilingual per u.language.
 * Audience: all non-deleted, non-banned users.
 *
 * Idempotent resume log: logs/broadcast-mp-launch-2026-08-23-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN = process.argv.includes('--dry-run');
const ENTITY_ID     = 'broadcast-mp-launch-2026-08-23';
const PNPTV_ID      = '8552451957';
const SEND_DELAY_MS = 60;

const LOG_DIR   = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => {
  try { return new Set(fsSync.readFileSync(SENT_FILE, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
};
const markSent = (id) => { try { fsSync.appendFileSync(SENT_FILE, `${id}\n`); } catch {} };
const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));
const isEs     = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

const MSG_EN = `💳 New payment option — Card via Mercado Pago (COP)

Every plan on Subscribe now accepts card payment via Mercado Pago, charged in Colombian pesos.

Great for Colombia (tap the 🇨🇴 button on your plan). After paying, we'll activate your plan within 2h.

👉 https://pnptv.app/subscribe`;

const MSG_ES = `💳 Nuevo método de pago — Tarjeta vía Mercado Pago (COP)

Todos los planes en Suscribir ahora aceptan pago con tarjeta vía Mercado Pago, cobrado en pesos colombianos.

Ideal para Colombia (toca el botón 🇨🇴 en tu plan). Después de pagar, activamos tu plan en 2h.

👉 https://pnptv.app/subscribe`;

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' MP Launch In-App DM — 2026-08-23');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be sent');
  console.log('');

  await initializePostgres();

  const { rows: users } = await query(`
    SELECT id, LOWER(COALESCE(language,'en')) AS language
    FROM users
    WHERE COALESCE(is_deleted, false) = false
      AND role != 'banned'
      AND id != $1
    ORDER BY id
  `, [PNPTV_ID]);

  const already = loadSentSet();
  const targets = users.filter(u => !already.has(u.id));

  console.log(`   Total users:              ${users.length}`);
  console.log(`   Already sent (resume):    ${already.size}`);
  console.log(`   To send now:              ${targets.length}`);
  console.log(`   ETA at ${SEND_DELAY_MS}ms/user:      ~${Math.ceil(targets.length * SEND_DELAY_MS / 1000)}s\n`);

  if (DRY_RUN) {
    console.log('── Sample DM (EN) ──\n' + MSG_EN);
    console.log('\n── Sample DM (ES) ──\n' + MSG_ES);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(' DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');
    process.exit(0);
  }

  let sent = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    const text = isEs(u.language) ? MSG_ES : MSG_EN;
    try {
      await sendSystemDM(PNPTV_ID, u.id, text, query);
      sent++;
      markSent(u.id);
    } catch (err) {
      failed++;
      if (failed <= 5 || failed % 100 === 0) console.warn(`     DM err [${u.id}]: ${err.message}`);
    }
    await sleep(SEND_DELAY_MS);
    if ((i + 1) % 200 === 0) console.log(`     Progress: ${i + 1}/${targets.length} (sent=${sent}, failed=${failed})`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' BROADCAST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Sent:   ${sent}`);
  console.log(` Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
