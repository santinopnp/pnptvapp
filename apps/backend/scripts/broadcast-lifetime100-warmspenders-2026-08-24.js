#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-warmspenders-2026-08-24.js
 *
 * Week-of-Aug-19 campaign — Send 4/4 (Sunday closer).
 * Channels: in-app DM (pnptv-official) + Telegram DM
 * Segment:  Warm spenders — users with any completed prior payment, currently non-PRIME (~104, ~78 with TG)
 * Angle:    Personal "you already know the value". No hard sell.
 * Idempotency: broadcast_lifetime100_week_2026_08_19 log table, channels sun_dm/sun_tg
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-warmspenders-2026-08-24.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-warmspenders-2026-08-24.js --live
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram }                  = require('telegraf');

const DRY = !process.argv.includes('--live');

const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const LIFETIME_URL = `${WEBAPP_URL}/lifetime100`;
const SYSTEM_SENDER = '8552451957';

const TG_DELAY_MS = 200;
const DM_DELAY_MS = 120;
const LOG_TABLE = 'broadcast_lifetime100_week_2026_08_19';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — warm & personal, not salesy ───────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🖤 *Tú ya sabes cómo funciona*

Ya probaste PNPtv! — sabes qué hay dentro, sabes lo que estamos construyendo.

Este fin de semana la puerta de Lifetime PRIME sigue abierta a $100. Un pago. Para siempre. Sin renovaciones, sin decisiones nuevas.

No hay urgencia — solo un recordatorio, por si el momento es ahora.

👉 ${LIFETIME_URL}

Y gracias por seguir por acá. 🖤

— PNPtv`;
  }
  return `🖤 *You already know how this works*

You've been inside PNPtv! before — you know what's there, you know what we're building.

The Lifetime PRIME door is still open this weekend at $100. One payment. Forever. No renewals, no future decisions.

No rush — just a note, in case now's the moment.

👉 ${LIFETIME_URL}

And thanks for being around. 🖤

— PNPtv`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🖤 <b>Tú ya sabes cómo funciona</b>\n\n` +
      `Hola${n} — ya probaste PNPtv!, así que este es directo:\n\n` +
      `Lifetime PRIME sigue abierto a $100 este fin de semana. Un pago, para siempre. Sin renovaciones.\n\n` +
      `Por si es el momento 👇\n\n` +
      `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
      `Gracias por seguir por acá. 🖤`
    );
  }
  return (
    `🖤 <b>You already know how this works</b>\n\n` +
    `Hey${n} — you've been inside before, so this is straight:\n\n` +
    `Lifetime PRIME is still open at $100 this weekend. One payment, forever. No renewals.\n\n` +
    `In case now's the moment 👇\n\n` +
    `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
    `Thanks for being around. 🖤`
  );
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function loadWarmSpenders() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id        AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.language
    FROM users u
    JOIN payments p ON p.user_id::text = u.id::text
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND p.status IN ('completed','confirmed','captured','succeeded','paid')
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime', 'pnp-member')
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at > NOW())
      )
    ORDER BY u.id
  `);
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  const tg = (!DRY && process.env.BOT_TOKEN) ? new Telegram(process.env.BOT_TOKEN) : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — /lifetime100 warm-spenders closer (Sun 2026-08-24)');
  console.log(`  MODE : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets = await loadWarmSpenders();
  const withTg = targets.filter(t => t.telegram && String(t.telegram).trim());

  console.log(`  ${targets.length} warm spenders currently non-PRIME`);
  console.log(`  ${withTg.length} with telegram\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  if (DRY) {
    console.log('  DRY sample DM (lang=en):');
    console.log('  ────────────');
    console.log(dmText('en'));
    console.log('  ────────────');
    console.log('\n  DRY sample DM (lang=es):');
    console.log('  ────────────');
    console.log(dmText('es'));
    console.log('  ────────────');
    if (withTg[0]) {
      console.log(`\n  DRY sample TG:`);
      console.log('  ────────────');
      console.log(tgText(withTg[0].first_name || withTg[0].username || null, withTg[0].language || 'en'));
      console.log('  ────────────');
    }
    console.log(`\n  DRY RUN — would process ${targets.length} user(s). Re-run with --live.\n`);
    process.exit(0);
  }

  const stats = { dm: 0, tg: 0, dmSkipped: 0, tgSkipped: 0, failed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const { user_id, username, first_name, telegram, language } = row;
    const name = first_name || username || null;
    const lang = language || 'en';

    // In-app DM
    if (await alreadySent(user_id, 'sun_dm')) {
      stats.dmSkipped++;
    } else {
      try {
        await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
        stats.dm++;
        await log(user_id, 'sun_dm', 'sent');
      } catch (err) {
        stats.failed++;
        await log(user_id, 'sun_dm', 'failed', (err.message || '?').slice(0, 500));
      }
      await sleep(DM_DELAY_MS);
    }

    // Telegram DM
    if (tg && telegram && String(telegram).trim()) {
      if (await alreadySent(user_id, 'sun_tg')) {
        stats.tgSkipped++;
      } else {
        try {
          await tg.sendMessage(telegram, tgText(name, lang), { parse_mode: 'HTML' });
          stats.tg++;
          await log(user_id, 'sun_tg', 'sent');
        } catch (err) {
          await log(user_id, 'sun_tg', 'failed', (err.description || err.message || '?').slice(0, 500));
        }
        await sleep(TG_DELAY_MS);
      }
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs sent   : ${stats.dm}`);
  console.log(`   In-app DMs skipped: ${stats.dmSkipped}`);
  console.log(`   Telegram DMs sent : ${stats.tg}`);
  console.log(`   Telegram skipped  : ${stats.tgSkipped}`);
  console.log(`   In-app DM failed  : ${stats.failed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
