'use strict';

/**
 * Creator "spenders are online" awareness broadcast — 2026-08-03
 *
 * Tells every creator/performer (roles: creator, model) that members
 * holding spendable tokens are online RIGHT NOW, and that we're about
 * to wire up live pings whenever a spender shows activity.
 *
 * Sends a Telegram DM with a dynamic "N spenders online right now"
 * hook computed at send time.
 *
 * Idempotent via broadcast_creator_spenders_online_2026_08_03 log table.
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-creator-spenders-online-2026-08-03.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-creator-spenders-online-2026-08-03.js
 */

const { Pool } = require('pg');
const https = require('https');
const Redis = require('ioredis');

const DRY = process.argv.includes('--dry-run');
const BOT_TOKEN = process.env.BOT_TOKEN;
const CTA_URL = 'https://pnptv.app/pnp-live';
const TOKEN_MIN_SPENDER = 30; // >=30 tokens = meaningful spender (a Live tip / a call unit)

// ── DB / Redis ──────────────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  max: 3,
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-pnptv',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Telegram send ───────────────────────────────────────────────────────────

function tgSend(chatId, text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false });
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

// ── Log table ───────────────────────────────────────────────────────────────

async function ensureLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS broadcast_creator_spenders_online_2026_08_03 (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}
async function alreadySent(client, userId, channel) {
  const { rows } = await client.query(
    `SELECT 1 FROM broadcast_creator_spenders_online_2026_08_03 WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}
async function log(client, userId, channel, status, error) {
  await client.query(
    `INSERT INTO broadcast_creator_spenders_online_2026_08_03 (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

// ── Live signal: count spenders currently online ────────────────────────────

async function countSpendersOnline(client) {
  const { rows } = await client.query(`
    SELECT u.id
      FROM users u
      JOIN user_token_wallets w ON w.user_id = u.id
     WHERE u.deleted_at IS NULL
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND u.role NOT IN ('creator','model','admin','superadmin')
       AND w.balance_tokens >= $1
  `, [TOKEN_MIN_SPENDER]);

  if (!rows.length) return { onlineNow: 0, totalPool: 0 };

  const totalPool = rows.length;
  const pipeline = redis.pipeline();
  for (const r of rows) pipeline.exists(`presence:online:${r.id}`);
  const results = await pipeline.exec();
  const onlineNow = results.reduce((n, [err, val]) => n + (!err && val === 1 ? 1 : 0), 0);
  return { onlineNow, totalPool };
}

// ── Targets ─────────────────────────────────────────────────────────────────

async function fetchCreators(client) {
  const { rows } = await client.query(`
    SELECT u.id,
           COALESCE(NULLIF(u.first_name,''), NULL) AS first_name,
           COALESCE(u.language,'en') AS lang,
           u.telegram, u.role
      FROM users u
     WHERE u.deleted_at IS NULL
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND u.role IN ('creator','model')
       AND u.telegram IS NOT NULL
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);
  return rows;
}

// ── Copy ────────────────────────────────────────────────────────────────────

function buildDm({ isEs, firstName, onlineNow, totalPool }) {
  const name = firstName || (isEs ? 'creador' : 'creator');

  const onlineLine = isEs
    ? (onlineNow > 0
        ? `🟢 ${onlineNow} miembro${onlineNow === 1 ? '' : 's'} con tokens está${onlineNow === 1 ? '' : 'n'} en línea ahora mismo.`
        : `🟢 Miembros con tokens entrando y saliendo todo el día.`)
    : (onlineNow > 0
        ? `🟢 ${onlineNow} member${onlineNow === 1 ? '' : 's'} holding spendable tokens ${onlineNow === 1 ? 'is' : 'are'} online right now.`
        : `🟢 Token-holding members are drifting in and out all day.`);

  if (isEs) {
    return `Hola ${name} 👋

${onlineLine}

En PNPtv! hay ${totalPool} miembros con tokens listos para gastar en tips, calls privadas, subs y contenido exclusivo — y estamos a punto de conectar avisos en vivo para que sepas EL MOMENTO EXACTO en que uno de ellos se activa.

Pero eso solo sirve si estás en línea. Los que están en línea salen primero en la búsqueda, en cercanos y en el feed. Los que no, se pierden el tip.

👉 Entra ahora, actívate "Disponible" o ponte En Vivo:
${CTA_URL}

— PNPtv!`;
  }

  return `Hey ${name} 👋

${onlineLine}

PNPtv! has ${totalPool} members holding spendable tokens — ready to drop them on tips, private calls, subs and exclusive content — and we're about to wire up live pings so you know THE EXACT MOMENT one of them shows activity.

But that only works if you're online. Online creators surface first in search, in Nearby, and in the feed. Offline ones miss the tip.

👉 Log in now, flip "Available" on, or go Live:
${CTA_URL}

— PNPtv!`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Creator spenders-online broadcast 2026-08-03 ${DRY ? '(DRY-RUN)' : ''} ===`);
  await redis.connect();
  const client = await pool.connect();
  try {
    await ensureLogTable(client);

    const { onlineNow, totalPool } = await countSpendersOnline(client);
    console.log(`  Live signal: ${onlineNow} spenders online now / ${totalPool} total spender pool`);

    const creators = await fetchCreators(client);
    console.log(`  Creators reachable via Telegram: ${creators.length}`);

    let sent = 0, fail = 0, skip = 0;
    for (const c of creators) {
      if (await alreadySent(client, c.id, 'tg')) { skip++; continue; }
      const isEs = String(c.lang).toLowerCase().startsWith('es');
      const text = buildDm({ isEs, firstName: c.first_name, onlineNow, totalPool });

      if (DRY) {
        if (sent < 3) {
          console.log(`\n  ── DRY sample #${sent + 1} → ${c.role} ${c.id} (${isEs ? 'ES' : 'EN'}) ──`);
          console.log(text);
        }
        sent++;
        continue;
      }

      const r = await tgSend(c.telegram, text);
      if (r.ok) { sent++; await log(client, c.id, 'tg', 'sent'); }
      else {
        fail++;
        await log(client, c.id, 'tg', 'failed', (r.description || r.error || 'unknown').slice(0, 500));
      }

      if ((sent + fail) % 10 === 0) {
        await sleep(1000);
        console.log(`  progress: sent=${sent} failed=${fail} skip=${skip} / ${creators.length}`);
      }
    }

    console.log(`\n=== FINAL: sent=${sent} failed=${fail} skipped=${skip} total=${creators.length} ===`);
  } finally {
    client.release();
    await pool.end();
    await redis.quit();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
