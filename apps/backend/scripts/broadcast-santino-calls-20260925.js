#!/usr/bin/env node
'use strict';

/**
 * broadcast-santino-calls-20260925.js
 *
 * Santino available for private calls — promotes 4 active call packages.
 * Targets all active members with Telegram or in-app DM.
 *
 * Usage:
 *   # dry-run
 *   docker cp apps/backend/scripts/broadcast-santino-calls-20260925.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-santino-calls-20260925.js --dry-run
 *
 *   # live
 *   docker run -d --name santino-calls-blast \
 *     --env-file /tmp/bot-env.txt \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-santino-calls-20260925.js
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

const CAMPAIGN      = 'santino-calls-2026-09-25';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const PROFILE_URL   = 'https://pnptv.app/u/SantinoFurioso';
const PHOTO_URL     = 'https://pnptv.app/uploads/avatars/8599671840-1782620624815.webp';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

const TG_CAPTION = {
  en: (name) => `🔥 <b>Santino is available for private calls — right now</b>

Hey ${name} — Santino just opened his call calendar.

☁️ <b>Cloud sessions:</b> 30 min $60 · 60 min $150
💉 <b>Slam sessions:</b> 30 min $100 · 60 min $200

One-on-one, private, your rules.

👉 <a href="${PROFILE_URL}">Book your session →</a>`.trim(),

  es: (name) => `🔥 <b>Santino está disponible para llamadas privadas — ahora mismo</b>

Hola ${name} — Santino acaba de abrir su calendario de llamadas.

☁️ <b>Sesiones cloud:</b> 30 min $60 · 60 min $150
💉 <b>Sesiones slam:</b> 30 min $100 · 60 min $200

Uno a uno, privado, a tu manera.

👉 <a href="${PROFILE_URL}">Reserva tu sesión →</a>`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — Santino just opened his private call calendar.

☁️ Cloud 30 min → $60  |  60 min → $150
💉 Slam  30 min → $100 |  60 min → $200

One-on-one. Private. Your rules.

→ ${PROFILE_URL}

— PNPtv! Team`,

  es: (name) =>
`Hola ${name} — Santino acaba de abrir su calendario de llamadas privadas.

☁️ Cloud 30 min → $60  |  60 min → $150
💉 Slam  30 min → $100 |  60 min → $200

Uno a uno. Privado. A tu manera.

→ ${PROFILE_URL}

— Equipo PNPtv!`,
};

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` SANTINO CALLS BLAST — ${CAMPAIGN}`);
  console.log(`══════════════════════════════════════════════════════`);
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
      AND u.id != $1
      AND (u.telegram IS NOT NULL)
    ORDER BY u.created_at DESC
  `, [SYSTEM_SENDER]);

  // Always CC Santino
  const hasSantino = targets.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, telegram, language FROM users WHERE id = $1`,
      [SANTINO_ID]
    );
    if (s.length) targets.push(s[0]);
  }

  console.log(` Targets: ${targets.length} users\n`);

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);

  const stats = { tg: 0, dm: 0, tgF: 0, dmF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const name = pickName(u);

    if (i % 500 === 0 && i > 0) {
      console.log(`--- Progress: ${i}/${targets.length} (TG: ${stats.tg} ✓) ---`);
    }

    if (DRY_RUN) {
      console.log(`[DRY ${i+1}/${targets.length}] @${u.username} (${lang}) TG:${u.telegram||'—'}`);
      continue;
    }

    // Dedup
    const deduped = await redis.sismember(DEDUP_KEY, u.id);
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, u.id);

    // Telegram — photo + caption + inline button
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendPhoto(u.telegram, PHOTO_URL, {
          caption:    TG_CAPTION[lang](name),
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{
              text: lang === 'es' ? '📅 Reservar sesión con Santino' : '📅 Book a session with Santino',
              url:  PROFILE_URL,
            }]],
          },
        });
        stats.tg++;
      } catch (e) { stats.tgF++; }
      await sleep(200);
    }

    // In-app DM
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, DM_MSG[lang](name), query);
        stats.dm++;
      } catch (e) { stats.dmF++; }
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
