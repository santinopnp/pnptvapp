#!/usr/bin/env node
'use strict';

/**
 * broadcast-email-collect-reminder-2026-10-06.js
 *
 * 72-hour follow-up for the email-collection campaign. Audience = users who
 * received the original DM (in Redis set pnpapp:broadcast:dedup:email-collect-2026-10-03)
 * AND still have no email on file (i.e., didn't convert).
 *
 * Softer tone than round 1. Same +20 Ru$h bonus still available (attribution
 * is driven by the SAME DEDUP_KEY on the change-email backend hook, so no new
 * attribution logic needed).
 *
 * Dedup : pnpapp:broadcast:dedup:email-collect-reminder-2026-10-06 (14-day TTL)
 *
 * CLI: same flags as round 1 (--dry-run, --limit N, --skip-dm, --skip-telegram, --skip-push)
 *
 * Run in an ISOLATED container.
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

const ORIGINAL_CAMPAIGN = 'email-collect-2026-10-03';
const CAMPAIGN          = 'email-collect-reminder-2026-10-06';
const ORIGINAL_DEDUP    = `pnpapp:broadcast:dedup:${ORIGINAL_CAMPAIGN}`;
const DEDUP_KEY         = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER     = '8552451957';
const SANTINO_ID        = '8599671840';

const CTA_URL  = `https://pnptv.app/settings/account?campaign=${ORIGINAL_CAMPAIGN}`;
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

function dmText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return `💎 Tus 20 Ru$h siguen esperando

Hola${n} — los 20 Ru$h que te apartamos siguen ahí.

Un correo + 30 segundos = +20 Ru$h 💎 en tu wallet
+ enlace mágico para entrar si Telegram se cae.

👉 ${CTA_URL}`;
  }
  return `💎 Your 20 Ru$h are still on hold

Hey${n} — those 20 Ru$h we set aside are still here.

One email + 30 seconds = +20 Ru$h 💎 to your wallet
+ a magic link to get back in if Telegram ever glitches.

👉 ${CTA_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `💎 <b>Tus 20 Ru$h siguen esperando</b>\n\n` +
      `Hola${n} — los 20 Ru$h siguen apartados a tu nombre.\n\n` +
      `Un correo + 30 seg = <b>+20 Ru$h 💎</b> en tu wallet\n` +
      `+ enlace mágico de respaldo si Telegram falla.`
    );
  }
  return (
    `💎 <b>Your 20 Ru$h are still on hold</b>\n\n` +
    `Hey${n} — those 20 Ru$h are still set aside for you.\n\n` +
    `One email + 30 sec = <b>+20 Ru$h 💎</b> to your wallet\n` +
    `+ magic-link backup if Telegram ever glitches.`
  );
}

const PUSH_COPY = {
  es: { title: '💎 Tus 20 Ru$h siguen esperando', body: '30 seg para reclamarlos — Ajustes' },
  en: { title: '💎 Your 20 Ru$h are still waiting', body: '30 sec to claim them — Settings' },
};

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
    chat_id: chatId, text: caption, parse_mode: 'HTML', disable_web_page_preview: false, reply_markup: kb,
  });
}

async function sendPushBatch(langKey, userIds) {
  const copy = PUSH_COPY[langKey];
  if (DRY_RUN) {
    console.log(`  [PUSH ${langKey.toUpperCase()}] ${userIds.length} eligible`);
    console.log(`    payload:`, { title: copy.title, body: copy.body });
    return 0;
  }
  if (userIds.length === 0) return 0;
  const sent = await PushNotificationService.sendToUsers(userIds, {
    title: copy.title, body: copy.body, url: CTA_URL, icon: '/icon-192.png', tag: CAMPAIGN,
  });
  console.log(`  [PUSH ${langKey.toUpperCase()}] delivered ${sent}/${userIds.length}`);
  return sent;
}

async function main() {
  await initializePostgres();
  if (!DRY_RUN) await PushNotificationService.initialize();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` EMAIL COLLECTION REMINDER — ${CAMPAIGN}`);
  console.log(`  DM: ${!SKIP_DM} · TG: ${!SKIP_TG} · Push: ${!SKIP_PUSH}`);
  console.log(`  MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${LIMIT ? ` · LIMIT ${LIMIT}` : ''}`);
  console.log('══════════════════════════════════════════════════════\n');

  const IORedis = nm('ioredis');
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = new IORedis(redisUrl, { lazyConnect: true });
  try { await redis.connect(); } catch {}
  redis.on('error', () => {});

  // Pull everyone who was in the round 1 audience.
  const originalIds = await redis.smembers(ORIGINAL_DEDUP);
  console.log(`  Round-1 audience : ${originalIds.length}`);
  if (originalIds.length === 0) {
    console.log('  No round-1 audience in Redis — did you run the first script?\n');
    process.exit(0);
  }

  // Filter down to those who STILL have no email on file (= didn't convert).
  // Chunk IN clause to avoid parameter overflow on 7k+ ids.
  const CHUNK = 500;
  const stillNoEmail = [];
  for (let i = 0; i < originalIds.length; i += CHUNK) {
    const slice = originalIds.slice(i, i + CHUNK);
    const { rows } = await query(
      `SELECT u.id, u.username, u.first_name, u.email, u.telegram, u.language
         FROM users u
        WHERE u.id = ANY($1::text[])
          AND COALESCE(u.is_deleted, false) = false
          AND (u.email IS NULL OR u.email = '')
          AND COALESCE(u.tier, 'free') <> 'banned'`,
      [slice]
    );
    stillNoEmail.push(...rows);
  }

  // Force-include Santino for verification (he has email — add explicitly).
  const { rows: s } = await query(
    `SELECT id, username, first_name, email, telegram, language FROM users WHERE id::text=$1`,
    [SANTINO_ID]
  );
  if (s.length && !stillNoEmail.some(u => String(u.id) === SANTINO_ID)) stillNoEmail.unshift(s[0]);

  const sliced = LIMIT > 0 ? stillNoEmail.slice(0, LIMIT) : stillNoEmail;
  const withTg = sliced.filter(t => t.telegram);
  console.log(`  Still no-email       : ${stillNoEmail.length}`);
  console.log(`  Processing (this run): ${sliced.length}`);
  console.log(`  With Telegram        : ${withTg.length}\n`);

  if (DRY_RUN) {
    console.log('  Sample DM (en):\n' + dmText('there', 'en'));
    console.log('\n  Sample DM (es):\n' + dmText('amigo', 'es'));
    console.log('\n  Sample TG (en):\n' + tgCaption(null, 'en'));
    console.log('\n  Sample TG (es):\n' + tgCaption('Carlos', 'es'));
    const esIds = sliced.filter(u => isEs(u.language)).map(u => String(u.id));
    const enIds = sliced.filter(u => !isEs(u.language)).map(u => String(u.id));
    if (!SKIP_PUSH) { await sendPushBatch('es', esIds); await sendPushBatch('en', enIds); }
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

    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, dmText(name, lang), query, { mediaUrl: HERO_URL, mediaType: 'image' });
        stats.dm++;
      } catch { stats.dmF++; }
      await sleep(DM_DELAY_MS);
    }

    if (!SKIP_TG && u.telegram) {
      const btnLabel = isEs(u.language) ? 'Añadir correo · +20 Ru$h 💎' : 'Add email · +20 Ru$h 💎';
      const r = await tgSend(u.telegram, tgCaption(name, lang), btnLabel, CTA_URL);
      if (r.ok) stats.tg++; else stats.tgF++;
      await sleep(TG_DELAY_MS);
    }
  }

  await redis.expire(DEDUP_KEY, 14 * 86400);

  // Push to the still-no-email subset only (recompute by language)
  let pushSent = 0;
  if (!SKIP_PUSH) {
    console.log('\n  ── Push notifications ──');
    const esIds = stillNoEmail.filter(u => isEs(u.language)).map(u => String(u.id));
    const enIds = stillNoEmail.filter(u => !isEs(u.language)).map(u => String(u.id));
    pushSent += await sendPushBatch('es', esIds);
    pushSent += await sendPushBatch('en', enIds);
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
