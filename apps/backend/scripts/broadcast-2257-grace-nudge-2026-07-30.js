'use strict';

/**
 * 2257 grace-period nudge for the 15 creators whose identity_verification
 * required_by date falls on 2026-08-14 or 2026-08-15.
 *
 * Idempotent via nudge_2257_grace_2026_08_01 log table.
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-2257-grace-nudge-2026-07-30.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-2257-grace-nudge-2026-07-30.js
 */

const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const https = require('https');

const DRY = process.argv.includes('--dry-run');
const BOT_TOKEN = process.env.BOT_TOKEN;
const STUDIO_URL = 'https://pnptv.app/creators/setup';

const TG_ES = (name, deadline, isResubmit) => isResubmit
  ? `Hola ${name || 'crack'},

Tu envío de verificación 2257 fue rechazado. Vence el ${deadline} — quedan 2 días.

Reenvía con mejor foto/iluminación:
${STUDIO_URL}

Si no verificas, tu cuenta se pausa el 1 de agosto (no podrás publicar, cobrar ni recibir suscriptores).

— PNPtv!`
  : `Hola ${name || 'crack'},

⚠️ URGENTE: Tu verificación 2257 vence el ${deadline} — quedan 2 días.

Sin verificar tu identidad, tu cuenta de creator se pausa: sin publicar, sin cobrar, sin suscriptores nuevos.

Toma 3 min:
${STUDIO_URL}

— PNPtv!`;

const TG_EN = (name, deadline, isResubmit) => isResubmit
  ? `Hi ${name || 'there'},

Your 2257 verification submission was rejected. Expires ${deadline} — 2 days left.

Please resubmit with better photo/lighting:
${STUDIO_URL}

If you don't verify, your account is paused on Aug 1 (no publishing, no earnings, no new subscribers).

— PNPtv!`
  : `Hi ${name || 'there'},

⚠️ URGENT: Your 2257 verification expires ${deadline} — 2 days left.

Without it, your creator account is paused: no publishing, no earnings, no new subscribers.

Takes 3 min:
${STUDIO_URL}

— PNPtv!`;

const EMAIL_SUBJECT_ES = '⚠️ Tu verificación 2257 vence pronto — PNPtv!';
const EMAIL_SUBJECT_EN = '⚠️ Your 2257 verification expires soon — PNPtv!';

const EMAIL_HTML = (name, deadline, isEs) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:Arial,sans-serif;color:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1a1a1a;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#e91e8c,#F59E0B);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;">${isEs ? '⚠️ Verificación 2257 por vencer' : '⚠️ 2257 verification expiring'}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${isEs ? `Vence el ${deadline}` : `Deadline: ${deadline}`}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;">${isEs ? `Hola ${name || 'crack'},` : `Hi ${name || 'there'},`}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#ccc;">${isEs
            ? 'Tu verificación de identidad legal (2257 / 18 U.S.C. § 2257) vence pronto. Es un requisito legal para creators — sin ella tu cuenta se pausa automáticamente:'
            : "Your legal identity verification (2257 / 18 U.S.C. § 2257) is expiring soon. It's a legal requirement for creators — without it your account is paused automatically:"}</p>
          <ul style="margin:0 0 24px;padding:0 0 0 20px;color:#ccc;font-size:14px;line-height:1.8;">
            <li>${isEs ? 'No podrás publicar contenido' : 'You cannot publish content'}</li>
            <li>${isEs ? 'No podrás recibir suscriptores nuevos' : 'No new subscribers'}</li>
            <li>${isEs ? 'Pagos pausados hasta verificar' : 'Payouts paused until verified'}</li>
          </ul>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#ccc;">${isEs
            ? 'Toma 3 minutos: subes foto de tu ID + selfie. Aprobamos en 24-48h.'
            : 'Takes 3 minutes: upload your ID photo + selfie. We approve within 24-48h.'}</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${STUDIO_URL}" style="background:linear-gradient(135deg,#e91e8c,#F59E0B);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold;display:inline-block;">${isEs ? 'Verificar ahora →' : 'Verify now →'}</a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#888;text-align:center;">${isEs
            ? 'Si ya lo enviaste, ignora este mensaje — estamos revisando.'
            : "If you already submitted, ignore this — we're reviewing."}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;text-align:center;color:#555;font-size:12px;">
          PNPtv! · <a href="https://pnptv.app" style="color:#e91e8c;text-decoration:none;">pnptv.app</a>
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
    const payload = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true });
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

async function ensureLog(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS nudge_2257_grace_2026_08_01 (
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
           COALESCE(u.language,'en') AS lang, u.email, u.telegram,
           u.identity_verification_required_by::date AS deadline,
           r.verification_status AS rec_status
      FROM users u
      LEFT JOIN creator_2257_records r ON r.user_id = u.id::text
     WHERE u.creator_status = 'active'
       AND u.deleted_at IS NULL
       AND u.identity_verified IS DISTINCT FROM true
       AND u.identity_verification_required_by::date = '2026-08-01'
       AND (r.verification_status IS NULL OR r.verification_status = 'rejected')
     ORDER BY u.username
  `);
  return rows;
}

async function alreadySent(client, userId, channel) {
  const { rows } = await client.query(
    `SELECT 1 FROM nudge_2257_grace_2026_08_01 WHERE user_id = $1 AND channel = $2 AND status = 'sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(client, userId, channel, status, error) {
  await client.query(
    `INSERT INTO nudge_2257_grace_2026_08_01 (user_id, channel, status, error)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function main() {
  console.log(`=== 2257 grace nudge 2026-07-30 ${DRY ? '(DRY-RUN)' : ''} ===`);
  const client = await pool.connect();
  try {
    await ensureLog(client);
    const targets = await fetchTargets(client);
    console.log(`Fetched ${targets.length} targets`);

    let tgSent = 0, tgFail = 0, tgSkip = 0;
    let emSent = 0, emFail = 0, emSkip = 0;

    for (const u of targets) {
      const isEs = String(u.lang).toLowerCase().startsWith('es');
      const isResubmit = u.rec_status === 'rejected';
      const deadlineFmt = isEs
        ? new Date(u.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
        : new Date(u.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

      // TG
      if (u.telegram) {
        if (await alreadySent(client, u.id, 'tg')) { tgSkip++; }
        else {
          const text = isEs ? TG_ES(u.first_name, deadlineFmt, isResubmit) : TG_EN(u.first_name, deadlineFmt, isResubmit);
          if (DRY) {
            console.log(`  DRY tg → ${u.id} (${u.first_name || 'noname'}, ${u.lang}): ${text.split('\n')[0]}`);
            tgSent++;
          } else {
            const r = await tgSend(u.telegram, text);
            if (r.ok) { tgSent++; await log(client, u.id, 'tg', 'sent'); }
            else { tgFail++; await log(client, u.id, 'tg', 'failed', r.description || r.error || 'unknown'); }
            await sleep(300); // gentle pacing for a tiny list
          }
        }
      }

      // Email
      if (u.email && u.email.trim()) {
        if (await alreadySent(client, u.id, 'email')) { emSkip++; }
        else {
          if (DRY) {
            console.log(`  DRY email → ${u.email}: ${isEs ? EMAIL_SUBJECT_ES : EMAIL_SUBJECT_EN}`);
            emSent++;
          } else {
            try {
              await mailer.sendMail({
                from: '"PNPtv!" <hello@pnptv.app>',
                to: u.email,
                subject: isEs ? EMAIL_SUBJECT_ES : EMAIL_SUBJECT_EN,
                html: EMAIL_HTML(u.first_name, deadlineFmt, isEs),
              });
              emSent++;
              await log(client, u.id, 'email', 'sent');
            } catch (e) {
              emFail++;
              await log(client, u.id, 'email', 'failed', String(e.message || e).slice(0, 500));
            }
            await sleep(1000);
          }
        }
      }
    }

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
