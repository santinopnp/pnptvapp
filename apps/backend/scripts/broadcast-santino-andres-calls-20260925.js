#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-andres-calls-20260925.js
 *
 * Promotes private video calls with Santino + his new boy Andres.
 * Window: 4 hours. Sends Telegram media group (both promo clips) + in-app DM.
 *
 * Strategy:
 *   1. Upload both MP4s to Santino's chat → capture file_ids (avoids re-upload for 7K+ sends)
 *   2. Broadcast to all active users with Telegram using file_ids (fast)
 *   3. In-app DM to all active users (text + URL)
 *
 * Usage:
 *   # dry-run
 *   docker cp apps/backend/scripts/broadcast-santino-andres-calls-20260925.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-santino-andres-calls-20260925.js --dry-run
 *
 *   # live — isolated container, NOT docker exec pnptv-bot
 *   docker run -d --name santino-andres-blast \
 *     --env-file /tmp/bot-env.txt \
 *     --network pnptvapp_pnptvapp_net \
 *     -v /opt/pnptvapp/apps/backend/scripts/broadcast-santino-andres-calls-20260925.js:/app/apps/backend/scripts/broadcast-santino-andres-calls-20260925.js:ro \
 *     -v /root/promos/andres1.mp4:/tmp/andres1.mp4:ro \
 *     -v /root/promos/andres2.mp4:/tmp/andres2.mp4:ro \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-santino-andres-calls-20260925.js
 */

const path = require('path');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/telegraf'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }    = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));
const { Telegram } = nm('telegraf');
const IORedis      = nm('ioredis');

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DM       = process.argv.includes('--skip-dm');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');

const CAMPAIGN      = 'santino-andres-calls-20260925';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const PROFILE_URL   = 'https://pnptv.app/c/santinofurioso';

// Video paths — bind-mounted into the container at /tmp/
const VIDEO1_PATH   = '/tmp/andres1.mp4';
const VIDEO2_PATH   = '/tmp/andres2.mp4';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

// Caption for the media group (goes on first video, no inline keyboard for albums)
const TG_CAPTION = {
  en: (name) => `🔥 <b>Santino + his new boy — 4 hours only</b>

Hey ${name} — Santino and Andres are available together right now.

Private video session. Two of them. Your vibe, your rules.

☁️ Cloud · 💉 Slam · One-on-one or both

👉 <a href="${PROFILE_URL}">Book your session now →</a>`.trim(),

  es: (name) => `🔥 <b>Santino + su nuevo chico — solo 4 horas</b>

Hola ${name} — Santino y Andres están disponibles juntos ahora mismo.

Sesión de video privada. Los dos. A tu manera.

☁️ Cloud · 💉 Slam · Uno a uno o con los dos

👉 <a href="${PROFILE_URL}">Reserva tu sesión ahora →</a>`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — Santino and his new boy Andres are available together for video calls right now.

Private session. 4 hours only.

☁️ Cloud  30 min → $60  |  60 min → $150
💉 Slam   30 min → $100 |  60 min → $200

One-on-one with either of them, or both.

→ ${PROFILE_URL}

— PNPtv! Team`,

  es: (name) =>
`Hola ${name} — Santino y su nuevo chico Andres están disponibles juntos para videollamadas ahora mismo.

Sesión privada. Solo 4 horas.

☁️ Cloud  30 min → $60  |  60 min → $150
💉 Slam   30 min → $100 |  60 min → $200

Uno a uno con cualquiera de los dos, o con ambos.

→ ${PROFILE_URL}

— Equipo PNPtv!`,
};

// Upload both videos to the first TG-reachable user in the audience to obtain
// Telegram file_ids. That user counts as "sent" and is skipped from the main loop.
async function uploadVideos(tg, uploadToTgId, uploadUserLabel) {
  console.log(` [UPLOAD] Uploading videos via @${uploadUserLabel} to capture file_ids...`);
  if (!fs.existsSync(VIDEO1_PATH)) throw new Error(`Video not found: ${VIDEO1_PATH}`);
  if (!fs.existsSync(VIDEO2_PATH)) throw new Error(`Video not found: ${VIDEO2_PATH}`);

  console.log(' [UPLOAD] andres1.mp4...');
  const msg1 = await tg.sendVideo(uploadToTgId, { source: fs.createReadStream(VIDEO1_PATH) }, {
    caption:    TG_CAPTION['en']('there — preview'),
    parse_mode: 'HTML',
  });
  const fileId1 = msg1?.video?.file_id;
  if (!fileId1) throw new Error('Failed to capture file_id from andres1 upload');
  console.log(` [UPLOAD] andres1 OK — file_id: ${fileId1.slice(0, 20)}...`);

  await sleep(1500);

  console.log(' [UPLOAD] andres2.mp4...');
  const msg2 = await tg.sendVideo(uploadToTgId, { source: fs.createReadStream(VIDEO2_PATH) });
  const fileId2 = msg2?.video?.file_id;
  if (!fileId2) throw new Error('Failed to capture file_id from andres2 upload');
  console.log(` [UPLOAD] andres2 OK — file_id: ${fileId2.slice(0, 20)}...`);

  return { fileId1, fileId2 };
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` SANTINO + ANDRES CALLS BLAST — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    try { await redis.connect(); } catch {}
    redis.on('error', () => {});
  }

  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.telegram, u.language
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND (u.is_active IS NULL OR u.is_active = true)
      AND u.id != $1
    ORDER BY u.created_at DESC
  `, [SYSTEM_SENDER]);

  // Always CC Santino first (also serves as the upload target)
  const hasSantino = targets.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, telegram, language FROM users WHERE id = $1`,
      [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  } else {
    // Move Santino to front so upload happens first
    const idx = targets.findIndex(u => u.id === SANTINO_ID);
    if (idx > 0) targets.unshift(targets.splice(idx, 1)[0]);
  }

  console.log(` Targets: ${targets.length} users`);
  console.log(` Telegram-reachable: ${targets.filter(u => u.telegram).length}\n`);

  const tg = (!SKIP_TELEGRAM && !DRY_RUN) ? new Telegram(process.env.BOT_TOKEN) : null;

  // Upload videos once to capture file_ids — tries TG users until one works
  // (some users have a telegram ID but never /start'ed the bot, so we retry).
  let fileId1 = null, fileId2 = null;
  const uploadedToIds = new Set();

  if (tg && !SKIP_TELEGRAM) {
    const tgCandidates = targets.filter(u => u.telegram);
    let uploaded = false;
    for (const candidate of tgCandidates.slice(0, 50)) {
      try {
        ({ fileId1, fileId2 } = await uploadVideos(tg, candidate.telegram, candidate.username));
        uploadedToIds.add(candidate.id);
        uploaded = true;
        console.log(' [UPLOAD] Both videos uploaded — using file_ids for blast\n');
        break;
      } catch (e) {
        if (e.message.includes('initiate conversation') || e.message.includes('blocked') || e.message.includes('deactivated')) {
          console.log(` [UPLOAD] @${candidate.username} unreachable — trying next...`);
          await sleep(300);
          continue;
        }
        console.error(' [UPLOAD] Unexpected error:', e.message);
        process.exit(1);
      }
    }
    if (!uploaded) {
      console.error(' [UPLOAD] Could not find a bot-started user in first 50 candidates — aborting');
      process.exit(1);
    }
  }

  const stats = { tg: 0, dm: 0, tgF: 0, dmF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const name = pickName(u);

    if (i % 500 === 0 && i > 0) {
      console.log(`--- Progress: ${i}/${targets.length} (TG: ${stats.tg} ✓  DM: ${stats.dm} ✓) ---`);
    }

    if (DRY_RUN) {
      console.log(`[DRY ${i+1}/${targets.length}] @${u.username} (${lang}) TG:${u.telegram||'—'}`);
      continue;
    }

    // Dedup
    const deduped = await redis.sismember(DEDUP_KEY, u.id);
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, u.id);

    // Telegram media group — both videos via file_ids
    const alreadyGotVideos = uploadedToIds.has(u.id);
    if (!SKIP_TELEGRAM && u.telegram && !alreadyGotVideos && fileId1 && fileId2) {
      try {
        await tg.sendMediaGroup(u.telegram, [
          {
            type:       'video',
            media:      fileId1,
            caption:    TG_CAPTION[lang](name),
            parse_mode: 'HTML',
          },
          {
            type:  'video',
            media: fileId2,
          },
        ]);
        stats.tg++;
      } catch { stats.tgF++; }
      await sleep(200);
    }

    // In-app DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, DM_MSG[lang](name), query);
        stats.dm++;
      } catch { stats.dmF++; }
      await sleep(80);
    }
  }

  if (!DRY_RUN && redis) await redis.expire(DEDUP_KEY, 86400); // 24h TTL

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` Telegram: ${stats.tg} sent / ${stats.tgF} failed`);
  console.log(` In-app DM: ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Skipped: ${stats.skip} (dedup)`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
