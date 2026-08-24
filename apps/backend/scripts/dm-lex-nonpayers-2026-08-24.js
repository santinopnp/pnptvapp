#!/usr/bin/env node
'use strict';

/**
 * dm-lex-nonpayers-2026-08-24.js
 *
 * Warm personal DM from Lex (PNPLATINOBOY, 8f5f4dd1-7bdb-4571-b026-e09d91113c91)
 * to the small cohort of users active in the last 24h who have NEVER paid
 * anything AND aren't in the L100 bouncer cohort DM'd earlier today.
 *
 * Soft ask — try PRIME Week $15. Not a mass blast; small warm nudge from a
 * founder voice these users haven't been hit by today.
 *
 * Log: logs/dm-lex-nonpayers-2026-08-24-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const LEX_ID = '8f5f4dd1-7bdb-4571-b026-e09d91113c91';
const SANTINO_IDS = new Set(['8599671840', '44e7dd9e-9b99-4d2f-92d0-b119fc2e5ba6']);

const LOG_DIR = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, 'dm-lex-nonpayers-2026-08-24-sent.log');
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => { try { return new Set(fsSync.readFileSync(SENT_FILE,'utf8').split('\n').filter(Boolean)); } catch { return new Set(); } };
const markSent = (id) => { try { fsSync.appendFileSync(SENT_FILE, `${id}\n`); } catch {} };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs = (l) => typeof l === 'string' && l.toLowerCase().startsWith('es');

function msgEn(name) {
  const n = name && name !== '-' ? ` ${name}` : '';
  return `Hey${n} — Lex here 💜

Saw you're around today but never tried PRIME yet. Just a heads-up: PRIME Week is $15 — that's every channel, every live room, every creator, for 7 days. See if it clicks for you, no commitment.

If it does, PRIME Monthly is $15 all weekend too (40% off, ends Monday).

👉 https://pnptv.app/subscribe

We accept card, Apple Pay, crypto, or Mercado Pago if you're in Colombia. Any question, just reply.

— Lex`;
}

function msgEs(name) {
  const n = name && name !== '-' ? ` ${name}` : '';
  return `Hola${n} — soy Lex 💜

Vi que has estado por acá hoy pero aún no probaste PRIME. Un aviso: PRIME Semana cuesta $15 — eso es cada canal, cada sala en vivo, cada creador, por 7 días. Pruébalo a ver si te encaja, sin compromiso.

Si te gusta, PRIME Mensual también está a $15 todo el finde (40% off, termina el lunes).

👉 https://pnptv.app/subscribe

Aceptamos tarjeta, Apple Pay, cripto, o Mercado Pago si estás en Colombia. Cualquier duda, respóndeme.

— Lex`;
}

async function loadTargets() {
  const { rows } = await query(`
    WITH active_prime AS (
      SELECT DISTINCT user_id FROM user_entitlements
      WHERE add_on_id IN ('prime','pnp-member') AND is_consumed = false
        AND (is_lifetime = true OR expires_at > NOW())
    ),
    ever_paid AS (
      SELECT DISTINCT user_id FROM payments WHERE status IN ('completed','confirmed')
      UNION SELECT DISTINCT user_id FROM dash_subscription_orders WHERE status = 'completed'
      UNION SELECT DISTINCT user_id FROM token_purchases WHERE status IN ('completed','confirmed','paid')
    ),
    l100_bouncers AS (
      SELECT DISTINCT user_id FROM dash_subscription_orders
      WHERE status = 'expired' AND plan_id = 'lifetime100'
        AND created_at::date NOT IN ('2026-08-16','2026-08-17','2026-08-18','2026-08-19')
    )
    SELECT
      u.id AS user_id,
      COALESCE(u.first_name, u.username) AS name,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    WHERE u.age_verified = true
      AND u.last_login_at > NOW() - INTERVAL '24 hours'
      AND u.id NOT IN (SELECT user_id FROM active_prime)
      AND u.id NOT IN (SELECT user_id FROM ever_paid)
      AND u.id NOT IN (SELECT user_id FROM l100_bouncers)
      AND u.id NOT IN ('8599671840','44e7dd9e-9b99-4d2f-92d0-b119fc2e5ba6')
      AND u.role NOT IN ('admin','moderator','banned')
      AND COALESCE(u.is_deleted, false) = false
    ORDER BY u.last_login_at DESC
  `);
  return rows.filter(r => !SANTINO_IDS.has(String(r.user_id)));
}

async function main() {
  await initializePostgres();
  const targets = await loadTargets();
  const already = loadSentSet();
  const toSend  = targets.filter(t => !already.has(t.user_id));

  console.log(`\n Lex → non-payer active-24h: ${targets.length} targets, sending ${toSend.length}\n`);

  let sent = 0, failed = 0;
  for (const t of toSend) {
    const text = isEs(t.language) ? msgEs(t.name) : msgEn(t.name);
    try {
      await sendSystemDM(LEX_ID, t.user_id, text, query);
      sent++;
      markSent(t.user_id);
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
