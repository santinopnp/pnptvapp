'use strict';

/**
 * Reactivation campaign 2026-07-30.
 * Targets users who registered but never logged in AND have a reachable channel
 * (email or telegram). Skips creators, admins, and soft-deleted users.
 *
 * Idempotent via reactivation_campaign_2026_07_30 log table — re-runs skip anyone
 * already marked 'sent'. Failed sends are retryable.
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-reactivation-2026-07-30.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-reactivation-2026-07-30.js --dry-run
 */

const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const https = require('https');

const DRY = process.argv.includes('--dry-run');
const BOT_TOKEN = process.env.BOT_TOKEN;
const LOGIN_URL = 'https://pnptv.app';

const TG_ES = (name) => `Hola ${name || 'amig@'}, notamos que te registraste en PNPtv! pero no llegaste a entrar.

Ya tenemos hangouts, canales de creadores, streaming en vivo y más. Entra en un clic:
${LOGIN_URL}

— El equipo de PNPtv!`;

const TG_EN = (name) => `Hi ${name || 'there'}, we noticed you signed up for PNPtv! but never made it in.

We've got hangouts, creator channels, live streams and more waiting. One-tap sign-in:
${LOGIN_URL}

— The PNPtv! team`;

const EMAIL_SUBJECT_ES = '¿Se te quedó pendiente? Tu cuenta PNPtv! está lista';
const EMAIL_SUBJECT_EN = 'Never made it in? Your PNPtv! account is ready';

const EMAIL_HTML = (name, isEs) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:Arial,sans-serif;color:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#e91e8c,#9c27b0);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;">PNPtv!</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">${isEs ? 'Tu cuenta está lista' : 'Your account is ready'}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;">${isEs ? `Hola ${name || 'amig@'},` : `Hi ${name || 'there'},`}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#ccc;">${isEs
            ? 'Notamos que te registraste pero nunca llegaste a entrar. Ya tenemos hangouts, canales de creadores, streaming en vivo y más esperándote.'
            : `We noticed you signed up but never made it in. We've got hangouts, creator channels, live streams and more waiting for you.`}</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${LOGIN_URL}" style="background:linear-gradient(135deg,#e91e8c,#9c27b0);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;display:inline-block;">${isEs ? 'Entrar ahora →' : 'Sign in →'}</a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;color:#888;text-align:center;">${isEs
            ? 'Usa tu email para recibir un enlace mágico — sin contraseñas.'
            : 'Sign in with your email — magic link, no password.'}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;text-align:center;color:#555;font-size:12px;">
          PNPtv! · <a href="${LOGIN_URL}" style="color:#e91e8c;text-decoration:none;">pnptv.app</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  max: 3,
});

const mailer = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 587,
  secure: false,
  auth: { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgSend(chatId, text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

async function ensureLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS reactivation_campaign_2026_07_30 (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function fetchTargets(client) {
  const { rows } = await client.query(`
    SELECT u.id, COALESCE(NULLIF(u.first_name,''), NULL) AS first_name,
           COALESCE(u.language,'en') AS lang, u.email, u.telegram
      FROM users u
     WHERE u.deleted_at IS NULL
       AND u.last_login_at IS NULL
       AND (u.email IS NOT NULL AND u.email <> '' OR u.telegram IS NOT NULL)
       AND u.role NOT IN ('admin','superadmin')
       AND u.creator_status IS DISTINCT FROM 'active'
     ORDER BY u.created_at DESC
  `);
  return rows;
}

async function alreadySent(client, userId, channel) {
  const { rows } = await client.query(
    `SELECT 1 FROM reactivation_campaign_2026_07_30 WHERE user_id = $1 AND channel = $2 AND status = 'sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(client, userId, channel, status, error) {
  await client.query(
    `INSERT INTO reactivation_campaign_2026_07_30 (user_id, channel, status, error)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function main() {
  console.log(`=== Reactivation broadcast 2026-07-30 ${DRY ? '(DRY-RUN)' : ''} ===`);
  const client = await pool.connect();
  try {
    await ensureLogTable(client);
    const targets = await fetchTargets(client);
    console.log(`Fetched ${targets.length} targets`);

    let tgSent = 0, tgFail = 0, tgSkip = 0;
    let emSent = 0, emFail = 0, emSkip = 0;

    // ── Phase 1: Telegram DMs ─────────────────────────────────────────────
    console.log('\n── Phase 1: Telegram DMs ──');
    const tgTargets = targets.filter(t => t.telegram);
    console.log(`  ${tgTargets.length} candidates with Telegram`);
    for (const u of tgTargets) {
      if (await alreadySent(client, u.id, 'tg')) { tgSkip++; continue; }
      const isEs = String(u.lang).toLowerCase().startsWith('es');
      const text = isEs ? TG_ES(u.first_name) : TG_EN(u.first_name);
      if (DRY) {
        if (tgSent < 3) console.log(`  DRY tg → ${u.id}: ${text.slice(0, 80)}...`);
        tgSent++;
        continue;
      }
      const r = await tgSend(u.telegram, text);
      if (r.ok) { tgSent++; await log(client, u.id, 'tg', 'sent'); }
      else { tgFail++; await log(client, u.id, 'tg', 'failed', r.description || r.error || 'unknown'); }
      // Rate limit: ~25/sec = well under Telegram's 30 msg/sec global cap
      if ((tgSent + tgFail) % 25 === 0) {
        await sleep(1000);
        console.log(`  TG progress: sent=${tgSent} failed=${tgFail} skip=${tgSkip} / ${tgTargets.length}`);
      }
    }
    console.log(`  ✓ TG done: sent=${tgSent} failed=${tgFail} skipped=${tgSkip}`);

    // ── Phase 2: Email ────────────────────────────────────────────────────
    console.log('\n── Phase 2: Email ──');
    const emTargets = targets.filter(t => t.email && t.email.trim());
    console.log(`  ${emTargets.length} candidates with email`);
    for (const u of emTargets) {
      if (await alreadySent(client, u.id, 'email')) { emSkip++; continue; }
      const isEs = String(u.lang).toLowerCase().startsWith('es');
      if (DRY) {
        if (emSent < 3) console.log(`  DRY email → ${u.email}: ${isEs ? EMAIL_SUBJECT_ES : EMAIL_SUBJECT_EN}`);
        emSent++;
        continue;
      }
      try {
        await mailer.sendMail({
          from: '"PNPtv!" <hello@pnptv.app>',
          to: u.email,
          subject: isEs ? EMAIL_SUBJECT_ES : EMAIL_SUBJECT_EN,
          html: EMAIL_HTML(u.first_name, isEs),
        });
        emSent++;
        await log(client, u.id, 'email', 'sent');
      } catch (e) {
        emFail++;
        await log(client, u.id, 'email', 'failed', String(e.message || e).slice(0, 500));
      }
      await sleep(2000); // 2s between — safe under Hostinger throttle
      if ((emSent + emFail) % 25 === 0) {
        console.log(`  Email progress: sent=${emSent} failed=${emFail} skip=${emSkip} / ${emTargets.length}`);
      }
    }
    console.log(`  ✓ Email done: sent=${emSent} failed=${emFail} skipped=${emSkip}`);

    console.log(`\n=== FINAL ===`);
    console.log(`  Telegram: sent=${tgSent} failed=${tgFail} skipped=${tgSkip}`);
    console.log(`  Email:    sent=${emSent} failed=${emFail} skipped=${emSkip}`);
  } finally {
    client.release();
    await pool.end();
    mailer.close();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
