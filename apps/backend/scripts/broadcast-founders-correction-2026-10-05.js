#!/usr/bin/env node
'use strict';

/**
 * broadcast-founders-correction-2026-10-05.js
 *
 * Correction for broadcast-founders-urgency-2026-10-05:
 * The CTA link sent was wrong. This resends the correct link ONLY
 * to users who already received the faulty DM/TG.
 *
 * Audience : users in dedup for founders-urgency-2026-10-05-dm (6,999)
 *            + TG correction for founders-urgency-2026-10-05-tg (2,414)
 * Channels : in-app DM + TG text (no photo, just correction)
 * Dedup key: founders-urgency-correction-2026-10-05-*
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY        = !process.argv.includes('--live');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';

const CTA_URL  = `${WEBAPP_URL}/lifetime100`;
const CAMPAIGN = 'founders-urgency-correction-2026-10-05';
const BATCH_DM = `${CAMPAIGN}-dm`;
const BATCH_TG = `${CAMPAIGN}-tg`;
const DM_DELAY = 80;
const TG_DELAY = 150;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function dmText(lang) {
  if (isEs(lang)) return `Corrección rápida 🙏

El link que te enviamos hace un momento estaba mal. El correcto es este:
👉 ${CTA_URL}

Disculpa la confusión — el precio y la fecha límite (domingo 12 oct) siguen igual.`;

  return `Quick correction 🙏

The link we just sent you was wrong. Here's the right one:
👉 ${CTA_URL}

Sorry for the confusion — the price and deadline (Sunday Oct 12) are the same.`;
}

function tgRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(
      {
        hostname: 'api.telegram.org',
        path    : `/bot${BOT_TOKEN}/${method}`,
        method  : 'POST',
        headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(JSON.parse(b))); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendTgText(telegramId, lang) {
  if (!BOT_TOKEN || !telegramId) return false;
  try {
    const text = isEs(lang)
      ? `Corrección rápida 🙏 El link anterior estaba mal. El correcto: ${CTA_URL}\n\n(precio y fecha límite sin cambios)`
      : `Quick correction 🙏 The link we sent was wrong. Correct one: ${CTA_URL}\n\n(price and deadline unchanged)`;
    const res = await tgRequest('sendMessage', {
      chat_id     : telegramId,
      text,
      reply_markup: { inline_keyboard: [[{ text: '🔒 Get Founders Access', url: CTA_URL }]] },
    });
    return res.ok;
  } catch { return false; }
}

async function main() {
  await initializePostgres();

  // Users who got the wrong DM
  const { rows: dmRows } = await query(`
    SELECT u.id, u.telegram, u.language
    FROM users u
    JOIN broadcast_dedup bd ON bd.user_id = u.id::text
    WHERE bd.batch_id = 'founders-urgency-2026-10-05-dm'
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup
        WHERE user_id = u.id::text AND batch_id LIKE '${CAMPAIGN}%'
      )
    UNION
    SELECT id, telegram, language FROM users WHERE id::text = '${SANTINO_ID}'
    ORDER BY id
  `);

  // Users who got the wrong TG (subset — for TG correction only)
  const { rows: tgRows } = await query(`
    SELECT u.id, u.telegram, u.language
    FROM users u
    JOIN broadcast_dedup bd ON bd.user_id = u.id::text
    WHERE bd.batch_id = 'founders-urgency-2026-10-05-tg'
      AND u.telegram IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup
        WHERE user_id = u.id::text AND batch_id = '${BATCH_TG}'
      )
    ORDER BY u.id
  `);

  const tgSet = new Set(tgRows.map(r => r.id));

  console.log(`[${DRY ? 'DRY RUN' : 'LIVE'}] DM correction: ${dmRows.length} users`);
  console.log(`[${DRY ? 'DRY RUN' : 'LIVE'}] TG correction: ${tgRows.length} users`);
  if (DRY) { console.log('Pass --live to send.'); process.exit(0); }

  let dmOk = 0, dmFail = 0, tgOk = 0, tgFail = 0;

  for (const u of dmRows) {
    const lang = u.language || 'en';

    // In-app DM correction
    try {
      await sendSystemDM(u.id, dmText(lang));
      dmOk++;
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_DM, u.id]
      );
    } catch { dmFail++; }
    await sleep(DM_DELAY);

    // TG correction only for those who got TG
    if (u.telegram && tgSet.has(u.id)) {
      const ok = await sendTgText(u.telegram, lang);
      ok ? tgOk++ : tgFail++;
      if (ok) await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_TG, u.id]
      );
      await sleep(TG_DELAY);
    }

    if ((dmOk + dmFail) % 100 === 0) process.stdout.write('.');
  }

  console.log(`\nDM correction → sent: ${dmOk} / failed: ${dmFail}`);
  console.log(`TG correction → sent: ${tgOk} / failed: ${tgFail}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
