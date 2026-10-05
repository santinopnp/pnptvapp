#!/usr/bin/env node
'use strict';

/**
 * broadcast-email-collect-2026-10-03.js
 *
 * Email collection campaign — 7,819 users have no email on file. Nudge them
 * to add one in Settings → Account. Reward: +20 Ru$h 💎 on confirmation.
 *
 * Audience : users with (email IS NULL OR email = ''), not banned/deleted.
 * Channels : in-app DM (hero image), Telegram DM (sendPhoto + CTA btn),
 *            Web push (ES + EN batches). NO email leg — audience has none.
 * Dedup    : Redis set  pnpapp:broadcast:dedup:email-collect-2026-10-03  (14-day TTL)
 *            (used by routes.js change-email handler to attribute +20 Ru$h grant)
 * Awarded  : Redis set  pnpapp:broadcast:awarded:email-collect-2026-10-03
 *            (prevents double-grant if user changes email twice)
 *
 * CLI flags:
 *   --dry-run         Print copy + audience size, no sends.
 *   --limit N         Smoke test — process only first N users (deterministic order).
 *   --skip-dm         Skip in-app DM leg.
 *   --skip-telegram   Skip Telegram DM leg.
 *   --skip-push       Skip push notification leg.
 *
 * Run in an ISOLATED container (compose restarts would kill `docker exec`):
 *
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp/apps/backend/scripts/broadcast-email-collect-2026-10-03.js:/app/apps/backend/scripts/broadcast-email-collect-2026-10-03.js:ro \
 *     --name bc-email-collect-2026-10-03 \
 *     pnptv-bot:latest \
 *     node apps/backend/scripts/broadcast-email-collect-2026-10-03.js --dry-run
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

const DRY_RUN   = process.argv.includes('--dry-run');
const SKIP_DM   = process.argv.includes('--skip-dm');
const SKIP_TG   = process.argv.includes('--skip-telegram');
const SKIP_PUSH = process.argv.includes('--skip-push');

const limitIdx = process.argv.indexOf('--limit');
const LIMIT    = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : 0;

const CAMPAIGN      = 'email-collect-2026-10-03';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

const CTA_URL  = `https://pnptv.app/settings/account?campaign=${CAMPAIGN}`;
const HERO_URL = 'https://pnptv.app/badge-diamond.png';

const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 150;
const DM_DELAY_MS = 80;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

function dmText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return `💎 20 Ru$h GRATIS

Hola${n} — asegura tu acceso:

Añade tu correo en Ajustes y te enviamos un enlace mágico cada vez que Telegram falle o cambies de equipo.

🎁 Bonus al confirmar:
+20 Ru$h 💎 directo en tu wallet

👉 Añadir correo (30 seg)
${CTA_URL}`;
  }
  return `💎 20 Ru$h FREE

Hey${n} — lock in your access:

Add your email in Settings and we'll magic-link you in anytime Telegram glitches or you switch phones.

🎁 Bonus on confirm:
+20 Ru$h 💎 straight to your wallet

👉 Add email (30 sec)
${CTA_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `💎 <b>20 Ru$h GRATIS</b>\n\n` +
      `Hola${n} — asegura tu acceso.\n\n` +
      `Añade tu correo en Ajustes y te enviamos un <b>enlace mágico</b> cada vez que Telegram falle o cambies de equipo.\n\n` +
      `🎁 <b>Bonus al confirmar:</b>\n` +
      `+20 Ru$h 💎 directo a tu wallet\n\n` +
      `⏱ 30 segundos`
    );
  }
  return (
    `💎 <b>20 Ru$h FREE</b>\n\n` +
    `Hey${n} — lock in your access.\n\n` +
    `Add your email in Settings and we'll <b>magic-link</b> you in anytime Telegram glitches or you switch phones.\n\n` +
    `🎁 <b>Bonus on confirm:</b>\n` +
    `+20 Ru$h 💎 straight to your wallet\n\n` +
    `⏱ 30 seconds`
  );
}

const PUSH_COPY = {
  es: { title: '💎 +20 Ru$h gratis',   body: 'Añade tu correo en Ajustes — 30 seg' },
  en: { title: '💎 +20 Ru$h on us',    body: 'Add your email in Settings — 30 sec' },
};

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

async function sendPushBatch(langKey) {
  const copy = PUSH_COPY[langKey];
  const isEsBatch = langKey === 'es';
  const langFilter = isEsBatch
    ? `LOWER(COALESCE(u.language,'en')) LIKE 'es%'`
    : `(u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')`;

  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_deleted, false) = false
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND (u.email IS NULL OR u.email = '')
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
    url:   CTA_URL,
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
  console.log(` EMAIL COLLECTION — ${CAMPAIGN}`);
  console.log(`  DM: ${!SKIP_DM} · TG: ${!SKIP_TG} · Push: ${!SKIP_PUSH}`);
  console.log(`  MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${LIMIT ? ` · LIMIT ${LIMIT}` : ''}`);
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
     WHERE COALESCE(u.is_deleted, false) = false
       AND (u.email IS NULL OR u.email = '')
       AND u.id NOT IN ('8552451957','fafa6786-de29-4216-b788-4f11d703df4f')
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);

  // Force-include Santino (for CC verification per feedback_broadcast_cc_santino).
  // Santino already has an email — the audience filter would exclude him — so
  // append explicitly after the SELECT.
  const { rows: s } = await query(
    `SELECT id, username, first_name, email, telegram, language FROM users WHERE id::text=$1`,
    [SANTINO_ID]
  );
  if (s.length && !targets.some(u => String(u.id) === SANTINO_ID)) targets.unshift(s[0]);

  const sliced = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
  const withTg = sliced.filter(t => t.telegram);
  console.log(`  Total no-email users : ${targets.length}`);
  console.log(`  Processing (this run): ${sliced.length}`);
  console.log(`  With Telegram        : ${withTg.length}\n`);

  if (DRY_RUN) {
    console.log('  Sample DM (en):\n' + dmText('there', 'en'));
    console.log('\n  Sample DM (es):\n' + dmText('amigo', 'es'));
    console.log('\n  Sample TG caption (en):\n' + tgCaption(null, 'en'));
    console.log('\n  Sample TG caption (es):\n' + tgCaption('Carlos', 'es'));
    if (!SKIP_PUSH) { await sendPushBatch('es'); await sendPushBatch('en'); }
    console.log(`\n  DRY RUN — would process ${sliced.length} users.\n`);
    process.exit(0);
  }

  const stats = { dm: 0, tg: 0, dmF: 0, tgF: 0, skip: 0 };

  for (let i = 0; i < sliced.length; i++) {
    const u    = sliced[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const name = pickName(u);

    if (i > 0 && i % 500 === 0) {
      console.log(`  progress ${i}/${sliced.length}  dm=${stats.dm} tg=${stats.tg} skip=${stats.skip}`);
    }

    const deduped = await redis.sismember(DEDUP_KEY, String(u.id));
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, String(u.id));

    // 1. In-app DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, dmText(name, lang), query, { mediaUrl: HERO_URL, mediaType: 'image' });
        stats.dm++;
      } catch { stats.dmF++; }
      await sleep(DM_DELAY_MS);
    }

    // 2. Telegram
    if (!SKIP_TG && u.telegram) {
      const btnLabel = isEs(u.language) ? 'Añadir correo · +20 Ru$h 💎' : 'Add email · +20 Ru$h 💎';
      const r = await tgSend(u.telegram, tgCaption(name, lang), btnLabel, CTA_URL);
      if (r.ok) stats.tg++; else stats.tgF++;
      await sleep(TG_DELAY_MS);
    }
  }

  // Keep dedup set for 14 days — change-email handler reads it to attribute +20 Ru$h.
  if (redis) await redis.expire(DEDUP_KEY, 14 * 86400);

  // Push — after DM/TG loop
  let pushSent = 0;
  if (!SKIP_PUSH) {
    console.log('\n  ── Push notifications ──');
    pushSent += await sendPushBatch('es');
    pushSent += await sendPushBatch('en');
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DONE — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` In-app DMs : ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram   : ${stats.tg} sent / ${stats.tgF} failed`);
  console.log(` Push       : ${pushSent} delivered`);
  console.log(` Skipped    : ${stats.skip} (already in dedup set)`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
