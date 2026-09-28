#!/usr/bin/env node
'use strict';

/**
 * Broadcast: dust converter launch.
 *
 * Scans every user with a linked Privy wallet, hits Base RPC for their USDC
 * + ETH balance, and DMs the ones whose total dust value sits between $0.17
 * and the current threshold (via /api/wallet/dust-config or the fallback 50).
 * Feature landed in prod on 2026-09-27 (commits 76a1bda2 → e50fd6fc).
 *
 * DM only — the feature is IN-app, no email/telegram fan-out needed.
 * Force-includes Santino (id 8599671840) so he sees the copy as a user.
 *
 * Usage:
 *   docker cp apps/backend/scripts/broadcast-dust-converter-launch.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-dust-converter-launch.js --dry-run
 *   docker exec pnptv-bot node /tmp/broadcast-dust-converter-launch.js
 */

const path  = require('path');
const fs    = require('fs');
const https = require('https');

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
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

// Dedup — campaign-namespaced LIKE key per feedback_broadcast_dedup_campaign_namespace.
// 30-day TTL so users who enter/exit the eligible dust range aren't re-hit weekly.
const NM_ROOT_DEDUP = fs.existsSync(path.join(BACKEND, 'node_modules/ioredis'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const IORedis = require(path.join(NM_ROOT_DEDUP, 'ioredis'));
const DEDUP_TTL_S = 30 * 86400;

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message);
  process.exit(1);
});

// ─── FLAGS ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CAMPAIGN      = 'dust-convert-launch-v1';
const SYSTEM_SENDER = '8552451957';  // @pnptv
const SANTINO_ID    = '8599671840';
const WALLET_URL    = 'https://pnptv.app/wallet';
const HERO_URL      = 'https://pnptv.app/videos/rush-marketing-vertical-en.jpg';

const THRESHOLD_USD = 50;
const MIN_USD       = 0.17;
const BONUS         = 1.10;
const ETH_RESERVE   = 0.0003;

const USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDC_DECIMALS = 6;

// Exclude staff so they aren't hit by their own broadcast; Santino is
// re-added explicitly at the end so he verifies what users see.
const EXCLUDED_IDS = [
  SYSTEM_SENDER,                           // @pnptv itself
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91',  // Lex
];

function baseRpcUrl() {
  const key = process.env.ALCHEMY_API_KEY;
  return key
    ? `https://base-mainnet.g.alchemy.com/v2/${key}`
    : 'https://mainnet.base.org';
}

const RPC_URL = baseRpcUrl();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── BASE RPC ─────────────────────────────────────────────────────────────────

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url  = new URL(RPC_URL);
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('RPC parse: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function readUsdc(addr) {
  const padded = addr.toLowerCase().replace('0x', '').padStart(64, '0');
  const data   = '0x70a08231' + padded;
  const r = await rpcCall('eth_call', [{ to: USDC_CONTRACT, data }, 'latest']);
  if (r.error) throw new Error(r.error.message);
  return Number(BigInt(r.result || '0x0')) / Math.pow(10, USDC_DECIMALS);
}

async function readEth(addr) {
  const r = await rpcCall('eth_getBalance', [addr.toLowerCase(), 'latest']);
  if (r.error) throw new Error(r.error.message);
  return Number(BigInt(r.result || '0x0')) / 1e18;
}

async function fetchEthUsd() {
  try {
    const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
    const j = await r.json();
    const n = Number(j?.data?.amount);
    return (Number.isFinite(n) && n > 0) ? n : null;
  } catch { return null; }
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

function dmMsg(name, sweepAsset, sweepUsd, rushTokens) {
  const usdStr = sweepUsd.toFixed(2);
  const assetLabel = sweepAsset === 'eth' ? 'ETH' : 'USDC';
  return `Hey ${name} — your PNPtv Wallet has $${usdStr} in ${assetLabel} sitting idle.

Turn it into ${rushTokens.toLocaleString()} Ru$h 💎 with a one-tap sweep — includes a +10% bonus. Ru$h works on any creator tip.

Open the 💎 wallet (bottom-right corner) → tap "Convert all".
${WALLET_URL}

1× per day.`.trim();
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DUST CONVERTER LAUNCH — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const DEDUP_KEY = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    try { await redis.connect(); } catch {}
    redis.on('error', () => {});
  }

  const ethUsd = await fetchEthUsd();
  console.log(` ETH spot: ${ethUsd ? `$${ethUsd.toFixed(2)}` : 'unavailable (ETH sweep skipped)'}\n`);

  const excludedPlaceholders = EXCLUDED_IDS.map((_, i) => `$${i + 1}`).join(',');
  const { rows: users } = await query(`
    SELECT u.id, u.username, u.first_name,
           COALESCE(u.preferred_wallet_address, u.wallet_address) AS wallet
    FROM users u
    WHERE COALESCE(u.preferred_wallet_address, u.wallet_address) IS NOT NULL
      AND char_length(COALESCE(u.preferred_wallet_address, u.wallet_address)) = 42
      AND u.is_deleted = false
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND u.id::text NOT IN (${excludedPlaceholders})
    ORDER BY u.created_at DESC
  `, EXCLUDED_IDS);

  console.log(` Users with linked wallets: ${users.length}`);
  console.log(' Scanning balances…\n');

  const stats = { checked: 0, eligible: 0, tooLow: 0, tooHigh: 0, sent: 0, err: 0 };

  for (const u of users) {
    stats.checked++;
    const first = String(u.first_name || '').trim().split(/\s+/)[0];
    const name = (first && first.length >= 2 && !/^\d+$/.test(first))
      ? first : (u.username || 'there');

    let usdc = 0, eth = 0;
    try {
      usdc = await readUsdc(u.wallet);
      await sleep(120);
      if (ethUsd != null) {
        eth = await readEth(u.wallet);
        await sleep(120);
      }
    } catch (err) {
      console.warn(` @${u.username || u.id} — balance error: ${err.message}`);
      stats.err++;
      continue;
    }

    // USDC takes priority; ETH only when USDC is empty
    let sweepAsset = null, sweepUsd = 0;
    if (usdc >= MIN_USD && usdc < THRESHOLD_USD) {
      sweepAsset = 'usdc';
      sweepUsd = Math.floor(usdc * 100) / 100;
    } else if (usdc <= 0 && ethUsd) {
      const ethSpendableUsd = Math.max(0, eth - ETH_RESERVE) * ethUsd;
      if (ethSpendableUsd >= MIN_USD && ethSpendableUsd < THRESHOLD_USD) {
        sweepAsset = 'eth';
        sweepUsd = Math.floor(ethSpendableUsd * 100) / 100;
      }
    }

    if (!sweepAsset) {
      if (usdc >= THRESHOLD_USD) stats.tooHigh++; else stats.tooLow++;
      continue;
    }

    stats.eligible++;
    const rushTokens = Math.floor(sweepUsd * 6 * BONUS);

    // Dedup check — skip anyone we've DM'd for this campaign in the last 30d.
    if (redis) {
      const seen = await redis.sismember(DEDUP_KEY, String(u.id));
      if (seen) {
        console.log(` @${u.username || u.id} — $${sweepUsd.toFixed(2)} ${sweepAsset.toUpperCase()} · SKIP (already DM'd)`);
        stats.sent = stats.sent; // no counter for skip, keep it visible via log
        continue;
      }
    }

    console.log(` @${u.username || u.id} — $${sweepUsd.toFixed(2)} ${sweepAsset.toUpperCase()} → ${rushTokens} Ru$h`);

    const body = dmMsg(name, sweepAsset, sweepUsd, rushTokens);
    if (DRY_RUN) {
      console.log(`   [DRY] DM → ${u.id}`);
    } else {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, body, query, {
          mediaUrl: HERO_URL, mediaType: 'image',
        });
        stats.sent++;
        if (redis) await redis.sadd(DEDUP_KEY, String(u.id));
        console.log(`   ✓ DM sent`);
      } catch (err) {
        console.warn(`   ✗ DM: ${err.message}`);
        stats.err++;
      }
      await sleep(200);
    }
  }

  if (redis) {
    await redis.expire(DEDUP_KEY, DEDUP_TTL_S);
    try { await redis.quit(); } catch {}
  }

  // ── Force-include Santino for verification ──────────────────────────────────
  if (!DRY_RUN) {
    try {
      const bodyForSantino = dmMsg('Santino', 'usdc', 4.60, Math.floor(4.60 * 6 * BONUS));
      await sendSystemDM(SYSTEM_SENDER, SANTINO_ID, bodyForSantino, query, {
        mediaUrl: HERO_URL, mediaType: 'image',
      });
      console.log('\n[CC] Verification DM sent to Santino');
    } catch (err) {
      console.warn('[CC] Santino DM failed:', err.message);
    }

    const summary = `[${CAMPAIGN}] Broadcast complete.\n\nChecked: ${stats.checked}\nEligible ($${MIN_USD}–$${THRESHOLD_USD} dust): ${stats.eligible}\nToo low: ${stats.tooLow}\nAbove threshold: ${stats.tooHigh}\nSent: ${stats.sent}\nErrors: ${stats.err}`;
    try {
      await sendSystemDM(SYSTEM_SENDER, SANTINO_ID, summary, query);
    } catch { /* non-fatal */ }
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` Checked:   ${stats.checked}`);
  console.log(` Eligible:  ${stats.eligible}   ($${MIN_USD}–$${THRESHOLD_USD} dust)`);
  console.log(` Too low:   ${stats.tooLow}`);
  console.log(` Too high:  ${stats.tooHigh}`);
  console.log(` Sent:      ${stats.sent}`);
  console.log(` Errors:    ${stats.err}`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message, err.stack);
  process.exit(1);
});
