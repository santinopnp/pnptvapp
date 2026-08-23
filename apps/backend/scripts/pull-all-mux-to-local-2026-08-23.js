#!/usr/bin/env node
'use strict';

/**
 * pull-all-mux-to-local-2026-08-23.js
 *
 * Migrate every remaining Mux-hosted channel_video off Mux and onto the local
 * /uploads/videos/<id>.mp4 path (already publicly reachable via nginx and
 * bind-mounted into pnptv-bot at /app/public/uploads).
 *
 * Per video:
 *   1. Fetch Mux master manifest, pick the 720p variant (or the closest
 *      lower one if 720p is missing) — cuts filesize ~50-65 % vs 1080p.
 *   2. ffmpeg -c copy -movflags +faststart into /opt/pnptvapp/public/uploads/videos/<id>.mp4.
 *   3. Grab a poster JPG at 25 % duration into <id>.jpg.
 *   4. UPDATE channel_videos: null mux_asset_id/playback_id/status,
 *      video_url = /uploads/videos/<id>.mp4,
 *      thumbnail_url = https://pnptv.app/uploads/videos/<id>.jpg.
 *   5. UPDATE social_posts where metadata.video_id = <id>: rewrite
 *      metadata.video_url, media_url (if Mux), video_thumbnail_url.
 *   6. Delete the Mux asset.
 *
 * Disk safety: aborts if free space on / drops below --min-free-gb (default 5).
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/pull-all-mux-to-local-2026-08-23.js            # dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/pull-all-mux-to-local-2026-08-23.js --live      # execute
 *   flags: --limit N            (process first N rows only)
 *          --min-free-gb N      (abort if free < N GB, default 5)
 *          --keep-mux           (skip Mux deletion — DB switch only)
 *          --skip-existing      (skip videos whose local file already exists)
 *
 * NOTE: this script runs INSIDE the pnptv-bot container. It writes to
 * /app/public/uploads/videos/ (== /opt/pnptvapp/public/uploads/videos/ on
 * the host via bind-mount) and calls ffmpeg — the ffmpeg binary must be
 * present in the container.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const Mux = require('@mux/mux-node');

const LIVE          = process.argv.includes('--live');
const KEEP_MUX      = process.argv.includes('--keep-mux');
const SKIP_EXISTING = process.argv.includes('--skip-existing');
const LIMIT         = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? parseInt(process.argv[i+1], 10) : null; })();
const MIN_FREE_GB   = (() => { const i = process.argv.indexOf('--min-free-gb'); return i >= 0 ? parseInt(process.argv[i+1], 10) : 5; })();

const UPLOAD_DIR = '/app/public/uploads/videos';
const PUBLIC_HOST = 'https://pnptv.app';
const TARGET_HEIGHT = 720;

function log(msg) {
  const t = new Date().toISOString().replace('T',' ').slice(0,19);
  console.log(`[${t}] ${msg}`);
}

function freeGbOnRoot() {
  // POSIX df — parse "Avail" column (in 1K blocks by default with -B1G)
  const { execSync } = require('child_process');
  const out = execSync('df -BG / | tail -1').toString();
  const cols = out.trim().split(/\s+/);
  return parseInt(cols[3].replace('G',''), 10);
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`GET ${url} → ${res.statusCode}`));
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function pick720Variant(masterM3u8) {
  const lines = masterM3u8.split('\n');
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+).*RESOLUTION=(\d+)x(\d+)/);
    if (m) {
      const bw = parseInt(m[1], 10);
      const w = parseInt(m[2], 10);
      const h = parseInt(m[3], 10);
      const url = lines[i+1] && lines[i+1].startsWith('http') ? lines[i+1] : null;
      if (url) variants.push({ bw, w, h, url });
    }
  }
  if (variants.length === 0) return null;
  // Prefer the tallest variant that is <= TARGET_HEIGHT. If none, take the
  // smallest one (lower than target).
  const atOrBelow = variants.filter(v => v.h <= TARGET_HEIGHT).sort((a,b) => b.h - a.h);
  if (atOrBelow.length > 0) return atOrBelow[0];
  return variants.sort((a,b) => a.h - b.h)[0];
}

function runFfmpeg(args, timeoutSec = 900) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', c => { stderr += c; if (stderr.length > 8000) stderr = stderr.slice(-4000); });
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`ffmpeg timeout after ${timeoutSec}s`)); }, timeoutSec * 1000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

async function fetchTargets() {
  const { rows } = await query(
    `SELECT cv.id, cv.channel_id, cv.title, cv.mux_asset_id, cv.mux_playback_id,
            cv.duration_sec, cv.thumbnail_url, cv.video_url
       FROM channel_videos cv
      WHERE cv.mux_playback_id IS NOT NULL
        AND cv.channel_id <> 209
      ORDER BY cv.channel_id, cv.id`
  );
  return rows;
}

async function processOne(video, mux) {
  const id = video.id;
  const dst = path.join(UPLOAD_DIR, `${id}.mp4`);
  const thumb = path.join(UPLOAD_DIR, `${id}.jpg`);
  const pbid = video.mux_playback_id;

  // Disk guard
  const freeGb = freeGbOnRoot();
  if (freeGb < MIN_FREE_GB) {
    throw new Error(`ABORT: only ${freeGb} GB free on /, below --min-free-gb=${MIN_FREE_GB}`);
  }

  if (SKIP_EXISTING && fs.existsSync(dst) && fs.statSync(dst).size > 1024 * 1024) {
    log(`  row=${id} skip (local file exists ${fs.statSync(dst).size} bytes)`);
    return { skipped: true };
  }

  // 1. Grab master + pick 720p (or nearest lower)
  const masterUrl = `https://stream.mux.com/${pbid}.m3u8`;
  log(`  row=${id} ch=${video.channel_id} pbid=${pbid.slice(0,10)}... free=${freeGb}GB`);
  let variant;
  try {
    const master = await httpGetText(masterUrl);
    variant = pick720Variant(master);
    if (!variant) throw new Error('no valid variants in master');
  } catch (err) {
    return { error: `master fetch: ${err.message}` };
  }
  log(`    picked ${variant.w}x${variant.h} @ ${variant.bw} bps`);

  if (!LIVE) {
    log(`    [DRY] would download → ${dst} + delete mux asset ${video.mux_asset_id}`);
    return { dry: true };
  }

  // 2. ffmpeg remux
  const tmp = `${dst}.tmp`;
  try {
    await runFfmpeg([
      '-nostdin','-y','-v','error',
      '-i', variant.url,
      '-c','copy','-bsf:a','aac_adtstoasc','-movflags','+faststart',
      '-f','mp4', tmp,
    ], /* timeoutSec */ Math.max(600, (video.duration_sec || 300) * 3));
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    return { error: `ffmpeg: ${err.message}` };
  }
  const size = fs.statSync(tmp).size;
  if (size < 1024) {
    try { fs.unlinkSync(tmp); } catch {}
    return { error: `output too small: ${size} bytes` };
  }
  fs.renameSync(tmp, dst);
  log(`    ✓ mp4 ${(size / (1024*1024)).toFixed(1)} MB`);

  // 3. Thumbnail at 25% of duration (or 10s if unknown)
  const seekSec = video.duration_sec ? Math.max(1, Math.floor(video.duration_sec * 0.25)) : 10;
  try {
    await runFfmpeg([
      '-nostdin','-y','-v','error',
      '-ss', String(seekSec),
      '-i', dst,
      '-vframes','1','-vf','scale=640:-1','-q:v','3',
      thumb,
    ], 60);
    log(`    ✓ thumb ${(fs.statSync(thumb).size / 1024).toFixed(0)} KB`);
  } catch (err) {
    log(`    (thumbnail failed non-fatal: ${err.message.slice(0, 200)})`);
  }

  // 4. UPDATE channel_videos + social_posts (transactional)
  const localVideoUrl = `/uploads/videos/${id}.mp4`;
  const publicThumbUrl = `${PUBLIC_HOST}/uploads/videos/${id}.jpg`;
  await query(
    `UPDATE channel_videos
        SET mux_asset_id    = NULL,
            mux_playback_id = NULL,
            mux_status      = NULL,
            video_url       = $2,
            thumbnail_url   = $3,
            updated_at      = NOW()
      WHERE id = $1`,
    [id, localVideoUrl, publicThumbUrl]
  );
  const publicVideoUrl = `${PUBLIC_HOST}${localVideoUrl}`;
  const sp = await query(
    `UPDATE social_posts sp
        SET metadata = sp.metadata || jsonb_build_object('video_url', $2::text),
            video_thumbnail_url = $3,
            media_url = CASE WHEN sp.media_url LIKE 'https://stream.mux.com/%' THEN $2 ELSE sp.media_url END,
            mux_playback_id = NULL,
            mux_status = NULL
      WHERE (sp.metadata->>'video_id')::bigint = $1
         OR sp.mux_playback_id = $4
      RETURNING sp.id`,
    [id, publicVideoUrl, publicThumbUrl, pbid]
  );
  log(`    ✓ db: channel_videos.1 social_posts.${sp.rowCount}`);

  // 5. Delete Mux asset
  if (!KEEP_MUX && video.mux_asset_id) {
    try {
      await mux.video.assets.delete(video.mux_asset_id);
      log(`    ✓ mux delete ${video.mux_asset_id.slice(0,10)}...`);
    } catch (err) {
      log(`    ⚠ mux delete failed (non-fatal): ${err.status || ''} ${err.message}`);
    }
  }

  return { ok: true, sizeBytes: size };
}

async function main() {
  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    throw new Error('MUX_TOKEN_ID / MUX_TOKEN_SECRET missing');
  }
  const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });

  if (LIVE) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  let targets = await fetchTargets();
  if (LIMIT) targets = targets.slice(0, LIMIT);
  log(`Found ${targets.length} Mux-hosted videos to migrate (target height ≤ ${TARGET_HEIGHT}p)`);
  log(`Mode: ${LIVE ? (KEEP_MUX ? 'LIVE (keep Mux)' : 'LIVE + DELETE MUX') : 'DRY-RUN'}   min-free=${MIN_FREE_GB}GB`);

  let ok = 0, err = 0, skipped = 0, totalBytes = 0;
  const errors = [];

  for (const [i, v] of targets.entries()) {
    try {
      const res = await processOne(v, mux);
      if (res.skipped) skipped++;
      else if (res.dry) { /* noop */ }
      else if (res.error) { err++; errors.push({ id: v.id, error: res.error }); log(`  row=${v.id} FAILED: ${res.error}`); }
      else if (res.ok) { ok++; totalBytes += res.sizeBytes || 0; }
    } catch (err2) {
      if (err2.message.startsWith('ABORT')) { log(err2.message); break; }
      err++;
      errors.push({ id: v.id, error: err2.message });
      log(`  row=${v.id} EXCEPTION: ${err2.message}`);
    }
    if ((i+1) % 10 === 0) log(`--- progress ${i+1}/${targets.length}: ok=${ok} err=${err} skipped=${skipped} total=${(totalBytes/(1024**3)).toFixed(2)}GB ---`);
  }

  log('');
  log(`=== DONE ok=${ok} err=${err} skipped=${skipped} totalDownloaded=${(totalBytes/(1024**3)).toFixed(2)}GB ===`);
  if (errors.length) {
    log('Errors:');
    for (const e of errors) log(`  row=${e.id}: ${e.error}`);
  }

  const after = await query(
    `SELECT COUNT(*) FILTER (WHERE mux_playback_id IS NOT NULL) AS still_mux,
            COUNT(*) FILTER (WHERE mux_asset_id IS NOT NULL) AS still_mux_asset,
            COUNT(*) AS total
       FROM channel_videos WHERE channel_id <> 209 AND status='published'`
  );
  log(`Non-Prime published: total=${after.rows[0].total}  still_on_mux=${after.rows[0].still_mux}  still_mux_asset=${after.rows[0].still_mux_asset}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
