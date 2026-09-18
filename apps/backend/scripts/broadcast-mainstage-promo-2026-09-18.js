#!/usr/bin/env node
'use strict';

/**
 * Main Stage promo blast — 2026-09-18
 * Promotes Main Stage to ALL users: Push + Telegram DM + System DM + Email.
 *
 * Usage:
 *   docker cp apps/backend/scripts/broadcast-mainstage-promo-2026-09-18.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-mainstage-promo-2026-09-18.js --dry-run
 *   docker run -d --name mainstage-promo-blast \
 *     --env-file /tmp/bot-env.txt \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-mainstage-promo-2026-09-18.js
 */

const path = require('path');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/nodemailer'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }    = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
const nodemailer   = nm('nodemailer');
const { Telegram } = nm('telegraf');
const IORedis      = nm('ioredis');

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DM       = process.argv.includes('--skip-dm');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_EMAIL    = process.argv.includes('--skip-email');
const SKIP_PUSH     = process.argv.includes('--skip-push');

const CAMPAIGN      = 'mainstage-promo-2026-09-18';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

const MAINSTAGE_URL = 'https://pnptv.app/main-stage';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// ─── COPY ────────────────────────────────────────────────────────────────────

const TG_MSG = {
  en: (name) => `
🎭 <b>Main Stage is open — come watch live</b>

Hey ${name} — PNPtv! Main Stage is where the community shows up in real time.

Watch creator live sessions, send them Ru$h 💎 as tips, and feel the energy of a room that's actually alive.

No recordings. No reruns. Just now.

👉 <a href="${MAINSTAGE_URL}">Jump into Main Stage →</a>`.trim(),

  es: (name) => `
🎭 <b>El Main Stage está abierto — ven a ver en vivo</b>

Hola ${name} — el Main Stage de PNPtv! es donde la comunidad se encuentra en tiempo real.

Mira sesiones en vivo de creators, mándales Ru$h 💎 como tips y siente la energía de una sala que está realmente viva.

Sin grabaciones. Sin reruns. Solo ahora.

👉 <a href="${MAINSTAGE_URL}">Entra al Main Stage →</a>`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — Main Stage is live right now.

Watch creator sessions in real time, tip them with Ru$h 💎, and be part of the energy.

No recordings, no replays — just the room, live.

→ ${MAINSTAGE_URL}

See you in there. — PNPtv! Team`,

  es: (name) =>
`Hola ${name} — el Main Stage está en vivo ahora mismo.

Mira sesiones de creators en tiempo real, tíralos Ru$h 💎 y siente la energía de la sala.

Sin grabaciones, sin replays — solo el momento, en vivo.

→ ${MAINSTAGE_URL}

Te vemos adentro. — Equipo PNPtv!`,
};

const EMAIL_SUBJECT = {
  en: '🎭 Main Stage is live — come watch',
  es: '🎭 El Main Stage está en vivo — entra a ver',
};

function buildEmail(lang, name) {
  const es   = lang === 'es';
  const h    = es ? 'El Main Stage está en vivo' : 'Main Stage is live right now';
  const sub  = es ? `Hola ${name}, la comunidad se está reuniendo en tiempo real.` : `Hey ${name}, the community is showing up in real time.`;
  const body = es
    ? 'El Main Stage de PNPtv! es donde los creators hacen sesiones en vivo y tú puedes acompañarlos, mandarles Ru$h 💎 como tips y sentir la energía de una sala que está realmente viva.'
    : "PNPtv! Main Stage is where creators go live and you can join them, tip them with Ru$h 💎, and feel the energy of a room that's actually alive.";
  const note = es ? 'Sin grabaciones. Sin reruns. Solo el momento.' : 'No recordings. No reruns. Just now.';
  const cta  = es ? 'Entrar al Main Stage →' : 'Jump into Main Stage →';

  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
<tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#9333ea);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">${sub}</p>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:900;color:#fff;line-height:1.3;">🎭 ${h}</h1>
  <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.7;">${body}</p>

  <!-- Feature row -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
  <tr>
    <td style="width:30%;padding:14px;background:rgba(147,51,234,0.12);border:1px solid rgba(147,51,234,0.3);border-radius:12px;text-align:center;">
      <div style="font-size:24px;margin-bottom:4px;">🎥</div>
      <div style="font-size:12px;color:#d1d5db;">${es ? 'Creators en vivo' : 'Live creators'}</div>
    </td>
    <td style="width:5%;"></td>
    <td style="width:30%;padding:14px;background:rgba(212,0,122,0.12);border:1px solid rgba(212,0,122,0.3);border-radius:12px;text-align:center;">
      <div style="font-size:24px;margin-bottom:4px;">💎</div>
      <div style="font-size:12px;color:#d1d5db;">${es ? 'Tips con Ru$h' : 'Tip with Ru$h'}</div>
    </td>
    <td style="width:5%;"></td>
    <td style="width:30%;padding:14px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:12px;text-align:center;">
      <div style="font-size:24px;margin-bottom:4px;">⚡</div>
      <div style="font-size:12px;color:#d1d5db;">${es ? 'Solo ahora' : 'Only now'}</div>
    </td>
  </tr>
  </table>

  <p style="margin:0 0 20px;font-size:13px;font-style:italic;color:#6b7280;">${note}</p>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
  <tr><td align="center">
    <a href="${MAINSTAGE_URL}" style="display:inline-block;padding:16px 48px;background:linear-gradient(90deg,#9333ea,#D4007A);color:#fff;font-size:16px;font-weight:900;text-decoration:none;border-radius:12px;">${cta}</a>
  </td></tr>
  </table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;font-size:11px;color:#6b7280;">🔒 ${es ? 'Encriptado · Facturación discreta' : 'Encrypted · Discreet billing'} · pnptv.app</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` MAIN STAGE PROMO BLAST — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  // Redis dedup
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    try { await redis.connect(); } catch {}
    redis.on('error', () => {});
  }

  // ── PUSH: fire to all subscribed users first (one batch, non-blocking) ──────
  if (!SKIP_PUSH) {
    console.log(' Sending web push to all subscribers…');
    PushNotificationService.initialize();
    const pushSent = DRY_RUN ? 0 : await PushNotificationService.sendToAll({
      title: '🎭 Main Stage is live',
      body:  'Come watch creators in real time — tip with Ru$h 💎',
      url:   '/main-stage',
      tag:   CAMPAIGN,
      icon:  '/app-icon-192.png',
    });
    console.log(DRY_RUN ? ' [PUSH] DRY RUN — skipped' : ` [PUSH] Delivered to ${pushSent} subscriptions`);
  }

  // ── TARGET: all non-deleted, non-banned users with TG or email ──────────────
  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.email, u.telegram, u.language
    FROM users u
    WHERE u.deleted_at IS NULL
      AND (u.tier IS NULL OR u.tier <> 'banned')
      AND u.id NOT IN ('8552451957','fafa6786-de29-4216-b788-4f11d703df4f')
      AND (
        u.telegram IS NOT NULL
        OR (u.email IS NOT NULL AND u.email NOT LIKE '%@telegram.pnptv.app')
      )
    ORDER BY u.created_at DESC
  `);

  // Ensure Santino gets the preview DM regardless of filters
  const hasSantino = targets.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, email, telegram, language FROM users WHERE id=$1`,
      [SANTINO_ID]
    );
    if (s.length) targets.push(s[0]);
  }

  console.log(` Targets: ${targets.length} users\n`);

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  const stats = { dm: 0, tg: 0, email: 0, dmF: 0, tgF: 0, emailF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const es   = isEs(u.language);
    const lang = es ? 'es' : 'en';
    const name = pickName(u);

    if (i % 500 === 0 && i > 0) {
      console.log(`--- Progress: ${i}/${targets.length} (TG: ${stats.tg} ✓, Email: ${stats.email} ✓) ---`);
    }

    if (DRY_RUN) {
      console.log(`[DRY ${i+1}/${targets.length}] @${u.username} (${lang}) TG:${u.telegram||'—'} Email:${u.email||'—'}`);
      if (i >= 4) { console.log('  … (showing first 5 only in dry-run)'); break; }
      continue;
    }

    // Dedup
    const deduped = await redis.sismember(DEDUP_KEY, u.id);
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, u.id);

    // System DM — direct insert bypasses NotificationEmitter/BullMQ
    if (!SKIP_DM) {
      try {
        const dmText = DM_MSG[lang](name);
        await query(
          `INSERT INTO direct_messages (sender_id, recipient_id, content)
           VALUES ($1, $2, $3)`,
          [SYSTEM_SENDER, u.id, dmText]
        );
        const [a, b] = [SYSTEM_SENDER, u.id].sort();
        const incB = SYSTEM_SENDER === a;
        await query(
          `INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at, unread_for_a, unread_for_b)
           VALUES ($1, $2, $3, NOW(), CASE WHEN $4 THEN 0 ELSE 1 END, CASE WHEN $4 THEN 1 ELSE 0 END)
           ON CONFLICT (user_a, user_b) DO UPDATE SET
             last_message    = EXCLUDED.last_message,
             last_message_at = NOW(),
             unread_for_a    = dm_threads.unread_for_a + CASE WHEN $4 THEN 0 ELSE 1 END,
             unread_for_b    = dm_threads.unread_for_b + CASE WHEN $4 THEN 1 ELSE 0 END`,
          [a, b, dmText.slice(0, 100), incB]
        );
        stats.dm++;
      } catch (e) { stats.dmF++; console.warn(`  ✗ DM @${u.username}: ${e.message}`); }
      await sleep(80);
    }

    // Telegram
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendMessage(u.telegram, TG_MSG[lang](name), {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
          reply_markup: {
            inline_keyboard: [[{
              text: es ? '🎭 Ir al Main Stage' : '🎭 Jump to Main Stage',
              url:  MAINSTAGE_URL,
            }]],
          },
        });
        stats.tg++;
      } catch (e) { stats.tgF++; }
      await sleep(200);
    }

    // Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      try {
        await transporter.sendMail({
          from:    '"PNPtv!" <noreply@pnptv.app>',
          to:      u.email,
          subject: EMAIL_SUBJECT[lang],
          html:    buildEmail(lang, name),
        });
        stats.email++;
      } catch (e) { stats.emailF++; }
      await sleep(250);
    }
  }

  if (!DRY_RUN && redis) await redis.expire(DEDUP_KEY, 172800); // 48h TTL

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` DM:       ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram: ${stats.tg} sent / ${stats.tgF} failed`);
  console.log(` Email:    ${stats.email} sent / ${stats.emailF} failed`);
  console.log(` Skipped:  ${stats.skip} (already sent)`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
