#!/usr/bin/env node
'use strict';

/**
 * x-delete-all-tweets-20260923.js
 *
 * Deletes every tweet from @pnplatinoboy (OAuth 1.0a) and
 * @PNPTelevision / @pnptvapp (OAuth 2.0) using the encrypted
 * tokens already stored in x_accounts.
 *
 * Fetches up to 3,200 tweets per account (X API v2 limit on timeline),
 * deletes in batches of 50 with a 15-second cooldown between batches
 * to respect rate limits.
 *
 * Usage (isolated container — REQUIRED):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e ENCRYPTION_KEY="$(docker exec pnptv-bot printenv ENCRYPTION_KEY)" \
 *     -e LEX_CONSUMER_KEY="$(docker exec pnptv-bot printenv LEX_CONSUMER_KEY)" \
 *     -e LEX_CONSUMER_SECRET="$(docker exec pnptv-bot printenv LEX_CONSUMER_SECRET)" \
 *     -e PNPTV_CONSUMER_KEY="$(docker exec pnptv-bot printenv PNPTV_CONSUMER_KEY)" \
 *     -e PNPTV_CONSUMER_SECRET="$(docker exec pnptv-bot printenv PNPTV_CONSUMER_SECRET)" \
 *     -e PNPTV_CLIENT_ID="$(docker exec pnptv-bot printenv PNPTV_CLIENT_ID)" \
 *     -e PNPTV_CLIENT_SECRET="$(docker exec pnptv-bot printenv PNPTV_CLIENT_SECRET)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/x-delete-all-tweets-20260923.js --dry-run
 *
 * Live run: remove --dry-run
 * Single account: add --account pnplatinoboy  OR  --account PNPTelevision
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PaymentSecurityService        = require(path.join(BACKEND, 'services/paymentSecurityService'));
const { buildAuthHeader }           = require(path.join(BACKEND, 'services/xOAuth1Service'));
const axios                         = require('axios');

const DRY_RUN         = process.argv.includes('--dry-run');
const ONLY_HANDLE     = (() => { const i = process.argv.indexOf('--account'); return i !== -1 ? process.argv[i + 1] : null; })();
const TARGET_HANDLES  = ['pnplatinoboy', 'PNPTelevision'];
const X_API           = 'https://api.twitter.com/2';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Token helpers ─────────────────────────────────────────────────────────────

function decryptToken(encrypted) {
  if (!encrypted) return null;
  try {
    const d = PaymentSecurityService.decryptSensitiveData(encrypted);
    return d?.accessToken || d?.token || null;
  } catch { return null; }
}

async function getOAuth2Token(account) {
  const d = PaymentSecurityService.decryptSensitiveData(account.encrypted_access_token);
  // d = { accessToken, tokenType, scope, expiresAt }
  const accessToken = d?.accessToken;
  const expiresAt   = d?.expiresAt ? new Date(d.expiresAt) : null;
  const isExpired   = expiresAt && expiresAt < new Date(Date.now() + 60_000);

  if (accessToken && !isExpired) return accessToken;

  // Refresh
  const ref = (account.consumer_key_ref || 'generic').toUpperCase();
  const clientId     = process.env[`${ref}_CLIENT_ID`]     || process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env[`${ref}_CLIENT_SECRET`] || process.env.TWITTER_CLIENT_SECRET;

  let refreshToken;
  try {
    const rd = PaymentSecurityService.decryptSensitiveData(account.encrypted_refresh_token);
    refreshToken = rd?.refreshToken || account.encrypted_refresh_token;
  } catch { refreshToken = null; }

  if (!refreshToken) throw new Error(`No refresh token for @${account.handle}`);
  if (!clientId)     throw new Error(`No client_id for ref=${ref}`);

  const payload = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  const res = await axios.post('https://api.twitter.com/2/oauth2/token', payload.toString(), { headers, timeout: 15000 });
  return res.data.access_token;
}

// ── X API helpers ──────────────────────────────────────────────────────────────

async function fetchAllTweetIds(account, credentials) {
  const userId   = account.x_user_id;
  const isOAuth1 = account.oauth_version === '1.0a';
  let paginationToken = null;
  const ids = [];

  console.log(`  Fetching tweets for @${account.handle} (user_id=${userId})…`);

  while (true) {
    const params = new URLSearchParams({
      max_results: '100',
      'tweet.fields': 'id',
      exclude: 'replies',   // fetch main + retweets; skip replies for now
    });
    if (paginationToken) params.set('pagination_token', paginationToken);

    const url = `${X_API}/users/${userId}/tweets?${params}`;
    let res;

    try {
      if (isOAuth1) {
        const auth = buildAuthHeader('GET', `${X_API}/users/${userId}/tweets`, Object.fromEntries(params), credentials);
        res = await axios.get(url, { headers: { Authorization: auth }, timeout: 15000 });
      } else {
        res = await axios.get(url, { headers: { Authorization: `Bearer ${credentials.bearerToken}` }, timeout: 15000 });
      }
    } catch (err) {
      const status = err?.response?.status;
      const data   = err?.response?.data;
      console.error(`  ❌ fetchTweets error (${status}):`, JSON.stringify(data));
      if (status === 429) { console.log('  Rate-limited on fetch. Waiting 60s…'); await sleep(60_000); continue; }
      break;
    }

    const tweets = res.data?.data || [];
    ids.push(...tweets.map(t => t.id));
    console.log(`  → fetched ${tweets.length} (total so far: ${ids.length})`);

    paginationToken = res.data?.meta?.next_token;
    if (!paginationToken || tweets.length === 0) break;
    await sleep(1000);
  }

  // Also fetch replies separately (they're excluded above for simplicity)
  // X API v2 can include them if we drop the `exclude` param
  // Fetch another pass with replies included to catch any missed
  paginationToken = null;
  console.log(`  Fetching replies for @${account.handle}…`);

  while (true) {
    const params = new URLSearchParams({ max_results: '100', 'tweet.fields': 'id' });
    if (paginationToken) params.set('pagination_token', paginationToken);

    const url = `${X_API}/users/${userId}/tweets?${params}`;
    let res;

    try {
      if (isOAuth1) {
        const auth = buildAuthHeader('GET', `${X_API}/users/${userId}/tweets`, Object.fromEntries(params), credentials);
        res = await axios.get(url, { headers: { Authorization: auth }, timeout: 15000 });
      } else {
        res = await axios.get(url, { headers: { Authorization: `Bearer ${credentials.bearerToken}` }, timeout: 15000 });
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) { console.log('  Rate-limited on fetch. Waiting 60s…'); await sleep(60_000); continue; }
      break;
    }

    const tweets = res.data?.data || [];
    const newIds = tweets.map(t => t.id).filter(id => !ids.includes(id));
    ids.push(...newIds);
    if (newIds.length > 0) console.log(`  → ${newIds.length} additional (total: ${ids.length})`);

    paginationToken = res.data?.meta?.next_token;
    if (!paginationToken || tweets.length === 0) break;
    await sleep(1000);
  }

  return [...new Set(ids)];
}

async function deleteTweet(tweetId, account, credentials) {
  const isOAuth1 = account.oauth_version === '1.0a';
  const url = `${X_API}/tweets/${tweetId}`;

  try {
    let res;
    if (isOAuth1) {
      const auth = buildAuthHeader('DELETE', url, {}, credentials);
      res = await axios.delete(url, { headers: { Authorization: auth }, timeout: 10000 });
    } else {
      res = await axios.delete(url, { headers: { Authorization: `Bearer ${credentials.bearerToken}` }, timeout: 10000 });
    }
    return { ok: true, data: res.data };
  } catch (err) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    return { ok: false, status, data };
  }
}

// ── Process one account ───────────────────────────────────────────────────────

async function processAccount(handle) {
  const { rows } = await query(
    `SELECT account_id, handle, oauth_version, x_user_id, consumer_key_ref,
            encrypted_access_token, encrypted_refresh_token, encrypted_access_token_secret,
            is_active
     FROM x_accounts WHERE handle = $1 LIMIT 1`,
    [handle]
  );

  if (!rows.length) { console.log(`  ⚠️  @${handle} not found in x_accounts`); return; }
  const account = rows[0];

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  @${account.handle}  |  OAuth ${account.oauth_version}  |  uid=${account.x_user_id}`);
  console.log(`  active=${account.is_active}  |  consumer_key_ref=${account.consumer_key_ref}`);
  console.log(`${'═'.repeat(65)}`);

  let credentials;

  if (account.oauth_version === '1.0a') {
    const ref            = (account.consumer_key_ref || 'generic').toUpperCase();
    const consumerKey    = process.env[`${ref}_CONSUMER_KEY`]    || process.env.TWITTER_CONSUMER_KEY;
    const consumerSecret = process.env[`${ref}_CONSUMER_SECRET`] || process.env.TWITTER_CONSUMER_SECRET;
    const accessToken    = decryptToken(account.encrypted_access_token);
    const tokenSecret    = decryptToken(account.encrypted_access_token_secret);

    if (!consumerKey)  { console.error(`  ❌ Missing ${ref}_CONSUMER_KEY`); return; }
    if (!accessToken)  { console.error(`  ❌ Could not decrypt access token`); return; }
    if (!tokenSecret)  { console.error(`  ❌ Could not decrypt token secret`); return; }

    credentials = { consumerKey, consumerSecret, accessToken, tokenSecret };
    console.log(`  ✅ OAuth 1.0a credentials ready (key: ${consumerKey.substring(0,6)}…)`);
  } else {
    // OAuth 2.0
    try {
      const bearerToken = await getOAuth2Token(account);
      credentials = { bearerToken };
      console.log(`  ✅ OAuth 2.0 token ready`);
    } catch (err) {
      console.error(`  ❌ Could not get OAuth2 token: ${err.message}`);
      return;
    }
  }

  const tweetIds = await fetchAllTweetIds(account, credentials);
  console.log(`\n  Total tweets to delete: ${tweetIds.length}`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would delete ${tweetIds.length} tweets.`);
    if (tweetIds.length > 0) console.log(`  Sample IDs: ${tweetIds.slice(0, 5).join(', ')}…`);
    return;
  }

  if (tweetIds.length === 0) {
    console.log(`  Nothing to delete.`);
    return;
  }

  let deleted = 0, failed = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < tweetIds.length; i++) {
    const id = tweetIds[i];
    const result = await deleteTweet(id, account, credentials);

    if (result.ok) {
      deleted++;
      process.stdout.write(`\r  Deleted: ${deleted} / ${tweetIds.length}  (failed: ${failed})`);
    } else {
      failed++;
      if (result.status === 404) {
        // Already deleted — fine
      } else if (result.status === 429) {
        console.log(`\n  Rate limited after ${deleted} deletes. Waiting 15 min…`);
        await sleep(15 * 60 * 1000);
        // Retry this tweet
        i--;
        continue;
      } else {
        console.log(`\n  ❌ Failed ${id}: status=${result.status} ${JSON.stringify(result.data)}`);
      }
    }

    // Batch pause: after every 50 deletes, pause 15s to stay within rate limits
    if ((i + 1) % BATCH_SIZE === 0 && i < tweetIds.length - 1) {
      console.log(`\n  Batch pause (50 done)… waiting 15s`);
      await sleep(15_000);
    } else {
      await sleep(300); // ~300ms between individual deletes
    }
  }

  console.log(`\n\n  ✅ @${account.handle} done: ${deleted} deleted, ${failed} failed`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const targets = ONLY_HANDLE
    ? TARGET_HANDLES.filter(h => h.toLowerCase() === ONLY_HANDLE.toLowerCase())
    : TARGET_HANDLES;

  if (!targets.length) {
    console.error(`Unknown --account value. Use: pnplatinoboy  or  PNPTelevision`);
    process.exit(1);
  }

  console.log('\n  PNPtv — Delete all X tweets');
  console.log(`  Accounts  : ${targets.join(', ')}`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE — THIS IS IRREVERSIBLE'}\n`);

  for (const handle of targets) {
    await processAccount(handle);
  }

  console.log('\n  All done.\n');
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
