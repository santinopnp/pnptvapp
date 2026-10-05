'use strict';

/**
 * One-shot: rewatermark the 4 PRIME videos uploaded with the broken
 * (black-background) watermark between d2e72bea and 3cc44ff2.
 *
 * Per video: enable master_access='temporary' → download original master
 * → create new Mux direct upload with the correct transparent watermark
 * → PUT master → wait for asset ready → swap IDs on channel_videos
 * → delete old asset. Zero quality loss.
 */

const fs = require('fs');
const https = require('https');
const { URL } = require('url');
const { query } = require('../config/postgres');
const muxService = require('../services/muxService');

const Mux = require('@mux/mux-node');
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

const VIDEO_IDS = [488, 489];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log(new Date().toISOString(), ...args);

async function waitForMaster(assetId, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const a = await mux.video.assets.retrieve(assetId);
    if (a.master && a.master.status === 'ready' && a.master.url) return a.master.url;
    if (a.master && a.master.status === 'errored') throw new Error('master errored');
    await sleep(10000);
  }
  throw new Error('master wait timeout');
}

function fetchWithRedirects(url, destPath, maxHops = 5) {
  return new Promise((resolve, reject) => {
    const go = (u, hopsLeft) => {
      https.get(u, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
          if (hopsLeft <= 0) return reject(new Error('too many redirects'));
          res.resume();
          return go(res.headers.location, hopsLeft - 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`download status ${res.statusCode}`));
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    };
    go(url, maxHops);
  });
}

function putFileToMux(filePath, uploadUrl) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size;
    const u = new URL(uploadUrl);
    const req = https.request({
      method: 'PUT',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'Content-Length': size,
        'Content-Type': 'application/octet-stream',
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`PUT status ${res.statusCode}: ${body.slice(0, 500)}`));
      });
    });
    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

async function waitForUploadAsset(uploadId, timeoutMs = 600000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const u = await mux.video.uploads.retrieve(uploadId);
    if (u.asset_id) return u.asset_id;
    if (u.status === 'errored' || u.status === 'cancelled') throw new Error(`upload ${u.status}`);
    await sleep(5000);
  }
  throw new Error('upload asset_id timeout');
}

async function waitForAssetReady(assetId, timeoutMs = 1500000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const a = await mux.video.assets.retrieve(assetId);
    if (a.status === 'ready' && a.playback_ids && a.playback_ids.length > 0) return a;
    if (a.status === 'errored') throw new Error('asset errored');
    await sleep(15000);
  }
  throw new Error('asset ready timeout');
}

async function processVideo(videoId) {
  log(`[${videoId}] start`);

  const { rows } = await query(
    `SELECT mux_asset_id, mux_playback_id, thumbnail_url
       FROM channel_videos WHERE id = $1`,
    [videoId]
  );
  if (!rows[0]) throw new Error('row not found');
  const { mux_asset_id: oldAssetId, mux_playback_id: oldPlaybackId, thumbnail_url: oldThumb } = rows[0];
  log(`[${videoId}] old asset=${oldAssetId} playback=${oldPlaybackId}`);

  log(`[${videoId}] enabling master_access='temporary'`);
  try {
    await mux.video.assets.updateMasterAccess(oldAssetId, { master_access: 'temporary' });
  } catch (err) {
    // "Download already exists" means the previous (interrupted) run enabled it;
    // skip and reuse the existing master URL.
    const msg = err?.message || '';
    if (!/Download already exists/i.test(msg)) throw err;
    log(`[${videoId}] master_access already enabled, reusing`);
  }
  const masterUrl = await waitForMaster(oldAssetId);
  log(`[${videoId}] master url ready`);

  const tmpPath = `/tmp/mux-rewatermark-${videoId}.mp4`;
  log(`[${videoId}] downloading master → ${tmpPath}`);
  await fetchWithRedirects(masterUrl, tmpPath);
  const size = fs.statSync(tmpPath).size;
  log(`[${videoId}] downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);

  log(`[${videoId}] creating new mux direct upload (with transparent watermark)`);
  const { uploadId, uploadUrl } = await muxService.createDirectUpload('https://pnptv.app', { watermark: true });

  log(`[${videoId}] PUTting file to ${uploadId}`);
  await putFileToMux(tmpPath, uploadUrl);
  log(`[${videoId}] PUT complete, waiting for asset`);

  const newAssetId = await waitForUploadAsset(uploadId);
  log(`[${videoId}] new asset ${newAssetId}, waiting ready`);
  const newAsset = await waitForAssetReady(newAssetId);
  const newPlaybackId = newAsset.playback_ids[0].id;
  log(`[${videoId}] new playback ${newPlaybackId}, status ready`);

  // Preserve the original thumbnail time/percentage params — just swap the id.
  let newThumbUrl = oldThumb;
  if (oldThumb && oldPlaybackId && oldThumb.includes(`image.mux.com/${oldPlaybackId}`)) {
    newThumbUrl = oldThumb.replace(oldPlaybackId, newPlaybackId);
  } else if (!oldThumb) {
    newThumbUrl = `https://image.mux.com/${newPlaybackId}/thumbnail.jpg?width=320&fit_mode=preserve&percentage=25`;
  }

  await query(
    `UPDATE channel_videos
        SET mux_asset_id = $1,
            mux_playback_id = $2,
            thumbnail_url = $3
      WHERE id = $4`,
    [newAssetId, newPlaybackId, newThumbUrl, videoId]
  );
  log(`[${videoId}] channel_videos updated`);

  try {
    await mux.video.assets.delete(oldAssetId);
    log(`[${videoId}] old asset ${oldAssetId} deleted`);
  } catch (err) {
    log(`[${videoId}] WARN: old asset delete failed: ${err.message}`);
  }

  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  log(`[${videoId}] done`);
}

(async () => {
  log(`starting rewatermark run for ${VIDEO_IDS.length} videos`);
  for (const vid of VIDEO_IDS) {
    try {
      await processVideo(vid);
    } catch (err) {
      log(`[${vid}] FAILED: ${err.stack || err.message}`);
    }
  }
  log('ALL DONE');
  process.exit(0);
})();
