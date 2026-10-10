#!/usr/bin/env node
'use strict';
/**
 * broadcast-wallet-to-rush-20261010.js
 *
 * DM to users who have USDC in their Privy wallet, inviting them to
 * convert it to Ru$h with one click via ?action=buy-rush&amount=X.
 *
 * Audience : users from wallet_balance_snapshot with usdc_balance >= 1
 * Dedup    : Redis set  pnpapp:broadcast:dedup:wallet-to-rush-20261010  (48h TTL)
 */

const path = require('path');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/ioredis'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

const CAMPAIGN      = 'wallet-to-rush-20261010';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const TOKEN_RATE    = 6; // 1 USD = 6 Ru$h

const DM_DELAY_MS = 80;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function rushAmount(usd) {
  return Math.floor(usd * TOKEN_RATE);
}

function formatUsd(usd) {
  // Show as integer if .00, otherwise 2 decimals
  return usd % 1 === 0 ? usd.toFixed(0) : usd.toFixed(2);
}

function dmText(lang, usd, rush, link) {
  if (isEs(lang)) {
    return `💎 Tenés $${formatUsd(usd)} USDC en tu wallet PNPtv

Ese saldo está ahí esperando. Convertilo en ${rush} Ru$h 💎 — tu moneda en la plataforma para propinas, contenido y más.

Un solo clic. Sin formularios.

👉 Convertir ahora
${link}`;
  }
  return `💎 You have $${formatUsd(usd)} USDC in your PNPtv wallet

That balance is just sitting there. Convert it into ${rush} Ru$h 💎 — your platform currency for tips, content, and more.

One tap. No forms.

👉 Convert now
${link}`;
}

async function main() {
  await initializePostgres();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` WALLET → RU$H DM — ${CAMPAIGN}`);
  console.log(`  MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════\n');

  // Pull users from latest wallet audit with USDC >= $1
  const { rows: walletUsers } = await query(`
    SELECT
      wbs.user_id,
      SUM(wbs.usdc_balance) AS usdc_total,
      SUM(wbs.total_usd_value) AS usd_total,
      u.language,
      u.first_name
    FROM wallet_balance_snapshot wbs
    JOIN users u ON u.id = wbs.user_id
    WHERE wbs.is_orphaned = false
      AND wbs.usdc_balance >= 1
      AND wbs.user_id IS NOT NULL
      AND u.is_deleted = false
      AND COALESCE(u.tier, 'free') <> 'banned'
    GROUP BY wbs.user_id, u.language, u.first_name
    HAVING SUM(wbs.usdc_balance) >= 1
    ORDER BY SUM(wbs.usdc_balance) DESC
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `);

  // Force-include Santino first for QA
  const targets = [...walletUsers];
  const hasSantino = targets.some(u => String(u.user_id) === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id AS user_id, language, first_name FROM users WHERE id::text=$1`, [SANTINO_ID]
    );
    if (s.length) targets.unshift({ ...s[0], usdc_total: 5, usd_total: 5 }); // preview amount for Santino
  }

  const esCount = targets.filter(t => isEs(t.language)).length;
  console.log(`  Targets with USDC >= $1 : ${targets.length}`);
  console.log(`  ES                      : ${esCount}`);
  console.log(`  EN                      : ${targets.length - esCount}`);
  const totalUsdc = walletUsers.reduce((s, u) => s + parseFloat(u.usdc_total), 0);
  console.log(`  Total USDC in wallets   : $${totalUsdc.toFixed(2)}\n`);

  if (DRY_RUN) {
    // Show sample for first 3 users
    for (const u of targets.slice(0, 3)) {
      const usd  = parseFloat(u.usdc_total);
      const rush = rushAmount(usd);
      const link = `https://pnptv.app/?action=buy-rush&amount=${formatUsd(usd)}`;
      console.log(`  [${u.user_id}] $${formatUsd(usd)} → ${rush} Ru$h`);
      console.log('  --- EN ---');
      console.log(dmText('en', usd, rush, link));
      console.log('  --- ES ---');
      console.log(dmText('es', usd, rush, link));
      console.log('');
    }
    console.log(`  DRY RUN — would DM ${targets.length} users.\n`);
    process.exit(0);
  }

  const IORedis = nm('ioredis');
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = new IORedis(redisUrl, { lazyConnect: true });
  try { await redis.connect(); } catch {}
  redis.on('error', () => {});

  let sent = 0, failed = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const usd  = parseFloat(u.usdc_total);
    const rush = rushAmount(usd);
    const link = `https://pnptv.app/?action=buy-rush&amount=${formatUsd(usd)}`;

    const deduped = await redis.sismember(DEDUP_KEY, String(u.user_id));
    if (deduped) { skipped++; continue; }

    try {
      await sendSystemDM(SYSTEM_SENDER, u.user_id, dmText(lang, usd, rush, link), query);
      await redis.sadd(DEDUP_KEY, String(u.user_id));
      sent++;
      console.log(`  ✓ ${u.user_id}  $${formatUsd(usd)} → ${rush} Ru$h`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${u.user_id}  ${e.message}`);
    }
    await sleep(DM_DELAY_MS);
  }

  await redis.expire(DEDUP_KEY, 172800);
  await redis.quit();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DONE — ${CAMPAIGN}`);
  console.log(`  Sent    : ${sent}`);
  console.log(`  Failed  : ${failed}`);
  console.log(`  Skipped : ${skipped}`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
