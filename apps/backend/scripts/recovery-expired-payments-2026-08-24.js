#!/usr/bin/env node
'use strict';

/**
 * recovery-expired-payments-2026-08-24.js
 *
 * Recovery in-app DM to users whose payment attempts expired in the last
 * 48h without a subsequent completed payment. Highlights the newly-added
 * Mercado Pago (COP) card option on /subscribe.
 *
 * lifetime100 attempts are routed to /lifetime100 (its own MP flow).
 * Excludes Santino's two DB rows (SantinoFurioso + carlosjimenezmanrique).
 *
 * Sender: @pnptv (8552451957). Idempotent per user.
 * Log: logs/recovery-expired-payments-2026-08-24-sent.log
 */

const path   = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN   = process.argv.includes('--dry-run');
const ENTITY_ID = 'recovery-expired-payments-2026-08-24';
const PNPTV_ID  = '8552451957';

const SANTINO_IDS = new Set(['8599671840', '44e7dd9e-9b99-4d2f-92d0-b119fc2e5ba6']);

const LOG_DIR   = path.join(BACKEND, '../../logs');
const SENT_FILE = path.join(LOG_DIR, `${ENTITY_ID}-sent.log`);
try { fsSync.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const loadSentSet = () => {
  try { return new Set(fsSync.readFileSync(SENT_FILE, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
};
const markSent = (id) => { try { fsSync.appendFileSync(SENT_FILE, `${id}\n`); } catch {} };
const isEs = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

const PLAN_NAMES = {
  'member_monthly':          { en: 'BASIC Monthly',                 es: 'Plan Básico Mensual',       usd: '9.99'  },
  'prime-week-pass-7d':      { en: 'PRIME Week Pass',               es: 'PRIME Semana',              usd: '15'    },
  'monthly-pass':            { en: 'PRIME Monthly',                 es: 'PRIME Mensual',             usd: '24.99' },
  'monthly-pass-promo-15':   { en: 'PRIME Monthly Promo',           es: 'PRIME Mensual Promo',       usd: '15'    },
  'prime-diamond-pass-365d': { en: 'PRIME Diamond Annual',          es: 'PRIME Diamond Anual',       usd: '99.99' },
  'lifetime-pass':           { en: 'PRIME Lifetime',                es: 'PRIME de por vida',         usd: '250'   },
  'lifetime100':             { en: 'Lifetime Member + 2mo PRIME',   es: 'Miembro Lifetime + 2m PRIME', usd: '99.99' },
};

function messageEn(planId) {
  const isL100 = planId === 'lifetime100';
  const url    = isL100 ? 'https://pnptv.app/lifetime100' : 'https://pnptv.app/subscribe';
  const info   = PLAN_NAMES[planId];
  const planLine = info ? ` for ${info.en} ($${info.usd})` : '';
  const mpNote = isL100
    ? "There's a card option (Mercado Pago, charged in COP) on the Lifetime page — tap it and we'll activate within 2h."
    : "We just added Mercado Pago as a card option (charged in COP). Tap the 🇨🇴 button on your plan and you're in.";
  return `👋 Saw your payment${planLine} didn't complete — your card or wallet timed out.

Good news: ${mpNote}

👉 ${url}

Any trouble, email support@pnptv.app — we activate within 2h.`;
}

function messageEs(planId) {
  const isL100 = planId === 'lifetime100';
  const url    = isL100 ? 'https://pnptv.app/lifetime100' : 'https://pnptv.app/subscribe';
  const info   = PLAN_NAMES[planId];
  const planLine = info ? ` de ${info.es} ($${info.usd})` : '';
  const mpNote = isL100
    ? 'Hay una opción de tarjeta (Mercado Pago, cobrado en COP) en la página de Lifetime — tócala y activamos en menos de 2h.'
    : 'Acabamos de añadir Mercado Pago como opción con tarjeta (cobrado en COP). Toca el botón 🇨🇴 en tu plan y listo.';
  return `👋 Vi que tu pago${planLine} no se completó — tu tarjeta o wallet expiró.

Buenas noticias: ${mpNote}

👉 ${url}

Cualquier problema, escribe a support@pnptv.app — activamos en 2h.`;
}

async function loadTargets() {
  const { rows } = await query(`
    WITH leaked AS (
      SELECT user_id, plan_id, MAX(created_at) AS last_try
      FROM dash_subscription_orders
      WHERE created_at > NOW() - INTERVAL '48 hours' AND status = 'expired'
      GROUP BY 1,2
      UNION ALL
      SELECT user_id, plan_id, MAX(created_at)
      FROM checkout_intents
      WHERE created_at > NOW() - INTERVAL '48 hours' AND status = 'expired'
      GROUP BY 1,2
    ),
    completed_since AS (
      SELECT DISTINCT user_id FROM payments
      WHERE created_at > NOW() - INTERVAL '48 hours' AND status IN ('completed','confirmed')
      UNION
      SELECT DISTINCT user_id FROM dash_subscription_orders
      WHERE created_at > NOW() - INTERVAL '48 hours' AND status = 'completed'
    ),
    -- Pick the most recent attempt per user, prefer non-null plan_id
    ranked AS (
      SELECT
        user_id,
        plan_id,
        last_try,
        ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY (CASE WHEN plan_id IS NOT NULL THEN 0 ELSE 1 END), last_try DESC
        ) AS rn
      FROM leaked
    )
    SELECT
      r.user_id,
      r.plan_id,
      LOWER(COALESCE(u.language, 'en')) AS language,
      COALESCE(u.username, u.first_name, '-') AS handle
    FROM ranked r
    LEFT JOIN users u ON u.id::text = r.user_id::text
    WHERE r.rn = 1
      AND r.user_id NOT IN (SELECT user_id FROM completed_since)
      AND COALESCE(u.is_deleted, false) = false
      AND (u.role IS NULL OR u.role != 'banned')
    ORDER BY r.last_try DESC
  `);
  return rows.filter(r => !SANTINO_IDS.has(String(r.user_id)));
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Expired-Payments Recovery DM — 2026-08-24');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be sent');
  console.log('');

  await initializePostgres();

  const targets = await loadTargets();
  const already = loadSentSet();
  const toSend  = targets.filter(t => !already.has(t.user_id));

  console.log(`   Recovery targets: ${targets.length} (already sent: ${already.size}, sending: ${toSend.length})\n`);

  if (DRY_RUN) {
    for (const t of toSend.slice(0, 5)) {
      const text = isEs(t.language) ? messageEs(t.plan_id) : messageEn(t.plan_id);
      console.log(`── ${t.handle} · ${t.language} · plan=${t.plan_id || '(unknown)'} ──`);
      console.log(text);
      console.log();
    }
    console.log(`(${toSend.length} total in DRY sample)\n`);
    process.exit(0);
  }

  let sent = 0, failed = 0;
  for (const t of toSend) {
    const text = isEs(t.language) ? messageEs(t.plan_id) : messageEn(t.plan_id);
    try {
      await sendSystemDM(PNPTV_ID, t.user_id, text, query);
      sent++;
      markSent(t.user_id);
      console.log(`   ✓ ${t.handle} (${t.plan_id || 'unknown'})`);
    } catch (err) {
      failed++;
      console.warn(`   ✗ ${t.handle}: ${err.message}`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`   Sent:   ${sent}`);
  console.log(`   Failed: ${failed}\n`);
  process.exit(0);
}

if (require.main === module) main().catch(err => { console.error('Fatal:', err); process.exit(1); });
module.exports = { main };
