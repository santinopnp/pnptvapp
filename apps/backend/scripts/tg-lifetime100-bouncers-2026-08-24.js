#!/usr/bin/env node
'use strict';

/**
 * tg-lifetime100-bouncers-2026-08-24.js
 *
 * Telegram DM version of the lifetime100 bouncer recovery (same audience
 * as dm-lifetime100-bouncers-2026-08-24, filtered to users with telegram).
 *
 * Idempotent resume log: logs/tg-lifetime100-bouncers-2026-08-24-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram } = require('telegraf');

const ENTITY_ID = 'tg-lifetime100-bouncers-2026-08-24';
const SEND_DELAY_MS = 40;
const SANTINO_IDS = new Set(['8599671840','44e7dd9e-9b99-4d2f-92d0-b119fc2e5ba6']);

const LOG_DIR = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => { try { return new Set(fsSync.readFileSync(SENT_FILE,'utf8').split('\n').filter(Boolean)); } catch { return new Set(); } };
const markSent = (tg) => { try { fsSync.appendFileSync(SENT_FILE, `${tg}\n`); } catch {} };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs = (l) => typeof l === 'string' && l.toLowerCase().startsWith('es');

const BLOCKED_RE = /blocked|deactivated|not found|chat not found|can't initiate|USER_BOT_TO_BOT_DISABLED|user is deactivated/i;

const MSG_EN = `👋 Saw you tried Lifetime PRIME ($100 one-time) — but the payment didn't complete.

We fixed a card processor issue this week AND added two new working options:

💳 Card in Colombian pesos (Mercado Pago): pnptv.app/lifetime100
🪙 Any crypto (BTC/USDT/ETH/USDC): also on that page

For MP: after paying, email your receipt to support@pnptv.app — we activate you within 2h.
For crypto: activates automatically once confirmed on chain.

Lifetime PRIME = every channel, every live room, every creator, every future drop. Yours forever, one payment, then relax.

👉 pnptv.app/lifetime100`;

const MSG_ES = `👋 Vi que intentaste PRIME de por vida ($100 una sola vez) — pero el pago no se completó.

Arreglamos un problema con el procesador de tarjetas esta semana Y añadimos dos opciones nuevas que funcionan:

💳 Tarjeta en pesos colombianos (Mercado Pago): pnptv.app/lifetime100
🪙 Cualquier cripto (BTC/USDT/ETH/USDC): también en esa página

Para MP: después de pagar, envía tu recibo a support@pnptv.app — te activamos en menos de 2h.
Para cripto: activa automáticamente al confirmar en la cadena.

PRIME de por vida = cada canal, cada sala en vivo, cada creador, cada lanzamiento futuro. Tuyo para siempre, un solo pago, y a disfrutar.

👉 pnptv.app/lifetime100`;

async function loadTargets() {
  const { rows } = await query(`
    WITH active_prime AS (
      SELECT DISTINCT user_id FROM user_entitlements
      WHERE add_on_id IN ('prime','pnp-member') AND is_consumed = false
        AND (is_lifetime = true OR expires_at > NOW())
    ),
    dso AS (
      SELECT user_id FROM dash_subscription_orders
      WHERE status = 'expired'
        AND created_at::date NOT IN ('2026-08-16','2026-08-17','2026-08-18','2026-08-19')
        AND plan_id = 'lifetime100'
      GROUP BY user_id
    )
    SELECT
      u.id AS user_id,
      u.telegram,
      LOWER(COALESCE(u.language,'en')) AS language,
      COALESCE(u.username, u.first_name, '-') AS handle
    FROM dso
    JOIN users u ON u.id = dso.user_id
    WHERE u.age_verified = true
      AND u.id NOT IN (SELECT user_id FROM active_prime)
      AND u.id NOT IN ('8599671840','44e7dd9e-9b99-4d2f-92d0-b119fc2e5ba6')
      AND u.role NOT IN ('admin','moderator')
      AND u.last_login_at > NOW() - INTERVAL '14 days'
      AND COALESCE(u.is_deleted, false) = false
      AND u.telegram IS NOT NULL AND u.telegram <> ''
    ORDER BY u.last_login_at DESC
  `);
  return rows.filter(r => !SANTINO_IDS.has(String(r.user_id)));
}

async function main() {
  if (!process.env.BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' L100 Bouncer TG DM — 2026-08-24');
  console.log('═══════════════════════════════════════════════════════════\n');

  await initializePostgres();
  const targets = await loadTargets();
  const already = loadSentSet();
  const toSend  = targets.filter(t => !already.has(String(t.telegram)));

  console.log(`   Targets: ${targets.length} · Sending: ${toSend.length}\n`);

  const tg = new Telegram(process.env.BOT_TOKEN);
  let sent = 0, blocked = 0, failed = 0;

  for (let i = 0; i < toSend.length; i++) {
    const t = toSend[i];
    const text = isEs(t.language) ? MSG_ES : MSG_EN;
    try {
      await tg.sendMessage(t.telegram, text, { disable_web_page_preview: false });
      sent++;
      markSent(t.telegram);
    } catch (err) {
      const desc = err.description || err.message || '?';
      if (BLOCKED_RE.test(desc)) { blocked++; markSent(t.telegram); }
      else { failed++; if (failed <= 5) console.warn(`   ✗ [${t.telegram}]: ${desc.slice(0,150)}`); }
    }
    await sleep(SEND_DELAY_MS);
    if ((i+1) % 100 === 0) console.log(`   progress ${i+1}/${toSend.length} (sent=${sent}, blocked=${blocked}, failed=${failed})`);
  }

  console.log(`\n── Summary ──\n   Sent:    ${sent}\n   Blocked: ${blocked}\n   Failed:  ${failed}\n`);
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
