'use strict';
/**
 * bunnyStreamService — Bunny Stream para los shows pregrabados de creadores
 * Crystal.
 *
 * Por qué subida directa navegador → Bunny (TUS) y no vía backend:
 * cada slot son hasta 2 h de vídeo (~2 GB). Pasarlo por el servidor lo
 * escribiría en un disco que ya está al 86%, y una subida rota a mitad dejaría
 * basura. TUS además es reanudable, que a 2 GB por móvil no es opcional.
 *
 * El backend solo:
 *   1. crea el objeto de vídeo en Bunny (necesita la API key, que NUNCA sale
 *      al cliente), y
 *   2. firma la subida TUS con una expiración corta.
 * El navegador sube los bytes directamente a Bunny con esa firma.
 *
 * Env:
 *   BUNNY_STREAM_LIBRARY_ID     id numérico de la librería
 *   BUNNY_STREAM_API_KEY        clave DE LA LIBRERÍA (no la de cuenta)
 *   BUNNY_STREAM_CDN_HOSTNAME   vz-xxxxxxxx.b-cdn.net
 *   BUNNY_STREAM_TOKEN_KEY      opcional: token auth de la librería. Si está,
 *                               las URLs de reproducción se firman y caducan.
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

const API_BASE = 'https://video.bunnycdn.com';
const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '';
const API_KEY = process.env.BUNNY_STREAM_API_KEY || '';
const CDN_HOST = process.env.BUNNY_STREAM_CDN_HOSTNAME || '';
const TOKEN_KEY = process.env.BUNNY_STREAM_TOKEN_KEY || '';

/** Subida TUS: 6 h de margen. Un slot de 2 h por conexión lenta puede tardar. */
const TUS_EXPIRY_SECONDS = 6 * 60 * 60;
/** Reproducción firmada: 4 h, suficiente para ver un loop de 2 h entero. */
const PLAYBACK_EXPIRY_SECONDS = 4 * 60 * 60;

function isConfigured() {
  return Boolean(LIBRARY_ID && API_KEY && CDN_HOST);
}

function _assertConfigured() {
  if (!isConfigured()) {
    const err = new Error('Bunny Stream no está configurado');
    err.code = 'BUNNY_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }
}

async function _api(method, path, body) {
  _assertConfigured();
  const res = await fetch(`${API_BASE}/library/${LIBRARY_ID}${path}`, {
    method,
    headers: {
      AccessKey: API_KEY,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* Bunny devuelve texto en algunos errores */ }
  if (!res.ok) {
    const err = new Error(`Bunny ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    err.code = 'BUNNY_API_ERROR';
    throw err;
  }
  return json;
}

/** Crea el objeto de vídeo (aún sin bytes) y devuelve su guid. */
async function createVideo(title) {
  const clean = String(title || 'untitled').slice(0, 200);
  const v = await _api('POST', '/videos', { title: clean });
  logger.info('[bunny] vídeo creado', { guid: v.guid, title: clean });
  return v;
}

/**
 * Firma para que el navegador suba directo por TUS.
 * Bunny espera: sha256(libraryId + apiKey + expirationTime + videoId).
 * La API key se usa solo aquí, en el servidor; al cliente va la firma.
 */
function createTusUpload(videoGuid) {
  _assertConfigured();
  const expiration = Math.floor(Date.now() / 1000) + TUS_EXPIRY_SECONDS;
  const signature = crypto
    .createHash('sha256')
    .update(`${LIBRARY_ID}${API_KEY}${expiration}${videoGuid}`)
    .digest('hex');
  return {
    endpoint: TUS_ENDPOINT,
    headers: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expiration),
      VideoId: videoGuid,
      LibraryId: String(LIBRARY_ID),
    },
    expiresAt: expiration * 1000,
  };
}

async function getVideo(guid) {
  return _api('GET', `/videos/${encodeURIComponent(guid)}`);
}

async function deleteVideo(guid) {
  await _api('DELETE', `/videos/${encodeURIComponent(guid)}`);
  logger.info('[bunny] vídeo borrado', { guid });
  return true;
}

/**
 * ¿Está listo para reproducir? Bunny transcodifica en background; un slot de
 * 2 h tarda un buen rato. status 4 = Finished, 5 = Error.
 */
function isReady(video) {
  return Number(video?.status) === 4;
}
function hasFailed(video) {
  return Number(video?.status) === 5;
}

/**
 * URL HLS. Si la librería tiene Token Authentication activado (recomendado:
 * es contenido de pago) hace falta BUNNY_STREAM_TOKEN_KEY o el CDN devuelve
 * 403. Sin esa env se devuelve la URL sin firmar, que solo funciona con token
 * auth desactivado.
 */
function getPlaybackUrl(guid, { expirySeconds = PLAYBACK_EXPIRY_SECONDS } = {}) {
  _assertConfigured();
  const path = `/${guid}/playlist.m3u8`;
  if (!TOKEN_KEY) return `https://${CDN_HOST}${path}`;
  const expires = Math.floor(Date.now() / 1000) + expirySeconds;
  const token = crypto
    .createHash('sha256')
    .update(`${TOKEN_KEY}${path}${expires}`)
    .digest('base64')
    .replace(/\n/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `https://${CDN_HOST}${path}?token=${token}&expires=${expires}`;
}

function getThumbnailUrl(guid) {
  _assertConfigured();
  return `https://${CDN_HOST}/${guid}/thumbnail.jpg`;
}

module.exports = {
  isConfigured,
  createVideo,
  createTusUpload,
  getVideo,
  deleteVideo,
  isReady,
  hasFailed,
  getPlaybackUrl,
  getThumbnailUrl,
};
