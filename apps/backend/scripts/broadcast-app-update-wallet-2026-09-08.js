#!/usr/bin/env node
'use strict';

/**
 * broadcast-app-update-wallet-2026-09-08.js
 *
 * Personal message from Santino to ALL users:
 *   - Apology for past app issues
 *   - Big bug-fix wave shipped
 *   - PNPtv! Wallet highlight
 *   - Upgraded payment platform (scammer protection)
 *   - New T&C: only in-app purchases are covered
 *
 * Channels: Telegram DM + web push
 * Sender voice: Santino (personal, founder)
 * Languages: EN + ES (all others default to EN)
 *
 * Usage:
 *   docker run --rm ... node /app/apps/backend/scripts/broadcast-app-update-wallet-2026-09-08.js
 *   Add --live to actually send. Default is dry run.
 *   Add --skip-telegram or --skip-push to skip a channel.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY       = !process.argv.includes('--live');
const SKIP_TG   = process.argv.includes('--skip-telegram');
const SKIP_PUSH = process.argv.includes('--skip-push');

const CTA_URL     = 'https://pnptv.app';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const LOG_TABLE   = 'broadcast_app_update_wallet_2026_09_08';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    pushTitle: 'Big update — PNPtv! is better than ever 🔥',
    pushBody:  'Bug fixes, wallet upgrades, and your purchases are now protected.',
    btn:       'Open PNPtv!',
    msg: (n) => {
      const hi = n && n.length > 1 ? `Hey ${n}` : 'Hey';
      return `${hi} — Santino here 👋

I want to be straight with you: the app had real issues these past weeks, and if that frustrated you, I get it. I'm sorry. You stuck with us anyway, and we didn't take that lightly.

So we went heads-down and fixed it.

<b>What just landed:</b>
🔧 A massive wave of bug fixes across the entire platform
💎 The PNPtv! Wallet — rebuilt and fully live. Manage your funds, spend Ru$h 💎, pay for memberships, private calls, and exclusive content all in one tap
🛡️ A completely upgraded payment system built to block scammers and protect every transaction you make with us

<b>Your purchases are now protected — here's what that means.</b>
We've updated our Terms &amp; Conditions: every purchase made through the PNPtv! Wallet or in-app checkout is tracked and backed by us.

For your protection, please always pay through the PNPtv! app. Payments made outside our platform — through external links, third parties, or anyone claiming to represent PNPtv — cannot be credited or refunded. If it's not in your PNPtv! transaction history, we have no way to cover it. When in doubt, only trust what's inside the app.

Come see what's new. The platform is ready for you.

— Santino`;
    },
  },

  es: {
    pushTitle: 'Gran actualización — PNPtv! mejor que nunca 🔥',
    pushBody:  'Corrección de bugs, mejoras en la billetera y tus compras ahora están protegidas.',
    btn:       'Abrir PNPtv!',
    msg: (n) => {
      const hi = n && n.length > 1 ? `Hola ${n}` : 'Hola';
      return `${hi} — soy Santino 👋

Quiero ser directo contigo: la app tuvo problemas reales estas últimas semanas y si eso te frustró, lo entiendo. Lo siento. Te quedaste con nosotros de todas formas, y no lo tomamos a la ligera.

Así que nos pusimos a trabajar y lo arreglamos.

<b>Lo que acaba de llegar:</b>
🔧 Una gran oleada de correcciones en toda la plataforma
💎 La Billetera PNPtv! — reconstruida y completamente activa. Administrá tus fondos, gastá Ru$h 💎, pagá membresías, llamadas privadas y contenido exclusivo con un solo toque
🛡️ Un sistema de pagos completamente mejorado, diseñado para bloquear estafadores y proteger cada transacción que hagas con nosotros

<b>Tus compras ahora están protegidas — esto es lo que significa.</b>
Actualizamos nuestros Términos &amp; Condiciones: cada compra hecha a través de la Billetera PNPtv! o el pago dentro de la app queda registrada y respaldada por nosotros.

Para tu protección, siempre pagá a través de la app de PNPtv. Los pagos realizados fuera de nuestra plataforma — a través de enlaces externos, terceros, o cualquier persona que diga representar a PNPtv — no pueden ser acreditados ni reembolsados. Si no está en tu historial de transacciones de PNPtv!, no tenemos forma de cubrirlo. Ante cualquier duda, solo confiá en lo que está dentro de la app.

Vení a ver lo nuevo. La plataforma está lista para vos.

— Santino`;
    },
  },
};

function resolveLang(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v.startsWith('es')) return 'es';
  return 'en';
}

const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildTgMessage(firstName, username, langKey) {
  const c    = COPY[langKey] || COPY.en;
  const raw  = (firstName || username || '').trim();
  const name = raw ? escapeHtml(raw).slice(0, 64) : '';
  return c.msg(name);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

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
    [String(userId), channel]);
  return rows.length > 0;
}

async function logSend(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]);
}

async function loadTelegramTargets() {
  const { rows } = await query(`
    SELECT u.id::text AS user_id, u.username, u.first_name, u.telegram, u.language, u.tier
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier,'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) <> ''
     ORDER BY u.last_active DESC NULLS LAST`);
  return rows;
}

async function loadPushTargets(excludedIds) {
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id, u.language
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier,'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')`);
  return rows.filter((r) => !excludedIds.has(r.id));
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, text, btnLabel, btnUrl) {
  return _tgApi('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] },
  });
}

// ── Push ──────────────────────────────────────────────────────────────────────

async function sendPush(targets) {
  const byLang = new Map();
  for (const r of targets) {
    const k = resolveLang(r.language);
    if (!byLang.has(k)) byLang.set(k, []);
    byLang.get(k).push(r.id);
  }

  let sent = 0;
  for (const [langKey, ids] of byLang.entries()) {
    const c = COPY[langKey] || COPY.en;
    const opts = { url: '/', icon: '/icon-192.png', tag: 'app-update-wallet-2026-09-08', title: c.pushTitle, body: c.pushBody };
    console.log(`  [PUSH ${langKey}] ${ids.length} users`);
    if (DRY) { console.log(`      "${opts.title}"`); continue; }
    const n = await PushNotificationService.sendToUsers(ids, opts);
    sent += n;
    console.log(`  [PUSH ${langKey}] delivered ${n}/${ids.length}`);
    for (const uid of ids) { try { await logSend(uid, `push_${langKey}`, 'sent'); } catch {} }
  }
  return sent;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) {
    await PushNotificationService.initialize();
    await ensureLogTable();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — App update + wallet broadcast   2026-09-08');
  console.log(`  MODE: ${DRY ? 'DRY RUN (not sending)' : 'LIVE'}   skip-tg: ${SKIP_TG}   skip-push: ${SKIP_PUSH}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Telegram ──────────────────────────────────────────────────────────────

  const tgTargets = SKIP_TG ? [] : await loadTelegramTargets();
  const tgIds     = new Set(tgTargets.map((t) => t.user_id));

  const byLang = new Map();
  for (const t of tgTargets) {
    const k = resolveLang(t.language);
    byLang.set(k, (byLang.get(k) || 0) + 1);
  }
  console.log(`  Telegram: ${tgTargets.length} users — ${[...byLang.entries()].map(([k, n]) => `${k}:${n}`).join('  ')}`);

  if (DRY) {
    for (const langKey of ['en', 'es']) {
      const ex = tgTargets.find((t) => resolveLang(t.language) === langKey);
      const name = ex ? (ex.first_name || ex.username || '') : 'TestUser';
      const username = ex ? (ex.username || '') : '';
      console.log(`\n── ${langKey} sample ──`);
      console.log(buildTgMessage(name, username, langKey).replace(/<\/?b>/g, '**'));
      console.log(`\n  [button] ${(COPY[langKey] || COPY.en).btn} → ${CTA_URL}`);
    }
    console.log('\n(dry run — pass --live to send)\n');
  } else {
    let sent = 0; let skipped = 0; let failed = 0;
    for (let i = 0; i < tgTargets.length; i++) {
      const t = tgTargets[i];
      if (await alreadySent(t.user_id, TG_CHANNEL)) { skipped++; continue; }
      const langKey = resolveLang(t.language);
      const c       = COPY[langKey] || COPY.en;
      const text    = buildTgMessage(t.first_name, t.username, langKey);
      const res     = await tgSend(t.telegram, text, c.btn, CTA_URL);
      if (res.ok) {
        await logSend(t.user_id, TG_CHANNEL, 'sent');
        sent++;
      } else {
        const err = res.description || JSON.stringify(res);
        await logSend(t.user_id, TG_CHANNEL, 'failed', err);
        failed++;
        if (i < 5) console.error(`  ✗ ${t.username} — ${err}`);
      }
      if (i % 100 === 0 && i > 0) process.stdout.write(`\r  TG progress: ${i}/${tgTargets.length} (sent ${sent}, failed ${failed})`);
      await sleep(TG_DELAY_MS);
    }
    process.stdout.write('\n');
    console.log(`  TG done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  }

  // ── Push ──────────────────────────────────────────────────────────────────

  if (!SKIP_PUSH) {
    const pushTargets = await loadPushTargets(tgIds);
    console.log(`\n  Push: ${pushTargets.length} additional subscribers`);
    if (!DRY) await sendPush(pushTargets);
  }

  console.log('\n  Done.\n');
  process.exit(0);
}

const TG_CHANNEL = 'tg';

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
