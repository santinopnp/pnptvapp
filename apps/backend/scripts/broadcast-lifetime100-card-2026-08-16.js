#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-card-2026-08-16.js
 *
 * Promotes /lifetime100 (Nequi Wompi card checkout, charged in COP) to every
 * active user without an active PRIME/pnp-member entitlement.
 *
 * Companion to broadcast-banxa-btc-recovery-lifetime100.js (--all-users --dual):
 * that one pitched the BTC-via-Banxa path; this one pitches the card path.
 * Overlap with the banxa batch is intentional (option A: different payment
 * angle, multi-touch).
 *
 * Channels:  in-app DM (pnptv-official) + Telegram DM
 * Batch id:  lifetime100-card-YYYY-MM-DD[-suffix]
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lifetime100-card-2026-08-16.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lifetime100-card-2026-08-16.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lifetime100-card-2026-08-16.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lifetime100-card-2026-08-16.js --skip-dm
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lifetime100-card-2026-08-16.js --batch-suffix=v2
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram }                  = require('telegraf');

const DRY_RUN  = process.argv.includes('--dry-run');
const SKIP_TG  = process.argv.includes('--skip-telegram');
const SKIP_DM  = process.argv.includes('--skip-dm');

const suffixArg    = process.argv.find(a => a.startsWith('--batch-suffix='));
const BATCH_SUFFIX = suffixArg ? `-${suffixArg.split('=')[1]}` : '';
const BATCH_ID     = `lifetime100-card-${new Date().toISOString().slice(0, 10)}${BATCH_SUFFIX}`;

const WEBAPP_URL    = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const LIFETIME_URL  = `${WEBAPP_URL}/lifetime100`;
const SYSTEM_SENDER = '8552451957';

const TG_DELAY_MS = 120;
const DM_DELAY_MS = 80;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Message templates ─────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🔓 *Lifetime PRIME — un solo pago, tuyo para siempre*

Ahora entrar es más fácil: pago con tarjeta, PRIME de por vida.
Sin cripto, sin billetera, sin renovaciones — nunca.

✅ Un solo pago — PRIME completo para siempre
✅ Cada función que hemos lanzado, y cada una que lanzaremos
✅ Pago con tarjeta vía Nequi (Pesos Colombianos — aprox. $100 USD)

👉 ${LIFETIME_URL}

Las puertas están abiertas. Entra. 🖤

— PNPtv`;
  }
  return `🔓 *Lifetime PRIME — pay once, unlocked forever*

The easiest way in is now open: card checkout, PRIME for life.
No crypto, no wallet, no renewals — ever.

✅ One payment — full PRIME forever
✅ Every feature we've shipped, and every one we ever will
✅ Card checkout via Nequi (Colombian pesos — approx. $100 USD)

👉 ${LIFETIME_URL}

Doors open. Slide in. 🖤

— PNPtv`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🔓 <b>Lifetime PRIME — un pago, tuyo para siempre</b>\n\n` +
      `¡Hola${n}! Pago fácil con tarjeta: un solo pago y PRIME es tuyo de por vida. Sin cripto.\n\n` +
      `✅ Un pago — PRIME para siempre\n` +
      `✅ Todas las funciones, actuales + futuras\n` +
      `✅ Tarjeta vía Nequi (COP — aprox. $100 USD)\n\n` +
      `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
      `Entra. 🖤`
    );
  }
  return (
    `🔓 <b>Lifetime PRIME — pay once, unlocked forever</b>\n\n` +
    `Hi${n}! Card checkout is open: one payment, PRIME for life. No crypto needed.\n\n` +
    `✅ One payment — PRIME forever\n` +
    `✅ All features, present + future\n` +
    `✅ Card via Nequi (COP — approx. $100 USD)\n\n` +
    `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
    `Slide in. 🖤`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const tg = (!DRY_RUN && !SKIP_TG && process.env.BOT_TOKEN)
    ? new Telegram(process.env.BOT_TOKEN)
    : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — /lifetime100 card broadcast');
  console.log(`  Batch   : ${BATCH_ID}`);
  console.log(`  Target  : /lifetime100 (Nequi/Wompi COP card checkout)`);
  if (DRY_RUN) console.log('  MODE    : DRY RUN — nothing will be sent');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id        AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.email,
      u.language
    FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime', 'pnp-member')
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at > NOW())
      )
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.batch_id LIKE $1
          AND bd.user_id = u.id::text
      )
    ORDER BY u.id
  `, [BATCH_ID + '%']);

  console.log(`  Found ${targets.length} user(s) to reach\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  const stats = { dm: 0, tg: 0, tgSkipped: 0, failed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const { user_id, username, first_name, telegram, email, language } = row;
    const name = first_name || username || null;
    const lang = language || 'es';
    const realEmail = email && !email.includes('@telegram.pnptv.app') ? email : null;

    console.log(`\n[${i + 1}/${targets.length}] user=${user_id} @${username || 'anon'}`);
    console.log(`  telegram=${telegram || '-'}  email=${realEmail || '-'}  lang=${lang}`);

    if (DRY_RUN) {
      console.log(`  [DRY] Would send in-app DM${telegram ? ' + Telegram DM' : ''}`);
      continue;
    }

    // 1. Dedup log (best-effort — PRIVATE table, never write to user-facing notifications)
    try {
      await query(`
        INSERT INTO broadcast_dedup (batch_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [BATCH_ID, String(user_id)]);
    } catch (err) {
      console.warn(`  ⚠ dedup log insert failed: ${err.message}`);
    }

    // 2. In-app DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
        console.log('  ✓ in-app DM sent');
        stats.dm++;
      } catch (err) {
        console.warn(`  ✗ in-app DM failed: ${err.message}`);
        stats.failed++;
      }
      await sleep(DM_DELAY_MS);
    }

    // 3. Telegram DM
    if (tg && telegram) {
      try {
        await tg.sendMessage(telegram, tgText(name, lang), { parse_mode: 'HTML' });
        console.log(`  ✓ Telegram DM sent → ${telegram}`);
        stats.tg++;
      } catch (err) {
        console.warn(`  ✗ Telegram DM failed [${telegram}]: ${err.message}`);
      }
      await sleep(TG_DELAY_MS);
    } else if (!tg && telegram && !SKIP_TG) {
      stats.tgSkipped++;
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  if (DRY_RUN) {
    console.log(`   DRY RUN — would have processed ${targets.length} user(s)`);
  } else {
    console.log(`   In-app DMs sent  : ${stats.dm}`);
    console.log(`   Telegram DMs sent: ${stats.tg}`);
    console.log(`   Failures         : ${stats.failed}`);
  }
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
