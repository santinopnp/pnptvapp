#!/usr/bin/env node
'use strict';

/**
 * broadcast-privy-funded-wallets-20261019.js
 *
 * Live-scans Privy embedded wallets for USDC/ETH funds on Base + Ethereum
 * mainnet, then sends a language-aware in-app DM from Santino with a
 * one-tap buy-rush action button (no pre-crediting).
 *
 * Chains: Base (USDC + ETH), Ethereum mainnet (USDC + ETH).
 * Min balance: $1.00 USD (ignores dust).
 * ETH price: CoinGecko (fallback $2500).
 * Rate: 1 USD = 6 Ru$h.
 *
 * DRY RUN (default):
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-privy-funded-wallets-20261019.js
 *
 * LIVE:
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-privy-funded-wallets-20261019.js --live
 *
 * Dedup: broadcast_dedup, batch_id 'privy-funded-buy-rush-20261019'
 */

const path  = require('path');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { Pool } = require('/app/node_modules/pg');

// ── Config ─────────────────────────────────────────────────────────────────────

const DRY_RUN     = !process.argv.includes('--live');
const LIMIT_ARG   = process.argv.find(a => a.startsWith('--limit='));
const LIMIT       = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

const CAMPAIGN      = 'privy-funded-buy-rush-20261019';
const SANTINO_ID    = '8599671840';
const TOKEN_RATE    = 6;   // 1 USD = 6 Ru$h
const MIN_USD       = 1.00;

// Base chain
const BASE_RPC           = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const BASE_USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Ethereum mainnet
const ETH_RPC            = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const ETH_USDC_CONTRACT  = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const BATCH_SIZE  = 10;
const BATCH_DELAY = 500;
const PAGE_DELAY  = 100;
const DM_DELAY    = 80;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => lang && /^es/i.test(String(lang));

// ── Copy ──────────────────────────────────────────────────────────────────────

function rushAmount(usd) {
  return Math.floor(usd * TOKEN_RATE);
}

function fmtUsd(usd) {
  return usd % 1 === 0 ? usd.toFixed(0) : usd.toFixed(2);
}

function dmContent(lang, usd) {
  const rush = rushAmount(usd);
  const amt  = fmtUsd(usd);

  if (isEs(lang)) {
    return `💎 $${amt} esperándote en tu wallet

Convertilo en ${rush} Ru$h — tu acceso a propinas en vivo, contenido exclusivo y llamadas privadas con creadores. Un solo toque, listo.`;
  }
  return `💎 $${amt} waiting in your wallet

Turn it into ${rush} Ru$h — your key to live tips, exclusive content, and private creator calls. One tap, done.`;
}

function dmMeta(usd) {
  const amt = fmtUsd(usd);
  return {
    action: {
      type:      'buy-rush',
      amountUsd: parseFloat(fmtUsd(usd)),
      label:     `Convert $${amt} to Ru$h 💎`,
    },
  };
}

// ── Postgres ─────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString:      process.env.DATABASE_URL,
  max:                   5,
  idleTimeoutMillis:     10000,
  connectionTimeoutMillis: 5000,
});

async function dbQuery(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
                   headers: { 'Content-Type': 'application/json' } };
    const req  = https.request(opts, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Privy ─────────────────────────────────────────────────────────────────────

async function fetchAllPrivyUsers() {
  const auth     = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64');
  const users    = [];
  let   cursor   = null;
  let   page     = 0;

  const privyGet = (cursor) => new Promise((resolve, reject) => {
    const qs   = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const opts = {
      hostname: 'auth.privy.io',
      path:     `/api/v1/users${qs}`,
      method:   'GET',
      headers:  { Authorization: `Basic ${auth}`, 'privy-app-id': process.env.PRIVY_APP_ID,
                  'Content-Type': 'application/json' },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
                            catch { resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject);
    req.end();
  });

  while (true) {
    page++;
    process.stdout.write(`\r  Privy page ${page} (${users.length} so far)...`);
    const { status, body } = await privyGet(cursor);
    if (status !== 200) throw new Error(`Privy API ${status}: ${JSON.stringify(body)}`);
    users.push(...(body.data || []));
    cursor = body.next_cursor || null;
    if (!cursor) break;
    await sleep(PAGE_DELAY);
  }
  process.stdout.write('\n');
  return users;
}

// ── On-chain balances ─────────────────────────────────────────────────────────

function encodeBalanceOf(address) {
  return '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function rpcCall(rpcUrl, method, params) {
  const u    = new URL(rpcUrl);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  return new Promise((resolve, reject) => {
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
                   headers: { 'Content-Type': 'application/json',
                              'Content-Length': Buffer.byteLength(body) } };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getWalletBalances(address) {
  const [baseEthR, baseUsdcR, ethEthR, ethUsdcR] = await Promise.allSettled([
    rpcCall(BASE_RPC, 'eth_getBalance',  [address, 'latest']),
    rpcCall(BASE_RPC, 'eth_call',        [{ to: BASE_USDC_CONTRACT, data: encodeBalanceOf(address) }, 'latest']),
    rpcCall(ETH_RPC,  'eth_getBalance',  [address, 'latest']),
    rpcCall(ETH_RPC,  'eth_call',        [{ to: ETH_USDC_CONTRACT,  data: encodeBalanceOf(address) }, 'latest']),
  ]);
  const hex = r => (r.status === 'fulfilled' && r.value?.result && r.value.result !== '0x') ? BigInt(r.value.result) : BigInt(0);
  return { baseEth: hex(baseEthR), baseUsdc: hex(baseUsdcR), ethEth: hex(ethEthR), ethUsdc: hex(ethUsdcR) };
}

async function getEthPrice() {
  try {
    const body = await httpsGet('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const p    = body?.ethereum?.usd;
    if (typeof p === 'number' && p > 0) return p;
  } catch {}
  return 2500;
}

function totalUsd(balances, ethPrice) {
  const usdc = Number(balances.baseUsdc + balances.ethUsdc) / 1e6;
  const eth  = Number(balances.baseEth  + balances.ethEth)  / 1e18;
  return usdc + eth * ethPrice;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function lookupPlatformUser(privyId) {
  const { rows } = await dbQuery(
    `SELECT u.id, u.username, u.language
     FROM users u
     WHERE u.privy_id = $1
       AND u.deleted_at IS NULL
       AND COALESCE(u.tier, 'free') != 'banned'`,
    [privyId]
  );
  return rows[0] || null;
}

async function isAlreadySent(userId) {
  const { rows } = await dbQuery(
    `SELECT 1 FROM broadcast_dedup WHERE batch_id = $1 AND user_id = $2`,
    [CAMPAIGN, String(userId)]
  );
  return rows.length > 0;
}

async function sendActionDM(recipientId, usd, lang) {
  const content  = dmContent(lang, usd);
  const metaJson = JSON.stringify(dmMeta(usd));

  const [userA, userB] = [SANTINO_ID, String(recipientId)].sort();
  const senderIsA      = SANTINO_ID === userA;

  const { rows } = await dbQuery(
    `INSERT INTO direct_messages (sender_id, recipient_id, content, message_type, meta)
     VALUES ($1, $2, $3, 'text', $4::jsonb)
     RETURNING id`,
    [SANTINO_ID, String(recipientId), content, metaJson]
  );
  const msgId = rows[0].id;

  await dbQuery(
    `INSERT INTO dm_threads
       (user_a, user_b, last_message_at, last_message, last_message_id, unread_for_a, unread_for_b)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6)
     ON CONFLICT (user_a, user_b) DO UPDATE SET
       last_message_at = NOW(),
       last_message    = EXCLUDED.last_message,
       last_message_id = EXCLUDED.last_message_id,
       unread_for_a    = CASE WHEN dm_threads.user_a = $7 THEN 0
                              ELSE dm_threads.unread_for_a + 1 END,
       unread_for_b    = CASE WHEN dm_threads.user_b = $7 THEN 0
                              ELSE dm_threads.unread_for_b + 1 END`,
    [userA, userB, content.slice(0, 100), msgId,
     senderIsA ? 0 : 1, senderIsA ? 1 : 0, SANTINO_ID]
  );

  await dbQuery(
    `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [CAMPAIGN, String(recipientId)]
  );

  return msgId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' PRIVY FUNDED WALLETS — BUY-RUSH DM (one-tap)');
  console.log(` Campaign : ${CAMPAIGN}`);
  console.log(` Mode     : ${DRY_RUN ? 'DRY RUN (pass --live to send)' : '🚀 LIVE'}`);
  if (LIMIT) console.log(` Limit    : ${LIMIT}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  process.stdout.write('Fetching ETH price... ');
  const ethPrice = await getEthPrice();
  console.log(`$${ethPrice.toLocaleString()}/ETH\n`);

  console.log('Fetching Privy user list...');
  const privyUsers = await fetchAllPrivyUsers();
  console.log(`  Total Privy users : ${privyUsers.length}\n`);

  // Extract users with an embedded (Privy) wallet
  const walleted = privyUsers
    .map(pu => {
      const linked = Array.isArray(pu.linked_accounts) ? pu.linked_accounts : [];
      const wallet = linked.find(a => a.type === 'wallet' && a.wallet_client_type === 'privy');
      return wallet ? { privyId: pu.id, address: wallet.address } : null;
    })
    .filter(Boolean);

  console.log(`Users with embedded wallet : ${walleted.length}\n`);
  console.log('Checking balances...\n');

  const funded   = [];
  let   checked  = 0;

  for (let i = 0; i < walleted.length; i += BATCH_SIZE) {
    const batch   = walleted.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(u => getWalletBalances(u.address).then(b => ({ ...u, usd: totalUsd(b, ethPrice) })))
    );
    for (const r of results) {
      checked++;
      if (r.status === 'fulfilled' && r.value.usd >= MIN_USD) {
        funded.push(r.value);
      }
    }
    if ((i + BATCH_SIZE) % 100 === 0) {
      process.stdout.write(`\r  checked: ${checked}/${walleted.length}  funded >= $${MIN_USD}: ${funded.length}  `);
    }
    if (i + BATCH_SIZE < walleted.length) await sleep(BATCH_DELAY);
  }
  process.stdout.write('\n');
  console.log(`\n  Wallets >= $${MIN_USD} : ${funded.length}\n`);

  // Resolve to platform users, dedup
  const targets = [];
  for (const w of funded) {
    const u = await lookupPlatformUser(w.privyId);
    if (!u) continue;
    if (await isAlreadySent(u.id)) continue;
    targets.push({ ...u, usd: w.usd });
  }

  // Force-include Santino for QA if not already present
  if (!targets.some(t => String(t.id) === SANTINO_ID)) {
    const { rows } = await dbQuery(
      `SELECT id, username, language FROM users WHERE id::text = $1`, [SANTINO_ID]
    );
    if (rows[0]) targets.unshift({ ...rows[0], usd: 5.00, _qa: true });
  }

  const esCount = targets.filter(t => isEs(t.language)).length;
  const totalBalance = targets.reduce((s, t) => s + t.usd, 0);

  console.log('══════════════════════════════════════════════════════════════');
  console.log(` Targets  : ${targets.length}`);
  console.log(` ES / EN  : ${esCount} / ${targets.length - esCount}`);
  console.log(` Total $  : $${totalBalance.toFixed(2)}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    const sampleEs = targets.find(t => isEs(t.language));
    const sampleEn = targets.find(t => !isEs(t.language));
    if (sampleEs) {
      console.log(`[ES sample] @${sampleEs.username || sampleEs.id}  $${fmtUsd(sampleEs.usd)} → ${rushAmount(sampleEs.usd)} Ru$h`);
      console.log(dmContent('es', sampleEs.usd));
      console.log('Meta:', JSON.stringify(dmMeta(sampleEs.usd)));
      console.log('');
    }
    if (sampleEn) {
      console.log(`[EN sample] @${sampleEn.username || sampleEn.id}  $${fmtUsd(sampleEn.usd)} → ${rushAmount(sampleEn.usd)} Ru$h`);
      console.log(dmContent('en', sampleEn.usd));
      console.log('Meta:', JSON.stringify(dmMeta(sampleEn.usd)));
    }
    console.log(`\n-- DRY RUN — would DM ${targets.length} users. Pass --live to send. --\n`);
    await pool.end();
    process.exit(0);
  }

  const toSend = LIMIT ? targets.slice(0, LIMIT) : targets;
  let sent = 0, failed = 0;

  for (let i = 0; i < toSend.length; i++) {
    const t    = toSend[i];
    const lang = isEs(t.language) ? 'es' : 'en';
    try {
      await sendActionDM(t.id, t.usd, lang);
      sent++;
      console.log(`  ✓ [${i + 1}/${toSend.length}] @${t.username || t.id}  $${fmtUsd(t.usd)} → ${rushAmount(t.usd)} Ru$h${t._qa ? '  [QA]' : ''}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ @${t.username || t.id}  ${e.message}`);
    }
    await sleep(DM_DELAY);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(` DONE — ${CAMPAIGN}`);
  console.log(` Sent   : ${sent}`);
  console.log(` Failed : ${failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
