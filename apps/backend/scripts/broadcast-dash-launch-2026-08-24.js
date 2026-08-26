#!/usr/bin/env node
'use strict';

/**
 * broadcast-dash-launch-2026-08-24.js
 *
 * Announces Dash as new direct-address payment option on /subscribe.
 * Sender: @pnptv. Bilingual per u.language.
 * Audience: all non-deleted, non-banned users.
 *
 * Log: logs/broadcast-dash-launch-2026-08-24-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN = process.argv.includes('--dry-run');
const ENTITY_ID = 'broadcast-dash-launch-2026-08-24';
const PNPTV_ID  = '8552451957';
const SEND_DELAY_MS = 60;

const LOG_DIR = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => { try { return new Set(fsSync.readFileSync(SENT_FILE,'utf8').split('\n').filter(Boolean)); } catch { return new Set(); } };
const markSent = (id) => { try { fsSync.appendFileSync(SENT_FILE, `${id}\n`); } catch {} };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs = (l) => typeof l === 'string' && l.toLowerCase().startsWith('es');

const MSG_EN = `🐎 New payment option — Pay with Dash

Every plan on Subscribe now accepts direct Dash cryptocurrency. Send Dash to our address and email your tx hash — we activate within 2h.

👉 https://pnptv.app/subscribe`;

const MSG_ES = `🐎 Nueva opción de pago — Paga con Dash

Todos los planes en Suscribir ahora aceptan Dash directamente. Envía Dash a nuestra dirección y envía tu tx hash por email — activamos en menos de 2h.

👉 https://pnptv.app/subscribe`;

async function main() {
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
  const toSend  = users.filter(u => !already.has(u.id));

  console.log(`\n Dash Launch DM · targets ${users.length} · sending ${toSend.length}\n`);

  if (DRY_RUN) {
    console.log('EN:\n' + MSG_EN);
    console.log('\nES:\n' + MSG_ES);
    process.exit(0);
  }

  let sent = 0, failed = 0;
  for (let i = 0; i < toSend.length; i++) {
    const u = toSend[i];
    const text = isEs(u.language) ? MSG_ES : MSG_EN;
    try {
      await sendSystemDM(PNPTV_ID, u.id, text, query);
      sent++;
      markSent(u.id);
    } catch (err) {
      failed++;
      if (failed <= 5) console.warn(`   ✗ ${u.id}: ${err.message}`);
    }
    await sleep(SEND_DELAY_MS);
    if ((i+1) % 200 === 0) console.log(`   progress ${i+1}/${toSend.length} (sent=${sent}, failed=${failed})`);
  }

  console.log(`\n Sent: ${sent} · Failed: ${failed}\n`);
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
