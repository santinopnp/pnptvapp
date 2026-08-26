#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-39-bday-2026-08-23.js
 *
 * Personal DM from Santino (SantinoFurioso, user id 8599671840) to all
 * age-verified members. Announces his 39th birthday and invites a gift
 * ($20+) in exchange for a private VIP video call next weekend.
 *
 * Two gift rails:
 *   - Crypto:  https://nowpayments.io/donation/Pnptv
 *   - Card:    https://link.mercadopago.com.co/pnplatinotv  (COP-only)
 *
 * Channel: in-app DM only (sendSystemDM → also fires web-push + bell).
 * No email, no Telegram DM, no social — matches prior birthday broadcast.
 *
 * Idempotent: per-user resume log at logs/santino-39-bday-2026-08-23-sent.log
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-39-bday-2026-08-23.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-39-bday-2026-08-23.js --only-users=<id1>,<id2>
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-39-bday-2026-08-23.js
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

const ENTITY_ID     = 'santino-39-bday-2026-08-23';
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
const isEn     = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Message (from Santino) ────────────────────────────────────────────────────

const MSG_EN = `Hi papi 💜

It's my 39th birthday today. I'm not throwing a party — I'd rather spend a few private moments next weekend with the people who make this platform mine.

Send me a gift ($20 USD or more) and I'll DM or email you back with a private VIP video call slot next weekend. Just you and me, no rush.

Two ways to gift:

💎 Crypto (any coin): https://nowpayments.io/donation/Pnptv

💳 Card (Mercado Pago, charged in Colombian pesos):
    · $1 USD ≈ $3,000 COP
    · $10 USD ≈ $30,000 COP
    · $100 USD ≈ $300,000 COP
   https://link.mercadopago.com.co/pnplatinotv

Once you gift, keep your receipt — I'll reach out to schedule.

Thank you for being here. Truly.
Santino 💜`;

const MSG_ES = `Hola papi 💜

Hoy cumplo 39. No estoy haciendo fiesta grande — prefiero pasar unos ratos privados el próximo fin de semana con la gente que hace mía esta plataforma.

Mándame un regalito ($20 USD o más) y te escribo por DM o correo con un cupo de videollamada VIP privada el próximo fin de semana. Solo tú y yo, sin apuro.

Dos formas de regalar:

💎 Cripto (cualquier moneda): https://nowpayments.io/donation/Pnptv

💳 Tarjeta (Mercado Pago, cobrado en pesos colombianos):
    · $1 USD ≈ $3.000 COP
    · $10 USD ≈ $30.000 COP
    · $100 USD ≈ $300.000 COP
   https://link.mercadopago.com.co/pnplatinotv

Cuando regales, guarda tu recibo — te contacto para agendar.

Gracias por estar aquí. De verdad.
Santino 💜`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Santino 39th Birthday DM Broadcast — 2026-08-23');
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
      AND age_verified = true
      AND id != $1
    ORDER BY id
  `, [SANTINO_ID]);

  const inScope = ONLY_USERS ? users.filter(u => ONLY_USERS.has(String(u.id))) : users;

  const already = loadSentSet();
  const targets = inScope.filter(u => !already.has(u.id));

  console.log(`   Total age-verified users: ${users.length}`);
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
    const text = isEn(u.language) ? MSG_EN : MSG_ES;
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
