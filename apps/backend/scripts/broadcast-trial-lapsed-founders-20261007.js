#!/usr/bin/env node
'use strict';

/**
 * broadcast-trial-lapsed-founders-20261007.js
 *
 * Targets 6,492 users who got a free PRIME+member trial on 2026-09-24 and
 * never paid. Offers the Founders Edition (lifetime100) — they already know
 * what PNPtv is, so copy leads with desire, not explanation.
 *
 * Channels: in-app DM · Telegram video (file_id cached from Santino QA send)
 * No email.
 *
 * Audience: had grant_source='trial', no wallet_checkout:wallet_usdc entitlement,
 *   not deleted, not banned.
 * Santino (8599671840) force-included first.
 *
 * Usage (isolated container — NEVER docker exec on live bot):
 *   docker run --rm --env-file <(docker exec pnptv-bot printenv | grep -v '^_') \
 *     -v /root/promos:/tmp/promos:ro \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-trial-lapsed-founders-20261007.js
 *
 *   Add --live to send. Default is dry run.
 *   Add --skip-dm or --skip-tg to disable a channel.
 */

const path  = require('path');
const https = require('https');
const fs    = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY      = !process.argv.includes('--live');
const SKIP_DM  = process.argv.includes('--skip-dm');
const SKIP_TG  = process.argv.includes('--skip-tg');

const WEBAPP_URL  = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const CTA_URL     = `${WEBAPP_URL}/lifetime100`;
const BOT_TOKEN   = process.env.BOT_TOKEN;
const SANTINO_ID  = '8599671840';
const SYSTEM_SENDER = '8552451957';

const VIDEO_PATH = '/tmp/promos/092902_1790709194112.mp4'; // 6 MB
const LOG_TABLE  = 'broadcast_trial_lapsed_founders_20261007';
const DM_CHANNEL = 'founders_dm';
const TG_CHANNEL = 'founders_tg';

const DM_DELAY_MS = 80;
const TG_DELAY_MS = 150;

const sleep  = ms => new Promise(r => setTimeout(r, ms));
const isEs   = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `Ya sabes lo que es PNPtv 🖤

Tuviste acceso. Viste el contenido. Conociste la comunidad.

Ahora puedes tenerlo para siempre — sin renovaciones, sin fechas de vencimiento.

Founders Edition: acceso de por vida, una sola vez.

👉 ${CTA_URL}`;
  }
  return `You already know what PNPtv is 🖤

You had access. You saw the content. You found the community.

Now you can own it forever — no renewals, no expiry dates.

Founders Edition: lifetime access, one time.

👉 ${CTA_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `<b>Ya sabes lo que es PNPtv</b> 🖤\n\n` +
      `Hola${n} —\n\n` +
      `Tuviste acceso gratis. Viste lo que hay adentro.\n\n` +
      `Ahora podés tenerlo para siempre. Founders Edition es acceso de por vida — una sola vez, sin renovaciones.\n\n` +
      `<b>Sé parte de los que construyeron esto desde el inicio.</b>`
    );
  }
  return (
    `<b>You already know what PNPtv is</b> 🖤\n\n` +
    `Hey${n} —\n\n` +
    `You had free access. You saw what's inside.\n\n` +
    `Now you can own it forever. Founders Edition is lifetime access — one time, no renewals.\n\n` +
    `<b>Be part of the ones who built this from the start.</b>`
  );
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

function tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

function tgUploadVideo(chatId, filePath, caption) {
  return new Promise((resolve) => {
    const boundary = 'TGBound' + Date.now();
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML`,
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}`,
    ].join('\r\n') + '\r\n';
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${fileName}"\r\nContent-Type: video/mp4\r\n\r\n`;
    const body = Buffer.concat([
      Buffer.from(parts),
      Buffer.from(fileHeader),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendVideo`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      timeout: 120000,
    }, res => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

function tgSendVideo(chatId, fileId, caption, btnLabel, btnUrl) {
  return tgApi('sendVideo', {
    chat_id: chatId,
    video: fileId,
    caption,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] },
  });
}

// ── Plumbing ──────────────────────────────────────────────────────────────────

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

async function loadTargets() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text                        AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      LOWER(COALESCE(u.language,'en'))  AS language
    FROM users u
    WHERE u.id IN (
      SELECT DISTINCT user_id FROM user_entitlements WHERE grant_source = 'trial'
    )
    AND u.id NOT IN (
      SELECT DISTINCT user_id FROM user_entitlements
      WHERE grant_source = 'wallet_checkout:wallet_usdc'
    )
    AND COALESCE(u.is_deleted, false) = false
    AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
    ORDER BY u.id
  `);

  const hasSantino = rows.some(r => r.user_id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id::text AS user_id, username, first_name, telegram,
              LOWER(COALESCE(language,'en')) AS language
       FROM users WHERE id::text = $1`,
      [SANTINO_ID]
    );
    if (s.length) rows.unshift(s[0]);
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  const targets   = await loadTargets();
  const tgTargets = targets.filter(t => t.telegram && String(t.telegram).trim());

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Trial lapsed → Founders Edition  2026-10-07');
  console.log(`  MODE     : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Channels : dm=${!SKIP_DM} tg=${!SKIP_TG}`);
  console.log(`  Audience : ${targets.length} total · ${tgTargets.length} with TG`);
  console.log(`  CTA      : ${CTA_URL}`);
  console.log(`  Video    : ${VIDEO_PATH}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY) {
    console.log('── DRY sample DM (en) ──────────────────────────────────────');
    console.log(dmText('en'));
    console.log('\n── DRY sample DM (es) ──────────────────────────────────────');
    console.log(dmText('es'));
    const sampleTg = tgTargets[1] || tgTargets[0];
    if (sampleTg) {
      console.log(`\n── DRY sample TG caption (lang=${sampleTg.language}) ────────`);
      console.log(tgCaption(sampleTg.first_name || sampleTg.username || null, sampleTg.language));
    }
    console.log(`\nDRY RUN — would send DM to ${targets.length}, TG to ${tgTargets.length}.`);
    console.log('Re-run with --live to fire.\n');
    process.exit(0);
  }

  // ── Upload video once, cache file_id ───────────────────────────────────────
  let videoFileId = null;
  const videoExists = (() => { try { return fs.statSync(VIDEO_PATH).isFile(); } catch { return false; } })();

  if (!SKIP_TG && videoExists) {
    console.log(`Uploading video via QA send to Santino…`);
    const qa = await tgUploadVideo(SANTINO_ID, VIDEO_PATH, '[QA founders] ' + tgCaption(null, 'en'));
    if (qa.ok && qa.result?.video?.file_id) {
      videoFileId = qa.result.video.file_id;
      console.log(`✓ file_id cached (${videoFileId.slice(0, 24)}…)\n`);
    } else {
      console.error('✗ video upload failed:', qa.description || qa.error);
      console.log('Continuing with text-only TG fallback.\n');
    }
  }

  const stats = { dm: 0, dmSkipped: 0, dmFailed: 0, tg: 0, tgSkipped: 0, tgFailed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const { user_id, username, first_name, telegram, language } = targets[i];
    const name = first_name || username || null;
    const lang = language || 'en';

    if ((i + 1) % 200 === 0) {
      console.log(`  progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
    }

    // In-app DM
    if (!SKIP_DM) {
      if (await alreadySent(user_id, DM_CHANNEL)) {
        stats.dmSkipped++;
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query);
          stats.dm++;
          await logSend(user_id, DM_CHANNEL, 'sent');
        } catch (e) {
          stats.dmFailed++;
          await logSend(user_id, DM_CHANNEL, 'failed', (e.message || '?').slice(0, 500));
        }
        await sleep(DM_DELAY_MS);
      }
    }

    // Telegram
    if (!SKIP_TG && telegram && String(telegram).trim()) {
      if (await alreadySent(user_id, TG_CHANNEL)) {
        stats.tgSkipped++;
      } else {
        const caption  = tgCaption(name, lang);
        const btnLabel = isEs(lang) ? 'Founders Edition ♾️' : 'Founders Edition ♾️';
        let r;
        if (videoFileId) {
          r = await tgSendVideo(telegram, videoFileId, caption, btnLabel, CTA_URL);
        } else {
          r = await tgApi('sendMessage', {
            chat_id: telegram, text: caption, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: btnLabel, url: CTA_URL }]] },
          });
        }
        if (r.ok) {
          stats.tg++;
          await logSend(user_id, TG_CHANNEL, 'sent');
        } else {
          stats.tgFailed++;
          await logSend(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500));
        }
        await sleep(TG_DELAY_MS);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  DONE`);
  console.log(`  DM    : ${stats.dm} sent · ${stats.dmSkipped} skipped · ${stats.dmFailed} failed`);
  console.log(`  TG    : ${stats.tg} sent · ${stats.tgSkipped} skipped · ${stats.tgFailed} failed`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
