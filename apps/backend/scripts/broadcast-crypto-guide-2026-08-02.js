'use strict';

/**
 * Crypto guide relaunch broadcast — 2026-08-02
 *
 * Promotes the upgraded 5-step video crypto tutorial + first-hour bonus.
 * Feed post is at /social/post/10609. Users who click through, finish the
 * tutorial, and make any NowPayments crypto purchase within 1 hour get
 * +100 Santino-only tokens (on top of the 30 from completion).
 *
 * Channels (in order):
 *   1. Telegram DM — all reachable users, skips admins/banned/creator=santino
 *      and users who already completed the tutorial.
 *   2. Push notifications — sendToAll (batched internally).
 *   3. Email — top 1,000 most-recently-active real-email users, split 500/500
 *      between easybots + pnptv SMTP to stay under Hostinger daily quota.
 *
 * Idempotent via broadcast_crypto_guide_2026_08_02 log table.
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-guide-2026-08-02.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-guide-2026-08-02.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-guide-2026-08-02.js --channel=tg
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-guide-2026-08-02.js --channel=push
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-guide-2026-08-02.js --channel=email
 */

const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const https = require('https');

const DRY = process.argv.includes('--dry-run');
const CHANNEL_ARG = (process.argv.find(a => a.startsWith('--channel=')) || '').split('=')[1] || 'all';
const BOT_TOKEN = process.env.BOT_TOKEN;
const POST_ID = '10609';
const POST_URL = `https://pnptv.app/social/post/${POST_ID}`;
const TUTORIAL_URL = 'https://pnptv.app/crypto-guide';
const SANTINO_ID = '8599671840';

// ── Copy ────────────────────────────────────────────────────────────────────

const TG_TEXT = (isEs, name) => isEs
  ? `Hola ${name || 'amig@'}! 🔓

Nuevo tutorial de cripto en PNPtv! — con videos reales, en 2 min lo entiendes.

🎁 Termínalo: 30 tokens Santino gratis.
🚀 Compra crypto en la 1ª hora: +100 tokens extra (Santino).
💡 O compra 250+ tokens de una y páralo todo — tips en Live, membresías, subs.

👉 ${POST_URL}`
  : `Hey ${name || 'there'}! 🔓

New crypto tutorial on PNPtv! — real videos, you'll get it in 2 min.

🎁 Finish it: 30 free Santino tokens.
🚀 Buy crypto in the 1st hour: +100 tokens extra (Santino).
💡 Or buy 250+ tokens once and use them for everything — Live tips, memberships, subs.

👉 ${POST_URL}`;

const PUSH_ES = { title: '🔓 Cripto en PNPtv, súper fácil', body: 'Nuevo tutorial + hasta 130 tokens Santino gratis. Míralo.' };
const PUSH_EN = { title: '🔓 Crypto on PNPtv, dead simple', body: 'New tutorial + up to 130 free Santino tokens. Check it out.' };

const EMAIL_SUBJECT_ES = '🔓 Cripto en PNPtv en 2 min + hasta 130 tokens gratis';
const EMAIL_SUBJECT_EN = '🔓 Crypto on PNPtv in 2 min + up to 130 free tokens';

// first_name comes from user profile / Telegram — must be HTML-escaped before
// interpolation, otherwise a display name like `<img src=x onerror=…>` becomes
// active markup in every recipient's inbox.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const EMAIL_HTML = (rawName, isEs) => {
  const name = rawName ? escapeHtml(rawName) : null;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161616;border-radius:14px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#D4007A,#7B61FF);padding:36px 32px;text-align:center;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.14em;color:rgba(255,255,255,.85);">${isEs ? 'NUEVO EN PNPTV' : 'NEW ON PNPTV'}</div>
          <h1 style="margin:10px 0 0;color:#fff;font-size:26px;line-height:1.25;">${isEs ? 'Paga con cripto en 2 minutos' : 'Pay with crypto in 2 minutes'}</h1>
        </td></tr>

        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0 0 20px;font-size:15px;color:#e5e5e7;line-height:1.6;">${isEs
            ? `Hola ${name || 'amig@'} — hicimos un tutorial nuevo con <b style="color:#fff">videos reales</b>. Elige tu wallet, cárgala, paga en PNPtv. No hay que adivinar.`
            : `Hey ${name || 'there'} — we made a new tutorial with <b style="color:#fff">real videos</b>. Pick your wallet, load it, pay on PNPtv. No guessing.`}</p>

          <div style="background:#0d0d0d;border:1px solid #2A2A2A;border-radius:12px;padding:18px;margin:0 0 14px;">
            <div style="font-size:16px;color:#fff;font-weight:700;">🎁 ${isEs ? 'Termina el tutorial' : 'Finish the tutorial'}</div>
            <div style="font-size:13px;color:#A1A1A3;margin-top:4px;">${isEs ? '30 tokens gratis para gastar con Santino.' : '30 free tokens to spend on Santino.'}</div>
          </div>

          <div style="background:#0d0d0d;border:1px solid #2A2A2A;border-radius:12px;padding:18px;margin:0 0 14px;">
            <div style="font-size:16px;color:#fff;font-weight:700;">🚀 ${isEs ? 'Compra en la 1ª hora' : 'Buy in the 1st hour'}</div>
            <div style="font-size:13px;color:#A1A1A3;margin-top:4px;">${isEs ? '+100 tokens extra (también Santino) en cualquier compra crypto.' : '+100 extra tokens (also Santino) on any crypto purchase.'}</div>
          </div>

          <div style="background:rgba(255,180,84,.10);border-left:3px solid #FFB454;border-radius:8px;padding:14px 16px;margin:14px 0 24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#FFB454;">💡 ${isEs ? 'BONO' : 'BONUS'}</div>
            <div style="font-size:13px;color:#e5e5e7;line-height:1.6;margin-top:6px;">${isEs
              ? `¿No quieres comprar cripto seguido? Compra <b>250 tokens de una</b> y páralo todo en PNPtv — tips en Live, membresías, suscripciones a creadores. Una vez y listo.`
              : `Don't want to buy crypto often? Buy <b>250 tokens once</b> and use them for everything on PNPtv — Live tips, memberships, creator subs. One and done.`}</div>
          </div>

          <div style="text-align:center;margin:8px 0 4px;">
            <a href="${POST_URL}" style="background:linear-gradient(135deg,#D4007A,#7B61FF);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;display:inline-block;">${isEs ? 'Ver ahora →' : 'See it now →'}</a>
          </div>
          <div style="text-align:center;margin:10px 0 0;">
            <a href="${TUTORIAL_URL}" style="color:#A78BFA;font-size:12px;text-decoration:none;">${isEs ? 'o abre el tutorial directo' : 'or open the tutorial directly'}</a>
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 32px;text-align:center;color:#555;font-size:11px;">
          PNPtv! · <a href="https://pnptv.app" style="color:#D4007A;text-decoration:none;">pnptv.app</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

// ── DB & mailers ────────────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  max: 3,
});

const mailerEasybots = nodemailer.createTransport({
  host: 'smtp.hostinger.com', port: 587, secure: false,
  auth: { user: process.env.EASYBOTS_SMTP_USER, pass: process.env.EASYBOTS_SMTP_PASS },
});
const mailerPnptv = nodemailer.createTransport({
  host: 'smtp.hostinger.com', port: 587, secure: false,
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
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload); req.end();
  });
}

// ── Log table ───────────────────────────────────────────────────────────────

async function ensureLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS broadcast_crypto_guide_2026_08_02 (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}
async function alreadySent(client, userId, channel) {
  const { rows } = await client.query(
    `SELECT 1 FROM broadcast_crypto_guide_2026_08_02 WHERE user_id = $1 AND channel = $2 AND status = 'sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}
async function log(client, userId, channel, status, error) {
  await client.query(
    `INSERT INTO broadcast_crypto_guide_2026_08_02 (user_id, channel, status, error)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [String(userId), channel, status, error || null]
  );
}

// ── Targets ─────────────────────────────────────────────────────────────────

const BASE_FILTER = `
  u.deleted_at IS NULL
  AND (u.tier IS NULL OR u.tier <> 'banned')
  AND u.role NOT IN ('admin','superadmin')
  AND u.id <> '${SANTINO_ID}'
  AND (u.crypto_guide_reward_granted_at IS NULL)
`;

async function fetchTgTargets(client) {
  const { rows } = await client.query(`
    SELECT u.id, COALESCE(NULLIF(u.first_name,''), NULL) AS first_name,
           COALESCE(u.language,'en') AS lang, u.telegram
      FROM users u
     WHERE ${BASE_FILTER}
       AND u.telegram IS NOT NULL
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);
  return rows;
}
async function fetchEmailTargets(client, limit) {
  const { rows } = await client.query(`
    SELECT u.id, COALESCE(NULLIF(u.first_name,''), NULL) AS first_name,
           COALESCE(u.language,'en') AS lang, u.email
      FROM users u
     WHERE ${BASE_FILTER}
       AND u.email IS NOT NULL AND u.email <> ''
       AND u.email NOT LIKE '%@telegram.pnptv.app'
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
     LIMIT $1
  `, [limit]);
  return rows;
}

// ── Phases ──────────────────────────────────────────────────────────────────

async function phaseTg(client) {
  console.log('\n── Phase 1: Telegram DMs ──');
  const targets = await fetchTgTargets(client);
  console.log(`  ${targets.length} candidates`);
  let sent = 0, fail = 0, skip = 0;
  for (const u of targets) {
    if (await alreadySent(client, u.id, 'tg')) { skip++; continue; }
    const isEs = String(u.lang).toLowerCase().startsWith('es');
    const text = TG_TEXT(isEs, u.first_name);
    if (DRY) {
      if (sent < 3) console.log(`  DRY tg → ${u.id} (${isEs ? 'ES' : 'EN'}): ${text.slice(0, 90)}...`);
      sent++;
      continue;
    }
    const r = await tgSend(u.telegram, text);
    if (r.ok) { sent++; await log(client, u.id, 'tg', 'sent'); }
    else { fail++; await log(client, u.id, 'tg', 'failed', (r.description || r.error || 'unknown').slice(0, 500)); }
    if ((sent + fail) % 25 === 0) {
      await sleep(1000);
      console.log(`  TG progress: sent=${sent} failed=${fail} skip=${skip} / ${targets.length}`);
    }
  }
  console.log(`  ✓ TG done: sent=${sent} failed=${fail} skipped=${skip}`);
  return { sent, fail, skip, total: targets.length };
}

async function phasePush() {
  console.log('\n── Phase 2: Push notifications ──');
  if (DRY) { console.log('  DRY — would call PushNotificationService.sendToAll'); return { sent: 0 }; }
  const PushSvc = require('../services/pushNotificationService');
  const sentEs = await PushSvc.sendToAll({ title: PUSH_ES.title, body: PUSH_ES.body, url: POST_URL });
  console.log(`  ✓ Push sent to ${sentEs} subscriptions`);
  return { sent: sentEs };
}

async function phaseEmail(client) {
  console.log('\n── Phase 3: Email (batched 500 per SMTP account) ──');
  const targets = await fetchEmailTargets(client, 1200);
  console.log(`  ${targets.length} candidates (top 1200 by recent activity)`);
  let sent = 0, fail = 0, skip = 0;
  const half = Math.min(500, Math.floor(targets.length / 2));
  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    if (await alreadySent(client, u.id, 'email')) { skip++; continue; }
    if (sent >= 1000) { console.log('  Reached 1000 sent — stopping to protect quota'); break; }
    const isEs = String(u.lang).toLowerCase().startsWith('es');
    const useEasybots = sent < half;
    const mailer = useEasybots ? mailerEasybots : mailerPnptv;
    const fromAddr = useEasybots ? '"PNPtv!" <hello@easybots.store>' : '"PNPtv!" <hello@pnptv.app>';
    if (DRY) {
      if (sent < 3) console.log(`  DRY email → ${u.email} via ${useEasybots ? 'easybots' : 'pnptv'} (${isEs ? 'ES' : 'EN'})`);
      sent++;
      continue;
    }
    try {
      await mailer.sendMail({
        from: fromAddr,
        to: u.email,
        subject: isEs ? EMAIL_SUBJECT_ES : EMAIL_SUBJECT_EN,
        html: EMAIL_HTML(u.first_name, isEs),
      });
      sent++;
      await log(client, u.id, 'email', 'sent');
    } catch (e) {
      fail++;
      await log(client, u.id, 'email', 'failed', String(e.message || e).slice(0, 500));
    }
    await sleep(2000);
    if ((sent + fail) % 25 === 0) {
      console.log(`  Email progress: sent=${sent} failed=${fail} skip=${skip} / cap=1000`);
    }
  }
  console.log(`  ✓ Email done: sent=${sent} failed=${fail} skipped=${skip}`);
  return { sent, fail, skip };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Crypto guide broadcast 2026-08-02 ${DRY ? '(DRY-RUN)' : ''} channel=${CHANNEL_ARG} ===`);
  console.log(`  Feed post: ${POST_URL}`);
  console.log(`  Tutorial:  ${TUTORIAL_URL}`);
  const client = await pool.connect();
  const results = { tg: null, push: null, email: null };
  try {
    await ensureLogTable(client);
    if (CHANNEL_ARG === 'all' || CHANNEL_ARG === 'tg')    results.tg    = await phaseTg(client);
    if (CHANNEL_ARG === 'all' || CHANNEL_ARG === 'push')  results.push  = await phasePush();
    if (CHANNEL_ARG === 'all' || CHANNEL_ARG === 'email') results.email = await phaseEmail(client);
    console.log('\n=== FINAL ===');
    if (results.tg)    console.log(`  Telegram: sent=${results.tg.sent} failed=${results.tg.fail} skipped=${results.tg.skip} total=${results.tg.total}`);
    if (results.push)  console.log(`  Push:     sent=${results.push.sent}`);
    if (results.email) console.log(`  Email:    sent=${results.email.sent} failed=${results.email.fail} skipped=${results.email.skip}`);
  } finally {
    client.release();
    await pool.end();
    mailerEasybots.close();
    mailerPnptv.close();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
