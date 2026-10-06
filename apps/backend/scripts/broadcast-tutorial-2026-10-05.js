#!/usr/bin/env node
'use strict';

/**
 * broadcast-tutorial-2026-10-05.js
 *
 * Founder note to ALL users pointing them to the in-app tutorial video.
 * Personal, warm tone — from Santino & Lex directly.
 *
 * Audience : all active, non-banned users
 * Channels : TG photo DM + in-app DM (sendSystemDM)
 * Dedup key : broadcast_tutorial_oct2026
 * Log table : broadcast_tutorial_2026_10_05
 *
 * Usage (isolated container — never docker exec on live bot):
 *   docker run --rm --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     pnptvapp-pnptv-bot node /app/apps/backend/scripts/broadcast-tutorial-2026-10-05.js
 *
 *   Add --live to send. Default is dry run.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY        = !process.argv.includes('--live');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';

const HERO_URL   = `${WEBAPP_URL}/uploads/avatars/8599671840-1782620624815.webp`;
const CTA_URL    = `${WEBAPP_URL}`;

const CAMPAIGN   = 'tutorial-2026-10-05';
const BATCH_DM   = `${CAMPAIGN}-dm`;
const BATCH_TG   = `${CAMPAIGN}-tg`;
const DM_DELAY   = 80;
const TG_DELAY   = 150;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) return `Hey 👋

Sabemos que tienen muchas preguntas — y sí, somos literalmente solo dos personas construyendo esto para ustedes.

Un tutorial completo está en camino, pero mientras tanto hicimos un video corto con las preguntas más frecuentes. Encuéntralo en la app: toca tu avatar → ▶ Tutorial.

Escríbenos cuando quieran — leemos todo. 🖤
— Santino & Lex`;

  return `Hey 👋

We know a lot of you have questions — and yes, we're literally just two people building this for you.

A full high-quality tutorial is on the way, but in the meantime we put together a short video covering the most common things we hear. Find it in the app: tap your avatar → ▶ Tutorial.

Feel free to DM us anytime with questions or feedback — we read everything. 🖤
— Santino & Lex`;
}

function tgCaption(lang) {
  if (isEs(lang)) return `Hey 👋 Somos solo dos personas construyendo PNPtv para ustedes. Hicimos un video con las preguntas más frecuentes — está en la app, toca tu avatar → ▶ Tutorial. ¡Escríbenos! 🖤`;
  return `Hey 👋 We're literally just two people building PNPtv for you. We made a short video answering the most common questions — find it in the app: tap your avatar → ▶ Tutorial. DM us anytime! 🖤`;
}

// ── TG photo send ─────────────────────────────────────────────────────────────

function tgRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(
      { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/${method}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(JSON.parse(b))); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendTgPhoto(telegramId, lang) {
  if (!BOT_TOKEN || !telegramId) return false;
  try {
    const res = await tgRequest('sendPhoto', {
      chat_id     : telegramId,
      photo       : HERO_URL,
      caption     : tgCaption(lang),
      parse_mode  : 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '▶ Watch Tutorial', url: CTA_URL }]] },
    });
    return res.ok;
  } catch { return false; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  // Audience: all active non-banned users not yet hit by this campaign
  // Force-include Santino regardless of prior sends
  const { rows } = await query(`
    SELECT u.id, u.telegram, u.language
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.tier != 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup
        WHERE user_id = u.id::text
          AND batch_id LIKE '${CAMPAIGN}%'
      )
    UNION
    SELECT id, telegram, language FROM users WHERE id::text = '${SANTINO_ID}'
    ORDER BY id
  `);

  console.log(`[${DRY ? 'DRY RUN' : 'LIVE'}] Audience: ${rows.length} users`);
  if (DRY) { console.log('Pass --live to send.'); process.exit(0); }

  let dmOk = 0, dmFail = 0, tgOk = 0, tgFail = 0;

  for (const u of rows) {
    const lang = u.language || 'en';

    // In-app DM
    try {
      await sendSystemDM(u.id, dmText(lang));
      dmOk++;
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_DM, u.id]
      );
    } catch { dmFail++; }
    await sleep(DM_DELAY);

    // Telegram photo
    if (u.telegram) {
      const ok = await sendTgPhoto(u.telegram, lang);
      ok ? tgOk++ : tgFail++;
      if (ok) await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_TG, u.id]
      );
      await sleep(TG_DELAY);
    }

    if ((dmOk + dmFail) % 100 === 0) process.stdout.write('.');
  }

  console.log(`\nDM  → sent: ${dmOk} / failed: ${dmFail}`);
  console.log(`TG  → sent: ${tgOk} / failed: ${tgFail}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
