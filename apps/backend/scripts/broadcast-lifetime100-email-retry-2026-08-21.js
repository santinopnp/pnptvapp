#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-email-retry-2026-08-21.js
 *
 * Week-of-Aug-19 campaign — Fri email RETRY.
 * Root cause of Thu 100% failure: `support@pnptv.app` was disabled in Hostinger
 * hPanel; every 554 auto-suppressed the recipient. hPanel toggled back on
 * 2026-08-21; the 2,113 smtp-554 false-positive suppressions were cleared.
 *
 * This retry:
 *   - FROM pinned to PNPtv! <support@pnptv.app> (matches SMTP auth user)
 *   - Targets non-PRIME users whose thu_email row is NOT status='sent'
 *   - New channel key: fri_email_retry (does not conflict with thu_email)
 *   - Fri closer copy — weekend is here, doors still open.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-email-retry-2026-08-21.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-email-retry-2026-08-21.js --live
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const emailService = require(path.join(BACKEND, 'services/emailservice'));

const DRY = !process.argv.includes('--live');
const LOG_TABLE = 'broadcast_lifetime100_week_2026_08_19';
const CHANNEL = 'fri_email_retry';

const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const LIFETIME_URL = `${WEBAPP_URL}/lifetime100`;
const SUBSCRIBE_URL = `${WEBAPP_URL}/subscribe`;

// Pin FROM to the currently-working mailbox (matches PNPTV_SMTP_USER)
const FROM_ADDR = 'PNPtv! <support@pnptv.app>';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function buildEmail(u) {
  const es = isEs(u.language);
  const name = u.first_name || (es ? 'hola' : 'hey');

  const subject = es
    ? `El fin de semana ya está aquí — Lifetime PRIME por $100 🖤`
    : `The weekend is here — Lifetime PRIME for $100 🖤`;

  const preheader = es
    ? `Un pago. PRIME para siempre. Tarjeta, Apple Pay o cualquier cripto.`
    : `One payment. PRIME forever. Card, Apple Pay, or any crypto.`;

  const bodyEs = `
<p>Hey ${name} 👋</p>
<p>Ya es viernes — y la puerta de Lifetime sigue abierta.</p>
<p><strong>Lifetime PRIME · $100 · un solo pago.</strong> Todas las funciones actuales, todas las que vamos a lanzar, para siempre.</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:24px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#FF69B4;margin-bottom:8px">🔓 Un pago — PRIME para siempre</div>
  <div style="color:#ccc;margin-bottom:8px">Tarjeta · Apple Pay · Nequi · cualquier cripto</div>
  <div style="color:#aaa;font-size:13px">Activación manual en menos de 2h (máx 24h) — así de personal es.</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${LIFETIME_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">🖤 Entrar por $100 de por vida</a>
</p>
<hr style="border:none;border-top:1px solid #2a1a30;margin:32px 0"/>
<p style="color:#aaa;font-size:13px">¿Prefieres empezar mes a mes? <a href="${SUBSCRIBE_URL}" style="color:#FF69B4">PRIME mensual</a> también está disponible.</p>
<p style="color:#888;font-size:12px;margin-top:24px">— El equipo PNPtv!</p>
`;

  const bodyEn = `
<p>Hey ${name} 👋</p>
<p>It's Friday — and the Lifetime door is still open.</p>
<p><strong>Lifetime PRIME · $100 · one payment.</strong> Every current feature, every one we ship next, forever.</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:24px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#FF69B4;margin-bottom:8px">🔓 One payment — PRIME forever</div>
  <div style="color:#ccc;margin-bottom:8px">Card · Apple Pay · Nequi · any crypto</div>
  <div style="color:#aaa;font-size:13px">Manually activated within 2h (24h max) — that's how personal it is.</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${LIFETIME_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">🖤 Get in for $100 · lifetime</a>
</p>
<hr style="border:none;border-top:1px solid #2a1a30;margin:32px 0"/>
<p style="color:#aaa;font-size:13px">Prefer to start month to month? <a href="${SUBSCRIBE_URL}" style="color:#FF69B4">PRIME monthly</a> is also open.</p>
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — /lifetime100 email RETRY (Fri 2026-08-21)');
  console.log(`  MODE : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  FROM : ${FROM_ADDR}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Target: non-PRIME users with reachable email whose Thu send did NOT succeed.
  // Include users with NO thu_email row (in case audience grew) OR status<>'sent'.
  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text AS user_id,
      u.email,
      u.first_name,
      u.username,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    LEFT JOIN ${LOG_TABLE} thu
      ON thu.user_id = u.id::text AND thu.channel = 'thu_email'
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND u.email IS NOT NULL
      AND u.email <> ''
      AND u.email NOT LIKE '%@telegram.pnptv.app'
      AND (thu.status IS NULL OR thu.status <> 'sent')
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime', 'pnp-member')
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at > NOW())
      )
    ORDER BY u.id
  `);

  console.log(`  ${targets.length} user(s) with reachable email, Thu not sent\n`);

  if (targets.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  if (DRY) {
    const sampleEn = targets.find(t => !t.language.startsWith('es')) || targets[0];
    const sampleEs = targets.find(t => t.language.startsWith('es'));
    const en = buildEmail(sampleEn);
    console.log(`  DRY sample EN (user=${sampleEn.user_id}):`);
    console.log(`    subject: ${en.subject}`);
    console.log(`    html: ${en.html.length} chars`);
    if (sampleEs) {
      const es = buildEmail(sampleEs);
      console.log(`\n  DRY sample ES (user=${sampleEs.user_id}):`);
      console.log(`    subject: ${es.subject}`);
      console.log(`    html: ${es.html.length} chars`);
    }
    console.log(`\n  DRY RUN — would send to ${targets.length} email(s). Re-run with --live.\n`);
    process.exit(0);
  }

  let sent = 0, fail = 0, skip = 0;
  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    if (await alreadySent(u.user_id, CHANNEL)) { skip++; continue; }

    const mail = buildEmail(u);
    try {
      const r = await emailService.send({
        to: u.email,
        from: FROM_ADDR,
        subject: mail.subject,
        html: mail.html,
      });
      if (r && r.success === true) {
        sent++;
        await log(u.user_id, CHANNEL, 'sent');
      } else {
        fail++;
        const err = (r && (r.error || r.mode)) || 'unknown';
        await log(u.user_id, CHANNEL, 'failed', String(err).slice(0, 500));
      }
    } catch (e) {
      fail++;
      await log(u.user_id, CHANNEL, 'failed', (e.message || '?').slice(0, 500));
    }

    await sleep(800);
    if ((sent + fail) % 25 === 0) {
      await sleep(2000);
      console.log(`  progress: sent=${sent} fail=${fail} skip=${skip} / ${targets.length}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   Emails sent    : ${sent}`);
  console.log(`   Emails skipped : ${skip}`);
  console.log(`   Emails failed  : ${fail}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
