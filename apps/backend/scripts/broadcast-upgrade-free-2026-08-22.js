#!/usr/bin/env node
'use strict';

/**
 * broadcast-upgrade-free-2026-08-22.js
 *
 * Free-tier upgrade broadcast — $15 PRIME promo + $10 Basic.
 *
 * Audience:
 *   Non-PRIME, active, not-banned users (source of truth: user_entitlements).
 *   ~8,131 total → in-app DM to all, TG DM to reachable (~6,031), email (~1,684).
 *
 * Promo:
 *   New plan `monthly-pass-promo-15` — $15 for 30 days PRIME (regular $24.99).
 *   Basic (`member_monthly`) is $9.99/mo standard — no promo needed, just called out.
 *
 * Channels (independent, all idempotent, resumable):
 *   - dm    (in-app DM)   — 80ms delay,  ~11 min for 8k
 *   - tg    (Telegram)    — 150ms delay, ~15 min for 6k
 *   - email (Hostinger)   — 5s + 10s/25 pause, ~11/min → ~2.5h for 1.7k
 *
 * Log table: broadcast_upgrade_free_2026_08_22
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-upgrade-free-2026-08-22.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-upgrade-free-2026-08-22.js --live
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-upgrade-free-2026-08-22.js --live --skip-email
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-upgrade-free-2026-08-22.js --live --only=email
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM  = require(path.join(BACKEND, 'services/sendSystemDM'));
const emailService  = require(path.join(BACKEND, 'services/emailservice'));
const { Telegram }  = require('telegraf');

const DRY        = !process.argv.includes('--live');
const SKIP_DM    = process.argv.includes('--skip-dm');
const SKIP_TG    = process.argv.includes('--skip-telegram') || process.argv.includes('--skip-tg');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const ONLY_ARG   = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';
const ONLY       = ONLY_ARG ? new Set(ONLY_ARG.split(',').map(s => s.trim().toLowerCase())) : null;

function channelEnabled(ch) {
  if (ONLY) return ONLY.has(ch);
  if (ch === 'dm' && SKIP_DM) return false;
  if (ch === 'tg' && SKIP_TG) return false;
  if (ch === 'email' && SKIP_EMAIL) return false;
  return true;
}

const WEBAPP_URL    = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const PROMO_URL     = `${WEBAPP_URL}/subscribe?plan=monthly-pass-promo-15`;
const BASIC_URL     = `${WEBAPP_URL}/subscribe?plan=member_monthly`;
const SUBSCRIBE_URL = `${WEBAPP_URL}/subscribe`;

const SYSTEM_SENDER = '8552451957';
const FROM_ADDR     = 'PNPtv! <support@pnptv.app>';

const DM_DELAY_MS = 80;
const TG_DELAY_MS = 150;

const LOG_TABLE   = 'broadcast_upgrade_free_2026_08_22';
const DM_CHANNEL    = 'dm';
const TG_CHANNEL    = 'tg';
const EMAIL_CHANNEL = 'email';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — desire-first, hook → development → CTA ─────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `🔓 *Acceso completo — semana especial*

$15 = 30 días PRIME 💎 (normal $24.99)
$10/mes = Basic

Cada PNP Channel, cada show en vivo, cada perfil de creador — abierto.

✅ Tarjeta · Apple Pay · cualquier cripto
✅ Activación instantánea

👉 ${PROMO_URL}

🖤 — PNPtv`;
  }
  return `🔓 *Full access — special this week*

$15 = 30 days PRIME 💎 (usually $24.99)
$10/mo = Basic

Every PNP Channel, every live room, every creator profile — unlocked.

✅ Card · Apple Pay · any crypto
✅ Activated instantly

👉 ${PROMO_URL}

🖤 — PNPtv`;
}

function tgText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🔓 <b>Acceso completo — semana especial</b>\n\n` +
      `Hola${n} —\n\n` +
      `<b>$15 = 30 días PRIME</b> 💎 (normal $24.99)\n` +
      `<b>$10/mes = Basic</b>\n\n` +
      `Cada PNP Channel, cada show en vivo, cada creador — abierto.\n\n` +
      `Tarjeta · Apple Pay · cualquier cripto — activación instantánea.\n\n` +
      `👉 <a href="${PROMO_URL}">Entrar a PRIME por $15</a>\n` +
      `👉 <a href="${BASIC_URL}">Basic por $10/mes</a>\n\n` +
      `🖤`
    );
  }
  return (
    `🔓 <b>Full access — special this week</b>\n\n` +
    `Hey${n} —\n\n` +
    `<b>$15 = 30 days PRIME</b> 💎 (usually $24.99)\n` +
    `<b>$10/mo = Basic</b>\n\n` +
    `Every PNP Channel, every live room, every creator — unlocked.\n\n` +
    `Card · Apple Pay · any crypto — activated instantly.\n\n` +
    `👉 <a href="${PROMO_URL}">Get PRIME for $15</a>\n` +
    `👉 <a href="${BASIC_URL}">Basic for $10/mo</a>\n\n` +
    `🖤`
  );
}

function buildEmail(u) {
  const es = isEs(u.language);
  const name = u.first_name || (es ? 'hola' : 'hey');

  const subject = es
    ? `🔓 PRIME por $15 esta semana — acceso completo`
    : `🔓 PRIME for $15 this week — full access`;

  const preheader = es
    ? `$15 = 30 días PRIME. $10/mes = Basic. Tarjeta, Apple Pay o cualquier cripto.`
    : `$15 = 30 days PRIME. $10/mo = Basic. Card, Apple Pay, or any crypto.`;

  const bodyEs = `
<p>Hey ${name} 👋</p>
<p>Esta semana abrimos la puerta con precios especiales — para que veas por dentro lo que estamos construyendo.</p>

<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:20px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#FF69B4;margin-bottom:8px">💎 PRIME — $15 por 30 días</div>
  <div style="color:#ccc;margin-bottom:12px">Normal $24.99/mes. Un pago único.</div>
  <div style="color:#aaa;font-size:14px;line-height:1.7">
    ✔ Todos los PNP Channels<br/>
    ✔ Todos los shows en vivo<br/>
    ✔ Perfiles exclusivos de creadores<br/>
    ✔ Hangouts privados y feed completo
  </div>
  <p style="text-align:center;margin:20px 0 0">
    <a href="${PROMO_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Entrar a PRIME por $15 🔓</a>
  </p>
</div>

<div style="background:#0f1420;border:1px solid #4a5568;border-radius:12px;padding:20px;margin:20px 0;color:#eee">
  <div style="font-size:18px;font-weight:700;color:#9ecbff;margin-bottom:6px">✨ Basic — $10/mes</div>
  <div style="color:#aaa;font-size:14px;line-height:1.7">DMs, feed, hangouts, PNP Radio. Perfecto para arrancar.</div>
  <p style="text-align:center;margin:16px 0 0">
    <a href="${BASIC_URL}" style="display:inline-block;background:#1e293b;color:#eee;padding:10px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #334155">Basic por $10/mes</a>
  </p>
</div>

<p style="color:#aaa;font-size:13px;text-align:center;margin-top:24px">
  Pagas con tarjeta, Apple Pay o cualquier cripto — activación instantánea.
</p>
<p style="color:#888;font-size:12px;margin-top:24px">— El equipo PNPtv!</p>
`;

  const bodyEn = `
<p>Hey ${name} 👋</p>
<p>This week we're opening the door with special pricing — so you can see what we've been building from the inside.</p>

<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:20px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#FF69B4;margin-bottom:8px">💎 PRIME — $15 for 30 days</div>
  <div style="color:#ccc;margin-bottom:12px">Regular $24.99/mo. One-time payment.</div>
  <div style="color:#aaa;font-size:14px;line-height:1.7">
    ✔ Every PNP Channel<br/>
    ✔ Every live show<br/>
    ✔ Exclusive creator profiles<br/>
    ✔ Private hangouts and full feed
  </div>
  <p style="text-align:center;margin:20px 0 0">
    <a href="${PROMO_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Get PRIME for $15 🔓</a>
  </p>
</div>

<div style="background:#0f1420;border:1px solid #4a5568;border-radius:12px;padding:20px;margin:20px 0;color:#eee">
  <div style="font-size:18px;font-weight:700;color:#9ecbff;margin-bottom:6px">✨ Basic — $10/mo</div>
  <div style="color:#aaa;font-size:14px;line-height:1.7">DMs, feed, hangouts, PNP Radio. Perfect starting point.</div>
  <p style="text-align:center;margin:16px 0 0">
    <a href="${BASIC_URL}" style="display:inline-block;background:#1e293b;color:#eee;padding:10px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #334155">Basic for $10/mo</a>
  </p>
</div>

<p style="color:#aaa;font-size:13px;text-align:center;margin-top:24px">
  Pay with card, Apple Pay, or any crypto — activated instantly.
</p>
<p style="color:#888;font-size:12px;margin-top:24px">— The PNPtv! team</p>
`;

  return { subject, html: htmlShell(preheader, es ? bodyEs : bodyEn) };
}

function htmlShell(preheader, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PNPtv!</title></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#eee">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</div>
<div style="max-width:600px;margin:0 auto;padding:32px 20px;background:#0a0a14;color:#eee;line-height:1.6">
  <div style="text-align:center;margin-bottom:24px">
    <img src="https://pnptv.app/logo-final.png" alt="PNPtv!" width="80" height="80" style="border-radius:16px"/>
  </div>
  ${body}
</div>
</body></html>`;
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

// Non-PRIME, active, not-banned, not deleted.
async function loadTargets() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text          AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.email,
      LOWER(COALESCE(u.language,'en')) AS language
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
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  const tg = (!DRY && channelEnabled('tg') && process.env.BOT_TOKEN)
    ? new Telegram(process.env.BOT_TOKEN)
    : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Upgrade broadcast (2026-08-22)');
  console.log(`  MODE       : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Channels   : dm=${channelEnabled('dm')} tg=${channelEnabled('tg')} email=${channelEnabled('email')}`);
  console.log(`  Promo URL  : ${PROMO_URL}`);
  console.log(`  Basic URL  : ${BASIC_URL}`);
  console.log(`  Email FROM : ${FROM_ADDR}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets = await loadTargets();
  const tgEligible    = targets.filter(t => t.telegram && String(t.telegram).trim());
  const emailEligible = targets.filter(t => t.email && t.email.trim() && !t.email.endsWith('@telegram.pnptv.app'));

  console.log(`  ${targets.length} non-PRIME users total (in-app DM target)`);
  console.log(`  ${tgEligible.length} eligible for Telegram DM`);
  console.log(`  ${emailEligible.length} eligible for email\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  if (DRY) {
    console.log('  ── DRY sample DM (en) ────────────────────────');
    console.log(dmText('en'));
    console.log('  ── DRY sample DM (es) ────────────────────────');
    console.log(dmText('es'));
    const sampleTg = tgEligible[0];
    if (sampleTg) {
      console.log(`\n  ── DRY sample TG (user=${sampleTg.user_id} lang=${sampleTg.language}) ──`);
      console.log(tgText(sampleTg.first_name || sampleTg.username || null, sampleTg.language));
    }
    const sampleEmailEn = emailEligible.find(t => !isEs(t.language)) || emailEligible[0];
    const sampleEmailEs = emailEligible.find(t => isEs(t.language));
    if (sampleEmailEn) {
      const m = buildEmail(sampleEmailEn);
      console.log(`\n  ── DRY sample email EN (user=${sampleEmailEn.user_id}) ──`);
      console.log(`     subject : ${m.subject}`);
      console.log(`     html len: ${m.html.length}`);
    }
    if (sampleEmailEs) {
      const m = buildEmail(sampleEmailEs);
      console.log(`\n  ── DRY sample email ES (user=${sampleEmailEs.user_id}) ──`);
      console.log(`     subject : ${m.subject}`);
      console.log(`     html len: ${m.html.length}`);
    }
    console.log(`\n  DRY RUN — would DM ${targets.length}, TG ${tgEligible.length}, email ${emailEligible.length}.`);
    console.log(`  Re-run with --live (optionally --only=dm,tg or --skip-email).\n`);
    process.exit(0);
  }

  const stats = {
    dm: 0, dmSkipped: 0, dmFailed: 0,
    tg: 0, tgSkipped: 0, tgFailed: 0,
    email: 0, emailSkipped: 0, emailFailed: 0,
  };

  // Phase 1: In-app DM + Telegram (fast channels)
  if (channelEnabled('dm') || channelEnabled('tg')) {
    console.log('── Phase 1: in-app DM + Telegram ───────────────────────────────');
    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      const { user_id, username, first_name, telegram, language } = row;
      const name = first_name || username || null;
      const lang = language || 'en';

      if ((i + 1) % 200 === 0) {
        console.log(`  P1 progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmSkip=${stats.dmSkipped} tgSkip=${stats.tgSkipped} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
      }

      if (channelEnabled('dm')) {
        if (await alreadySent(user_id, DM_CHANNEL)) {
          stats.dmSkipped++;
        } else {
          try {
            await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
            stats.dm++;
            await log(user_id, DM_CHANNEL, 'sent');
          } catch (err) {
            stats.dmFailed++;
            await log(user_id, DM_CHANNEL, 'failed', (err.message || '?').slice(0, 500));
          }
          await sleep(DM_DELAY_MS);
        }
      }

      if (channelEnabled('tg') && tg && telegram && String(telegram).trim()) {
        if (await alreadySent(user_id, TG_CHANNEL)) {
          stats.tgSkipped++;
        } else {
          try {
            await tg.sendMessage(telegram, tgText(name, lang), {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            });
            stats.tg++;
            await log(user_id, TG_CHANNEL, 'sent');
          } catch (err) {
            stats.tgFailed++;
            await log(user_id, TG_CHANNEL, 'failed', (err.description || err.message || '?').slice(0, 500));
          }
          await sleep(TG_DELAY_MS);
        }
      }
    }
  }

  // Phase 2: Email (slow / throttled)
  if (channelEnabled('email')) {
    console.log('\n── Phase 2: email (Hostinger SMTP, throttled) ──────────────────');
    let processed = 0;
    for (let i = 0; i < emailEligible.length; i++) {
      const u = emailEligible[i];
      if (await alreadySent(u.user_id, EMAIL_CHANNEL)) {
        stats.emailSkipped++;
        continue;
      }
      const mail = buildEmail(u);
      try {
        const r = await emailService.send({
          to: u.email,
          from: FROM_ADDR,
          subject: mail.subject,
          html: mail.html,
        });
        if (r && r.success === true) {
          stats.email++;
          await log(u.user_id, EMAIL_CHANNEL, 'sent');
        } else {
          stats.emailFailed++;
          const err = (r && (r.error || r.mode)) || 'unknown';
          await log(u.user_id, EMAIL_CHANNEL, 'failed', String(err).slice(0, 500));
        }
      } catch (e) {
        stats.emailFailed++;
        await log(u.user_id, EMAIL_CHANNEL, 'failed', (e.message || '?').slice(0, 500));
      }

      processed++;
      // Hostinger cap ≈ 200/hr per sender. 20s + 30s pause every 25 → ~180/hr.
      await sleep(20000);
      if (processed % 25 === 0) {
        await sleep(30000);
        console.log(`  email progress: sent=${stats.email} fail=${stats.emailFailed} skip=${stats.emailSkipped} / ${emailEligible.length}`);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs   sent/skip/fail: ${stats.dm} / ${stats.dmSkipped} / ${stats.dmFailed}`);
  console.log(`   Telegram DMs sent/skip/fail: ${stats.tg} / ${stats.tgSkipped} / ${stats.tgFailed}`);
  console.log(`   Emails       sent/skip/fail: ${stats.email} / ${stats.emailSkipped} / ${stats.emailFailed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
