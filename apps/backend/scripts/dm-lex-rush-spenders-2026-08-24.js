#!/usr/bin/env node
'use strict';

/**
 * dm-lex-rush-spenders-2026-08-24.js
 *
 * Personal DM from Lex (PNPLATINOBOY) to the 10 real users holding
 * purchased Ru$h that they haven't spent. Two tiers of warmth:
 *   - Whale tier (100+ Ru$h): warmer, personal-attention flavor
 *   - Standard tier: standard nudge to spend
 *
 * Excludes Santino self (8599671840) + @pnptv system (8552451957).
 *
 * Log: logs/dm-lex-rush-spenders-2026-08-24-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const LEX_ID = '8f5f4dd1-7bdb-4571-b026-e09d91113c91';
const SKIP_IDS = new Set(['8599671840', '8552451957', '44e7dd9e-9b99-4d2f-92d0-b119fc2e5ba6']);

const LOG_DIR   = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, 'dm-lex-rush-spenders-2026-08-24-sent.log');
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => { try { return new Set(fsSync.readFileSync(SENT_FILE,'utf8').split('\n').filter(Boolean)); } catch { return new Set(); } };
const markSent = (id) => { try { fsSync.appendFileSync(SENT_FILE, `${id}\n`); } catch {} };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs = (l) => typeof l === 'string' && l.toLowerCase().startsWith('es');

// Whale (>= 100 Ru$h) — extra warmth, points at private-call options
function msgWhaleEn(name, balance) {
  const n = name && name !== '-' ? ` ${name}` : '';
  return `Hey${n} — Lex here 💜

You've got **${balance} Ru$h 💎** sitting in your wallet ($${(balance/6).toFixed(2)}) and I noticed you haven't touched it. That's real money — put it to work.

Best ways to spend it right now:
🎥 Book a private 1:1 video call with any creator — https://pnptv.app/creators
🔓 Unlock exclusive content in the feed (Ru$h auto-pays on tap)
💸 Tip creators live — Main Stage at https://pnptv.app/main-stage

If you want a call with me or Santino directly, just reply here and we'll set it up.

— Lex`;
}

function msgWhaleEs(name, balance) {
  const n = name && name !== '-' ? ` ${name}` : '';
  return `Hola${n} — soy Lex 💜

Tienes **${balance} Ru$h 💎** en tu wallet ($${(balance/6).toFixed(2)}) sin usar. Eso es plata real — dale uso.

Las mejores formas de gastarlos ahora:
🎥 Reserva una videollamada 1:1 con cualquier creador — https://pnptv.app/creators
🔓 Desbloquea contenido exclusivo en el feed (Ru$h paga solo)
💸 Tipea creadores en vivo — Main Stage en https://pnptv.app/main-stage

Si quieres una llamada conmigo o con Santino directo, responde acá y la organizamos.

— Lex`;
}

// Standard (< 100 Ru$h) — shorter nudge
function msgStandardEn(name, balance) {
  const n = name && name !== '-' ? ` ${name}` : '';
  return `Hey${n} — Lex here 💜

Just noticed you have ${balance} Ru$h 💎 sitting in your wallet. It's spendable on:
🎥 Private 1:1 creator calls
🔓 Exclusive content unlocks
💸 Live tips on Main Stage

Grab something you actually want — https://pnptv.app

— Lex`;
}

function msgStandardEs(name, balance) {
  const n = name && name !== '-' ? ` ${name}` : '';
  return `Hola${n} — soy Lex 💜

Vi que tienes ${balance} Ru$h 💎 en tu wallet. Los puedes gastar en:
🎥 Videollamadas 1:1 con creators
🔓 Contenido exclusivo
💸 Tips en vivo en Main Stage

Date un gusto — https://pnptv.app

— Lex`;
}

async function loadTargets() {
  const { rows } = await query(`
    SELECT
      w.user_id,
      w.balance_tokens,
      COALESCE(u.first_name, u.username) AS name,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM user_token_wallets w
    JOIN users u ON u.id = w.user_id
    WHERE w.balance_tokens > 0
      AND COALESCE(u.is_deleted, false) = false
      AND u.role NOT IN ('admin','moderator','banned')
    ORDER BY w.balance_tokens DESC
  `);
  return rows.filter(r => !SKIP_IDS.has(String(r.user_id)));
}

async function main() {
  await initializePostgres();
  const targets = await loadTargets();
  const already = loadSentSet();
  const toSend  = targets.filter(t => !already.has(t.user_id));

  console.log(`\n Lex → Ru$h spenders: ${targets.length} targets, sending ${toSend.length}\n`);

  let sent = 0, failed = 0;
  for (const t of toSend) {
    const isWhale = t.balance_tokens >= 100;
    const es = isEs(t.language);
    const text = isWhale
      ? (es ? msgWhaleEs(t.name, t.balance_tokens) : msgWhaleEn(t.name, t.balance_tokens))
      : (es ? msgStandardEs(t.name, t.balance_tokens) : msgStandardEn(t.name, t.balance_tokens));
    try {
      await sendSystemDM(LEX_ID, t.user_id, text, query);
      sent++;
      markSent(t.user_id);
      console.log(`   ✓ ${t.name || t.user_id} (${t.balance_tokens} Ru$h${isWhale ? ' 🐋' : ''})`);
    } catch (err) {
      failed++;
      console.warn(`   ✗ ${t.name || t.user_id}: ${err.message}`);
    }
    await sleep(60);
  }

  console.log(`\n Sent: ${sent} · Failed: ${failed}\n`);
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
