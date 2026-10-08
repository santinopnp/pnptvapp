#!/usr/bin/env node
'use strict';

/**
 * broadcast-performer-private-calls-20261008.js
 *
 * Reminds active performers they can earn from private calls:
 * go available on Main Stage → members book them → payout within 12h.
 *
 * Audience : performers.status = 'active', with telegram_id, not deleted
 * Channel  : Telegram DM only (photo + caption + CTA button)
 * Hero     : today's featured creator image (STORMYTD / Main Stage live)
 * CTA      : https://pnptv.app/main-stage
 * Santino  : force-included first (QA + CC rule)
 *
 * Usage (isolated container — NEVER docker exec on live bot):
 *   docker run --rm \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^_') \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-performer-private-calls-20261008.js
 *
 *   Add --live to fire. Default = dry run.
 */

const path  = require('path');
const https = require('https');
const fs    = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const DRY     = !process.argv.includes('--live');
const SKIP_TG = process.argv.includes('--skip-tg');

const WEBAPP_URL   = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const CTA_URL      = `${WEBAPP_URL}/main-stage`;
const BOT_TOKEN    = process.env.BOT_TOKEN;
const SANTINO_ID   = '8599671840';
const LOG_TABLE    = 'broadcast_performer_private_calls_20261008';
const TG_CHANNEL   = 'tg';
const TG_DELAY_MS  = 200;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Hero image (today's featured creator — STORMYTD) ──────────────────────────

const HERO_URL = 'https://pnptv.app/uploads/posts/img-7915648272-1789158710402.webp';

// ── Copy ──────────────────────────────────────────────────────────────────────

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `<b>Tu perfil ya está generando interés 💎</b>\n\n` +
      `Hey${n} — como performer en PNPtv puedes recibir reservas para llamadas privadas directamente desde el Main Stage.\n\n` +
      `Cuando estás disponible ahí, los miembros pueden reservarte. Cada llamada completada se paga en un máximo de 12 horas.\n\n` +
      `Entra, activa tu disponibilidad y empieza a cobrar.`
    );
  }
  return (
    `<b>Your profile is already getting attention 💎</b>\n\n` +
    `Hey${n} — as a performer on PNPtv you can earn from private calls booked directly on Main Stage.\n\n` +
    `When you're available there, members can book you. Every completed call pays out within 12 hours.\n\n` +
    `Get in, flip your availability, and start earning.`
  );
}

function btnLabel(lang) {
  return isEs(lang) ? '💎 Ir al Main Stage →' : '💎 Go to Main Stage →';
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

function tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/${method}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout:  15000,
    }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error',   () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function logSend(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

// ── Audience ──────────────────────────────────────────────────────────────────

async function loadTargets() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text                        AS user_id,
      u.username,
      u.first_name,
      u.telegram::text                  AS telegram,
      LOWER(COALESCE(u.language,'en'))  AS language
    FROM performers p
    JOIN users u ON u.id::text = p.user_id::text
    WHERE p.status = 'active'
      AND u.telegram IS NOT NULL
      AND u.telegram::text <> ''
      AND COALESCE(u.is_deleted, false) = false
    ORDER BY u.id
  `);

  // Force-include Santino first (CC rule + QA preview)
  const hasSantino = rows.some(r => r.user_id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id::text AS user_id, username, first_name,
              telegram::text AS telegram,
              LOWER(COALESCE(language,'en')) AS language
       FROM users WHERE id::text = $1`,
      [SANTINO_ID]
    );
    if (s.length) rows.unshift(s[0]);
  } else {
    const idx = rows.findIndex(r => r.user_id === SANTINO_ID);
    if (idx > 0) rows.unshift(rows.splice(idx, 1)[0]);
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const targets = await loadTargets();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Performer Private Calls Reminder  2026-10-08');
  console.log(`  MODE     : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Audience : ${targets.length} performers with TG`);
  console.log(`  Hero     : ${HERO_URL}`);
  console.log(`  CTA      : ${CTA_URL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY) {
    const sample = targets[0];
    console.log('── Sample caption (en) ─────────────────────────────────────');
    console.log(tgCaption(sample?.first_name || null, 'en'));
    console.log('\n── Sample caption (es) ─────────────────────────────────────');
    console.log(tgCaption(sample?.first_name || null, 'es'));
    console.log(`\nTargets preview (first 5):`);
    targets.slice(0, 5).forEach(t =>
      console.log(`  @${t.username} (${t.language}) tg=${t.telegram}`)
    );
    console.log(`\nDRY RUN — would send TG to ${targets.length}. Re-run with --live to fire.\n`);
    process.exit(0);
  }

  await ensureLogTable();

  // QA preview to Santino (CC rule — his telegram col is empty, use raw numeric ID)
  if (!SKIP_TG) {
    console.log('Sending QA preview to Santino…');
    const qa = await tgApi('sendPhoto', {
      chat_id:    SANTINO_ID,
      photo:      HERO_URL,
      caption:    '[QA] ' + tgCaption(null, 'en'),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: btnLabel('en'), url: CTA_URL }]] },
    });
    console.log(qa.ok ? '✓ QA sent\n' : `✗ QA failed: ${qa.description}\n`);
  }

  const stats = { tg: 0, tgSkipped: 0, tgFailed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const { user_id, username, first_name, telegram, language } = targets[i];
    const name = first_name || username || null;
    const lang = language || 'en';

    if ((i + 1) % 10 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  sent=${stats.tg} skip=${stats.tgSkipped} fail=${stats.tgFailed}`);
    }

    if (!SKIP_TG && telegram) {
      if (await alreadySent(user_id, TG_CHANNEL)) {
        stats.tgSkipped++;
        continue;
      }

      const r = await tgApi('sendPhoto', {
        chat_id:    telegram,
        photo:      HERO_URL,
        caption:    tgCaption(name, lang),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: btnLabel(lang), url: CTA_URL }]],
        },
      });

      if (r.ok) {
        stats.tg++;
        await logSend(user_id, TG_CHANNEL, 'sent');
      } else {
        stats.tgFailed++;
        await logSend(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500));
        if (i < 3) console.warn(`  ✗ @${username}: ${r.description || r.error}`);
      }

      await sleep(TG_DELAY_MS);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  DONE`);
  console.log(`  TG : ${stats.tg} sent · ${stats.tgSkipped} skipped · ${stats.tgFailed} failed`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
