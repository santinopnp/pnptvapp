#!/usr/bin/env node
'use strict';

/**
 * broadcast-payment-launch-day3.js
 *
 * DAY 3 of the payment-system launch drip.
 * Angle: "Membership, your way — card, crypto, or Ru$h 💎."
 * CTA:  /marketing/subscribe-pnptv.html
 *
 * Channels: payment_launch_day3_dm, payment_launch_day3_tg,
 *           payment_launch_day3_push_es, payment_launch_day3_push_en.
 * Dedup table: broadcast_payment_launch_day3.
 *
 * Fire from an isolated docker container (see day 1 header for template).
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY       = !process.argv.includes('--live');
const SKIP_TG   = process.argv.includes('--skip-telegram');
const SKIP_DM   = process.argv.includes('--skip-dm');
const SKIP_PUSH = process.argv.includes('--skip-push');

const SYSTEM_SENDER  = '8552451957';
const SUBSCRIBE_URL  = 'https://pnptv.app/marketing/subscribe-pnptv.html';
const MARKETING_URL  = 'https://pnptv.app/marketing/';
const VIDEO_URL      = 'https://pnptv.app/rush-wallet/marketing-vertical.mp4';

const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const DM_DELAY_MS = 60;
const LOG_TABLE   = 'broadcast_payment_launch_day3';
const DM_CHANNEL  = 'payment_launch_day3_dm';
const TG_CHANNEL  = 'payment_launch_day3_tg';

const SANTINO_USER_ID = '8599671840';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function dmText(lang) {
  if (isEs(lang)) {
    return `💎 Tu membresía, a tu manera.

Elige tu plan. Paga con tarjeta, cripto o Ru$h 💎. Renovación fácil, cancela cuando quieras.

Únete o renueva 👇
${SUBSCRIBE_URL}`;
  }
  return `💎 Membership, your way.

Pick your plan. Pay with card, crypto, or Ru$h 💎. Easy renewal, cancel anytime.

Join or renew 👇
${SUBSCRIBE_URL}`;
}

function tgCaption(lang) {
  if (isEs(lang)) {
    return (
      `💎 <b>Tu membresía, a tu manera.</b>\n\n` +
      `Elige tu plan. Paga con <b>tarjeta, cripto o Ru$h 💎</b>. Renovación fácil.\n\n` +
      `Únete o renueva 👇`
    );
  }
  return (
    `💎 <b>Membership, your way.</b>\n\n` +
    `Pick your plan. Pay with <b>card, crypto, or Ru$h 💎</b>. Easy renewal.\n\n` +
    `Join or renew 👇`
  );
}

const TG_BUTTONS = {
  en: [[
    { text: '💎 Join or Renew', url: SUBSCRIBE_URL },
    { text: 'See all →',        url: MARKETING_URL },
  ]],
  es: [[
    { text: '💎 Únete o Renueva', url: SUBSCRIBE_URL },
    { text: 'Ver todo →',         url: MARKETING_URL },
  ]],
};

const PUSH_COPY = {
  es: { title: '💎 Tu membresía, a tu manera', body: 'Elige tu plan · paga como quieras' },
  en: { title: '💎 Membership, your way',      body: 'Pick your plan · pay how you like' },
};

const PUSH_COMMON = { url: SUBSCRIBE_URL, icon: '/icon-192.png', tag: 'payment-launch-day3' };

async function ensureLogTable() {
  await query(`CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
    user_id text NOT NULL, channel text NOT NULL, status text NOT NULL,
    error text, sent_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel))`);
}
async function alreadySent(userId, channel) {
  const { rows } = await query(`SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND status='sent'`, [String(userId), channel]);
  return rows.length > 0;
}
async function log(userId, channel, status, error) {
  await query(`INSERT INTO ${LOG_TABLE} (user_id, channel, status, error) VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id, channel) DO UPDATE SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]);
}
async function loadDmTgTargets() {
  const { rows } = await query(`SELECT u.id AS user_id, u.username, u.first_name, u.telegram,
    LOWER(COALESCE(u.language,'en')) AS language FROM users u
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
    ORDER BY COALESCE(u.last_active, u.created_at) DESC`);
  return rows;
}
function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({ hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 },
      res => { let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } }); });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}
async function tgSend(chatId, caption, buttons) {
  const kb = { inline_keyboard: buttons };
  const vidRes = await _tgApi('sendVideo', { chat_id: chatId, video: VIDEO_URL, caption: caption.slice(0, 1024),
    parse_mode: 'HTML', supports_streaming: true, reply_markup: kb });
  if (vidRes.ok) return vidRes;
  return _tgApi('sendMessage', { chat_id: chatId, text: caption, parse_mode: 'HTML',
    disable_web_page_preview: false, reply_markup: kb });
}
async function sendPushBatch(langKey) {
  const isEsBatch = langKey === 'es';
  const copy = PUSH_COPY[langKey];
  const opts = { ...PUSH_COMMON, title: copy.title, body: copy.body };
  const channel = `payment_launch_day3_push_${langKey}`;
  const langFilter = isEsBatch ? `LOWER(COALESCE(u.language,'en')) LIKE 'es%'` : `(u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')`;
  const { rows } = await query(`SELECT DISTINCT u.id::text AS id FROM users u
    JOIN push_subscriptions ps ON ps.user_id = u.id
    WHERE COALESCE(u.is_active, true) = true AND (u.tier IS NULL OR u.tier <> 'banned') AND ${langFilter}`);
  const userIds = rows.map(r => r.id);
  console.log(`  [PUSH ${langKey.toUpperCase()}] ${userIds.length} eligible`);
  if (DRY) { console.log(`    payload:`, opts); return { attempted: userIds.length, sent: 0 }; }
  if (userIds.length === 0) return { attempted: 0, sent: 0 };
  const sent = await PushNotificationService.sendToUsers(userIds, opts);
  console.log(`  [PUSH ${langKey.toUpperCase()}] delivered ${sent}/${userIds.length}`);
  for (const uid of userIds) { try { await log(uid, channel, 'sent'); } catch {} }
  return { attempted: userIds.length, sent };
}

async function main() {
  await initializePostgres();
  if (!DRY) { await PushNotificationService.initialize(); await ensureLogTable(); }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Payment System Launch · Day 3 (Subscribe to PNPtv)');
  console.log(`  MODE  : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Hero  : ${VIDEO_URL}`);
  console.log(`  CTA   : ${SUBSCRIBE_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  const targets = await loadDmTgTargets();
  const tgEligible = targets.filter(t => t.telegram && String(t.telegram).trim());
  const includesSantino = targets.some(t => String(t.user_id) === SANTINO_USER_ID);
  console.log(`  ${targets.length} users   ${tgEligible.length} TG eligible   Santino: ${includesSantino ? 'YES' : 'NO'}\n`);
  if (DRY) {
    console.log('  DRY EN:\n  ────────────\n' + dmText('en') + '\n  ────────────');
    console.log('  DRY ES:\n  ────────────\n' + dmText('es') + '\n  ────────────');
    if (!SKIP_PUSH) { console.log('\n  ── PUSH preview ──'); await sendPushBatch('es'); await sendPushBatch('en'); }
    console.log(`\n  DRY RUN — would DM ${targets.length}, TG ${tgEligible.length}. Re-run with --live.\n`);
    process.exit(0);
  }
  const stats = { dm: 0, dmSkipped: 0, dmFailed: 0, tg: 0, tgSkipped: 0, tgFailed: 0 };
  for (let i = 0; i < targets.length; i++) {
    const { user_id, telegram, language } = targets[i];
    const lang = language || 'en';
    if ((i + 1) % 100 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmSkip=${stats.dmSkipped} tgSkip=${stats.tgSkipped} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
    }
    if (!SKIP_DM) {
      if (await alreadySent(user_id, DM_CHANNEL)) { stats.dmSkipped++; }
      else {
        try { await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query, { mediaUrl: VIDEO_URL, mediaType: 'video' });
          stats.dm++; await log(user_id, DM_CHANNEL, 'sent'); }
        catch (err) { stats.dmFailed++; await log(user_id, DM_CHANNEL, 'failed', (err.message || '?').slice(0, 500)); }
        await sleep(DM_DELAY_MS);
      }
    }
    if (!SKIP_TG && BOT_TOKEN && telegram && String(telegram).trim()) {
      if (await alreadySent(user_id, TG_CHANNEL)) { stats.tgSkipped++; }
      else {
        const buttons = isEs(lang) ? TG_BUTTONS.es : TG_BUTTONS.en;
        const r = await tgSend(telegram, tgCaption(lang), buttons);
        if (r.ok) { stats.tg++; await log(user_id, TG_CHANNEL, 'sent'); }
        else { stats.tgFailed++; await log(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500)); }
        await sleep(TG_DELAY_MS);
      }
    }
  }
  let pushEs = { attempted: 0, sent: 0 }, pushEn = { attempted: 0, sent: 0 };
  if (!SKIP_PUSH) { console.log('\n  ── PUSH ──'); pushEs = await sendPushBatch('es'); pushEn = await sendPushBatch('en'); }
  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs : sent=${stats.dm}   skipped=${stats.dmSkipped}   failed=${stats.dmFailed}`);
  console.log(`   Telegram   : sent=${stats.tg}   skipped=${stats.tgSkipped}   failed=${stats.tgFailed}`);
  console.log(`   Push ES    : ${pushEs.sent}/${pushEs.attempted}`);
  console.log(`   Push EN    : ${pushEn.sent}/${pushEn.attempted}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}
main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
