'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');

let _mux = null;
function getMux() {
  if (_mux) return _mux;
  const Mux = require('@mux/mux-node');
  _mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
  });
  return _mux;
}

async function createDirectUpload(corsOrigin = 'https://pnptv.app', opts = {}) {
  const mux = getMux();
  const settings = {
    playback_policy: ['public'],
    encoding_tier: 'smart',
  };

  // Baked-in PNPtv watermark (channel uploads opt in via opts.watermark).
  // Mux fetches the overlay URL once at transcode time and burns it into
  // every rendition — survives download, screen-recording, direct HLS pull.
  if (opts.watermark) {
    settings.input = [
      {
        url: 'https://pnptv.app/logo-final.png',
        overlay_settings: {
          vertical_align: 'bottom',
          vertical_margin: '4%',
          horizontal_align: 'right',
          horizontal_margin: '4%',
          width: '8%',
          opacity: '35%',
        },
      },
    ];
  }

  const upload = await mux.video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: settings,
  });
  return { uploadId: upload.id, uploadUrl: upload.url };
}

async function getAsset(assetId) {
  return getMux().video.assets.retrieve(assetId);
}

async function getUpload(uploadId) {
  return getMux().video.uploads.retrieve(uploadId);
}

function getPlaybackUrl(playbackId) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

function getThumbnailUrl(playbackId, opts = {}) {
  const { time, percentage = 25, width = 320 } = opts;
  // fit_mode=preserve keeps the video's natural aspect ratio so portrait videos
  // don't get cropped to a 16:9 landscape thumbnail (smartcrop default).
  const base = `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&fit_mode=preserve`;
  if (time != null) return `${base}&time=${time}`;
  return `${base}&percentage=${percentage}`;
}

function getThumbnailOptions(playbackId) {
  const base = `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&fit_mode=smartcrop`;
  return [
    { label: 'Inicio', url: `${base}&percentage=10` },
    { label: 'Medio',  url: `${base}&percentage=50` },
    { label: 'Final',  url: `${base}&percentage=90` },
  ];
}

async function deleteAsset(assetId) {
  try {
    await getMux().video.assets.delete(assetId);
  } catch (err) {
    logger.warn('muxService.deleteAsset failed', { assetId, err: err.message });
  }
}

function verifyWebhookSignature(rawBody, signature, secret) {
  try {
    const parts = Object.fromEntries(
      signature.split(',').map(p => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; })
    );
    const timestamp = parts.t;
    const expectedHash = parts.v1;
    if (!timestamp || !expectedHash) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    const payload = `${timestamp}.${rawBody}`;
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  createDirectUpload,
  getAsset,
  getUpload,
  getPlaybackUrl,
  getThumbnailUrl,
  getThumbnailOptions,
  deleteAsset,
  verifyWebhookSignature,
};
