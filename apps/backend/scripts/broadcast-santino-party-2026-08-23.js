#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-party-2026-08-23.js
 *
 * Replacement DM after the morning "Hi papi" version was soft-deleted.
 * Reframes the celebration as a private spun video call next Saturday for
 * VIPs, with both gift rails (NowPayments + Mercado Pago) inline.
 *
 * Channel: in-app DM only (sendSystemDM → also fires web-push + bell).
 * Sender:  SantinoFurioso (8599671840).
 * Audience: ALL non-deleted, non-banned users, EXCLUDING Santino.
 * Language: bilingual EN/ES per u.language.
 *
 * Idempotent resume log: logs/santino-party-2026-08-23-sent.log
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-party-2026-08-23.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-party-2026-08-23.js
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN    = process.argv.includes('--dry-run');
const ONLY_ARG   = process.argv.find(a => a.startsWith('--only-users='));
const ONLY_USERS = ONLY_ARG ? new Set(ONLY_ARG.split('=')[1].split(',').map(s => s.trim()).filter(Boolean)) : null;

const ENTITY_ID     = 'santino-party-2026-08-23';
const SANTINO_ID    = '8599671840';
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

// ── Message ──────────────────────────────────────────────────────────────────

const MSG_EN = `🔥 Santino's birthday was the 14th…

We're celebrating next Saturday with a private spun video call 🐷💨

VIPs / real pigs only.
Send a gift → get a personal DM from Santino + Lex with all the filthy details.

Don't miss the cult party. Links below 👇 🔥🍆🐽

💎 Crypto (any coin):
https://nowpayments.io/donation/Pnptv

💳 Card (Mercado Pago, charged in Colombian pesos):
   · $1 USD ≈ $3,000 COP
   · $10 USD ≈ $30,000 COP
   · $100 USD ≈ $300,000 COP
https://link.mercadopago.com.co/pnplatinotv`;

const MSG_ES = `🔥 El cumple de Santino fue el 14…

Estamos celebrando el próximo sábado con una videollamada privada bien tinada 🐷💨

Solo VIPs / cerdos de verdad.
Regala un gift → recibes un DM personal de Santino + Lex con todos los detalles cochinos.

No te pierdas la fiesta de culto. Links abajo 👇 🔥🍆🐽

💎 Cripto (cualquier moneda):
https://nowpayments.io/donation/Pnptv

💳 Tarjeta (Mercado Pago, cobrado en pesos colombianos):
   · $1 USD ≈ $3.000 COP
   · $10 USD ≈ $30.000 COP
   · $100 USD ≈ $300.000 COP
https://link.mercadopago.com.co/pnplatinotv`;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Santino Party DM Broadcast — 2026-08-23');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)    console.log(' MODE: DRY RUN — nothing will be sent');
  if (ONLY_USERS) console.log(` MODE: ONLY-USERS = [${[...ONLY_USERS].join(', ')}]`);
  console.log('');

  await initializePostgres();

  const { rows: users } = await query(`
    SELECT id, first_name, username, language
    FROM users
    WHERE COALESCE(is_deleted, false) = false
      AND role != 'banned'
      AND id != $1
    ORDER BY id
  `, [SANTINO_ID]);

  const inScope = ONLY_USERS ? users.filter(u => ONLY_USERS.has(String(u.id))) : users;

  const already = loadSentSet();
  const targets = inScope.filter(u => !already.has(u.id));

  console.log(`   Total users:              ${users.length}`);
  console.log(`   In scope:                 ${inScope.length}`);
  console.log(`   Already sent (resume):    ${already.size}`);
  console.log(`   To send now:              ${targets.length}`);
  console.log(`   ETA at ${SEND_DELAY_MS}ms/user:      ~${Math.ceil(targets.length * SEND_DELAY_MS / 1000)}s\n`);

  if (DRY_RUN) {
    console.log('── Sample DM (EN) ──\n');
    console.log(MSG_EN);
    console.log('\n── Sample DM (ES) ──\n');
    console.log(MSG_ES);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(' DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');
    process.exit(0);
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    const text = isEs(u.language) ? MSG_ES : MSG_EN;
    try {
      await sendSystemDM(SANTINO_ID, u.id, text, query);
      sent++;
      markSent(u.id);
    } catch (err) {
      failed++;
      if (failed <= 5 || failed % 100 === 0) {
        console.warn(`     DM err [${u.id}]: ${err.message}`);
      }
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

if (require.main === module) {
  main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main };
