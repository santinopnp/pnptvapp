#!/usr/bin/env node
'use strict';

/**
 * broadcast-wallet-funded-rush-2026-10-05.js
 *
 * Target users who have ≥ $5 USDC on Base in their linked PNPtv wallet and
 * invite them to convert those funds into Ru$h.
 *
 * Audience : all non-banned users with wallet_address + telegram OR push,
 *            whose Base USDC balance is ≥ MIN_BALANCE_USD
 * Channels : Telegram DM (from PNPtv bot) + web push
 * Dedup    : broadcast_dedup LIKE 'wallet-funded-rush-2026-10-05%'
 * CC       : Santino always included for verification
 *
 * Dry run (shows audience + sample copy, no sends, no on-chain queries):
 *   docker run --rm ... node apps/backend/scripts/broadcast-wallet-funded-rush-2026-10-05.js --dry-run
 *
 * Balance-only scan (checks on-chain balances, prints eligible list, no sends):
 *   ... --scan-only
 *
 * Live:
 *   docker run --rm \
 *     --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e ALCHEMY_API_KEY="$(docker exec pnptv-bot printenv ALCHEMY_API_KEY)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-wallet-funded-rush-2026-10-05.js --dry-run
 */

const path  = require('path');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY_RUN   = process.argv.includes('--dry-run');
const SCAN_ONLY = process.argv.includes('--scan-only');

const CAMPAIGN         = 'wallet-funded-rush-2026-10-05';
const MIN_BALANCE_USD  = 5.0;
const WEBAPP_URL       = 'https://pnptv.app';
const WALLET_URL       = `${WEBAPP_URL}/?openWallet=1`;
const BOT_TOKEN        = process.env.BOT_TOKEN;
const ALCHEMY_KEY      = process.env.ALCHEMY_API_KEY;
const SANTINO_ID       = '8599671840';

// USDC on Base (lowercase — viem rejects mixed-case checksums, bit us on kobton1 audit)
const USDC_BASE_ADDRESS  = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BASE_RPC           = ALCHEMY_KEY
  ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : 'https://mainnet.base.org';

const EXCLUDED_IDS = [
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91', // Lex
  '8552451957',                             // system sender
];

const TG_DELAY_MS  = 120;
const BAL_BATCH    = 10;  // concurrent on-chain balance requests
const BAL_DELAY_MS = 300; // between batches

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── On-chain USDC balance on Base ─────────────────────────────────────────────

async function getBaseUsdcBalance(address) {
  // eth_call to USDC.balanceOf(address) — raw JSON-RPC, no viem dependency
  const data = '0x70a08231' + address.toLowerCase().replace('0x', '').padStart(64, '0');
  const payload = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: USDC_BASE_ADDRESS, data }, 'latest'],
  });

  return new Promise((resolve) => {
    const url = new URL(BASE_RPC);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout:  8000,
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (json.error || !json.result || json.result === '0x') { resolve(0); return; }
          const raw = BigInt(json.result);
          resolve(Number(raw) / 1_000_000); // USDC has 6 decimals
        } catch { resolve(0); }
      });
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.write(payload);
    req.end();
  });
}

// ── Telegram send ─────────────────────────────────────────────────────────────

function tgRequest(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/${method}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout:  10000,
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, text) {
  return tgRequest('sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
  });
}

// ── Copy ──────────────────────────────────────────────────────────────────────

function tgCopy(firstName, balanceUsd, lang) {
  const name = firstName ? ` ${firstName}` : '';
  const bal  = balanceUsd.toFixed(2);
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');

  if (isEs) {
    return (
      `💎 <b>Tenés $${bal} USDC en tu billetera PNPtv — convertilo en Ru$h.</b>\n\n` +
      `Con Ru$h desbloqueás contenido exclusivo, apostás a tus creadores favoritos y mucho más.\n\n` +
      `Lo mejor: ya tenés los fondos. Solo falta usarlos.\n\n` +
      `👉 <a href="${WALLET_URL}">${WALLET_URL}</a>\n\n` +
      `— PNPtv`
    );
  }

  return (
    `💎 <b>You have $${bal} USDC in your PNPtv wallet — turn it into Ru$h.</b>\n\n` +
    `Ru$h unlocks exclusive content, tips your favorite creators, and more.\n\n` +
    `Best part: you already have the funds. Just spend them.\n\n` +
    `👉 <a href="${WALLET_URL}">${WALLET_URL}</a>\n\n` +
    `— PNPtv`
  );
}

function pushCopy(lang) {
  const isEs = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  return isEs
    ? {
        title: '💎 Convertí tu USDC en Ru$h',
        body:  'Ya tenés fondos en tu billetera PNPtv — usálos.',
        url:   WALLET_URL,
        tag:   CAMPAIGN,
        notifType: 'promo',
      }
    : {
        title: '💎 Turn your USDC into Ru$h',
        body:  'You already have funds in your PNPtv wallet — spend them.',
        url:   WALLET_URL,
        tag:   CAMPAIGN,
        notifType: 'promo',
      };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set — aborting'); process.exit(1); }

  // ── Step 1: fetch candidate users ─────────────────────────────────────────
  const excludePlaceholders = EXCLUDED_IDS.map((_, i) => `$${i + 1}`).join(',');
  const { rows: candidates } = await query(`
    SELECT
      u.id,
      u.telegram,
      u.wallet_address,
      u.first_name,
      u.username,
      CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang,
      EXISTS (
        SELECT 1 FROM push_subscriptions ps
        WHERE ps.user_id = u.id::text AND ps.endpoint IS NOT NULL
      ) AS has_push
    FROM users u
    WHERE u.wallet_address IS NOT NULL
      AND u.wallet_address != ''
      AND u.is_deleted = false
      AND COALESCE(u.tier, 'free') != 'banned'
      AND u.id::text NOT IN (${excludePlaceholders})
    ORDER BY u.created_at DESC
  `, EXCLUDED_IDS);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — Wallet Funded → Spend on Ru$h · 2026-10-05');
  console.log(`  Campaign  : ${CAMPAIGN}`);
  console.log(`  Min USDC  : $${MIN_BALANCE_USD}`);
  console.log(`  Candidates: ${candidates.length} users with linked wallet`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : SCAN_ONLY ? 'SCAN ONLY' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN sample (balance = $12.50) ──');
    console.log(tgCopy('Alex', 12.50, 'en'));
    console.log('\n── ES sample (balance = $8.00) ──');
    console.log(tgCopy('Carlos', 8.00, 'es'));
    console.log(`\nPush EN: "${pushCopy('en').title}" — ${pushCopy('en').body}`);
    console.log(`Push ES: "${pushCopy('es').title}" — ${pushCopy('es').body}`);
    console.log(`\nWould check on-chain balance for ${candidates.length} wallets.`);
    console.log('\n-- DRY RUN complete. Use --scan-only to check balances. --\n');
    process.exit(0);
  }

  // ── Step 2: check on-chain balances in batches ────────────────────────────
  console.log(`Checking Base USDC balance for ${candidates.length} wallets...\n`);
  const eligible = [];

  for (let i = 0; i < candidates.length; i += BAL_BATCH) {
    const batch = candidates.slice(i, i + BAL_BATCH);
    const results = await Promise.all(
      batch.map(u => getBaseUsdcBalance(u.wallet_address))
    );
    results.forEach((bal, j) => {
      const u = batch[j];
      const label = bal >= MIN_BALANCE_USD ? `✓ $${bal.toFixed(2)}` : `  $${bal.toFixed(2)}`;
      console.log(`  ${label}  ${u.wallet_address.slice(0, 10)}…  @${u.username || u.id}`);
      if (bal >= MIN_BALANCE_USD) eligible.push({ ...u, balanceUsd: bal });
    });
    if (i + BAL_BATCH < candidates.length) await sleep(BAL_DELAY_MS);
  }

  console.log(`\n  Eligible (≥ $${MIN_BALANCE_USD}): ${eligible.length} users\n`);

  if (SCAN_ONLY) {
    console.log('-- SCAN ONLY complete. Remove --scan-only to send. --\n');
    process.exit(0);
  }

  if (eligible.length === 0) {
    console.log('No eligible users — nothing to send.\n');
    process.exit(0);
  }

  // Force-include Santino for CC (with a dummy balance so copy looks realistic)
  if (!eligible.some(u => u.id === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, telegram, wallet_address, first_name, username,
              CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang,
              EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = id::text) AS has_push
         FROM users WHERE id = $1`,
      [SANTINO_ID]
    );
    if (s.length) eligible.unshift({ ...s[0], balanceUsd: 15.00, _cc: true });
  }

  // ── Step 3: dedup check ────────────────────────────────────────────────────
  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [`${CAMPAIGN}%`]
  );
  console.log(`Dedup: ${dedupRows[0].cnt} already sent under this campaign.\n`);

  // ── Step 4: send ───────────────────────────────────────────────────────────
  await PushNotificationService.initialize();

  const stats = { tgOk: 0, tgFail: 0, pushOk: 0, pushFail: 0, skipped: 0 };

  for (const u of eligible) {
    // per-user dedup check
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${CAMPAIGN}%`, u.id]
    );
    if (already.length) { stats.skipped++; continue; }

    const tgId  = u.telegram;
    const hasTg = tgId && String(tgId).trim() !== '';
    let sent    = false;

    // Telegram DM
    if (hasTg) {
      const res = await tgSend(tgId, tgCopy(u.first_name, u.balanceUsd, u.lang));
      if (res.ok) {
        stats.tgOk++;
        sent = true;
        console.log(`  ✓ TG  @${u.username || u.id}  $${u.balanceUsd.toFixed(2)}`);
      } else {
        stats.tgFail++;
        console.log(`  ✗ TG  @${u.username || u.id}  ${JSON.stringify(res.description || res.error)}`);
      }
      await sleep(TG_DELAY_MS);
    }

    // Web push
    if (u.has_push) {
      try {
        await PushNotificationService.sendToUser(u.id, pushCopy(u.lang));
        stats.pushOk++;
        sent = true;
        console.log(`  ✓ PSH @${u.username || u.id}`);
      } catch (err) {
        stats.pushFail++;
        console.log(`  ✗ PSH @${u.username || u.id}  ${err.message}`);
      }
    }

    // Record dedup only if at least one channel succeeded
    if (sent) {
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [CAMPAIGN, u.id]
      );
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DONE');
  console.log(`  TG sent:    ${stats.tgOk}   failed: ${stats.tgFail}`);
  console.log(`  Push sent:  ${stats.pushOk}  failed: ${stats.pushFail}`);
  console.log(`  Skipped:    ${stats.skipped} (already sent)`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
