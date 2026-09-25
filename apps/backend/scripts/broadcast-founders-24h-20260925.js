#!/usr/bin/env node
'use strict';

/**
 * broadcast-founders-24h-20260925.js
 *
 * Opens the PNPtv! Founders offer ($99.99 lifetime) for 24 hours to all
 * existing non-prime members. Sends Telegram DM + in-app DM + web push.
 * Also resets founders_offer_expires_at → NOW()+24h for the entire audience
 * so the diamond widget shows the aggressive promo immediately on next open.
 *
 * Usage:
 *   # dry-run (no messages sent, no DB changes)
 *   docker cp apps/backend/scripts/broadcast-founders-24h-20260925.js pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/broadcast-founders-24h-20260925.js --dry-run
 *
 *   # live — ALWAYS run in isolated container, never docker exec pnptv-bot
 *   docker run -d --name founders-24h-blast \
 *     --env-file /tmp/bot-env.txt \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-founders-24h-20260925.js
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
const PushService  = require(path.join(BACKEND, 'services/pushNotificationService'));
const { Telegram } = nm('telegraf');
const IORedis      = nm('ioredis');

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DM       = process.argv.includes('--skip-dm');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_DB_RESET = process.argv.includes('--skip-db-reset');

const CAMPAIGN      = 'founders-24h-20260925';
const DEDUP_KEY     = `pnpapp:broadcast:dedup:${CAMPAIGN}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const CLAIM_URL     = 'https://pnptv.app/';
const PHOTO_URL     = 'https://pnptv.app/uploads/avatars/8599671840-1782620624815.webp';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'amigo' : 'there');
}

const TG_CAPTION = {
  en: (name) => `💎 <b>PNPtv! Founders — $99.99 lifetime · 24 hours only</b>

Hey ${name} — for the next 24 hours we're opening the Founders offer to all existing members.

One payment. Lifetime access. PRIME content, forever.

After today, this price is only available to new users.

👉 <a href="${CLAIM_URL}">Claim your Founders access →</a>`.trim(),

  es: (name) => `💎 <b>PNPtv! Founders — $99.99 de por vida · solo 24 horas</b>

Hola ${name} — por las próximas 24 horas abrimos la oferta Founders para todos los miembros actuales.

Un solo pago. Acceso de por vida. Contenido PRIME, para siempre.

Después de hoy, este precio solo estará disponible para nuevos usuarios.

👉 <a href="${CLAIM_URL}">Reclama tu acceso Founders →</a>`.trim(),
};

const DM_MSG = {
  en: (name) =>
`Hey ${name} — the PNPtv! Founders offer is open for the next 24 hours.

💎 $99.99 one-time · Lifetime PRIME access · All features, forever.

After today this offer disappears for existing members — only new users will see it.

Tap the 💎 button on the app to claim it now.

→ ${CLAIM_URL}

— PNPtv! Team`,

  es: (name) =>
`Hola ${name} — la oferta PNPtv! Founders está abierta por las próximas 24 horas.

💎 $99.99 único pago · Acceso PRIME de por vida · Todas las funciones, para siempre.

Después de hoy esta oferta desaparece para miembros actuales — solo la verán nuevos usuarios.

Toca el botón 💎 en la app para reclamarla ahora.

→ ${CLAIM_URL}

— Equipo PNPtv!`,
};

async function resetFoundersWindow(targets, dryRun) {
  if (dryRun) { console.log(' [DB] DRY — would reset founders_offer_expires_at for audience'); return 0; }
  const ids = targets.map(u => u.id);
  const { rowCount } = await query(
    `UPDATE users
        SET founders_offer_expires_at  = NOW() + INTERVAL '24 hours',
            founders_popup_dismissed_at = NULL,
            updated_at                  = NOW()
      WHERE id = ANY($1::text[])`,
    [ids]
  );
  return rowCount;
}

async function sendPushBatch(targets, dryRun) {
  if (dryRun) { console.log(' [PUSH] DRY — would send web push to subscribed users'); return { sent: 0, total: 0 }; }

  PushService.initialize();

  const ids = targets.map(u => u.id);
  const { rows: subs } = await query(
    `SELECT ps.id, ps.endpoint, ps.auth, ps.p256dh, ps.user_id
       FROM push_subscriptions ps
      WHERE ps.user_id = ANY($1::text[])`,
    [ids]
  );

  if (!subs.length) return { sent: 0, total: 0 };

  const payloadJson = PushService._buildPayload({
    title: '💎 24-hour Founders Offer',
    body:  'Lifetime PRIME access · $99.99 today only — tap to claim',
    url:   '/',
    tag:   CAMPAIGN,
    image: PHOTO_URL,
  });

  let sent = 0;
  const BATCH = 50;
  for (let i = 0; i < subs.length; i += BATCH) {
    const batch = subs.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(s => PushService._sendToSubscription(s, payloadJson)));
    sent += results.filter(Boolean).length;
    if (i % 500 === 0 && i > 0) console.log(` [PUSH] ${i}/${subs.length} processed`);
  }

  return { sent, total: subs.length };
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` FOUNDERS 24H BLAST — ${CAMPAIGN}`);
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

  // Audience: non-prime, active, completed onboarding
  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.telegram, u.language
    FROM users u
    WHERE u.tier != 'prime'
      AND COALESCE(u.is_deleted, false) = false
      AND (u.is_active IS NULL OR u.is_active = true)
      AND u.onboarding_complete = true
      AND u.id != $1
    ORDER BY u.created_at DESC
  `, [SYSTEM_SENDER]);

  // Always CC Santino
  const hasSantino = targets.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, telegram, language FROM users WHERE id = $1`,
      [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  console.log(` Audience: ${targets.length} users`);
  console.log(` Telegram-reachable: ${targets.filter(u => u.telegram).length}`);
  console.log('');

  // ── 1. Reset founders window for entire audience ──────────────────────────
  if (!SKIP_DB_RESET) {
    const updated = await resetFoundersWindow(targets, DRY_RUN);
    console.log(` [DB] founders_offer_expires_at reset for ${DRY_RUN ? '(dry)' : updated} users\n`);
  }

  // ── 2. Telegram DM + in-app DM ────────────────────────────────────────────
  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
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

    // Telegram photo + caption + inline button
    if (!SKIP_TELEGRAM && u.telegram) {
      try {
        await tg.sendPhoto(u.telegram, PHOTO_URL, {
          caption:    TG_CAPTION[lang](name),
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{
              text: lang === 'es' ? '💎 Reclamar acceso Founders' : '💎 Claim Founders access',
              url:  CLAIM_URL,
            }]],
          },
        });
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

  // ── 3. Web push ───────────────────────────────────────────────────────────
  if (!SKIP_PUSH) {
    console.log('\n [PUSH] Sending web push notifications...');
    const pushResult = await sendPushBatch(targets, DRY_RUN);
    console.log(` [PUSH] ${pushResult.sent} sent / ${pushResult.total} subscriptions targeted`);
  }

  if (!DRY_RUN && redis) await redis.expire(DEDUP_KEY, 172800); // 48h TTL

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
