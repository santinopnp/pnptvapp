#!/usr/bin/env node
'use strict';

/**
 * broadcast-elio-live-calls-20261010.js
 *
 * Promo: @elio1310 is live on Main Stage + available for private calls.
 * Audience : all active non-banned non-deleted users.
 * Dedup    : Redis set  pnpapp:broadcast:dedup:elio-live-calls-20261010  (48h TTL)
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

const CAMPAIGN      = 'elio-live-calls-20261010';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

const PROFILE_URL = 'https://pnptv.app/c/elio1310';
const HERO_URL    = 'https://pnptv.app/uploads/avatars/05738281-287a-47d4-a121-f397f83a2503-1788364034374.webp';

const DM_DELAY_MS = 80;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function dmText(lang) {
  if (isEs(lang)) {
    return `🔴 EN VIVO AHORA — Estarling está en el Main Stage

Llamadas privadas abiertas. Solo ustedes dos. Cámara prendida. 🎥

━━━━━━━━━━━━━━━
💰 Llamada Privada · desde $80
⚡ Cupos limitados — está en línea ahora mismo
━━━━━━━━━━━━━━━

Reservá ahora 👇
${PROFILE_URL}`;
  }
  return `🔴 LIVE NOW — Estarling is on Main Stage

Private calls open. Just you and him. Camera on. 🎥

━━━━━━━━━━━━━━━
💰 Private Call · from $80
⚡ Limited spots — he's online right now
━━━━━━━━━━━━━━━

Book now 👇
${PROFILE_URL}`;
}

async function main() {
  await initializePostgres();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ELIO LIVE PROMO — ${CAMPAIGN}`);
  console.log(`  MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════\n');

  const IORedis = nm('ioredis');
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = new IORedis(redisUrl, { lazyConnect: true });
  try { await redis.connect(); } catch {}
  redis.on('error', () => {});

  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.language
      FROM users u
     WHERE u.deleted_at IS NULL
       AND u.id NOT IN ('8552451957', 'fafa6786-de29-4216-b788-4f11d703df4f', '05738281-287a-47d4-a121-f397f83a2503')
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
     ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `);

  // Force-include Santino first for QA verification
  const hasSantino = targets.some(u => String(u.id) === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, language FROM users WHERE id::text=$1`, [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  const esCount = targets.filter(t => isEs(t.language)).length;
  console.log(`  Total targets : ${targets.length}`);
  console.log(`  ES            : ${esCount}`);
  console.log(`  EN            : ${targets.length - esCount}\n`);

  if (DRY_RUN) {
    console.log('  Sample DM (en):\n' + dmText('en'));
    console.log('\n  Sample DM (es):\n' + dmText('es'));
    console.log(`\n  DRY RUN — would DM ${targets.length} users.\n`);
    await redis.quit();
    process.exit(0);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';

    if (i > 0 && i % 500 === 0) {
      console.log(`  progress ${i}/${targets.length}  sent=${sent} failed=${failed} skip=${skipped}`);
    }

    const deduped = await redis.sismember(DEDUP_KEY, String(u.id));
    if (deduped) { skipped++; continue; }

    try {
      await sendSystemDM(SYSTEM_SENDER, u.id, dmText(lang), query, { mediaUrl: HERO_URL, mediaType: 'image' });
      await redis.sadd(DEDUP_KEY, String(u.id));
      sent++;
    } catch (e) {
      failed++;
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
