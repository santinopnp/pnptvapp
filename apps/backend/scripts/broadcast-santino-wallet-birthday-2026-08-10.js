#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-wallet-birthday-2026-08-10.js
 *
 * Personal DM from Santino (SantinoFurioso, user id 8599671840) to all
 * age-verified members announcing the PNP Wallet + Ru$h 💎 launch and his
 * 2026-08-14 birthday.
 *
 * Channels (via sendSystemDM):
 *   - In-app DM (direct_messages table) — user sees it in their /dm/<santino> inbox
 *   - Web push notification (fired by NotificationEmitter downstream)
 *   - In-app bell notification (fired by NotificationEmitter downstream)
 *
 * Explicitly NOT via:
 *   - Telegram bot DM (user's explicit exclusion)
 *   - Email
 *   - Social feed post
 *   - X post
 *
 * Respects notification_preferences.dms.{push,inApp,bot} because this is a
 * REAL DM (type=dm in notifications), not a promo announcement. The 'inApp'
 * key on the DB row governs whether NotificationEmitter creates a bell row.
 *
 * Idempotency: per-user resume log (avoids double-DM on crash/re-run).
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-wallet-birthday-2026-08-10.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-wallet-birthday-2026-08-10.js --only-users=<id1>,<id2>
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-santino-wallet-birthday-2026-08-10.js
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }    = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN    = process.argv.includes('--dry-run');
const ONLY_ARG   = process.argv.find(a => a.startsWith('--only-users='));
const ONLY_USERS = ONLY_ARG ? new Set(ONLY_ARG.split('=')[1].split(',').map(s => s.trim()).filter(Boolean)) : null;

const ENTITY_ID     = 'santino-wallet-birthday-2026-08-10';
const SANTINO_ID    = '8599671840'; // SantinoFurioso, superadmin, "Santino" persona
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

const MSG_EN = `Hi papi,

As you know I've been working hard to improve and finish the app, and even though we've had so many bugs (for which I truly apologize 🙈) we've also made some great accomplishments. The main one I want to present to you all later today: a safe, reliable, easy and fast payment method — the PNP Wallet with Ru$h 💎.

I know crypto sounds scary but trust me, it's easier than you think. We prepared a very nice video tutorial on how to use it, and starting August 17th the Wallet is the main way to pay inside PNPtv. Please please please watch it before then — do it for me <3

You can skip it all week but pretty please, don't leave it for the last minute.

It's also my birthday on the 14th and I'd love to take the day off to smoke with you guys (hydrated and with food please, let's take care of each other 💜) — but I can't take it easy if I'm answering payment questions all day 😅. So drop your Wallet questions now and we'll clear everything before then.

Thank you for your support. Always yours,
Santino 💜`;

const MSG_ES = `Papi,

Como saben he estado trabajando duro para mejorar y terminar la app, y aunque hemos tenido tantos bugs (por los que de verdad les pido disculpas 🙈) también hemos logrado cosas grandes. La principal se las presento hoy: un método de pago seguro, confiable, fácil y rápido — la PNP Wallet con Ru$h 💎.

Sé que "cripto" suena feo pero créanme, es más fácil de lo que piensan. Preparamos un video tutorial muy lindo de cómo usarla, y a partir del 17 de agosto la Wallet es la forma principal de pagar dentro de PNPtv. Por favor, por favor, por favor, mírenlo antes — háganlo por mí <3

Pueden saltárselo toda la semana pero porfa, no lo dejen para el último minuto.

Además es mi cumpleaños el 14 y me encantaría tomarme el día para fumar con ustedes (hidratados y con comida, cuidémonos 💜) — pero no puedo relajarme si estoy contestando preguntas de pago todo el día 😅. Así que déjame tus dudas de la Wallet ya y las respondemos antes.

Gracias por su apoyo. Siempre suyo,
Santino 💜`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Santino Wallet + Birthday DM Broadcast — 2026-08-10');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)    console.log(' MODE: DRY RUN — nothing will be sent');
  if (ONLY_USERS) console.log(` MODE: ONLY-USERS = [${[...ONLY_USERS].join(', ')}]`);
  console.log('');

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
