#!/usr/bin/env node
'use strict';

/**
 * tg-santino-party-2026-08-23.js
 *
 * Telegram DM version of the party broadcast. Sends the same bilingual
 * message via the bot to every user with a populated `telegram` column.
 *
 * Silent 403 for users who never /start-ed the bot — nothing we can do.
 * Rate limited to Telegram's ~30 msg/sec ceiling.
 *
 * Idempotent resume log: logs/tg-santino-party-2026-08-23-sent.log
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/tg-santino-party-2026-08-23.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/tg-santino-party-2026-08-23.js
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram } = require('telegraf');

const DRY_RUN    = process.argv.includes('--dry-run');
const ONLY_ARG   = process.argv.find(a => a.startsWith('--only-users='));
const ONLY_USERS = ONLY_ARG ? new Set(ONLY_ARG.split('=')[1].split(',').map(s => s.trim()).filter(Boolean)) : null;

const ENTITY_ID     = 'tg-santino-party-2026-08-23';
const SANTINO_ID    = '8599671840';
const SEND_DELAY_MS = 40; // ~25/sec, under TG 30/sec ceiling

const LOG_DIR   = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => {
  try { return new Set(fsSync.readFileSync(SENT_FILE, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
};
const markSent = (tg) => { try { fsSync.appendFileSync(SENT_FILE, `${tg}\n`); } catch {} };
const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));
const isEs     = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

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

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Santino Party TELEGRAM DM — 2026-08-23');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)    console.log(' MODE: DRY RUN — nothing will be sent');
  if (ONLY_USERS) console.log(` MODE: ONLY-USERS = [${[...ONLY_USERS].join(', ')}]`);
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
  `, [SANTINO_ID]);

  const inScope = ONLY_USERS ? users.filter(u => ONLY_USERS.has(String(u.id))) : users;

  const already = loadSentSet();
  const targets = inScope.filter(u => !already.has(String(u.telegram)));

  console.log(`   Users with telegram:      ${users.length}`);
  console.log(`   In scope:                 ${inScope.length}`);
  console.log(`   Already sent (resume):    ${already.size}`);
  console.log(`   To send now:              ${targets.length}`);
  console.log(`   ETA at ${SEND_DELAY_MS}ms/user:      ~${Math.ceil(targets.length * SEND_DELAY_MS / 1000)}s\n`);

  if (DRY_RUN) {
    console.log('── Sample TG DM (EN) ──\n');
    console.log(MSG_EN);
    console.log('\n── Sample TG DM (ES) ──\n');
    console.log(MSG_ES);
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
      await tg.sendMessage(u.telegram, text, { disable_web_page_preview: true });
      sent++;
      markSent(u.telegram);
    } catch (err) {
      const desc = err.description || err.message || '?';
      if (/blocked|deactivated|not found|chat not found/i.test(desc)) {
        blocked++;
        markSent(u.telegram); // don't retry — mark as done
      } else {
        failed++;
        if (failed <= 5 || failed % 100 === 0) {
          console.warn(`     TG err [${u.telegram}]: ${desc.slice(0, 200)}`);
        }
      }
    }
    await sleep(SEND_DELAY_MS);
    if ((i + 1) % 200 === 0) {
      console.log(`     Progress: ${i + 1}/${targets.length} (sent=${sent}, blocked=${blocked}, failed=${failed})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' TELEGRAM BROADCAST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Sent:    ${sent}`);
  console.log(` Blocked: ${blocked}  (bot blocked / user deactivated / never /started)`);
  console.log(` Failed:  ${failed}  (transient — resume log will retry)`);
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main };
