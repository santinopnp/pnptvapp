#!/usr/bin/env node
'use strict';

/**
 * tg-dash-launch-2026-08-24.js
 *
 * Telegram version of Dash launch announcement.
 * Log: logs/tg-dash-launch-2026-08-24-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram } = require('telegraf');

const ENTITY_ID = 'tg-dash-launch-2026-08-24';
const PNPTV_ID  = '8552451957';
const SEND_DELAY_MS = 40;

const LOG_DIR = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => { try { return new Set(fsSync.readFileSync(SENT_FILE,'utf8').split('\n').filter(Boolean)); } catch { return new Set(); } };
const markSent = (tg) => { try { fsSync.appendFileSync(SENT_FILE, `${tg}\n`); } catch {} };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs = (l) => typeof l === 'string' && l.toLowerCase().startsWith('es');

const BLOCKED_RE = /blocked|deactivated|not found|chat not found|can't initiate|USER_BOT_TO_BOT_DISABLED|user is deactivated/i;

const MSG_EN = `🐎 New payment option — Pay with Dash

Every plan on Subscribe now accepts direct Dash cryptocurrency. Send Dash to our address and email your tx hash — we activate within 2h.

👉 https://pnptv.app/subscribe`;

const MSG_ES = `🐎 Nueva opción de pago — Paga con Dash

Todos los planes en Suscribir ahora aceptan Dash directamente. Envía Dash a nuestra dirección y envía tu tx hash por email — activamos en menos de 2h.

👉 https://pnptv.app/subscribe`;

async function main() {
  if (!process.env.BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT id, telegram, LOWER(COALESCE(language,'en')) AS language
    FROM users
    WHERE COALESCE(is_deleted, false) = false
      AND role != 'banned'
      AND id != $1
      AND telegram IS NOT NULL AND telegram <> ''
    ORDER BY id
  `, [PNPTV_ID]);

  const already = loadSentSet();
  const toSend  = users.filter(u => !already.has(String(u.telegram)));

  console.log(`\n Dash Launch TG · targets ${users.length} · sending ${toSend.length}\n`);

  const tg = new Telegram(process.env.BOT_TOKEN);
  let sent = 0, blocked = 0, failed = 0;

  for (let i = 0; i < toSend.length; i++) {
    const u = toSend[i];
    const text = isEs(u.language) ? MSG_ES : MSG_EN;
    try {
      await tg.sendMessage(u.telegram, text, { disable_web_page_preview: false });
      sent++;
      markSent(u.telegram);
    } catch (err) {
      const desc = err.description || err.message || '?';
      if (BLOCKED_RE.test(desc)) { blocked++; markSent(u.telegram); }
      else { failed++; if (failed <= 5) console.warn(`   ✗ [${u.telegram}]: ${desc.slice(0,150)}`); }
    }
    await sleep(SEND_DELAY_MS);
    if ((i+1) % 200 === 0) console.log(`   progress ${i+1}/${toSend.length} (sent=${sent}, blocked=${blocked}, failed=${failed})`);
  }

  console.log(`\n Sent: ${sent} · Blocked: ${blocked} · Failed: ${failed}\n`);
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
