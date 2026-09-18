#!/usr/bin/env node
'use strict';

/**
 * broadcast-calls-santino-lex-2026-09-18.js
 *
 * Combined private video call promo — Santino Furioso AND Lex.
 *   30 min → $80 USD  |  1 hour → $150 USD
 *
 * Audience : ALL non-banned, non-deleted users (calls ≠ subscription pitch,
 *            even PRIME users are valid call buyers).
 * Channels : in-app DM (hero image), Telegram (sendPhoto + CTA btn),
 *            Push (ES + EN batches), Email (HTML).
 * Dedup    : Redis set  pnpapp:broadcast:dedup:calls-santino-lex-2026-09-18
 *
 * Run in an ISOLATED container (compose restarts would kill docker exec):
 *
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp/apps/backend/scripts/broadcast-calls-santino-lex-2026-09-18.js:/app/apps/backend/scripts/broadcast-calls-santino-lex-2026-09-18.js:ro \
 *     pnptv-bot:latest \
 *     node apps/backend/scripts/broadcast-calls-santino-lex-2026-09-18.js --dry-run
 *
 *   # Live send (remove --dry-run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp/apps/backend/scripts/broadcast-calls-santino-lex-2026-09-18.js:/app/apps/backend/scripts/broadcast-calls-santino-lex-2026-09-18.js:ro \
 *     pnptv-bot:latest \
 *     node apps/backend/scripts/broadcast-calls-santino-lex-2026-09-18.js
 */

const path  = require('path');
const https = require('https');
const fs    = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/nodemailer'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN     = process.argv.includes('--dry-run');
const SKIP_DM     = process.argv.includes('--skip-dm');
const SKIP_TG     = process.argv.includes('--skip-telegram');
const SKIP_PUSH   = process.argv.includes('--skip-push');
const SKIP_EMAIL  = process.argv.includes('--skip-email');

const CAMPAIGN      = 'calls-santino-lex-2026-09-18';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const LEX_ID        = '8f5f4dd1-7bdb-4571-b026-e09d91113c91';

const URL_SANTINO = 'https://pnptv.app/profile/santinofurioso';
const URL_LEX     = `https://pnptv.app/profile/${LEX_ID}?action=book&open=1`;
const HERO_URL    = 'https://pnptv.app/uploads/creator-media/8599671840-1783409405497.webp';

const BOT_TOKEN      = process.env.BOT_TOKEN;
const TG_DELAY_MS    = 150;
const DM_DELAY_MS    = 80;
const EMAIL_DELAY_MS = 280;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `Videollamada privada 1:1 — Santino o Lex 🖤

⏱ 30 min · $80 USD
⏱ 1 hora · $150 USD

Reserva con Santino Furioso 👉 ${URL_SANTINO}
Reserva con Lex 👉 ${URL_LEX}`;
  }
  return `Private 1:1 video call — Santino or Lex 🖤

⏱ 30 min · $80 USD
⏱ 1 hour · $150 USD

Book with Santino Furioso 👉 ${URL_SANTINO}
Book with Lex 👉 ${URL_LEX}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `🔥 <b>Videollamada 1:1 — Santino Furioso o Lex</b>\n\n` +
      `Hola${n} — privado, tú y él, cámara prendida.\n\n` +
      `⏱ <b>30 min · $80</b>\n` +
      `⏱ <b>1 hora · $150</b>\n\n` +
      `<a href="${URL_SANTINO}">Reservar con Santino →</a>\n` +
      `<a href="${URL_LEX}">Reservar con Lex →</a>`
    );
  }
  return (
    `🔥 <b>Private 1:1 call — Santino Furioso or Lex</b>\n\n` +
    `Hey${n} — private, just you two, camera on.\n\n` +
    `⏱ <b>30 min · $80</b>\n` +
    `⏱ <b>1 hour · $150</b>\n\n` +
    `<a href="${URL_SANTINO}">Book with Santino →</a>\n` +
    `<a href="${URL_LEX}">Book with Lex →</a>`
  );
}

const PUSH_COPY = {
  es: { title: '🔥 Videollamada 1:1',            body: 'Santino o Lex · 30 min $80 · 1 h $150' },
  en: { title: '🔥 Private 1:1 video call',      body: 'Santino or Lex · 30 min $80 · 1 h $150' },
};

const EMAIL_SUBJECT = {
  en: '🔥 Private 1:1 call with Santino Furioso or Lex',
  es: '🔥 Videollamada 1:1 privada con Santino Furioso o Lex',
};

function buildEmail(lang, name) {
  const es   = lang === 'es';
  const h    = es ? 'Videollamada privada 1:1' : 'Private 1:1 video call';
  const sub  = es ? `Hola ${name}, reserva tu momento privado.` : `Hey ${name}, book your private moment.`;
  const line1 = es
    ? 'Cara a cara. Solo tú y él. Sin interrupciones.'
    : 'Face to face. Just you two. No interruptions.';
  const line2 = es
    ? 'Elige duración y con quién, paga con tarjeta o crypto — activa en minutos.'
    : 'Pick your time, pick who, pay with card or crypto — activates in minutes.';
  const ctaSantino = es ? 'Reservar con Santino →' : 'Book with Santino →';
  const ctaLex     = es ? 'Reservar con Lex →'     : 'Book with Lex →';

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(212,0,122,0.25);">
<tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#9b59b6);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">${sub}</p>
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#fff;line-height:1.3;">🔥 ${h}</h1>
  <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.7;">${line1}</p>
  <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.7;">${line2}</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
  <tr>
    <td style="width:48%;padding:16px;background:rgba(212,0,122,0.1);border:1px solid rgba(212,0,122,0.35);border-radius:12px;text-align:center;vertical-align:top;">
      <div style="font-size:11px;font-weight:700;color:#f472b6;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">⏱ 30 min</div>
      <div style="font-size:28px;font-weight:900;color:#fff;">$80</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">USD</div>
    </td>
    <td style="width:4%;"></td>
    <td style="width:48%;padding:16px;background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.35);border-radius:12px;text-align:center;vertical-align:top;">
      <div style="font-size:11px;font-weight:700;color:#c084fc;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">⏱ 1 ${es ? 'hora' : 'hour'}</div>
      <div style="font-size:28px;font-weight:900;color:#fff;">$150</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">USD</div>
    </td>
  </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
  <tr><td align="center">
    <a href="${URL_SANTINO}" style="display:inline-block;padding:14px 36px;background:linear-gradient(90deg,#D4007A,#9b59b6);color:#fff;font-size:15px;font-weight:900;text-decoration:none;border-radius:12px;">${ctaSantino}</a>
  </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
  <tr><td align="center">
    <a href="${URL_LEX}" style="display:inline-block;padding:14px 36px;background:rgba(155,89,182,0.2);color:#c084fc;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;border:1px solid rgba(155,89,182,0.5);">${ctaLex}</a>
  </td></tr>
  </table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;font-size:11px;color:#6b7280;">🔒 ${es ? 'Encriptado · Facturación discreta' : 'Encrypted · Discreet billing'} · pnptv.app</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── TELEGRAM HELPERS ─────────────────────────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, caption, btnLabel, btnUrl) {
  const kb = { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] };
  const photoRes = await _tgApi('sendPhoto', {
    chat_id: chatId,
    photo: HERO_URL,
    caption: caption.slice(0, 1024),
    parse_mode: 'HTML',
    reply_markup: kb,
  });
  if (photoRes.ok) return photoRes;
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: kb,
  });
}

// ─── PUSH ─────────────────────────────────────────────────────────────────────

async function sendPushBatch(langKey, IORedis) {
  const copy = PUSH_COPY[langKey];
  const isEsBatch = langKey === 'es';
  const langFilter = isEsBatch
    ? `LOWER(COALESCE(u.language,'en')) LIKE 'es%'`
    : `(u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')`;

  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_active, true) = true
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND ${langFilter}
  `);

  const userIds = rows.map(r => r.id);
  console.log(`  [PUSH ${langKey.toUpperCase()}] ${userIds.length} eligible`);

  if (DRY_RUN) {
    console.log(`    payload:`, { title: copy.title, body: copy.body });
    return 0;
  }
  if (userIds.length === 0) return 0;

  const sent = await PushNotificationService.sendToUsers(userIds, {
    title: copy.title,
    body:  copy.body,
    url:   URL_SANTINO,
    icon:  '/icon-192.png',
    tag:   CAMPAIGN,
  });
  console.log(`  [PUSH ${langKey.toUpperCase()}] delivered ${sent}/${userIds.length}`);
  return sent;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY_RUN) await PushNotificationService.initialize();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` CALLS PROMO — Santino + Lex — ${CAMPAIGN}`);
  console.log(`  DM: ${!SKIP_DM} · TG: ${!SKIP_TG} · Push: ${!SKIP_PUSH} · Email: ${!SKIP_EMAIL}`);
  console.log(`  MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════\n');

  const IORedis = nm('ioredis');
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    try { await redis.connect(); } catch {}
    redis.on('error', () => {});
  }

  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.email, u.telegram, u.language
      FROM users u
     WHERE u.deleted_at IS NULL
       AND u.id NOT IN ('8552451957','fafa6786-de29-4216-b788-4f11d703df4f')
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);

  // Force-include Santino for verification
  const hasSantino = targets.some(u => String(u.id) === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, email, telegram, language FROM users WHERE id::text=$1`,
      [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  const withTg    = targets.filter(t => t.telegram);
  const withEmail = targets.filter(t => t.email && !t.email.includes('@telegram.pnptv.app'));
  console.log(`  Targets total  : ${targets.length}`);
  console.log(`  With Telegram  : ${withTg.length}`);
  console.log(`  With email     : ${withEmail.length}\n`);

  if (DRY_RUN) {
    console.log('  Sample DM (en):'); console.log(dmText('en'));
    console.log('\n  Sample DM (es):'); console.log(dmText('es'));
    console.log('\n  Sample TG caption (en):'); console.log(tgCaption(null, 'en'));
    if (!SKIP_PUSH) { await sendPushBatch('es', IORedis); await sendPushBatch('en', IORedis); }
    console.log(`\n  DRY RUN — would process ${targets.length} users. Re-run without --dry-run.\n`);
    process.exit(0);
  }

  const nodemailer  = nm('nodemailer');
  const transporter = SKIP_EMAIL ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  const stats = { dm: 0, tg: 0, email: 0, dmF: 0, tgF: 0, emailF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const name = pickName(u);

    if (i > 0 && i % 500 === 0) {
      console.log(`  progress ${i}/${targets.length}  dm=${stats.dm} tg=${stats.tg} email=${stats.email} skip=${stats.skip}`);
    }

    const deduped = await redis.sismember(DEDUP_KEY, String(u.id));
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, String(u.id));

    // 1. In-app DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, dmText(lang), query, { mediaUrl: HERO_URL, mediaType: 'image' });
        stats.dm++;
      } catch { stats.dmF++; }
      await sleep(DM_DELAY_MS);
    }

    // 2. Telegram
    if (!SKIP_TG && u.telegram) {
      const btnLabel = isEs(u.language) ? 'Reservar llamada 🖤' : 'Book a call 🖤';
      const r = await tgSend(u.telegram, tgCaption(name, lang), btnLabel, URL_SANTINO);
      if (r.ok) stats.tg++; else stats.tgF++;
      await sleep(TG_DELAY_MS);
    }

    // 3. Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      try {
        await transporter.sendMail({
          from:    `"PNPtv!" <${process.env.PNPTV_SMTP_USER || 'support@pnptv.app'}>`,
          to:      u.email,
          subject: EMAIL_SUBJECT[lang],
          html:    buildEmail(lang, name),
        });
        stats.email++;
      } catch { stats.emailF++; }
      await sleep(EMAIL_DELAY_MS);
    }
  }

  if (redis) await redis.expire(DEDUP_KEY, 172800);

  // Push — after DM/TG/Email loop
  let pushSent = 0;
  if (!SKIP_PUSH) {
    console.log('\n  ── Push notifications ──');
    pushSent += await sendPushBatch('es', IORedis);
    pushSent += await sendPushBatch('en', IORedis);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DONE — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` In-app DMs : ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram   : ${stats.tg} sent / ${stats.tgF} failed`);
  console.log(` Email      : ${stats.email} sent / ${stats.emailF} failed`);
  console.log(` Push       : ${pushSent} delivered`);
  console.log(` Skipped    : ${stats.skip} (already sent)`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
