#!/usr/bin/env node
'use strict';

/**
 * send-x-dm-invite-all-inbox-2026-10-19.js
 *
 * Walks the FULL DM inbox of @PNPtvApp (OAuth 2.0, consumer_key_ref='pnptv')
 * via X API v2 /2/dm_events, builds the set of unique counterparts, detects
 * language per counterpart from their last message, and sends a single
 * invite DM pointing to https://pnptv.app.
 *
 * Dedup is file-based (apps/backend/.cache/x-dm-invite-sent.json) so re-runs
 * only hit new conversations.
 *
 * DEFAULT = dry-run. Pass --live to actually send.
 *
 * Usage:
 *   # dry-run (safe default — reads inbox, prints EN/ES split + previews, no send)
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e X_PNPTVAPP_BEARER='<oauth2 user token w/ dm.read dm.write>' \
 *     -v /opt/pnptvapp/apps/backend/scripts/send-x-dm-invite-all-inbox-2026-10-19.js:/app/apps/backend/scripts/send-x-dm-invite-all-inbox-2026-10-19.js:ro \
 *     -v /opt/pnptvapp/apps/backend/.cache:/app/apps/backend/.cache \
 *     pnptv-bot:latest node /app/apps/backend/scripts/send-x-dm-invite-all-inbox-2026-10-19.js
 *
 *   # backfill cache with current counterparts WITHOUT sending (post-send recovery)
 *   docker run … --mark-sent
 *
 *   # live send (requires: cache dir writable + no _lock key in cache file)
 *   docker run … --live
 *   docker run … --limit=5 --live    # sanity check first
 *
 * BROADCAST RULES ENFORCED:
 *   - must run via `docker run` (NOT docker exec pnptv-bot) — otherwise a parallel
 *     session restarting the bot container kills the send mid-flight.
 *   - cache dir must be host-mounted and writable so dedup survives re-runs.
 *   - script refuses --live if `_lock` key present in cache file.
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const db = require(path.join(BACKEND, 'utils/db'));
const XPostService = require(path.join(BACKEND, 'services/xPostService'));

const LIVE = process.argv.includes('--live');
const MARK_SENT = process.argv.includes('--mark-sent'); // backfill cache without sending
const DRY_RUN = !LIVE && !MARK_SENT;
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;

const ACCOUNT_HANDLE = 'PNPtvApp';
const CACHE_DIR = path.join(BACKEND, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'x-dm-invite-sent.json');

// Safety: refuse to send if cache is unwritable. 2026-10-19 run went live without
// a working cache; without this check a re-run of --live silently duplicates DMs.
function assertCacheWritable() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const probe = path.join(CACHE_DIR, '.probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
  } catch (err) {
    console.error(`\n❌ FATAL: ${CACHE_DIR} is not writable (${err.code}). Refusing to send without durable dedup.`);
    console.error('   Fix: chmod 777 the .cache dir on host, or mount it writable in docker run.');
    process.exit(1);
  }
}

const PACE_MS = 10_000;          // 10s between sends → ~90/15min, well under 1000/24h
const BACKOFF_MS = 5 * 60_000;   // 5min backoff on 429

const INVITE_EN =
  "hey — if you ever wondered what we actually do, it all lives at https://pnptv.app. exclusive content, live streams, private creator calls. come through.";
const INVITE_ES =
  "oye — si alguna vez te preguntaste qué hacemos realmente, todo está en https://pnptv.app. contenido exclusivo, lives, llamadas privadas con creadores. pásate.";

// Rough but good-enough ES detector: common Spanish markers that are unlikely
// to appear in English text. If any match → ES, else EN.
const ES_RE = /\b(qué|cómo|hola|gracias|chico|puedo|dónde|más|sí|cuánto|cuanto|cuándo|cuando|por\s*favor|amigo|cariño|guapo|dime|pásame|cuéntame|quiero|quieres|tienes|estás|estas|español|precio|hablas|holaa+|hermano|papi)\b/i;
const ES_CHARS = /[ñ¿¡]/;

function detectLang(text) {
  if (!text) return 'en';
  if (ES_CHARS.test(text) || ES_RE.test(text)) return 'es';
  return 'en';
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return { sent: {} };
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (err) {
    console.error('⚠️  Cache read failed, starting empty:', err.message);
    return { sent: {} };
  }
}

function saveCache(cache) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('⚠️  Cache write failed:', err.message);
  }
}

async function getAccount() {
  const { rows } = await db.query(
    `SELECT account_id, handle, oauth_version, consumer_key_ref,
            encrypted_access_token, encrypted_refresh_token,
            encrypted_access_token_secret, token_expires_at, x_user_id
       FROM x_accounts WHERE handle = $1 LIMIT 1`,
    [ACCOUNT_HANDLE]
  );
  if (!rows[0]) throw new Error(`X account @${ACCOUNT_HANDLE} not found in DB`);
  return rows[0];
}

async function getMe(accessToken) {
  const res = await axios.get('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15_000,
  });
  return res.data.data; // { id, name, username }
}

async function lookupUser(id, accessToken) {
  try {
    const res = await axios.get(`https://api.twitter.com/2/users/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15_000,
    });
    return res.data.data;
  } catch {
    return { id, username: '(unknown)' };
  }
}

// Walk every MessageCreate event in the inbox. Returns Map<senderId, {lastText, lastAt, convoId}>.
async function collectCounterparts(accessToken, myId) {
  const counterparts = new Map();
  let token = null;
  let page = 0;
  let totalEvents = 0;

  do {
    page++;
    const params = {
      max_results: 100,
      event_types: 'MessageCreate',
      'dm_event.fields': 'sender_id,text,created_at,dm_conversation_id',
    };
    if (token) params.pagination_token = token;

    let res;
    try {
      res = await axios.get('https://api.twitter.com/2/dm_events', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
        timeout: 20_000,
      });
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;
      if (status === 429) {
        console.log(`⏳ 429 on page ${page}, backing off ${BACKOFF_MS / 1000}s…`);
        await new Promise((r) => setTimeout(r, BACKOFF_MS));
        continue;
      }
      throw new Error(`dm_events page ${page} failed: ${status} ${JSON.stringify(body)}`);
    }

    const events = res.data.data || [];
    totalEvents += events.length;
    for (const ev of events) {
      if (!ev.sender_id || ev.sender_id === myId) continue;
      const existing = counterparts.get(ev.sender_id);
      // keep the most recent text we have from them
      if (!existing || new Date(ev.created_at) > new Date(existing.lastAt)) {
        counterparts.set(ev.sender_id, {
          lastText: ev.text || '',
          lastAt: ev.created_at,
          convoId: ev.dm_conversation_id,
        });
      }
    }

    token = res.data.meta?.next_token || null;
    process.stdout.write(`\r📥 page ${page} — events scanned: ${totalEvents} — unique counterparts: ${counterparts.size}  `);

    if (token) await new Promise((r) => setTimeout(r, 1500)); // light pacing between pages
  } while (token);

  process.stdout.write('\n');
  return counterparts;
}

async function sendDM(recipientId, text, accessToken) {
  const res = await axios.post(
    `https://api.twitter.com/2/dm_conversations/with/${recipientId}/messages`,
    { text },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 20_000,
    }
  );
  return res.data;
}

async function main() {
  console.log(`\n🦋 X DM Inbox Invite — @${ACCOUNT_HANDLE} [${DRY_RUN ? 'DRY RUN' : 'LIVE'}]`);
  if (LIMIT) console.log(`   limit: ${LIMIT} sends`);
  console.log('');

  if (LIVE) {
    assertCacheWritable();
    const existing = loadCache();
    if (existing._lock) {
      console.error(`\n❌ FATAL: cache has active _lock — refusing to --live.`);
      console.error(`   reason:   ${existing._lock.reason}`);
      console.error(`   set_at:   ${existing._lock.set_at}`);
      console.error(`   clear_by: ${existing._lock.clear_by}`);
      console.error(`   file:     ${CACHE_FILE}`);
      process.exit(1);
    }
  }

  let accessToken;
  if (process.env.X_PNPTVAPP_BEARER) {
    accessToken = process.env.X_PNPTVAPP_BEARER;
    console.log('🔑 using X_PNPTVAPP_BEARER env override (bypassing DB token)');
  } else {
    const account = await getAccount();
    accessToken = await XPostService.getValidAccessToken(account);
  }
  const me = await getMe(accessToken);
  console.log(`🔑 authenticated as @${me.username} (id ${me.id})`);

  console.log('\n📥 scanning full DM inbox…');
  const counterparts = await collectCounterparts(accessToken, me.id);
  console.log(`✅ found ${counterparts.size} unique counterparts across the inbox`);

  const cache = loadCache();
  cache.sent = cache.sent || {};

  const pending = [];
  const skippedCache = [];
  for (const [senderId, info] of counterparts) {
    if (cache.sent[senderId]) {
      skippedCache.push(senderId);
      continue;
    }
    pending.push({ senderId, ...info, lang: detectLang(info.lastText) });
  }

  console.log(`   • already-sent (cache): ${skippedCache.length}`);
  console.log(`   • pending:              ${pending.length}`);

  const byLang = pending.reduce((acc, p) => ((acc[p.lang] = (acc[p.lang] || 0) + 1), acc), {});
  console.log(`   • lang split:           ${JSON.stringify(byLang)}`);

  if (MARK_SENT) {
    assertCacheWritable();
    const nowIso = new Date().toISOString();
    let marked = 0;
    for (const p of pending) {
      cache.sent[p.senderId] = { at: nowIso, lang: p.lang, backfilled: true };
      marked++;
    }
    // Keep _lock so prod stays safe until operator removes it explicitly
    saveCache(cache);
    console.log(`\n📒 MARK-SENT — ${marked} counterparts added to cache (no DMs sent). File: ${CACHE_FILE}`);
    console.log(`   Note: remove the "_lock" key from the cache file manually before next --live.`);
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — sample previews:');
    const sampleEs = pending.find((p) => p.lang === 'es');
    const sampleEn = pending.find((p) => p.lang === 'en');
    if (sampleEs) {
      const u = await lookupUser(sampleEs.senderId, accessToken);
      console.log(`\n   [ES] → @${u.username} (last msg: "${(sampleEs.lastText || '').slice(0, 80)}")`);
      console.log(`         "${INVITE_ES}"`);
    }
    if (sampleEn) {
      const u = await lookupUser(sampleEn.senderId, accessToken);
      console.log(`\n   [EN] → @${u.username} (last msg: "${(sampleEn.lastText || '').slice(0, 80)}")`);
      console.log(`         "${INVITE_EN}"`);
    }
    console.log(`\n🧪 DRY RUN — nothing sent. Re-run with --live to actually DM ${pending.length} people.`);
    process.exit(0);
  }

  const toSend = LIMIT ? pending.slice(0, LIMIT) : pending;
  console.log(`\n🚀 LIVE — sending ${toSend.length} DMs (pacing ${PACE_MS / 1000}s)…`);

  let sent = 0;
  let failed = 0;
  let rateLimited = 0;

  for (const p of toSend) {
    const copy = p.lang === 'es' ? INVITE_ES : INVITE_EN;
    try {
      await sendDM(p.senderId, copy, accessToken);
      cache.sent[p.senderId] = { at: new Date().toISOString(), lang: p.lang };
      saveCache(cache);
      sent++;
      if (sent % 10 === 0) console.log(`   … ${sent}/${toSend.length} sent`);
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;
      if (status === 429) {
        rateLimited++;
        console.log(`⏳ 429 after ${sent} sends — backing off ${BACKOFF_MS / 1000}s and retrying this one…`);
        await new Promise((r) => setTimeout(r, BACKOFF_MS));
        try {
          await sendDM(p.senderId, copy, accessToken);
          cache.sent[p.senderId] = { at: new Date().toISOString(), lang: p.lang };
          saveCache(cache);
          sent++;
        } catch (err2) {
          failed++;
          console.error(`   ❌ ${p.senderId} retry failed: ${err2.response?.status} ${JSON.stringify(err2.response?.data)}`);
        }
      } else {
        failed++;
        console.error(`   ❌ ${p.senderId}: ${status} ${JSON.stringify(body)}`);
        // Common failure modes: 403 (user has DMs closed / blocked us), 404 (deleted user).
        // Mark as "sent" in cache so we don't retry forever.
        cache.sent[p.senderId] = { at: new Date().toISOString(), lang: p.lang, error: `${status}` };
        saveCache(cache);
      }
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }

  console.log(`\n🏁 Done — sent: ${sent}, failed: ${failed}, rate-limited retries: ${rateLimited}`);
  console.log(`📒 Cache file: ${CACHE_FILE}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
