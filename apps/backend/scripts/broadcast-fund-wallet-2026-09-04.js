#!/usr/bin/env node
'use strict';

/**
 * broadcast-fund-wallet-2026-09-04.js
 *
 * "Fund your wallet" nudge to all wallet-linked users whose wallet is empty
 * (or effectively empty — audit-user-wallets-multichain-2026-09-04 showed
 * only 2 funded, both under $5). Message: your wallet is ready, $10 unlocks
 * 60 Ru$h 💎 — one tip, half a call, or a weekend of unlocks.
 *
 * Channels: Web push (all with subscription) + Telegram DM (with telegram_id).
 * Copy: bilingual by user.language.
 * Dedup: broadcast_fund_wallet_2026_09_04 log table.
 * Santino force-included per feedback_broadcast_cc_santino.
 *
 *   docker run --rm --network pnptvapp_pnptvapp_net -v /opt/pnptvapp:/app \
 *     -w /app pnptvapp-pnptv-bot node /app/apps/backend/scripts/broadcast-fund-wallet-2026-09-04.js --dry-run
 *   (add --live to actually send)
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const https = require('https');
const { query } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY = !process.argv.includes('--live');
const BOT_TOKEN = process.env.BOT_TOKEN;
const WALLET_URL = 'https://pnptv.app/wallet?highlight=topup';
const SANTINO_ID = '8599671840';

// ── COPY ─────────────────────────────────────────────────────────────────────

const push_en = {
  title: `Your wallet's ready 👛`,
  body: `Top up $10 → 60 Ru$h 💎 · tips, calls, exclusive unlocks`,
};
const push_es = {
  title: `Tu wallet está lista 👛`,
  body: `Recarga $10 → 60 Ru$h 💎 · tips, llamadas, contenido exclusivo`,
};

const tg_en = `Hey 👋

Your **PNPtv wallet** is already set up — just no fuel in it yet.

**$10 = 60 Ru$h 💎.** That's:

· A tip that lands on a creator during Main Stage
· Half of a private call
· A weekend of exclusive content unlocks

Card, Apple Pay, or crypto — 30 seconds, no signup drama.

Ready? 👇`;

const tg_es = `Hey 👋

Tu **wallet en PNPtv** ya está lista — solo le falta un poquito de fuego.

**$10 = 60 Ru$h 💎.** Con eso:

· Tiras un tip en Main Stage a tu creador favorito
· Cubres media llamada privada
· Un finde entero desbloqueando contenido exclusivo

Tarjeta, Apple Pay o cripto — 30 seg, sin líos.

¿Le das? 👇`;

const TG_BUTTON_EN = '💳 Top up my wallet';
const TG_BUTTON_ES = '💳 Recargar mi wallet';

const PUSH_COMMON = { icon: '/icon-192.png', tag: 'fund-wallet-2026-09-04', url: '/wallet?highlight=topup' };

// ── PLUMBING ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgSend(chatId, text, buttonText, buttonUrl) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] },
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

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcast_fund_wallet_2026_09_04 (
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
    `SELECT 1 FROM broadcast_fund_wallet_2026_09_04 WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO broadcast_fund_wallet_2026_09_04 (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function loadAudience() {
  const { rows } = await query(`
    SELECT u.id::text AS id,
           u.telegram,
           u.username,
           LOWER(COALESCE(u.language,'en')) AS lang
      FROM users u
     WHERE u.is_deleted IS NOT TRUE
       AND u.wallet_address IS NOT NULL
       AND u.wallet_address <> ''
       AND COALESCE(u.tier, 'free') <> 'banned'
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);
  // Force-include Santino even if he already has a wallet (verification)
  const hasSantino = rows.some(r => r.id === SANTINO_ID);
  if (!hasSantino) {
    const s = await query(
      `SELECT id::text AS id, telegram, username, LOWER(COALESCE(language,'en')) AS lang
         FROM users WHERE id = $1`,
      [SANTINO_ID]
    );
    if (s.rows[0]) rows.unshift(s.rows[0]);
  }
  return rows;
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== broadcast-fund-wallet-2026-09-04 (${DRY ? 'DRY' : 'LIVE'}) ===\n`);
  await ensureLogTable();

  const users = await loadAudience();
  console.log(`  Audience: ${users.length} wallet-linked users`);
  const tgUsers = users.filter(u => u.telegram);
  console.log(`  With Telegram: ${tgUsers.length}`);
  console.log(`  ES: ${users.filter(u => u.lang.startsWith('es')).length}  EN: ${users.filter(u => !u.lang.startsWith('es')).length}\n`);

  // PUSH — same copy per language, use sendToUsers batched by lang for efficiency
  const enIds = users.filter(u => !u.lang.startsWith('es')).map(u => u.id);
  const esIds = users.filter(u =>  u.lang.startsWith('es')).map(u => u.id);
  console.log(`  [PUSH] EN=${enIds.length} ES=${esIds.length}`);
  if (!DRY) {
    let pushSent = 0, pushFail = 0;
    // EN
    for (const id of enIds) {
      if (await alreadySent(id, 'push')) continue;
      try {
        const n = await PushNotificationService.sendToUser(id, { ...PUSH_COMMON, ...push_en });
        if (n > 0) { pushSent++; await log(id, 'push', 'sent'); }
        else { pushFail++; await log(id, 'push', 'no_subs'); }
      } catch (e) { pushFail++; await log(id, 'push', 'failed', e.message); }
      await sleep(30);
    }
    // ES
    for (const id of esIds) {
      if (await alreadySent(id, 'push')) continue;
      try {
        const n = await PushNotificationService.sendToUser(id, { ...PUSH_COMMON, ...push_es });
        if (n > 0) { pushSent++; await log(id, 'push', 'sent'); }
        else { pushFail++; await log(id, 'push', 'no_subs'); }
      } catch (e) { pushFail++; await log(id, 'push', 'failed', e.message); }
      await sleep(30);
    }
    console.log(`  [PUSH] sent=${pushSent} no_subs/failed=${pushFail}`);
  } else {
    console.log(`  [PUSH] DRY samples:`);
    console.log(`    EN:`, { ...PUSH_COMMON, ...push_en });
    console.log(`    ES:`, { ...PUSH_COMMON, ...push_es });
  }

  // TELEGRAM
  console.log(`\n  [TG] ${tgUsers.length} candidates`);
  if (!DRY && tgUsers.length) {
    let sent = 0, fail = 0, skip = 0;
    for (const u of tgUsers) {
      if (await alreadySent(u.id, 'tg')) { skip++; continue; }
      const isEs = u.lang.startsWith('es');
      const text = isEs ? tg_es : tg_en;
      const btn  = isEs ? TG_BUTTON_ES : TG_BUTTON_EN;
      const r = await tgSend(u.telegram, text, btn, WALLET_URL);
      if (r.ok) { sent++; await log(u.id, 'tg', 'sent'); }
      else { fail++; await log(u.id, 'tg', 'failed', (r.description || r.error || '?').slice(0, 500)); }
      // Stay under Telegram bot-wide 30 msg/sec limit — 40ms per send + burst pause every 20
      await sleep(40);
      if ((sent + fail) % 20 === 0) await sleep(1000);
    }
    console.log(`  [TG] sent=${sent} fail=${fail} skip=${skip}`);
  } else if (DRY) {
    console.log(`  [TG] DRY samples:`);
    console.log(`  ── EN ──`);
    console.log(tg_en);
    console.log(`    [button: ${TG_BUTTON_EN} → ${WALLET_URL}]`);
    console.log(`  ── ES ──`);
    console.log(tg_es);
    console.log(`    [button: ${TG_BUTTON_ES} → ${WALLET_URL}]`);
  }

  console.log(`\n=== done (${DRY ? 'DRY' : 'LIVE'}) ===`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
