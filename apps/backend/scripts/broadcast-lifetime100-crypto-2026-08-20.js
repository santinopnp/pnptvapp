#!/usr/bin/env node
'use strict';

/**
 * Mass broadcast — Lifetime PRIME $100 now payable in USDC / USDT / ETH / BTC.
 * Landing at https://pnptv.app/lifetime100 → in-page NP widget checkout.
 * IPN auto-grants lifetime membership + 60 days PRIME.
 *
 * Channels:
 *   • Telegram DM — single inline button → /lifetime100
 *   • In-app DM   — text with /lifetime100 link
 *
 * Manual one-shot only — NEVER schedule in cron.
 *
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-crypto-2026-08-20.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-crypto-2026-08-20.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-crypto-2026-08-20.js --only-user=<uid>
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const https = require('https');
const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY = process.argv.includes('--dry-run');
const ONLY_USER = (process.argv.find(a => a.startsWith('--only-user=')) || '').split('=')[1] || null;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://pnptv.app';
const SYSTEM_SENDER_ID = '8552451957'; // Cristina / system
const CTA_URL = `${WEBAPP_URL.replace(/\/$/, '')}/lifetime100`;

if (!BOT_TOKEN) { console.error('FATAL: BOT_TOKEN missing.'); process.exit(1); }

// ── COPY ────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    tg: `💎 Lifetime PRIME — one payment, yours forever.

Now pay with USDC, USDT, Ethereum or Bitcoin — no card, no bank.
Open your wallet or scan a QR right in the checkout.

$100 → all exclusive content, private sessions with creators,
founding-member status. Every future feature, included.

👉 ${CTA_URL}`,
    dm: `💎 Lifetime PRIME — one payment, yours forever.

Now pay with USDC, USDT, Ethereum or Bitcoin — no card, no bank.
Open your wallet or scan a QR right in the checkout.

$100 → all exclusive content, private sessions with creators,
founding-member status. Every future feature, included.

👉 ${CTA_URL}

— PNPtv! 🏳️‍🌈`,
    btn: '💎 Get Lifetime PRIME — $100',
  },
  es: {
    tg: `💎 Lifetime PRIME — un pago, tuyo para siempre.

Ya puedes pagar con USDC, USDT, Ethereum o Bitcoin — sin tarjeta,
sin banco. Abre tu wallet o escanea un QR en el checkout.

$100 → todo el contenido exclusivo, sesiones privadas con creadores,
estatus de miembro fundador. Cada función futura, incluida.

👉 ${CTA_URL}`,
    dm: `💎 Lifetime PRIME — un pago, tuyo para siempre.

Ya puedes pagar con USDC, USDT, Ethereum o Bitcoin — sin tarjeta,
sin banco. Abre tu wallet o escanea un QR en el checkout.

$100 → todo el contenido exclusivo, sesiones privadas con creadores,
estatus de miembro fundador. Cada función futura, incluida.

👉 ${CTA_URL}

— PNPtv! 🏳️‍🌈`,
    btn: '💎 Reclama Lifetime PRIME — $100',
  },
};

// ── TG HTTP ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgSend(chatId, text, replyMarkup) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
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

// ── LOG TABLE ──────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcast_lifetime100_crypto_2026_08_20 (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}
// Skip anything we've already recorded — 'sent' or 'failed' (Telegram permanent
// rejection = user hasn't /start'd or blocked; retry burns API budget).
async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM broadcast_lifetime100_crypto_2026_08_20 WHERE user_id=$1 AND channel=$2 AND status IN ('sent','failed')`,
    [String(userId), channel]
  );
  return rows.length > 0;
}
async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO broadcast_lifetime100_crypto_2026_08_20 (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

// ── AUDIENCE ───────────────────────────────────────────────────────────────
// Everyone active, not banned, not deleted, WITHOUT an active lifetime-PRIME
// entitlement (they already have what we're selling).

async function fetchAudience() {
  const extraFilter = ONLY_USER ? ' AND u.id::text = $1' : '';
  const params = ONLY_USER ? [String(ONLY_USER)] : [];
  const { rows } = await query(`
    SELECT u.id::text        AS id,
           u.telegram        AS telegram,
           LOWER(COALESCE(u.language,'en')) AS lang
      FROM users u
      LEFT JOIN user_entitlements ue
        ON ue.user_id = u.id
       AND ue.add_on_id = 'prime'
       AND ue.is_lifetime = true
       AND ue.is_consumed = false
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND ue.user_id IS NULL
       ${extraFilter}
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `, params);
  return rows;
}

// ── SENDERS ────────────────────────────────────────────────────────────────

async function sendTelegramDMs(audience) {
  const tgUsers = audience.filter(u => u.telegram && u.telegram.trim() !== '');
  console.log(`  [TG] ${tgUsers.length} users with telegram id`);
  let sent = 0, fail = 0, skip = 0, dryPreview = 0;

  for (const u of tgUsers) {
    if (await alreadySent(u.id, 'tg')) { skip++; continue; }
    const isEs = u.lang.startsWith('es');
    const copy = isEs ? COPY.es : COPY.en;
    const keyboard = { inline_keyboard: [[{ text: copy.btn, url: CTA_URL }]] };

    if (DRY) {
      if (dryPreview < 2) {
        console.log(`\n  ── DRY TG sample #${dryPreview + 1} → user ${u.id} (${isEs ? 'ES' : 'EN'}) chat ${u.telegram} ──`);
        console.log(copy.tg);
        console.log('  keyboard:', JSON.stringify(keyboard));
        dryPreview++;
      }
      sent++;
      continue;
    }

    const r = await tgSend(u.telegram, copy.tg, keyboard);
    if (r.ok) { sent++; await log(u.id, 'tg', 'sent'); }
    else {
      fail++;
      await log(u.id, 'tg', 'failed', (r.description || r.error || 'unknown').slice(0, 500));
    }

    await sleep(40);
    if ((sent + fail) % 200 === 0) {
      await sleep(1000);
      console.log(`  [TG] progress: sent=${sent} failed=${fail} skip=${skip} / ${tgUsers.length}`);
    }
  }

  console.log(`  [TG] final: sent=${sent} failed=${fail} skipped=${skip} total=${tgUsers.length}`);
  return { sent, fail, skip, total: tgUsers.length };
}

async function sendInAppDMs(audience) {
  console.log(`  [DM] ${audience.length} users`);
  let sent = 0, fail = 0, skip = 0, dryPreview = 0;

  for (const u of audience) {
    if (await alreadySent(u.id, 'dm')) { skip++; continue; }
    const isEs = u.lang.startsWith('es');
    const copy = isEs ? COPY.es : COPY.en;

    if (DRY) {
      if (dryPreview < 2) {
        console.log(`\n  ── DRY DM sample #${dryPreview + 1} → user ${u.id} (${isEs ? 'ES' : 'EN'}) ──`);
        console.log(copy.dm);
        dryPreview++;
      }
      sent++;
      continue;
    }

    try {
      await sendSystemDM(SYSTEM_SENDER_ID, u.id, copy.dm, query);
      sent++;
      await log(u.id, 'dm', 'sent');
    } catch (err) {
      fail++;
      await log(u.id, 'dm', 'failed', String(err.message || err).slice(0, 500));
    }

    if ((sent + fail) % 200 === 0) {
      console.log(`  [DM] progress: sent=${sent} failed=${fail} skip=${skip} / ${audience.length}`);
      await sleep(300);
    } else {
      await sleep(20);
    }
  }

  console.log(`  [DM] final: sent=${sent} failed=${fail} skipped=${skip} total=${audience.length}`);
  return { sent, fail, skip, total: audience.length };
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Lifetime100 crypto broadcast 2026-08-20 ${DRY ? '(DRY-RUN)' : ''} ${ONLY_USER ? `[ONLY ${ONLY_USER}]` : ''} ===`);
  console.log(`CTA: ${CTA_URL}`);
  await initializePostgres();
  await ensureLogTable();

  const audience = await fetchAudience();
  console.log(`Audience: ${audience.length} users (non-lifetime, non-banned, non-deleted)`);
  if (audience.length === 0) { console.log('Nothing to send.'); process.exit(0); }

  console.log('\n── TELEGRAM DM ──');
  const tg = await sendTelegramDMs(audience);

  console.log('\n── IN-APP DM ──');
  const dm = await sendInAppDMs(audience);

  console.log(`\n=== FINAL ===`);
  console.log(`  tg:  sent=${tg.sent}  failed=${tg.fail}  skipped=${tg.skip}  total=${tg.total}`);
  console.log(`  dm:  sent=${dm.sent}  failed=${dm.fail}  skipped=${dm.skip}  total=${dm.total}`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
