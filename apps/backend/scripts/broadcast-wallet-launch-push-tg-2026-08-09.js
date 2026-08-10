#!/usr/bin/env node
'use strict';

/**
 * PNP Wallet + Ru$h launch broadcast — 2026-08-09
 * Push + Telegram DM. Two cohorts, distinct messaging:
 *
 *   Cohort A (free-tier + ≥60 gifted Ru$h): Personalized "usa tus 💎 gratis para
 *     ser Basic" — highest-intent, they can upgrade with what they already have.
 *     Basic sub = 60 💎 = $9.99. Message says how many they have, how many are
 *     needed, and how many left over after.
 *
 *   Cohort B (everyone else, excludes banned/deleted): General "PNP Wallet
 *     lista, recarga con tarjeta en 30 seg" launch pitch.
 *
 * Bilingual by user.language. Idempotent via broadcast_wallet_launch_2026_08_09
 * log table. One-shot manual — do NOT crontab.
 *
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-push-tg-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-push-tg-2026-08-09.js --live --cohort=A
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-push-tg-2026-08-09.js --live --cohort=B
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-wallet-launch-push-tg-2026-08-09.js --live --cohort=all
 *
 * Recommend: run cohort=A first (small, high-intent), observe conversion,
 * then run cohort=B once ready.
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const https = require('https');
const { query } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY = !process.argv.includes('--live');
const cohortArg = (process.argv.find(a => a.startsWith('--cohort=')) || '--cohort=all').split('=')[1];
const RUN_COHORT_A = cohortArg === 'A' || cohortArg === 'all';
const RUN_COHORT_B = cohortArg === 'B' || cohortArg === 'all';
const BOT_TOKEN = process.env.BOT_TOKEN;

const WALLET_URL = 'https://pnptv.app/wallet';
const SUB_URL = 'https://pnptv.app/subscribe';
const BASIC_COST_RUSH = 60; // 1 USD = 6 Ru$h, Basic = $9.99 → 60 💎

// ── COPY ─────────────────────────────────────────────────────────────────────

// Cohort A: free-tier user with gifted ≥ 60. Personalize with their balance.
function cohortA_es(gifted) {
  const leftover = gifted - BASIC_COST_RUSH;
  return {
    push: {
      title: `🎁 Tienes ${gifted} 💎 bonus`,
      body: `Úsalos: 60 💎 = Basic Plan (${leftover} 💎 te quedan). Cero tarjeta.`,
    },
    tg: `Hey 👋

Ya tienes **${gifted} 💎 Ru$h bonus** esperando en tu wallet — y no lo sabías.

Con 60 💎 te pasas a **PNP Stans Basic** (equivale a $9.99, pero tú no pagas nada — usas tus 💎 bonus).

Te quedan ${leftover} 💎 para tips a Santino o para arrancar cuando compres más.

¿Le das? 👇`,
    tgButton: '💎 Usar mis Ru$h ahora',
    tgButtonUrl: `${SUB_URL}?highlight=member_monthly`,
  };
}

function cohortA_en(gifted) {
  const leftover = gifted - BASIC_COST_RUSH;
  return {
    push: {
      title: `🎁 You have ${gifted} starter 💎`,
      body: `Use them: 60 💎 = Basic Plan (${leftover} 💎 left over). No card needed.`,
    },
    tg: `Hey 👋

You have **${gifted} starter Ru$h 💎** sitting in your wallet — didn't know?

60 💎 flips you to **PNP Stans Basic** (worth $9.99, but you pay nothing — you're using starter 💎).

${leftover} 💎 left over for Santino tips or to combine when you top up.

Wanna do it? 👇`,
    tgButton: '💎 Use my Ru$h now',
    tgButtonUrl: `${SUB_URL}?highlight=member_monthly`,
  };
}

// Cohort B: general launch.
const cohortB_es = {
  push: {
    title: '💎 Llegó PNP Wallet',
    body: 'Recarga con tarjeta en 30 seg y gasta Ru$h donde quieras',
  },
  tg: `💎 **PNP Wallet está lista**.

Recarga con tu **tarjeta** (sí, así de simple — nada de cripto) en 30 segundos y usa **Ru$h 💎** para:

· Tipear creators en Main Stage
· Agendar llamadas privadas
· Desbloquear contenido exclusivo
· Suscribirte a channels

1 USD = 6 Ru$h · Paquetes desde $50

¿Le entras? 👇`,
  tgButton: '💳 Recargar mi wallet',
  tgButtonUrl: WALLET_URL,
};

const cohortB_en = {
  push: {
    title: '💎 PNP Wallet is live',
    body: 'Top up with card in 30 sec and spend Ru$h anywhere',
  },
  tg: `💎 **PNP Wallet is live**.

Top up with your **card** (yeah — no crypto knowledge needed) in 30 seconds and use **Ru$h 💎** for:

· Tipping creators on Main Stage
· Booking private calls
· Unlocking exclusive content
· Subscribing to channels

1 USD = 6 Ru$h · Packages from $50

Ready? 👇`,
  tgButton: '💳 Top up my wallet',
  tgButtonUrl: WALLET_URL,
};

const PUSH_COMMON = { icon: '/icon-192.png', tag: 'wallet-launch-2026-08-09' };

// ── PLUMBING ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgSend(chatId, text, buttonText, buttonUrl) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
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
    CREATE TABLE IF NOT EXISTS broadcast_wallet_launch_2026_08_09 (
      user_id text NOT NULL,
      channel text NOT NULL,
      cohort  text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM broadcast_wallet_launch_2026_08_09 WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(userId, channel, cohort, status, error) {
  await query(
    `INSERT INTO broadcast_wallet_launch_2026_08_09 (user_id, channel, cohort, status, error)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, cohort, status, error || null]
  );
}

// ── COHORT A: free-tier with gifted ≥ 60 ────────────────────────────────────

async function loadCohortA() {
  const { rows } = await query(`
    SELECT u.id::text AS id,
           u.telegram,
           LOWER(COALESCE(u.language,'en')) AS lang,
           w.gifted_balance::int AS gifted
      FROM users u
      JOIN user_token_wallets w ON w.user_id = u.id
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier = 'free')
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND w.gifted_balance >= $1
     ORDER BY w.gifted_balance DESC
  `, [BASIC_COST_RUSH]);
  return rows;
}

async function runCohortA() {
  console.log('\n=== Cohort A: free-tier + gifted ≥ 60 💎 ===');
  const users = await loadCohortA();
  console.log(`  ${users.length} eligible users`);

  // PUSH
  const pushOptsById = new Map();
  const pushIds = [];
  for (const u of users) {
    const isEs = u.lang.startsWith('es');
    const copy = isEs ? cohortA_es(u.gifted) : cohortA_en(u.gifted);
    pushOptsById.set(u.id, { ...PUSH_COMMON, ...copy.push, url: '/subscribe?highlight=member_monthly' });
    pushIds.push(u.id);
  }
  console.log(`  [PUSH-A] ${pushIds.length} candidates`);
  if (!DRY && pushIds.length) {
    // sendToUsers only takes ONE opts payload — since cohort A copy is personalized
    // per user, iterate one-by-one via sendToUser.
    let pushSent = 0, pushFail = 0;
    for (const u of users) {
      if (await alreadySent(u.id, 'push')) continue;
      try {
        const opts = pushOptsById.get(u.id);
        const n = await PushNotificationService.sendToUser(u.id, opts);
        if (n > 0) { pushSent++; await log(u.id, 'push', 'A', 'sent'); }
        else { pushFail++; await log(u.id, 'push', 'A', 'no_subs'); }
      } catch (e) {
        pushFail++; await log(u.id, 'push', 'A', 'failed', e.message);
      }
      await sleep(50);
    }
    console.log(`  [PUSH-A] sent=${pushSent} fail=${pushFail}`);
  } else if (DRY) {
    if (users[0]) {
      console.log(`  [PUSH-A] DRY sample: user=${users[0].id} lang=${users[0].lang} gifted=${users[0].gifted}`);
      console.log(`    payload:`, pushOptsById.get(users[0].id));
    }
  }

  // TELEGRAM
  const tgUsers = users.filter(u => u.telegram);
  console.log(`  [TG-A] ${tgUsers.length} candidates with telegram`);
  if (!DRY && tgUsers.length) {
    let sent = 0, fail = 0, skip = 0;
    for (const u of tgUsers) {
      if (await alreadySent(u.id, 'tg')) { skip++; continue; }
      const isEs = u.lang.startsWith('es');
      const copy = isEs ? cohortA_es(u.gifted) : cohortA_en(u.gifted);
      const r = await tgSend(u.telegram, copy.tg, copy.tgButton, copy.tgButtonUrl);
      if (r.ok) { sent++; await log(u.id, 'tg', 'A', 'sent'); }
      else { fail++; await log(u.id, 'tg', 'A', 'failed', (r.description || r.error || '?').slice(0, 500)); }
      await sleep(50);
      if ((sent + fail) % 20 === 0) await sleep(1000);
    }
    console.log(`  [TG-A] sent=${sent} fail=${fail} skip=${skip}`);
  } else if (DRY && tgUsers[0]) {
    const u = tgUsers[0];
    const isEs = u.lang.startsWith('es');
    const copy = isEs ? cohortA_es(u.gifted) : cohortA_en(u.gifted);
    console.log(`  [TG-A] DRY sample user=${u.id} lang=${u.lang} gifted=${u.gifted}:`);
    console.log('  ────────────');
    console.log(copy.tg);
    console.log(`  [button: ${copy.tgButton} → ${copy.tgButtonUrl}]`);
    console.log('  ────────────');
  }
}

// ── COHORT B: everyone else ────────────────────────────────────────────────

async function loadCohortB(excludeIds) {
  const { rows } = await query(`
    SELECT u.id::text AS id,
           u.telegram,
           LOWER(COALESCE(u.language,'en')) AS lang
      FROM users u
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND ($1::text[] IS NULL OR NOT (u.id::text = ANY($1)))
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `, [excludeIds && excludeIds.length ? excludeIds : null]);
  return rows;
}

async function runCohortB() {
  console.log('\n=== Cohort B: general launch (everyone else) ===');
  const cohortAUsers = await loadCohortA();
  const excludeIds = cohortAUsers.map(u => u.id);
  const users = await loadCohortB(excludeIds);
  console.log(`  ${users.length} users (excluded ${excludeIds.length} in Cohort A)`);

  // PUSH — batch by language, same payload per lang
  const esIds = users.filter(u => u.lang.startsWith('es')).map(u => u.id);
  const enIds = users.filter(u => !u.lang.startsWith('es')).map(u => u.id);

  console.log(`  [PUSH-B ES] ${esIds.length} · [PUSH-B EN] ${enIds.length}`);
  if (!DRY) {
    if (esIds.length) {
      const n = await PushNotificationService.sendToUsers(esIds, { ...PUSH_COMMON, ...cohortB_es.push, url: '/wallet' });
      console.log(`  [PUSH-B ES] delivered ${n}/${esIds.length}`);
      for (const id of esIds) await log(id, 'push', 'B', n > 0 ? 'sent' : 'no_subs');
    }
    if (enIds.length) {
      const n = await PushNotificationService.sendToUsers(enIds, { ...PUSH_COMMON, ...cohortB_en.push, url: '/wallet' });
      console.log(`  [PUSH-B EN] delivered ${n}/${enIds.length}`);
      for (const id of enIds) await log(id, 'push', 'B', n > 0 ? 'sent' : 'no_subs');
    }
  } else {
    console.log(`  [PUSH-B ES] payload:`, { ...PUSH_COMMON, ...cohortB_es.push, url: '/wallet' });
    console.log(`  [PUSH-B EN] payload:`, { ...PUSH_COMMON, ...cohortB_en.push, url: '/wallet' });
  }

  // TG
  const tgUsers = users.filter(u => u.telegram);
  console.log(`  [TG-B] ${tgUsers.length} candidates with telegram`);
  if (!DRY && tgUsers.length) {
    let sent = 0, fail = 0, skip = 0;
    for (const u of tgUsers) {
      if (await alreadySent(u.id, 'tg')) { skip++; continue; }
      const isEs = u.lang.startsWith('es');
      const copy = isEs ? cohortB_es : cohortB_en;
      const r = await tgSend(u.telegram, copy.tg, copy.tgButton, copy.tgButtonUrl);
      if (r.ok) { sent++; await log(u.id, 'tg', 'B', 'sent'); }
      else { fail++; await log(u.id, 'tg', 'B', 'failed', (r.description || r.error || '?').slice(0, 500)); }
      await sleep(50);
      if ((sent + fail) % 100 === 0) {
        await sleep(1000);
        console.log(`  [TG-B] progress: sent=${sent} fail=${fail} skip=${skip} / ${tgUsers.length}`);
      }
    }
    console.log(`  [TG-B] final sent=${sent} fail=${fail} skip=${skip}`);
  } else if (DRY) {
    console.log(`  [TG-B] DRY sample ES:`);
    console.log('  ────────────');
    console.log(cohortB_es.tg);
    console.log(`  [button: ${cohortB_es.tgButton} → ${cohortB_es.tgButtonUrl}]`);
    console.log('  ────────────');
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== broadcast-wallet-launch-push-tg-2026-08-09 (${DRY ? 'DRY-RUN' : 'LIVE'}) ===`);
  console.log(`Cohorts: A=${RUN_COHORT_A} B=${RUN_COHORT_B}`);
  if (!DRY) await ensureLogTable();
  if (RUN_COHORT_A) await runCohortA();
  if (RUN_COHORT_B) await runCohortB();
  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
