#!/usr/bin/env node
'use strict';

/**
 * PNP Wallet + Ru$h launch broadcast — 2026-08-09 (EMAIL)
 * Hostinger SMTP only (per feedback_broadcast_no_resend + feedback_email_send_only).
 *
 * Same two-cohort segmentation as the push+tg script:
 *   Cohort A (free-tier + ≥60 gifted 💎): personalized "usa tus 💎 para Basic"
 *   Cohort B (everyone else, active 90d): general PNP Wallet launch pitch
 *
 * Idempotent via broadcast_wallet_launch_2026_08_09 log table (shared with
 * push+tg script — channel='email' keeps rows disjoint).
 *
 * Rate limiting: SMTP burst-safe pace = 1 email / 800ms + pause every 25.
 *
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-email-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-email-2026-08-09.js --live --cohort=A
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-email-2026-08-09.js --live --cohort=B
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-email-2026-08-09.js --live --cohort=all
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const emailService = require(path.join(BACKEND, 'services/emailservice'));

const DRY = !process.argv.includes('--live');
const cohortArg = (process.argv.find(a => a.startsWith('--cohort=')) || '--cohort=all').split('=')[1];
const RUN_A = cohortArg === 'A' || cohortArg === 'all';
const RUN_B = cohortArg === 'B' || cohortArg === 'all';

const BASIC_COST_RUSH = 60;
const WALLET_URL = 'https://pnptv.app/wallet';
const SUB_URL = 'https://pnptv.app/subscribe';

// ── COPY ─────────────────────────────────────────────────────────────────────

function cohortA_email(u) {
  const isEs = u.lang.startsWith('es');
  const leftover = u.gifted - BASIC_COST_RUSH;
  const name = u.first_name || (isEs ? 'hola' : 'hey');
  const url = `${SUB_URL}?highlight=member_monthly`;

  const subject = isEs
    ? `🎁 Tienes ${u.gifted} 💎 bonus — te sirven para Basic`
    : `🎁 You have ${u.gifted} starter 💎 — they'll get you Basic`;

  const preheader = isEs
    ? `Con 60 💎 te pasas a PNP Stans Basic. Cero tarjeta.`
    : `60 💎 flips you to PNP Stans Basic. No card needed.`;

  const bodyEs = `
<p>Hey ${name} 👋</p>
<p>Ya tienes <strong>${u.gifted} 💎 Ru$h bonus</strong> esperando en tu wallet de PNPtv! — quizá no lo sabías.</p>
<p>Y aquí viene lo bueno: con <strong>60 💎</strong> te haces <strong>PNP Stans Basic</strong> (equivale a $9.99, pero tú no pagas nada — usas los 💎 que ya tienes).</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:20px;margin:24px 0;color:#eee">
  <div style="font-size:24px;font-weight:800;color:#FF69B4;margin-bottom:8px">${u.gifted} 💎 → Basic</div>
  <div style="color:#ccc">Usas 60 💎 → te quedan <strong>${leftover} 💎</strong> para tips a Santino</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${url}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">💎 Usar mis Ru$h ahora</a>
</p>
<p style="color:#aaa;font-size:13px">Basic te abre suscripciones a creators, DMs premium, y todo el catálogo PNPtv!. Los ${leftover} 💎 que sobran son tu starter kit — solo se pueden usar en tips a Santino o si recargas más adelante.</p>
<p style="color:#888;font-size:12px;margin-top:32px">— El equipo PNPtv!</p>
`;

  const bodyEn = `
<p>Hey ${name} 👋</p>
<p>You have <strong>${u.gifted} starter Ru$h 💎</strong> sitting in your PNPtv! wallet — you probably didn't know.</p>
<p>Here's the play: with <strong>60 💎</strong> you flip to <strong>PNP Stans Basic</strong> (worth $9.99, but you pay nothing — you're using the 💎 you already have).</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:20px;margin:24px 0;color:#eee">
  <div style="font-size:24px;font-weight:800;color:#FF69B4;margin-bottom:8px">${u.gifted} 💎 → Basic</div>
  <div style="color:#ccc">Spend 60 💎 → you keep <strong>${leftover} 💎</strong> for Santino tips</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${url}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">💎 Use my Ru$h now</a>
</p>
<p style="color:#aaa;font-size:13px">Basic unlocks creator subs, premium DMs, and the full PNPtv! catalog. The ${leftover} 💎 you keep are your starter kit — usable on Santino tips or if you top up later.</p>
<p style="color:#888;font-size:12px;margin-top:32px">— The PNPtv! team</p>
`;

  return { subject, html: htmlShell(preheader, isEs ? bodyEs : bodyEn) };
}

function cohortB_email(u) {
  const isEs = u.lang.startsWith('es');
  const name = u.first_name || (isEs ? 'hola' : 'hey');

  const subject = isEs
    ? `Tu PNP Wallet ya está lista 💎`
    : `Your PNP Wallet is ready 💎`;

  const preheader = isEs
    ? `Recarga con tarjeta en 30 seg y gasta Ru$h donde quieras.`
    : `Top up with card in 30 sec and spend Ru$h anywhere.`;

  const bodyEs = `
<p>Hey ${name} 👋</p>
<p>Llegó <strong>PNP Wallet</strong> — la forma más simple de tener <strong>Ru$h 💎</strong> para gastar en PNPtv!.</p>
<p><strong>¿Qué son los Ru$h 💎?</strong><br>
Es el crédito interno de la plataforma. Con ellos puedes:</p>
<ul>
  <li>Tipear a tus creators favoritos en Main Stage</li>
  <li>Agendar llamadas privadas</li>
  <li>Desbloquear contenido exclusivo</li>
  <li>Suscribirte a channels</li>
</ul>
<p><strong>¿Cómo los compras?</strong><br>
Igual que en cualquier tienda: metes tu tarjeta, eliges el paquete y listo. 30 segundos.</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:20px;margin:24px 0;color:#eee">
  <div style="font-size:14px;color:#aaa;margin-bottom:12px">1 USD = 6 Ru$h 💎</div>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:120px;background:#0a0a14;padding:12px;border-radius:8px;text-align:center">
      <div style="color:#FF69B4;font-weight:700">$50</div>
      <div style="color:#eee">315 💎</div>
    </div>
    <div style="flex:1;min-width:120px;background:#0a0a14;padding:12px;border-radius:8px;text-align:center;border:1px solid #E69138">
      <div style="color:#E69138;font-weight:700">$100 <span style="font-size:10px">POPULAR</span></div>
      <div style="color:#eee">660 💎</div>
    </div>
    <div style="flex:1;min-width:120px;background:#0a0a14;padding:12px;border-radius:8px;text-align:center">
      <div style="color:#FF69B4;font-weight:700">$500</div>
      <div style="color:#eee">3,450 💎</div>
    </div>
  </div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${WALLET_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">💳 Recargar mi wallet</a>
</p>
<p style="color:#aaa;font-size:13px">¿Prefieres cripto? También aceptamos BTC, USDT, USDC y más. Todo en la misma wallet.</p>
<p style="color:#888;font-size:12px;margin-top:32px">— El equipo PNPtv!</p>
`;

  const bodyEn = `
<p>Hey ${name} 👋</p>
<p><strong>PNP Wallet</strong> is here — the simplest way to hold <strong>Ru$h 💎</strong> for spending on PNPtv!.</p>
<p><strong>What are Ru$h 💎?</strong><br>
Your PNPtv! platform credit. Use them to:</p>
<ul>
  <li>Tip your favorite creators on Main Stage</li>
  <li>Book private calls</li>
  <li>Unlock exclusive content</li>
  <li>Subscribe to channels</li>
</ul>
<p><strong>How to buy?</strong><br>
Same as any online store: enter card, pick a pack, done. 30 seconds.</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:20px;margin:24px 0;color:#eee">
  <div style="font-size:14px;color:#aaa;margin-bottom:12px">1 USD = 6 Ru$h 💎</div>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:120px;background:#0a0a14;padding:12px;border-radius:8px;text-align:center">
      <div style="color:#FF69B4;font-weight:700">$50</div>
      <div style="color:#eee">315 💎</div>
    </div>
    <div style="flex:1;min-width:120px;background:#0a0a14;padding:12px;border-radius:8px;text-align:center;border:1px solid #E69138">
      <div style="color:#E69138;font-weight:700">$100 <span style="font-size:10px">POPULAR</span></div>
      <div style="color:#eee">660 💎</div>
    </div>
    <div style="flex:1;min-width:120px;background:#0a0a14;padding:12px;border-radius:8px;text-align:center">
      <div style="color:#FF69B4;font-weight:700">$500</div>
      <div style="color:#eee">3,450 💎</div>
    </div>
  </div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${WALLET_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">💳 Top up my wallet</a>
</p>
<p style="color:#aaa;font-size:13px">Prefer crypto? We also accept BTC, USDT, USDC and more. Same wallet.</p>
<p style="color:#888;font-size:12px;margin-top:32px">— The PNPtv! team</p>
`;

  return { subject, html: htmlShell(preheader, isEs ? bodyEs : bodyEn) };
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

// ── PLUMBING ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcast_wallet_launch_2026_08_09 (
      user_id text NOT NULL,
      channel text NOT NULL,
      cohort  text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM broadcast_wallet_launch_2026_08_09 WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(userId, channel, cohort, status, error) {
  await query(
    `INSERT INTO broadcast_wallet_launch_2026_08_09 (user_id, channel, cohort, status, error)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, cohort, status, error || null]
  );
}

// ── COHORTS ──────────────────────────────────────────────────────────────────

async function loadCohortA() {
  const { rows } = await query(`
    SELECT u.id::text AS id,
           u.email,
           u.first_name,
           LOWER(COALESCE(u.language,'en')) AS lang,
           w.gifted_balance::int AS gifted
      FROM users u
      JOIN user_token_wallets w ON w.user_id = u.id
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier = 'free')
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND u.email IS NOT NULL AND u.email <> ''
       AND w.gifted_balance >= $1
     ORDER BY w.gifted_balance DESC
  `, [BASIC_COST_RUSH]);
  return rows;
}

async function loadCohortB(excludeIds) {
  const { rows } = await query(`
    SELECT u.id::text AS id,
           u.email,
           u.first_name,
           LOWER(COALESCE(u.language,'en')) AS lang
      FROM users u
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND u.email IS NOT NULL AND u.email <> ''
       AND (u.last_active > NOW() - INTERVAL '90 days'
            OR u.created_at > NOW() - INTERVAL '90 days')
       AND ($1::text[] IS NULL OR NOT (u.id::text = ANY($1)))
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `, [excludeIds && excludeIds.length ? excludeIds : null]);
  return rows;
}

async function sendOne(u, cohort, mail) {
  if (DRY) return { success: true, mode: 'dry' };
  try {
    const r = await emailService.send({ to: u.email, subject: mail.subject, html: mail.html });
    return { success: r.success !== false, error: r.error || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function runCohort(name, users, builder) {
  console.log(`\n  [EMAIL ${name}] ${users.length} candidates`);
  if (DRY && users[0]) {
    const sample = builder(users[0]);
    console.log(`  [EMAIL ${name}] DRY sample user=${users[0].id} lang=${users[0].lang}`);
    console.log(`    subject: ${sample.subject}`);
    console.log(`    html length: ${sample.html.length}`);
    return;
  }
  let sent = 0, fail = 0, skip = 0;
  for (const u of users) {
    if (await alreadySent(u.id, 'email')) { skip++; continue; }
    const mail = builder(u);
    const r = await sendOne(u, name, mail);
    if (r.success) { sent++; await log(u.id, 'email', name, 'sent'); }
    else { fail++; await log(u.id, 'email', name, 'failed', (r.error || '?').slice(0, 500)); }
    await sleep(800);
    if ((sent + fail) % 25 === 0) {
      await sleep(2000);
      console.log(`  [EMAIL ${name}] progress: sent=${sent} fail=${fail} skip=${skip} / ${users.length}`);
    }
  }
  console.log(`  [EMAIL ${name}] final: sent=${sent} fail=${fail} skip=${skip}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== broadcast-wallet-launch-email-2026-08-09 (${DRY ? 'DRY-RUN' : 'LIVE'}) ===`);
  console.log(`Cohorts: A=${RUN_A} B=${RUN_B}`);
  if (!DRY) await ensureLogTable();

  if (RUN_A) {
    const aUsers = await loadCohortA();
    await runCohort('A', aUsers, cohortA_email);
  }
  if (RUN_B) {
    const aUsers = RUN_A ? await loadCohortA() : [];
    const aIds = aUsers.map(u => u.id);
    const bUsers = await loadCohortB(aIds);
    await runCohort('B', bUsers, cohortB_email);
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
