#!/usr/bin/env node
'use strict';

/**
 * broadcast-cashapp-revolut-crypto-2026-10-06.js
 *
 * Tells all users they can subscribe using crypto bought on CashApp or Revolut.
 * Flow: buy Bitcoin/crypto in either app → send to PNPtv /subscribe → done.
 *
 * Audience : all non-banned users
 * Channels : TG video DM + in-app DM (sendSystemDM) + web push
 * Dedup    : cashapp-revolut-crypto-2026-10-06%  (campaign-wide LIKE)
 * CC       : Santino always first (also used to capture TG file_id)
 * Hero     : /root/promos/100414_1791167196177.mp4 — mount via -v /root/promos:/promos
 *
 * DRY RUN (default — no sends, prints copy + audience size):
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     -v /root/promos:/promos \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-cashapp-revolut-crypto-2026-10-06.js
 *
 * LIVE:
 *   docker run --rm \
 *     --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     -v /root/promos:/promos \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-cashapp-revolut-crypto-2026-10-06.js --live
 */

const path  = require('path');
const fs    = require('fs');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY        = !process.argv.includes('--live');
const TG_ONLY    = process.argv.includes('--tg-only');  // skip DM+push, only send TG video
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';

const VIDEO_PATH = '/promos/092902_1790709194112.mp4';
const CTA_URL    = `${WEBAPP_URL}/subscribe`;
const CAMPAIGN   = 'cashapp-revolut-crypto-2026-10-06';
const TG_DELAY   = 150;
const DM_DELAY   = 80;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) return `💎 ¿Ya usás CashApp o Revolut?

Podés pagar PRIME directo desde cualquiera de las dos — sin tarjeta.

Así es:
→ Abrí CashApp o Revolut
→ Comprá un poco de Bitcoin (o cualquier crypto en Revolut)
→ Entrá a pnptv.app/subscribe → elegí "Pagar con Crypto"
→ Enviá el monto que aparece — listo

Dos minutos. Desbloqueás todo.

👉 ${CTA_URL}

— Santino & Lex`;

  return `💎 Already using CashApp or Revolut?

You can pay for PRIME right from either app — no card needed.

Here's how:
→ Open CashApp or Revolut
→ Buy a little Bitcoin (or any crypto on Revolut)
→ Go to pnptv.app/subscribe → choose "Pay with Crypto"
→ Send the amount shown — done

Takes 2 minutes. Unlock everything.

👉 ${CTA_URL}

— Santino & Lex`;
}

function tgCaption(lang) {
  if (isEs(lang)) return `💎 ¿CashApp o Revolut? Comprá crypto → pagá en /subscribe → desbloqueás todo. 2 minutos.`;
  return `💎 CashApp or Revolut? Buy crypto → pay at /subscribe → unlock everything. Takes 2 minutes.`;
}

function ctaButton(lang) {
  return {
    inline_keyboard: [[{
      text: isEs(lang) ? '💎 Suscribirse con Crypto' : '💎 Subscribe with Crypto',
      url : CTA_URL,
    }]],
  };
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

function tgJsonRequest(method, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.telegram.org',
      path    : `/bot${BOT_TOKEN}/${method}`,
      method  : 'POST',
      headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout : 15000,
    }, res => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(data); req.end();
  });
}

// Upload video file via multipart — used once to get file_id
function uploadVideoFile(chatId, filePath, lang) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve({ ok: false, error: `File not found: ${filePath}` });
      return;
    }
    const boundary = `TGBound${Date.now().toString(16)}`;
    const filename  = path.basename(filePath);
    const fileData  = fs.readFileSync(filePath);
    const caption   = tgCaption(lang);
    const markup    = JSON.stringify(ctaButton(lang));

    const head = [
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML`,
      `--${boundary}\r\nContent-Disposition: form-data; name="reply_markup"\r\n\r\n${markup}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4`,
    ].join('\r\n') + '\r\n\r\n';

    const body = Buffer.concat([Buffer.from(head), fileData, Buffer.from(`\r\n--${boundary}--\r\n`)]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path    : `/bot${BOT_TOKEN}/sendVideo`,
      method  : 'POST',
      headers : {
        'Content-Type'  : `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 120000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'upload timeout' }); });
    req.write(body); req.end();
  });
}

async function sendTgVideo(chatId, videoSrc, lang, isUpload) {
  if (!BOT_TOKEN || !chatId) return { ok: false };
  try {
    if (isUpload) return uploadVideoFile(chatId, videoSrc, lang);
    return tgJsonRequest('sendVideo', {
      chat_id     : chatId,
      video       : videoSrc,
      caption     : tgCaption(lang),
      parse_mode  : 'HTML',
      reply_markup: ctaButton(lang),
    });
  } catch { return { ok: false }; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set — aborting'); process.exit(1); }

  // ── Audience ───────────────────────────────────────────────────────────────
  // --tg-only: users with telegram who haven't received TG yet (ignore DM dedup)
  // default:   all non-banned users not yet hit by any channel of this campaign
  const dedupFilter = TG_ONLY ? `${CAMPAIGN}-tg` : `${CAMPAIGN}%`;
  const { rows } = await query(`
    SELECT u.id, u.telegram, u.language,
           EXISTS (
             SELECT 1 FROM push_subscriptions ps
             WHERE ps.user_id = u.id::text AND ps.endpoint IS NOT NULL
           ) AS has_push
    FROM users u
    WHERE u.deleted_at IS NULL
      AND COALESCE(u.tier, 'free') != 'banned'
      ${TG_ONLY ? 'AND u.telegram IS NOT NULL' : ''}
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup bd
        WHERE bd.user_id = u.id::text
          AND bd.batch_id LIKE $1
      )
    UNION
    SELECT id, telegram, language,
           EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = id::text) AS has_push
    FROM users WHERE id::text = $2
    ORDER BY id
  `, [dedupFilter, SANTINO_ID]);

  const withTg   = rows.filter(r => r.telegram).length;
  const withPush = rows.filter(r => r.has_push).length;

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — Pay with CashApp / Revolut · 2026-10-06');
  console.log(`  Campaign  : ${CAMPAIGN}`);
  console.log(`  Audience  : ${rows.length} users  (TG: ${withTg}  Push: ${withPush})`);
  console.log(`  Video     : ${VIDEO_PATH}  (exists: ${fs.existsSync(VIDEO_PATH) ? 'YES' : 'NO'})`);
  console.log(`  Mode      : ${DRY ? 'DRY RUN — pass --live to send' : '🚀 LIVE'}${TG_ONLY ? ' (TG only)' : ''}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY) {
    console.log('── EN in-app DM ──\n');
    console.log(dmText('en'));
    console.log('\n── ES in-app DM ──\n');
    console.log(dmText('es'));
    console.log(`\n── EN TG caption ──\n${tgCaption('en')}`);
    console.log(`── ES TG caption ──\n${tgCaption('es')}`);
    if (!fs.existsSync(VIDEO_PATH)) {
      console.warn(`\n⚠️  Video not found at ${VIDEO_PATH} — add -v /root/promos:/promos to docker run`);
    }
    console.log('\n-- DRY RUN complete. Pass --live to send. --\n');
    process.exit(0);
  }

  if (!fs.existsSync(VIDEO_PATH)) {
    console.error(`Video not found: ${VIDEO_PATH}. Add -v /root/promos:/promos to docker run.`);
    process.exit(1);
  }

  // ── Web push (fire-and-forget, skipped in --tg-only mode) ────────────────
  if (TG_ONLY) {
    console.log('TG-only mode — skipping push + in-app DMs.\n');
  }
  if (!TG_ONLY) (async () => {
    try {
      await PushNotificationService.initialize();
      const sent = await PushNotificationService.sendToAll({
        title: '💎 Pay with CashApp or Revolut',
        body : 'Buy crypto → subscribe in 2 min',
        url  : CTA_URL,
        icon : `${WEBAPP_URL}/icon-192.png`,
        tag  : CAMPAIGN,
      });
      console.log(`PUSH → delivered: ${sent}`);
    } catch (e) { console.error('PUSH error:', e.message); }
  })();

  // ── Santino CC first — upload video, capture file_id ─────────────────────
  let tgFileId = null;
  const santinoRow = rows.find(r => String(r.id) === SANTINO_ID);

  if (santinoRow?.telegram) {
    console.log('Uploading video for Santino CC (first send — capturing file_id)…');
    const res = await sendTgVideo(santinoRow.telegram, VIDEO_PATH, santinoRow.language || 'en', true);
    if (res.ok && res.result?.video?.file_id) {
      tgFileId = res.result.video.file_id;
      console.log(`  ✓ TG CC Santino — file_id captured`);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [`${CAMPAIGN}-tg`, SANTINO_ID]
      );
    } else {
      console.warn(`  ✗ TG CC Santino — ${JSON.stringify(res.description || res.error)}`);
      console.warn('  Continuing without file_id — will upload for each TG user (slow).');
    }

    // In-app DM for Santino — self-send guard in sendSystemDM skips this silently,
    // which is intentional (Santino sees his copy via TG photo above)
    try {
      await sendSystemDM(SANTINO_ID, SANTINO_ID, dmText(santinoRow.language || 'en'), query);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [`${CAMPAIGN}-dm`, SANTINO_ID]
      );
    } catch (e) {
      console.warn(`  ✗ DM CC Santino — ${e.message}`);
    }
    await sleep(TG_DELAY);
  }

  // ── Main send loop ────────────────────────────────────────────────────────
  const stats = { dmOk: 0, dmFail: 0, tgOk: 0, tgFail: 0 };

  for (const u of rows) {
    if (String(u.id) === SANTINO_ID) continue;

    const lang = u.language || 'en';

    // In-app DM (skipped in --tg-only mode)
    if (!TG_ONLY) {
      try {
        await sendSystemDM(SANTINO_ID, u.id, dmText(lang), query);
        stats.dmOk++;
        await query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [`${CAMPAIGN}-dm`, u.id]
        );
      } catch { stats.dmFail++; }
      await sleep(DM_DELAY);
    }

    // Telegram video
    if (u.telegram) {
      const src      = tgFileId || VIDEO_PATH;
      const isUpload = !tgFileId;
      const res      = await sendTgVideo(u.telegram, src, lang, isUpload);

      if (res.ok) {
        stats.tgOk++;
        if (!tgFileId && res.result?.video?.file_id) {
          tgFileId = res.result.video.file_id;
          console.log(`  → file_id captured from user ${u.id}`);
        }
        await query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [`${CAMPAIGN}-tg`, u.id]
        );
      } else {
        stats.tgFail++;
        if (stats.tgFail <= 5) {
          console.log(`  ✗ TG ${u.id}  ${JSON.stringify(res.description || res.error)}`);
        }
      }
      await sleep(TG_DELAY);
    }

    if ((stats.dmOk + stats.dmFail) % 500 === 0 && stats.dmOk + stats.dmFail > 0) {
      process.stdout.write(`  …${stats.dmOk + stats.dmFail} processed\n`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DONE');
  console.log(`  In-app DM : sent ${stats.dmOk}  / failed ${stats.dmFail}`);
  console.log(`  Telegram  : sent ${stats.tgOk}  / failed ${stats.tgFail}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
