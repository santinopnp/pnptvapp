#!/usr/bin/env node
'use strict';

/**
 * broadcast-prime-video-20260917.js
 *
 * Push + Telegram DM blast to free users:
 * "New exclusive content is live — subscribe to PRIME"
 *
 * Channels:
 *   1. Telegram DM  (~2,088 active free users with Telegram ID)
 *   2. Web push     (~617 free users with push subscriptions)
 *
 * Idempotency: broadcast_prime_video_20260917 log table (user_id, channel)
 * CC: Santino (8599671840) force-first in all channels
 *
 * Run in isolated container (NEVER docker exec pnptv-bot):
 *   docker run --rm \
 *     $(docker exec pnptv-bot printenv | grep -E '^(BOT_TOKEN|DATABASE_URL|REDIS_URL|SMTP|PNPTV|WEBAPP|NODE_ENV|SESSION)' | sed 's/^/-e /') \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-prime-video-20260917.js
 *
 *   Add --live to actually send. Default is dry run.
 *   Add --skip-telegram / --skip-push to skip a channel.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY       = !process.argv.includes('--live');
const SKIP_TG   = process.argv.includes('--skip-telegram');
const SKIP_PUSH = process.argv.includes('--skip-push');

const SANTINO_ID  = '8599671840';
const LOG_TABLE   = 'broadcast_prime_video_20260917';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const WEBAPP_URL  = process.env.WEBAPP_URL || 'https://pnptv.app';
const TG_DELAY_MS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    pushTitle: 'New content just dropped on PNPtv! 🔥',
    pushBody:  'Subscribe to PRIME — exclusive videos, live shows & more.',
    tgMsg: (name) => {
      const hi = name ? `Hey ${name}` : 'Hey';
      return `${hi} 👋

New exclusive content is live on PNPtv! 🔥

The hottest creators are posting. Private calls, live shows, exclusive videos — all inside PRIME.

<b>🔥 Annual PRIME — $50/year</b>
<b>🖤 Lifetime PRIME — $100, forever</b>

— PNPtv! 🏳️‍🌈`;
    },
  },
  es: {
    pushTitle: '¡Nuevo contenido exclusivo en PNPtv! 🔥',
    pushBody:  'Suscribite a PRIME — videos exclusivos, shows en vivo y mucho más.',
    tgMsg: (name) => {
      const hi = name ? `Hola ${name}` : 'Hola';
      return `${hi} 👋

¡Hay contenido nuevo en PNPtv! 🔥

Los mejores creadores están publicando. Llamadas privadas, shows en vivo, videos exclusivos — todo dentro de PRIME.

<b>🔥 PRIME Anual — $50/año</b>
<b>🖤 PRIME de por vida — $100</b>

— PNPtv! 🏳️‍🌈`;
    },
  },
};

function resolveLang(raw) {
  if (!raw) return 'en';
  const l = raw.toLowerCase();
  if (l.startsWith('es')) return 'es';
  return 'en';
}

// ── Telegram helper ───────────────────────────────────────────────────────────

async function tgSend(chatId, text, inlineKeyboard) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id:    chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); }
        });
      }
    );
    req.on('error', () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

// ── Dedup helpers ─────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id = $1 AND channel = $2`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function markSent(userId, channel) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [String(userId), channel]
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[prime-video] ${DRY ? 'DRY RUN — ' : 'LIVE — '}starting`);

  await initializePostgres();
  if (!DRY) await ensureLogTable();
  PushNotificationService.initialize();

  // ── 1. Telegram DM ────────────────────────────────────────────────────────
  if (!SKIP_TG) {
    const { rows: tgUsers } = await query(`
      SELECT u.id, u.username, u.first_name, u.language
        FROM users u
       WHERE u.tier = 'free'
         AND u.deleted_at IS NULL
         AND u.id ~ '^\\d+$'
         AND u.last_active > NOW() - INTERVAL '90 days'
       ORDER BY u.id = $1 DESC, u.last_active DESC
    `, [SANTINO_ID]);

    console.log(`[prime-video/tg] ${tgUsers.length} candidates`);

    let tgSent = 0, tgSkipped = 0, tgFailed = 0;
    for (const u of tgUsers) {
      const lang = resolveLang(u.language);
      const copy = COPY[lang] || COPY.en;
      const text = copy.tgMsg(u.first_name || u.username);
      const keyboard = [[
        { text: '🔥 Subscribe · $50/yr', url: `${WEBAPP_URL}/subscribe` },
        { text: '🖤 Lifetime · $100',    url: `${WEBAPP_URL}/lifetime100` },
      ]];

      if (DRY) {
        console.log(`  [dry] TG @${u.username || u.id} (${lang})`);
        tgSent++;
        continue;
      }

      if (await alreadySent(u.id, 'tg')) { tgSkipped++; continue; }

      const res = await tgSend(u.id, text, keyboard);
      if (res.ok) {
        await markSent(u.id, 'tg');
        tgSent++;
        if (tgSent % 100 === 0) console.log(`  [tg] ${tgSent} sent…`);
      } else {
        const errCode = res.error_code;
        if (errCode === 403 || errCode === 400) {
          await markSent(u.id, 'tg'); // mark so we don't retry unreachable users
        }
        tgFailed++;
      }
      await sleep(TG_DELAY_MS);
    }
    console.log(`[prime-video/tg] sent=${tgSent} skipped=${tgSkipped} failed=${tgFailed}`);
  }

  // ── 2. Web push ───────────────────────────────────────────────────────────
  if (!SKIP_PUSH) {
    const { rows: pushUsers } = await query(`
      SELECT u.id, u.language
        FROM users u
        JOIN push_subscriptions ps ON ps.user_id = u.id
       WHERE u.tier = 'free'
         AND u.deleted_at IS NULL
       GROUP BY u.id, u.language
       ORDER BY (u.id = $1) DESC, u.id
    `, [SANTINO_ID]);

    console.log(`[prime-video/push] ${pushUsers.length} candidates`);

    let pushSent = 0, pushSkipped = 0;
    for (const u of pushUsers) {
      const lang = resolveLang(u.language);
      const copy = COPY[lang] || COPY.en;

      if (DRY) {
        console.log(`  [dry] push uid=${u.id} (${lang})`);
        pushSent++;
        continue;
      }

      if (await alreadySent(u.id, 'push')) { pushSkipped++; continue; }

      const sent = await PushNotificationService.sendToUser(u.id, {
        title: copy.pushTitle,
        body:  copy.pushBody,
        url:   `${WEBAPP_URL}/subscribe`,
        tag:   'prime-video-20260917',
        icon:  '/icon-192.png',
      });
      if (sent > 0) {
        await markSent(u.id, 'push');
        pushSent++;
      }
    }
    console.log(`[prime-video/push] sent=${pushSent} skipped=${pushSkipped}`);
  }

  console.log('\n[prime-video] Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('[prime-video] FATAL:', err);
  process.exit(1);
});
