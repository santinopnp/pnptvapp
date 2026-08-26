#!/usr/bin/env node
'use strict';

/**
 * tg-mp-launch-2026-08-23.js
 *
 * Telegram DM version of the MP launch announcement. Broadened blocked
 * regex from tg-lifetime100 pattern.
 *
 * Idempotent resume log: logs/tg-mp-launch-2026-08-23-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram } = require('telegraf');

const DRY_RUN = process.argv.includes('--dry-run');
const ENTITY_ID     = 'tg-mp-launch-2026-08-23';
const PNPTV_ID      = '8552451957';
const SEND_DELAY_MS = 40;

const LOG_DIR   = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => {
  try { return new Set(fsSync.readFileSync(SENT_FILE, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
};
const markSent = (tg) => { try { fsSync.appendFileSync(SENT_FILE, `${tg}\n`); } catch {} };
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

const BLOCKED_RE = /blocked|deactivated|not found|chat not found|can't initiate|USER_BOT_TO_BOT_DISABLED|user is deactivated/i;

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' MP Launch TELEGRAM DM — 2026-08-23');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be sent');
  if (!process.env.BOT_TOKEN) { console.error(' BOT_TOKEN not set'); process.exit(1); }
  console.log('');

  await initializePostgres();

  const { rows: users } = await query(`
    SELECT id, telegram, LOWER(COALESCE(language,'en')) AS language
    FROM users
    WHERE COALESCE(is_deleted, false) = false
      AND role != 'banned'
      AND id != $1
      AND telegram IS NOT NULL
      AND telegram <> ''
    ORDER BY id
  `, [PNPTV_ID]);

  const already = loadSentSet();
  const targets = users.filter(u => !already.has(String(u.telegram)));

  console.log(`   Users with telegram:      ${users.length}`);
  console.log(`   Already sent (resume):    ${already.size}`);
  console.log(`   To send now:              ${targets.length}`);
  console.log(`   ETA at ${SEND_DELAY_MS}ms/user:      ~${Math.ceil(targets.length * SEND_DELAY_MS / 1000)}s\n`);

  if (DRY_RUN) {
    console.log('── Sample TG (EN) ──\n' + MSG_EN);
    console.log('\n── Sample TG (ES) ──\n' + MSG_ES);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(' DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');
    process.exit(0);
  }

  const tg = new Telegram(process.env.BOT_TOKEN);
  let sent = 0, blocked = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    const text = isEs(u.language) ? MSG_ES : MSG_EN;
    try {
      await tg.sendMessage(u.telegram, text, { disable_web_page_preview: false });
      sent++;
      markSent(u.telegram);
    } catch (err) {
      const desc = err.description || err.message || '?';
      if (BLOCKED_RE.test(desc)) {
        blocked++;
        markSent(u.telegram);
      } else {
        failed++;
        if (failed <= 5 || failed % 100 === 0) console.warn(`     TG err [${u.telegram}]: ${desc.slice(0, 200)}`);
      }
    }
    await sleep(SEND_DELAY_MS);
    if ((i + 1) % 200 === 0) console.log(`     Progress: ${i + 1}/${targets.length} (sent=${sent}, blocked=${blocked}, failed=${failed})`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' TELEGRAM BROADCAST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Sent:    ${sent}`);
  console.log(` Blocked: ${blocked}`);
  console.log(` Failed:  ${failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
