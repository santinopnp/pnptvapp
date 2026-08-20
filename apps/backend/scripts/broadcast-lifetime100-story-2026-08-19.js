#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-story-2026-08-19.js
 *
 * Week-of-Aug-19 campaign — Send 1/4.
 * Angle: "Behind the $100 — why we hand-activate every account."
 * Ties to lifetime100 copy shipped in commit cc582f51 (manual activation notice).
 *
 * Channels: in-app DM (pnptv-official) + Telegram DM
 * Segment:  all non-PRIME reachable users (~5.8k TG + full in-app)
 * Idempotency: broadcast_lifetime100_week_2026_08_19 log table, channels wed_dm/wed_tg
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-story-2026-08-19.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-story-2026-08-19.js --live
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-story-2026-08-19.js --live --skip-telegram
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-story-2026-08-19.js --live --skip-dm
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram }                  = require('telegraf');

const DRY     = !process.argv.includes('--live');
const SKIP_TG = process.argv.includes('--skip-telegram');
const SKIP_DM = process.argv.includes('--skip-dm');

const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const LIFETIME_URL = `${WEBAPP_URL}/lifetime100`;
const SYSTEM_SENDER = '8552451957';

const TG_DELAY_MS = 120;
const DM_DELAY_MS = 80;
const LOG_TABLE = 'broadcast_lifetime100_week_2026_08_19';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🖤 *Detrás del $100 — te lo activamos a mano*

Sí, cada Lifetime PRIME se activa manualmente. Uno por uno. Normalmente en menos de 2 horas, máximo 24.

Esa atención personal es una de las razones por las que podemos ofrecerlo a $100 (en vez de los $250 que costará después).

✅ Un solo pago — PRIME para siempre
✅ Cada función actual y futura, incluida
✅ Tarjeta, Apple Pay, o cualquier cripto — tú eliges

👉 ${LIFETIME_URL}

Las puertas siguen abiertas. 🖤

— PNPtv`;
  }
  return `🖤 *Behind the $100 — we activate every account by hand*

Yeah — every Lifetime PRIME is activated manually. One by one. Usually within 2 hours, up to 24 max.

That hands-on onboarding is one of the reasons we can offer this at $100 (instead of the $250 it'll cost later).

✅ One payment — PRIME forever
✅ Every current and future feature included
✅ Card, Apple Pay, or any crypto — your call

👉 ${LIFETIME_URL}

Doors still open. 🖤

— PNPtv`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🖤 <b>Detrás del $100 — te activamos a mano</b>\n\n` +
      `Hola${n} — cada Lifetime PRIME lo activamos manualmente. Normalmente en menos de 2 horas.\n\n` +
      `Esa atención personal es por qué podemos ofrecerlo a $100 en vez de $250.\n\n` +
      `✅ Un pago, PRIME de por vida\n` +
      `✅ Tarjeta, Apple Pay, o cualquier cripto\n` +
      `✅ Todas las funciones incluidas — actuales y futuras\n\n` +
      `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
      `🖤`
    );
  }
  return (
    `🖤 <b>Behind the $100 — we activate every account by hand</b>\n\n` +
    `Hey${n} — every Lifetime PRIME is activated manually. Usually within 2 hours.\n\n` +
    `That hands-on onboarding is why we can offer this at $100 instead of $250.\n\n` +
    `✅ One payment, PRIME for life\n` +
    `✅ Card, Apple Pay, or any crypto\n` +
    `✅ Every feature included — present and future\n\n` +
    `👉 <a href="${LIFETIME_URL}">pnptv.app/lifetime100</a>\n\n` +
    `🖤`
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  const tg = (!DRY && !SKIP_TG && process.env.BOT_TOKEN)
    ? new Telegram(process.env.BOT_TOKEN)
    : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — /lifetime100 story broadcast (Wed 2026-08-19)');
  console.log(`  MODE    : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  SKIP_DM : ${SKIP_DM}   SKIP_TG: ${SKIP_TG}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id        AS user_id,
      u.username,
      u.first_name,
      u.telegram,
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
    ORDER BY u.id
  `);

  console.log(`  Found ${targets.length} non-PRIME user(s) to reach`);
  const withTg = targets.filter(t => t.telegram && String(t.telegram).trim());
  console.log(`  ${withTg.length} of those have telegram\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  if (DRY) {
    const sample = targets[0];
    const sampleTg = withTg[0];
    console.log('  DRY sample DM (lang=en):');
    console.log('  ────────────');
    console.log(dmText('en'));
    console.log('  ────────────');
    console.log('\n  DRY sample DM (lang=es):');
    console.log('  ────────────');
    console.log(dmText('es'));
    console.log('  ────────────');
    if (sampleTg) {
      console.log(`\n  DRY sample TG (user=${sampleTg.user_id} lang=${sampleTg.language || 'en'}):`);
      console.log('  ────────────');
      console.log(tgText(sampleTg.first_name || sampleTg.username || null, sampleTg.language || 'en'));
      console.log('  ────────────');
    }
    console.log(`\n  DRY RUN — would process ${targets.length} user(s). Re-run with --live to send.\n`);
    process.exit(0);
  }

  const stats = { dm: 0, tg: 0, tgSkipped: 0, dmSkipped: 0, failed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const { user_id, username, first_name, telegram, language } = row;
    const name = first_name || username || null;
    const lang = language || 'en';

    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} skip=${stats.dmSkipped + stats.tgSkipped} fail=${stats.failed}`);
    }

    // 1. In-app DM
    if (!SKIP_DM) {
      if (await alreadySent(user_id, 'wed_dm')) {
        stats.dmSkipped++;
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
          stats.dm++;
          await log(user_id, 'wed_dm', 'sent');
        } catch (err) {
          stats.failed++;
          await log(user_id, 'wed_dm', 'failed', (err.message || '?').slice(0, 500));
        }
        await sleep(DM_DELAY_MS);
      }
    }

    // 2. Telegram DM
    if (tg && telegram && String(telegram).trim()) {
      if (await alreadySent(user_id, 'wed_tg')) {
        stats.tgSkipped++;
      } else {
        try {
          await tg.sendMessage(telegram, tgText(name, lang), { parse_mode: 'HTML' });
          stats.tg++;
          await log(user_id, 'wed_tg', 'sent');
        } catch (err) {
          await log(user_id, 'wed_tg', 'failed', (err.description || err.message || '?').slice(0, 500));
        }
        await sleep(TG_DELAY_MS);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs sent  : ${stats.dm}`);
  console.log(`   In-app DMs skipped: ${stats.dmSkipped}`);
  console.log(`   Telegram DMs sent: ${stats.tg}`);
  console.log(`   Telegram skipped : ${stats.tgSkipped}`);
  console.log(`   In-app DM failed : ${stats.failed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
