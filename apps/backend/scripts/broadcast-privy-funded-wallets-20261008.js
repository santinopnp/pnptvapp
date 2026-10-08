#!/usr/bin/env node
'use strict';

/**
 * broadcast-privy-funded-wallets-20261008.js
 *
 * Finds PNPtv users whose Privy embedded wallet holds more than $0.01 in crypto
 * (USDC or ETH across Base + Ethereum mainnet) and sends them an in-app DM from
 * Santino with a "buy-rush" action button so they can convert those funds to Ru$h.
 *
 * Chains checked: Base (USDC + ETH), Ethereum mainnet (USDC + ETH).
 * ETH price: CoinGecko (fallback $2500).
 *
 * Usage (isolated container — never docker exec on live bot):
 *
 *   # Dry run (default — no sends)
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-privy-funded-wallets-20261008.js
 *
 *   # Live run
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-privy-funded-wallets-20261008.js --live
 *
 * Dedup: broadcast_dedup, batch_id 'privy-funded-buy-rush-20261008'
 */

const path  = require('path');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { Pool } = require('/app/node_modules/pg');

// ── Config ─────────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes('--live');

const CAMPAIGN      = 'privy-funded-buy-rush-20261008';
const SANTINO_ID    = '8599671840';
const MIN_USD       = 0.01;
const PRIVY_BASE    = 'auth.privy.io';

// Base chain
const BASE_RPC          = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const BASE_USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Ethereum mainnet
const ETH_RPC           = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const ETH_USDC_CONTRACT  = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const BATCH_SIZE    = 10;
const BATCH_DELAY   = 500;
const PAGE_DELAY    = 100;

const DM_CONTENT = `💎 Your crypto wallet has funds

Convert them to Ru$h and spend them on PNPtv — tip creators, unlock exclusive content, book private calls.`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Postgres ───────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  // No SSL — internal Docker network
});

async function dbQuery(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// ── HTTP helpers (no external deps) ───────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', chunk => { b += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Privy API ─────────────────────────────────────────────────────────────────

async function privyRequest(path, cursor) {
  const fullPath = cursor
    ? `/api/v1/users?limit=100&cursor=${encodeURIComponent(cursor)}`
    : '/api/v1/users?limit=100';

  const auth = Buffer.from(
    `${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`
  ).toString('base64');

  return httpsPost(PRIVY_BASE, fullPath, undefined, {
    Authorization: `Basic ${auth}`,
    'privy-app-id': process.env.PRIVY_APP_ID,
    'Content-Length': '0',
  }).catch(async () => {
    // GET method needed — rebuild with https.get-style request
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: PRIVY_BASE,
        path: fullPath,
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'privy-app-id': process.env.PRIVY_APP_ID,
          'Content-Type': 'application/json',
        },
      };
      const req = https.request(opts, res => {
        let b = '';
        res.on('data', c => { b += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
          catch { resolve({ status: res.statusCode, body: b }); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  });
}

async function fetchAllPrivyUsers() {
  const users = [];
  let cursor = null;
  let page = 0;

  // Use GET via httpsGet-style — rebuild properly
  const auth = Buffer.from(
    `${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`
  ).toString('base64');

  const privyGet = (cursor) => new Promise((resolve, reject) => {
    const qs = cursor
      ? `?limit=100&cursor=${encodeURIComponent(cursor)}`
      : '?limit=100';
    const opts = {
      hostname: PRIVY_BASE,
      path: `/api/v1/users${qs}`,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'privy-app-id': process.env.PRIVY_APP_ID,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    req.on('error', reject);
    req.end();
  });

  while (true) {
    page++;
    process.stdout.write(`\r  Fetching Privy page ${page} (${users.length} users so far)...`);

    const { status, body } = await privyGet(cursor);
    if (status !== 200) {
      throw new Error(`Privy API error ${status}: ${JSON.stringify(body)}`);
    }

    const batch = body.data || [];
    users.push(...batch);

    cursor = body.next_cursor || null;
    if (!cursor) break;

    await sleep(PAGE_DELAY);
  }

  process.stdout.write('\n');
  return users;
}

// ── Balance checking (Alchemy JSON-RPC) ───────────────────────────────────────

function encodeBalanceOfCall(address) {
  // ABI encode: balanceOf(address) = 0x70a08231 + address zero-padded to 32 bytes
  const addr = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return '0x70a08231' + addr;
}

async function rpcCall(rpcUrl, method, params) {
  const u = new URL(rpcUrl);
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(b)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function hexToDecimal(hex) {
  if (!hex || hex === '0x') return BigInt(0);
  return BigInt(hex);
}

async function getWalletBalances(address) {
  const [baseEthRes, baseUsdcRes, ethEthRes, ethUsdcRes] = await Promise.allSettled([
    rpcCall(BASE_RPC, 'eth_getBalance', [address, 'latest']),
    rpcCall(BASE_RPC, 'eth_call', [
      { to: BASE_USDC_CONTRACT, data: encodeBalanceOfCall(address) },
      'latest',
    ]),
    rpcCall(ETH_RPC, 'eth_getBalance', [address, 'latest']),
    rpcCall(ETH_RPC, 'eth_call', [
      { to: ETH_USDC_CONTRACT, data: encodeBalanceOfCall(address) },
      'latest',
    ]),
  ]);

  const baseEth  = baseEthRes.status  === 'fulfilled' ? hexToDecimal(baseEthRes.value?.result)  : BigInt(0);
  const baseUsdc = baseUsdcRes.status === 'fulfilled' ? hexToDecimal(baseUsdcRes.value?.result) : BigInt(0);
  const ethEth   = ethEthRes.status   === 'fulfilled' ? hexToDecimal(ethEthRes.value?.result)   : BigInt(0);
  const ethUsdc  = ethUsdcRes.status  === 'fulfilled' ? hexToDecimal(ethUsdcRes.value?.result)  : BigInt(0);

  return { baseEth, baseUsdc, ethEth, ethUsdc };
}

async function getEthPrice() {
  try {
    const { body } = await httpsGet(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );
    const price = body?.ethereum?.usd;
    if (typeof price === 'number' && price > 0) return price;
  } catch {}
  return 2500;
}

function computeTotalUsd(balances, ethPrice) {
  const usdcTotal = Number(balances.baseUsdc + balances.ethUsdc) / 1e6;
  const ethTotal  = Number(balances.baseEth + balances.ethEth) / 1e18;
  return usdcTotal + ethTotal * ethPrice;
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function lookupPlatformUser(privyId) {
  const { rows } = await dbQuery(
    `SELECT id, username FROM users WHERE privy_id = $1 AND deleted_at IS NULL`,
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

async function recordDedup(userId) {
  await dbQuery(
    `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [CAMPAIGN, String(userId)]
  );
}

async function sendActionDM(recipientId, totalUsd) {
  const amountUsd = Math.round(totalUsd * 100) / 100;
  const metaObj = {
    action: {
      type: 'buy-rush',
      amountUsd,
      label: `Convert $${amountUsd.toFixed(2)} to Ru$h 💎`,
    },
  };

  // Insert direct_messages with meta (cannot use sendSystemDM — it doesn't support meta)
  const { rows: dmRows } = await dbQuery(
    `INSERT INTO direct_messages (sender_id, recipient_id, content, message_type, meta)
     VALUES ($1, $2, $3, 'text', $4::jsonb)
     RETURNING id`,
    [SANTINO_ID, recipientId, DM_CONTENT, JSON.stringify(metaObj)]
  );
  const messageId = dmRows[0].id;

  // Upsert dm_threads (user_a < user_b enforced by CHECK constraint)
  const [userA, userB] = [SANTINO_ID, recipientId].sort();
  const senderIsA = SANTINO_ID === userA;

  // unread_for_a/b: the *recipient* (not sender) gets the increment
  await dbQuery(
    `INSERT INTO dm_threads (user_a, user_b, last_message_at, last_message, last_message_id, unread_for_a, unread_for_b)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6)
     ON CONFLICT (user_a, user_b) DO UPDATE SET
       last_message_at = NOW(),
       last_message    = EXCLUDED.last_message,
       last_message_id = EXCLUDED.last_message_id,
       unread_for_a    = CASE WHEN dm_threads.user_a = $7 THEN 0
                              ELSE dm_threads.unread_for_a + 1 END,
       unread_for_b    = CASE WHEN dm_threads.user_b = $7 THEN 0
                              ELSE dm_threads.unread_for_b + 1 END`,
    [
      userA,
      userB,
      DM_CONTENT.slice(0, 100),
      messageId,
      senderIsA ? 0 : 1,          // unread_for_a (0 if A is sender)
      senderIsA ? 1 : 0,          // unread_for_b (0 if B is sender)
      SANTINO_ID,                 // $7 — identifies the sender for CASE logic
    ]
  );

  return messageId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' PRIVY FUNDED WALLETS — BUY-RUSH DM');
  console.log(` Campaign : ${CAMPAIGN}`);
  console.log(` Mode     : ${DRY_RUN ? 'DRY RUN (pass --live to send)' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // 1. Fetch ETH price
  process.stdout.write('Fetching ETH price... ');
  const ethPrice = await getEthPrice();
  console.log(`$${ethPrice.toLocaleString()}/ETH\n`);

  // 2. Paginate through all Privy users
  console.log('Fetching Privy user list...');
  const privyUsers = await fetchAllPrivyUsers();
  console.log(`  Total Privy users: ${privyUsers.length}\n`);

  // 3. Extract users with an embedded (Privy) wallet
  const walleted = [];
  for (const pu of privyUsers) {
    const linked = Array.isArray(pu.linked_accounts) ? pu.linked_accounts : [];
    const wallet = linked.find(
      a => a.type === 'wallet' && a.wallet_client_type === 'privy'
    );
    if (wallet && wallet.address) {
      walleted.push({ privyId: pu.id, address: wallet.address });
    }
  }
  console.log(`Users with embedded wallet: ${walleted.length}\n`);

  // 4. Batch balance checks
  console.log('Checking wallet balances...\n');

  const stats = {
    users_checked: 0,
    funded: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (let batchStart = 0; batchStart < walleted.length; batchStart += BATCH_SIZE) {
    const batch = walleted.slice(batchStart, batchStart + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(u => getWalletBalances(u.address).then(b => ({ ...u, balances: b })))
    );

    for (const result of results) {
      stats.users_checked++;

      if (result.status === 'rejected') {
        stats.failed++;
        console.log(`  ERR balance check: ${result.reason?.message || result.reason}`);
        continue;
      }

      const { privyId, address, balances } = result.value;
      const totalUsd = computeTotalUsd(balances, ethPrice);

      if (totalUsd <= MIN_USD) {
        // Silent skip — too many near-zero wallets to log each one
        continue;
      }

      stats.funded++;
      const label = `$${totalUsd.toFixed(2)}`;

      // Look up platform account
      let platformUser;
      try {
        platformUser = await lookupPlatformUser(privyId);
      } catch (err) {
        stats.failed++;
        console.log(`  ERR DB lookup privy:${privyId}: ${err.message}`);
        continue;
      }

      if (!platformUser) {
        stats.skipped++;
        console.log(`  SKIP ${label} privy:${privyId.slice(0, 16)}… (no platform account)`);
        continue;
      }

      // Dedup check
      let alreadySent = false;
      try {
        alreadySent = await isAlreadySent(platformUser.id);
      } catch (err) {
        stats.failed++;
        console.log(`  ERR dedup check @${platformUser.username || platformUser.id}: ${err.message}`);
        continue;
      }

      if (alreadySent) {
        stats.skipped++;
        console.log(`  SKIP ${label} @${platformUser.username || platformUser.id} (already sent)`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY] OK @${platformUser.username || platformUser.id} ${label}`);
        stats.sent++;
        continue;
      }

      // Send DM
      try {
        await sendActionDM(platformUser.id, totalUsd);
        await recordDedup(platformUser.id);
        stats.sent++;
        console.log(`  OK @${platformUser.username || platformUser.id} ${label}`);
      } catch (err) {
        stats.failed++;
        console.log(`  ERR @${platformUser.username || platformUser.id}: ${err.message}`);
      }
    }

    if (batchStart + BATCH_SIZE < walleted.length) {
      await sleep(BATCH_DELAY);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(` DONE — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(` users_checked : ${stats.users_checked}`);
  console.log(` funded        : ${stats.funded}`);
  console.log(` sent          : ${stats.sent}`);
  console.log(` skipped       : ${stats.skipped}`);
  console.log(` failed        : ${stats.failed}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
