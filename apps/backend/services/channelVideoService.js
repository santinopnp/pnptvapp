'use strict';
/**
 * channelVideoService — universal "upload a video to my channel" pipeline.
 *
 * Replaces the admin-only /admin/prime-videos/upload flow for non-admin
 * creators. Each creator who owns a creator_channels row (or is in the
 * collaborators array) can:
 *
 *   1. uploadVideo()       → POST file to Directus, INSERT channel_videos (status=processing)
 *   2. aiTitle/aiDesc/aiTags → Grok-assisted metadata generation, stored on the row
 *   3. updateVideo()       → patch title/description/tags pre-publish
 *   4. publishVideo()      → generate 3s GIF via ffmpeg, create promo social_post,
 *                            mark status=published. GIF failures fall back to JPG.
 *   5. deleteVideo()       → soft-delete + tombstone the promo post
 *
 * Per-channel access_type ('free'|'subscription'|'prime'|'paid') is captured in
 * the promo post's `metadata` JSON so the frontend renders the right CTA per
 * viewer state without further DB writes.
 *
 * Storage: Directus (matches existing prime_videos pipeline). FK to
 * creator_channels handled in DB; FK to the file lives in Directus by uuid.
 */

const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');
const { query, getPool } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const grokService = require('./grokService');
const logger = require('../utils/logger');
const EntitlementAccessService = require('./entitlementAccessService');

// ── Directus helpers ─────────────────────────────────────────────────────────

function directusBaseUrl() {
  return (
    process.env.DIRECTUS_URL ||
    process.env.DIRECTUS_INTERNAL_URL ||
    'http://directus:8055'
  ).replace(/\/$/, '');
}
function directusHeaders() {
  return {
    Authorization: `Bearer ${process.env.DIRECTUS_ADMIN_TOKEN}`,
  };
}
function directusFileUrl(fileId) {
  // Public CDN URL the SPA uses.
  return `https://cms.pnptv.app/assets/${fileId}`;
}
function directusThumbUrl(fileId) {
  // The cms video-thumb extension generates JPG poster frames asynchronously.
  return `https://cms.pnptv.app/video-thumb/${fileId}.jpg`;
}

// ── Per-creator Directus folder helpers ───────────────────────────────────────
// Each creator's channel videos land in Directus under "Creators/creator-<id>/".
// Matches the folder structure used by cmsCreatorController for CMS uploads.

const _creatorFolderCache = new Map(); // uploaderId → folderId
let _creatorsParentFolderIdPromise = null;

async function _getOrCreateCreatorsParentFolder() {
  if (_creatorsParentFolderIdPromise) return _creatorsParentFolderIdPromise;
  _creatorsParentFolderIdPromise = (async () => {
    const res = await axios.get(`${directusBaseUrl()}/folders`, {
      headers: directusHeaders(),
      params: { filter: JSON.stringify({ name: { _eq: 'Creators' }, parent: { _null: true } }), limit: 1 },
    });
    const found = res.data?.data?.[0];
    if (found) return found.id;
    const created = await axios.post(`${directusBaseUrl()}/folders`, { name: 'Creators' }, { headers: directusHeaders() });
    return created.data?.data?.id;
  })().catch((err) => { _creatorsParentFolderIdPromise = null; throw err; });
  return _creatorsParentFolderIdPromise;
}

async function _getOrCreateCreatorFolder(uploaderId) {
  const cached = _creatorFolderCache.get(uploaderId);
  if (cached) return cached;
  const parentId = await _getOrCreateCreatorsParentFolder();
  const folderName = `creator-${uploaderId}`;
  const listRes = await axios.get(`${directusBaseUrl()}/folders`, {
    headers: directusHeaders(),
    params: { filter: JSON.stringify({ name: { _eq: folderName }, parent: { _eq: parentId } }), limit: 1 },
  });
  let folderId = listRes.data?.data?.[0]?.id;
  if (!folderId) {
    const cr = await axios.post(`${directusBaseUrl()}/folders`, { name: folderName, parent: parentId }, { headers: directusHeaders() });
    folderId = cr.data?.data?.id;
  }
  if (folderId) _creatorFolderCache.set(uploaderId, folderId);
  return folderId;
}

// ── Tag taxonomy used by Grok suggestSafeTags ────────────────────────────────
//
// Bounded taxonomy keeps the LLM honest: it can only pick tags the platform
// already knows how to filter / surface. Operators can extend this list
// (and reload the bot) without DB migrations.

const TAG_TAXONOMY = [
  // cast size
  'solo', 'duo', 'group', 'orgy',
  // experience level
  'amateur', 'professional',
  // body type / age
  'twink', 'bear', 'daddy', 'jock', 'otter', 'muscle', 'chub',
  // ethnicity
  'latino', 'black', 'asian', 'white', 'mixed',
  // substance play
  'clouds', 'party', 'sober',
  // sex type
  'breeding', 'raw', 'condom', 'oral', 'rim',
  // kink & fetish
  'leather', 'gear', 'bdsm', 's&m', 'bondage', 'sex-slave', 'golden-shower',
  'fisting', 'spanking', 'foot', 'spit', 'watersports', 'pig-play',
  // style
  'roleplay', 'voyeur', 'exhibition', 'outdoor', 'public',
  // format
  'live', 'recorded', 'show', 'private',
];

// ── Ownership check ─────────────────────────────────────────────────────────

const STORAGE_CAP_BYTES = Number(process.env.MAX_STORAGE_BYTES_PER_CREATOR) || 26843545600;

async function getStorageQuota(uploaderId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(filesize_bytes), 0)::bigint AS used, COUNT(*)::int AS videos
       FROM channel_videos
      WHERE uploader_id = $1 AND status <> 'removed'`,
    [String(uploaderId)]
  );
  const used = Number(rows[0]?.used || 0);
  return {
    usedBytes: used,
    capBytes: STORAGE_CAP_BYTES,
    remainingBytes: Math.max(0, STORAGE_CAP_BYTES - used),
    videoCount: Number(rows[0]?.videos || 0),
  };
}

async function assertStorageCapacity(uploaderId, incomingBytes) {
  const q = await getStorageQuota(uploaderId);
  if (q.usedBytes + Number(incomingBytes || 0) > q.capBytes) {
    const err = new Error('Storage quota exceeded for this creator');
    err.code = 'STORAGE_QUOTA_EXCEEDED';
    err.status = 413;
    err.details = { usedBytes: q.usedBytes, capBytes: q.capBytes, remainingBytes: q.remainingBytes, incomingBytes: Number(incomingBytes || 0) };
    throw err;
  }
  return q;
}

/**
 * Returns the creator_channels row if user can manage it (owner, collaborator,
 * or platform admin). Throws ChannelOwnershipError otherwise.
 */
async function loadOwnedChannel(channelId, userId, isAdmin = false) {
  const r = await query(
    `SELECT * FROM creator_channels WHERE id = $1 AND is_active = true`,
    [channelId]
  );
  const ch = r.rows[0];
  if (!ch) {
    const e = new Error('Channel not found');
    e.code = 'CHANNEL_NOT_FOUND';
    e.status = 404;
    throw e;
  }
  if (isAdmin) return ch;
  if (String(ch.creator_id) === String(userId)) return ch;
  const collab = Array.isArray(ch.collaborators) ? ch.collaborators : [];
  if (collab.map(String).includes(String(userId))) return ch;
  const e = new Error('You are not a manager of this channel');
  e.code = 'CHANNEL_NOT_OWNED';
  e.status = 403;
  throw e;
}

async function loadOwnedVideo(videoId, userId, isAdmin = false) {
  const r = await query(
    `SELECT cv.*, cc.creator_id AS channel_creator_id, cc.collaborators AS channel_collaborators
       FROM channel_videos cv
       JOIN creator_channels cc ON cc.id = cv.channel_id
      WHERE cv.id = $1`,
    [videoId]
  );
  const v = r.rows[0];
  if (!v) {
    const e = new Error('Video not found');
    e.code = 'VIDEO_NOT_FOUND';
    e.status = 404;
    throw e;
  }
  if (isAdmin) return v;
  if (String(v.uploader_id) === String(userId)) return v;
  if (String(v.channel_creator_id) === String(userId)) return v;
  const collab = Array.isArray(v.channel_collaborators) ? v.channel_collaborators : [];
  if (collab.map(String).includes(String(userId))) return v;
  const e = new Error('You cannot manage this video');
  e.code = 'VIDEO_NOT_OWNED';
  e.status = 403;
  throw e;
}

// ── Upload ──────────────────────────────────────────────────────────────────

/**
 * Push the multer file to Directus then create a channel_videos row in
 * status='processing'. Caller (route handler) is responsible for size/MIME
 * gating before this function — we trust the input here.
 */
async function uploadVideo({ channelId, uploaderId, isAdmin, file, title }) {
  const channel = await loadOwnedChannel(channelId, uploaderId, isAdmin);

  // Step 1 — push file to Directus into the creator's private folder
  let fileId;
  try {
    const folderId = await _getOrCreateCreatorFolder(uploaderId).catch(() => null);
    const fd = new FormData();
    fd.append('title', (title || file.originalname || 'Untitled').slice(0, 255));
    if (folderId) fd.append('folder', folderId);
    const filePayload = file.path
      ? require('fs').createReadStream(file.path)
      : file.buffer;
    const payloadOpts = { filename: file.originalname || 'video.mp4', contentType: file.mimetype || 'video/mp4' };
    if (file.path && file.size) payloadOpts.knownLength = file.size;
    fd.append('file', filePayload, payloadOpts);
    const { data } = await axios.post(`${directusBaseUrl()}/files`, fd, {
      headers: { ...fd.getHeaders(), ...directusHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 600_000,
    });
    fileId = data?.data?.id;
  } catch (err) {
    logger.error('channel_videos: directus file upload failed', { channelId, error: err.message });
    if (file.path) await require('fs').promises.unlink(file.path).catch(() => {});
    const e = new Error(`File storage failed: ${err.message}`);
    e.code = 'FILE_STORAGE_FAILED';
    e.status = 502;
    throw e;
  }
  if (!fileId) {
    const e = new Error('File storage returned no id');
    e.code = 'FILE_STORAGE_FAILED';
    e.status = 502;
    throw e;
  }

  // Step 2 — fetch Directus metadata for duration / size (non-fatal on failure)
  let durationSec = null;
  let filesizeBytes = file.size || null;
  try {
    const { data } = await axios.get(
      `${directusBaseUrl()}/files/${fileId}?fields=id,duration,filesize`,
      { headers: directusHeaders(), timeout: 5000 }
    );
    if (data?.data?.duration) durationSec = Math.round(data.data.duration / 1000);
    if (data?.data?.filesize) filesizeBytes = Number(data.data.filesize) || filesizeBytes;
  } catch (_) {
    /* non-fatal */
  }

  // Step 3 — generate thumbnail immediately from the temp file (before cleanup)
  // so the creator sees a cover image right away, without waiting for the
  // async video-thumb cron to process the Directus-stored file.
  const thumbsDir = '/opt/pnptvapp/infrastructure/data/directus/uploads/_thumbs';
  const thumbPath = path.join(thumbsDir, `${fileId}.jpg`);
  if (file.path) {
    await new Promise((resolve) => {
      const ff = spawn('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y',
        '-ss', '3', '-i', file.path, '-frames:v', '1',
        '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
        thumbPath,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      ff.on('error', resolve);
      ff.on('close', resolve);
    }).catch(() => {});
  }

  // Step 4 — insert row
  const fallbackTitle = (title || file.originalname || 'Untitled').slice(0, 255);
  const inserted = await query(
    `INSERT INTO channel_videos
        (channel_id, uploader_id, directus_file_id, title, duration_sec,
         filesize_bytes, thumbnail_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')
     RETURNING *`,
    [channel.id, uploaderId, fileId, fallbackTitle, durationSec, filesizeBytes, directusThumbUrl(fileId)]
  );

  // Clean up disk-based temp file now that Directus has stored it
  if (file.path) await require('fs').promises.unlink(file.path).catch(() => {});

  return shapeForApi(inserted.rows[0], channel);
}

// ── AI helpers ──────────────────────────────────────────────────────────────

async function aiTitle({ videoId, userId, isAdmin }) {
  const v = await loadOwnedVideo(videoId, userId, isAdmin);
  // Build a prompt from whatever the human has written + filename
  const prompt =
    (v.title && v.title !== 'Untitled' ? v.title + '. ' : '') +
    (v.description ? v.description : '') +
    (v.tags?.length ? ' Tags: ' + v.tags.join(', ') : '');
  const text = await grokService.generateSafeVideoTitle({
    prompt: prompt.trim() || 'A new video uploaded to a creator channel.',
  });
  await query(
    `UPDATE channel_videos
        SET title = $2,
            ai_generated_meta = ai_generated_meta || '{"title": "ai"}'::jsonb
      WHERE id = $1`,
    [videoId, text.slice(0, 255)]
  );
  return { title: text };
}

async function aiDescription({ videoId, userId, isAdmin }) {
  const v = await loadOwnedVideo(videoId, userId, isAdmin);
  const text = await grokService.generateImprovedVideoDescription({
    title: v.title || '',
    currentDescription: v.description || '',
    tags: v.tags || [],
  });
  await query(
    `UPDATE channel_videos
        SET description = $2,
            ai_generated_meta = ai_generated_meta || '{"description": "ai"}'::jsonb
      WHERE id = $1`,
    [videoId, text]
  );
  return { description: text };
}

async function aiTags({ videoId, userId, isAdmin }) {
  const v = await loadOwnedVideo(videoId, userId, isAdmin);
  const prompt = (v.title || '') + ' ' + (v.description || '');
  const tags = await grokService.suggestSafeTags({
    prompt: prompt.trim() || 'a creator video',
    taxonomy: TAG_TAXONOMY,
  });
  await query(
    `UPDATE channel_videos
        SET tags = $2,
            ai_generated_meta = ai_generated_meta || '{"tags": "ai"}'::jsonb
      WHERE id = $1`,
    [videoId, tags]
  );
  return { tags };
}

// ── Edit ────────────────────────────────────────────────────────────────────

async function updateVideo({ videoId, userId, isAdmin, fields }) {
  const v = await loadOwnedVideo(videoId, userId, isAdmin);
  if (v.status === 'removed') {
    const e = new Error('Video has been removed');
    e.code = 'VIDEO_REMOVED';
    e.status = 410;
    throw e;
  }
  const sets = [];
  const params = [videoId];
  // Track which fields the human edits (for ai_generated_meta delta)
  const humanizedFields = {};
  if (typeof fields.title === 'string') {
    params.push(fields.title.slice(0, 255));
    sets.push(`title = $${params.length}`);
    humanizedFields.title = 'human';
  }
  if (typeof fields.description === 'string' || fields.description === null) {
    params.push(fields.description);
    sets.push(`description = $${params.length}`);
    if (fields.description) humanizedFields.description = 'human';
  }
  if (Array.isArray(fields.tags)) {
    const cleanTags = fields.tags
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    params.push(cleanTags);
    sets.push(`tags = $${params.length}::text[]`);
    if (cleanTags.length) humanizedFields.tags = 'human';
  }
  // status: non-admin creators may only move a video back to 'draft'.
  // Setting status='published' via PATCH would bypass publishVideo() — which
  // generates the GIF, creates the promo post, and enforces the title requirement.
  // Admins retain full status control (processing → published/failed/removed etc.).
  if (typeof fields.status === 'string') {
    if (isAdmin && ['published', 'draft', 'processing', 'failed', 'removed'].includes(fields.status)) {
      params.push(fields.status);
      sets.push(`status = $${params.length}`);
    } else if (!isAdmin && fields.status === 'draft') {
      // Creators can retract a published video back to draft
      params.push('draft');
      sets.push(`status = $${params.length}`);
    }
    // Any other status value from a non-admin is silently ignored.
  }
  // is_featured — creators curate their own "Featured Videos" row on their
  // public profile (capped at 5); admins remain uncapped for platform curation.
  if (typeof fields.is_featured === 'boolean') {
    if (fields.is_featured && !isAdmin) {
      const { rows: featCountRows } = await query(
        `SELECT count(*)::int AS n
           FROM channel_videos cv
           JOIN creator_channels cc ON cc.id = cv.channel_id
          WHERE cc.creator_id = $1 AND cv.is_featured = true AND cv.id != $2`,
        [v.channel_creator_id, videoId]
      );
      if ((featCountRows[0]?.n ?? 0) >= 5) {
        const e = new Error('You can only feature up to 5 videos');
        e.code = 'FEATURED_LIMIT_REACHED';
        e.status = 422;
        throw e;
      }
    }
    params.push(fields.is_featured);
    sets.push(`is_featured = $${params.length}`);
  }
  if (typeof fields.post_to_feed === 'boolean') {
    params.push(fields.post_to_feed);
    sets.push(`post_to_feed = $${params.length}`);
  }
  if (sets.length === 0) return shapeForApi(v);
  if (Object.keys(humanizedFields).length) {
    params.push(JSON.stringify(humanizedFields));
    sets.push(`ai_generated_meta = ai_generated_meta || $${params.length}::jsonb`);
  }
  const updated = await query(
    `UPDATE channel_videos SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return shapeForApi(updated.rows[0]);
}

// ── Publish ─────────────────────────────────────────────────────────────────

// ── Broadcast fan-out (fire-and-forget) ─────────────────────────────────────

// ── Auto-announce to @PNPTelevision (X) — consented creators, free content only ─
// Rate-limit: max 1 X post per creator per hour. Silently skipped if the creator
// hasn't opted in via /creators/documentation → "Let PNPtv announce my new content".
const PNPTV_X_ACCOUNT_ID = process.env.PNPTV_X_ACCOUNT_ID || '450eba46-9a7f-46ca-a0dd-7e4ecd5ab1d4';
const PNPTV_X_RATE_LIMIT_TTL = 60 * 60; // 1 hour

// Fire-and-forget analytics logger — never blocks a broadcast.
async function logBroadcastEvent(fields) {
  try {
    await query(
      `INSERT INTO broadcast_events
         (creator_id, content_type, content_ref, promo_post_id, channel, target, status, reason, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        String(fields.creatorId || ''),
        fields.contentType || 'video',
        fields.contentRef != null ? String(fields.contentRef) : null,
        fields.promoPostId ?? null,
        fields.channel,
        fields.target ?? null,
        fields.status,
        fields.reason ?? null,
        fields.errorMessage ?? null,
      ]
    );
  } catch (err) {
    logger.warn('logBroadcastEvent: insert failed', { channel: fields.channel, error: err.message });
  }
}

async function announceVideoOnX({ videoId, promoPostId, creatorId, creatorUsername, title, thumbnailUrl, gifUrl, accessType }) {
  const eventBase = { creatorId, contentType: 'video', contentRef: videoId, promoPostId, channel: 'x', target: '@PNPTelevision' };
  try {
    if (accessType && accessType !== 'free') {
      void logBroadcastEvent({ ...eventBase, status: 'skipped', reason: 'not-free' });
      return { skipped: true, reason: 'not-free' };
    }

    const { rows } = await query(
      `SELECT pnptv_announce_consent FROM users WHERE id = $1`,
      [String(creatorId)]
    );
    if (!rows[0]?.pnptv_announce_consent) {
      void logBroadcastEvent({ ...eventBase, status: 'skipped', reason: 'no-consent' });
      return { skipped: true, reason: 'no-consent' };
    }

    const redis = getRedis();
    const rlKey = `pnp:auto-announce:x:rl:creator:${creatorId}`;
    const rlAcquired = await redis.set(rlKey, '1', 'EX', PNPTV_X_RATE_LIMIT_TTL, 'NX');
    if (rlAcquired === null) {
      logger.info('announceVideoOnX: rate-limited', { creatorId, videoId });
      void logBroadcastEvent({ ...eventBase, status: 'skipped', reason: 'rate-limited' });
      return { skipped: true, reason: 'rate-limited' };
    }

    const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
    const shareUrl = promoPostId ? `${appUrl}/v/${promoPostId}` : `${appUrl}/channels`;
    const handle = creatorUsername ? `@${creatorUsername}` : 'a PNPtv! creator';
    const safeTitle = (title || '').toString().trim().slice(0, 140);

    // Bilingual, brand-tight — EN line, ES line, hashtags. OG card carries the visuals.
    const text = safeTitle
      ? `🎬 New drop — ${handle}: ${safeTitle}\n🎬 Nuevo — ${handle} acaba de subir\n\n${shareUrl}\n\n#PNPtv #PNPLive`
      : `🎬 ${handle} just dropped new content on PNPtv!\n🎬 ${handle} tiene contenido nuevo en PNPtv!\n\n${shareUrl}\n\n#PNPtv`;

    const mediaUrl = gifUrl || thumbnailUrl || null;

    const XPostService = require('./xPostService');
    const result = await XPostService.sendPostNow({
      accountId: PNPTV_X_ACCOUNT_ID,
      adminId: null,
      adminUsername: 'pnptv-auto-announce',
      text,
      mediaUrl,
    });

    logger.info('announceVideoOnX: posted', { videoId, creatorId, xPostId: result.postId, shareUrl });
    void logBroadcastEvent({ ...eventBase, status: 'sent' });
    return { posted: true, postId: result.postId };
  } catch (err) {
    try { await getRedis().del(`pnp:auto-announce:x:rl:creator:${creatorId}`); } catch { /* ignore */ }
    logger.warn('announceVideoOnX: failed', { videoId, creatorId, error: err.message });
    void logBroadcastEvent({ ...eventBase, status: 'failed', errorMessage: err.message });
    return { error: err.message };
  }
}

// Post the announcement to every active Telegram group the bot admins.
// Skipped when creator has not consented. Uses inline "Watch" button linking
// to /v/<promoPostId> so Telegram renders the OG preview card.
async function announceVideoToTelegramGroups({ videoId, promoPostId, creatorId, creatorUsername, title, thumbnailUrl, gifUrl, accessType }) {
  const eventBase = { creatorId, contentType: 'video', contentRef: videoId, promoPostId, channel: 'telegram_group' };
  try {
    if (accessType && accessType !== 'free') {
      void logBroadcastEvent({ ...eventBase, target: '*', status: 'skipped', reason: 'not-free' });
      return { skipped: true, reason: 'not-free' };
    }
    const { rows: consentRows } = await query(
      `SELECT pnptv_announce_consent FROM users WHERE id = $1`,
      [String(creatorId)]
    );
    if (!consentRows[0]?.pnptv_announce_consent) {
      void logBroadcastEvent({ ...eventBase, target: '*', status: 'skipped', reason: 'no-consent' });
      return { skipped: true, reason: 'no-consent' };
    }

    const { rows: groups } = await query(
      `SELECT telegram_group_id, name FROM community_groups
        WHERE is_active = TRUE
          AND telegram_group_id IS NOT NULL
          AND telegram_group_id NOT LIKE '-100123456789%'`
    );
    if (!groups.length) {
      void logBroadcastEvent({ ...eventBase, target: '*', status: 'skipped', reason: 'no-groups' });
      return { skipped: true, reason: 'no-groups' };
    }

    let botInstance;
    try {
      const { getBotInstance } = require('../bot/core/bot');
      botInstance = getBotInstance();
    } catch (err) {
      logger.warn('announceVideoToTelegramGroups: cannot resolve bot instance', { videoId, error: err.message });
      void logBroadcastEvent({ ...eventBase, target: '*', status: 'failed', errorMessage: err.message });
      return { error: 'no-bot' };
    }
    if (!botInstance?.telegram) {
      void logBroadcastEvent({ ...eventBase, target: '*', status: 'failed', errorMessage: 'no-bot' });
      return { error: 'no-bot' };
    }

    const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
    const shareUrl = promoPostId ? `${appUrl}/v/${promoPostId}` : `${appUrl}/channels`;
    const handle = creatorUsername ? `@${creatorUsername}` : 'un creador';
    const safeTitle = (title || '').toString().trim().slice(0, 160);
    // Bilingual — ES first (LatAm-heavy audience), EN below
    const captionEs = safeTitle
      ? `🎬 <b>Nuevo drop de ${escapeHtml(handle)}</b>\n${escapeHtml(safeTitle)}\n\n🎬 <i>New drop from ${escapeHtml(handle)}</i>\n\n👇`
      : `🎬 <b>${escapeHtml(handle)} acaba de subir contenido nuevo</b>\n\n🎬 <i>${escapeHtml(handle)} just dropped new content on PNPtv!</i>\n\n👇`;

    const keyboard = {
      inline_keyboard: [[{ text: '▶️ Ver ahora / Watch now', url: shareUrl }]],
    };

    const photoUrl = thumbnailUrl || gifUrl || null;

    let sent = 0;
    for (const g of groups) {
      try {
        if (photoUrl) {
          await botInstance.telegram.sendPhoto(g.telegram_group_id, photoUrl, {
            caption: captionEs, parse_mode: 'HTML', reply_markup: keyboard,
          });
        } else {
          await botInstance.telegram.sendMessage(g.telegram_group_id, captionEs, {
            parse_mode: 'HTML', reply_markup: keyboard,
            link_preview_options: { prefer_large_media: true },
          });
        }
        sent++;
        void logBroadcastEvent({ ...eventBase, target: g.telegram_group_id, status: 'sent' });
      } catch (err) {
        logger.warn('announceVideoToTelegramGroups: send failed', {
          videoId, chatId: g.telegram_group_id, groupName: g.name, code: err.code, description: err.description || err.message,
        });
        void logBroadcastEvent({
          ...eventBase, target: g.telegram_group_id, status: 'failed',
          errorMessage: `${err.code || ''} ${err.description || err.message}`.trim(),
        });
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    logger.info('announceVideoToTelegramGroups: broadcast complete', { videoId, total: groups.length, sent });
    return { posted: true, groupsAttempted: groups.length, sent };
  } catch (err) {
    logger.warn('announceVideoToTelegramGroups: failed', { videoId, error: err.message });
    void logBroadcastEvent({ ...eventBase, target: '*', status: 'failed', errorMessage: err.message });
    return { error: err.message };
  }
}


function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function broadcastNewVideo({ videoId, channelId, creatorId, title, description, thumbnailUrl, gifUrl }) {
  const redis = getRedis();
  const dedupKey = `pnp:video:notified:${videoId}`;
  const alreadySent = await redis.set(dedupKey, '1', 'EX', 86400, 'NX');
  if (alreadySent === null) return; // already broadcast

  const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
  const watchUrl = `${appUrl}/channels`;
  const previewUrl = gifUrl || thumbnailUrl;
  const descSnippet = description ? description.slice(0, 100) + (description.length > 100 ? '…' : '') : '';

  // Load followers of this creator (non-free, non-banned)
  let followers = [];
  try {
    const { rows } = await query(
      `SELECT u.id, u.telegram, u.email, u.first_name, u.username, u.language,
              u.notification_preferences
         FROM user_follows uf
         JOIN users u ON u.id = uf.follower_id
        WHERE uf.following_id = $1
          AND u.tier NOT IN ('free', 'banned')
        LIMIT 3000`,
      [String(creatorId)]
    );
    followers = rows;
  } catch (err) {
    logger.warn('broadcastNewVideo: failed to load followers', { creatorId, error: err.message });
    return;
  }

  // ── Telegram DMs — opt-in only ────────────────────────────────────────────
  // Followers who have BOTH linked Telegram AND ticked
  // notification_preferences.creator_new_content.bot receive a DM.
  // Users default to bot:false so nothing is sent until they opt in.
  const shareUrl = watchUrl; // for promo linking use the /v/<promo_post_id> supplied by caller in future
  const escapeMd = (s) => String(s).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
  const dmOptedIn = followers.filter((f) => {
    if (!f.telegram) return false;
    const prefs = f.notification_preferences;
    return prefs?.creator_new_content?.bot === true;
  });

  if (dmOptedIn.length > 0) {
    try {
      const { getBotInstance } = require('../bot/core/bot');
      const bot = getBotInstance();
      if (bot?.telegram) {
        const safeTitle = escapeMd(title || '');
        const safeSnippet = descSnippet ? escapeMd(descSnippet) + '\n\n' : '';
        // Bilingual DM — ES top, EN bottom, watch button
        const tgMessage =
          `🎬 *Nuevo video de un creador que sigues\\!*\n${safeTitle}\n${safeSnippet}` +
          `🎬 _New video from a creator you follow_\n\n` +
          `👉 [Ver ahora / Watch now](${shareUrl})`;
        let sentDm = 0;
        for (const f of dmOptedIn) {
          try {
            await bot.telegram.sendMessage(f.telegram, tgMessage, { parse_mode: 'MarkdownV2' });
            sentDm++;
            void logBroadcastEvent({ creatorId, contentType: 'video', contentRef: videoId, channel: 'telegram_dm', target: String(f.id), status: 'sent' });
          } catch (err) {
            if (err.code !== 403 && err.code !== 400) {
              logger.warn('broadcastNewVideo: tg DM failed', { telegram: f.telegram, code: err.code });
            }
            void logBroadcastEvent({ creatorId, contentType: 'video', contentRef: videoId, channel: 'telegram_dm', target: String(f.id), status: 'failed', errorMessage: `${err.code || ''}` });
          }
          await new Promise((r) => setTimeout(r, 60));
        }
        logger.info('broadcastNewVideo: telegram DMs sent', { videoId, optedIn: dmOptedIn.length, sent: sentDm });
      }
    } catch (err) {
      logger.warn('broadcastNewVideo: telegram fan-out failed', { videoId, error: err.message });
    }
  }

  // ── Push notifications ────────────────────────────────────────────────────
  try {
    const PushNotificationService = require('./pushNotificationService');
    const pushUserIds = followers.map((f) => f.id);
    if (pushUserIds.length > 0) {
      await PushNotificationService.sendToUsers(pushUserIds, {
        title: `🎬 Nuevo video: ${title}`,
        body: descSnippet || 'Ver en PNP Channels →',
        url: watchUrl,
        icon: previewUrl || undefined,
      });
    }
    logger.info('broadcastNewVideo: push notifications queued', { videoId, count: pushUserIds.length });
  } catch (err) {
    logger.warn('broadcastNewVideo: push notifications failed', { videoId, error: err.message });
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  try {
    const emailService = require('./emailservice');
    const emailFollowers = followers.filter((f) => f.email);
    if (emailFollowers.length > 0) {
      await emailService.sendBroadcastEmails(emailFollowers, {
        subjectEn: `🎬 New video: ${title}`,
        subjectEs: `🎬 Nuevo video: ${title}`,
        messageEn: `A new video has been published on PNP Channels!\n\n**${title}**\n\n${descSnippet}\n\n[Watch now →](${watchUrl})`,
        messageEs: `¡Nuevo video en PNP Channels!\n\n**${title}**\n\n${descSnippet}\n\n[Ver ahora →](${watchUrl})`,
        mediaUrl: previewUrl || null,
        buttons: [{ labelEn: 'Watch now →', labelEs: 'Ver ahora →', url: watchUrl }],
        preheaderEn: `New on PNP Channels: ${title}`,
        preheaderEs: `Nuevo en PNP Channels: ${title}`,
      });
    }
    logger.info('broadcastNewVideo: emails sent', { videoId, count: emailFollowers.length });
  } catch (err) {
    logger.warn('broadcastNewVideo: email broadcast failed', { videoId, error: err.message });
  }
}

/**
 * Mark the video published. When post_to_feed is true (default), creates a
 * promo post on the official PNPtv! account and broadcasts to channel
 * followers (Telegram DM / push / email). When false, the video is published
 * silently into the channel only — no feed post, no broadcast. The GIF is
 * always generated as the channel-page hover preview.
 */
async function publishVideo({ videoId, userId, isAdmin }) {
  const v = await loadOwnedVideo(videoId, userId, isAdmin);
  if (v.status === 'published') {
    return shapeForApi(v); // idempotent
  }
  if (v.status === 'removed') {
    const e = new Error('Cannot publish a removed video');
    e.code = 'VIDEO_REMOVED';
    e.status = 410;
    throw e;
  }
  if (!v.title || v.title.trim() === '' || v.title === 'Untitled') {
    const e = new Error('Title is required to publish');
    e.code = 'TITLE_REQUIRED';
    e.status = 400;
    throw e;
  }

  const ch = (await query(
    `SELECT cc.*, u.username AS creator_username, u.first_name AS creator_first_name
       FROM creator_channels cc
       JOIN users u ON u.id = cc.creator_id
      WHERE cc.id = $1`,
    [v.channel_id]
  )).rows[0];

  let gifUrl = null;
  if (v.directus_file_id) {
    try {
      gifUrl = await Promise.race([
        generateGifFromVideo(v.directus_file_id),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GIF generation timed out')), 60_000)),
      ]);
    } catch (err) {
      logger.warn('channel_videos: GIF generation failed, falling back to static JPG', {
        videoId, channelId: v.channel_id, error: err.message,
      });
      gifUrl = null;
    }
  }

  await query(
    `UPDATE channel_videos
        SET status = 'published', gif_url = $2
      WHERE id = $1`,
    [videoId, gifUrl]
  );

  let final = (await query(`SELECT * FROM channel_videos WHERE id = $1`, [videoId])).rows[0];

  // Honor the creator's "announce on social feed" toggle (default true).
  // Gates BOTH the promo post AND the follower broadcast below.
  const shouldAnnounce = final.post_to_feed !== false;

  // Create promo post on the official PNPtv! account, linked to the channel so it
  // appears both in the channel's Posts section AND in the general feed/profile wall.
  const OFFICIAL_USER_ID = '8552451957';
  try {
    const previewUrl = final.gif_url || final.thumbnail_url;
    if (shouldAnnounce && previewUrl && !final.promo_post_id) {
      const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
      const directusBase = (process.env.DIRECTUS_PUBLIC_URL || 'https://cms.pnptv.app').replace(/\/$/, '');
      // Only include description snippet if it adds something beyond the title
      const rawDesc = (final.description || '').trim();
      const titleNorm = (final.title || '').trim().toLowerCase();
      const descNorm = rawDesc.toLowerCase();
      const descDifferent = rawDesc && !descNorm.startsWith(titleNorm) && descNorm !== titleNorm;
      const descSnippet = descDifferent
        ? rawDesc.slice(0, 140) + (rawDesc.length > 140 ? '…' : '')
        : '';
      const promoContent = [
        `🎬 NEW on PNP Channels: ${final.title}`,
        descSnippet,
        `🔒 Subscribe to watch → ${appUrl}/channels`,
      ].filter(Boolean).join('\n\n').slice(0, 1000);
      const metadata = {
        kind: 'channel_promo',
        channel_id: ch.id,
        channel_slug: ch.slug ?? '',
        channel_name: ch.name ?? '',
        creator_id: ch.creator_id ?? '',
        creator_username: ch.creator_username ?? null,
        access_type: ch.access_type ?? 'prime',
        price_usd: null,
        video_id: videoId,
        video_directus_id: final.directus_file_id ?? '',
        video_url: final.mux_playback_id
          ? `https://stream.mux.com/${final.mux_playback_id}.m3u8`
          : (final.directus_file_id ? `${directusBase}/assets/${final.directus_file_id}` : ''),
        has_animated_gif: !!(final.gif_url),
      };
      // Promo posts are always public (is_exclusive=false, content_tier='free') so
      // all logged-in users see the teaser in the feed. The CTA card gates the
      // actual video behind the channel's access_type. Marking the post exclusive
      // would prevent even creators (who hold pnp-member, not PRIME) from seeing it.
      // Include video_title/video_description so the /v/<postId> OG preview
      // renders the actual video title in social-share cards (X, Telegram).
      const promoInsert = await query(
        `INSERT INTO social_posts
           (user_id, content, media_url, media_type, metadata, is_exclusive,
            content_tier, channel_id, video_title, video_description, video_thumbnail_url, created_at)
         VALUES ($1, $2, $3, 'image', $4, false, 'free', $5, $6, $7, $8, NOW())
         RETURNING id`,
        [
          OFFICIAL_USER_ID, promoContent, previewUrl, JSON.stringify(metadata),
          ch.id,
          (final.title || '').toString().slice(0, 200) || null,
          (final.description || '').toString().slice(0, 2000) || null,
          final.thumbnail_url || null,
        ]
      );
      const promoPostId = promoInsert.rows[0]?.id ?? null;
      if (promoPostId) {
        await query(`UPDATE channel_videos SET promo_post_id = $2 WHERE id = $1`, [videoId, promoPostId]);
        final = { ...final, promo_post_id: promoPostId };
        // Sync post_count on the channel
        await query(
          `UPDATE creator_channels SET post_count = (SELECT COUNT(*) FROM social_posts WHERE channel_id = $1 AND is_deleted = false) WHERE id = $1`,
          [ch.id]
        ).catch(() => {});
        // Tag channel creator + any tagged_creator_ids in post_mentions.
        // Also fire tag_post notifications so tagged creators know their video
        // was promoted — with channel_video_id in metadata so the UI can link
        // back to the actual video, not just the promo post wrapper.
        const taggedIds = [ch.creator_id, ...(final.tagged_creator_ids || [])].filter(Boolean);
        const uniqueTagged = [...new Set(taggedIds)];
        let NotificationEmitter = null;
        try { NotificationEmitter = require('./notificationEmitter'); } catch { /* ignore */ }
        for (const uid of uniqueTagged) {
          await query(
            `INSERT INTO post_mentions (post_id, mentioned_user_id, mentioner_id, mention_type) VALUES ($1, $2, $3, 'tag') ON CONFLICT DO NOTHING`,
            [promoPostId, uid, OFFICIAL_USER_ID]
          ).catch(() => {});
          if (NotificationEmitter && String(uid) !== String(OFFICIAL_USER_ID)) {
            try {
              await NotificationEmitter.emit({
                type: 'tag_post',
                category: 'social',
                priority: 'normal',
                actorId: OFFICIAL_USER_ID,
                targetUserId: uid,
                entityType: 'post',
                entityId: String(promoPostId),
                message: `@pnptv tagged you in a channel promo`,
                metadata: {
                  post_id: promoPostId,
                  original_kind: 'channel_promo',
                  channel_video_id: videoId,
                  channel_id: ch.id,
                },
              });
            } catch (emitErr) {
              logger.warn('channel_videos: tag notification emit failed (non-fatal)', { videoId, uid, error: emitErr.message });
            }
          }
        }
      }
    }
  } catch (err) {
    logger.warn('channel_videos: promo post creation failed (non-fatal)', { videoId, error: err.message });
  }

  // ── Hangout announcement — post system message to linked hangout ──────────
  if (ch.hangout_group_id && shouldAnnounce) {
    try {
      const appUrl = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');
      const previewUrl = final.gif_url || final.thumbnail_url;
      const descSnippet = (final.description || '').trim().slice(0, 120);
      const announcementContent = [
        `🎬 Nuevo video en el canal: **${final.title}**`,
        descSnippet || null,
        `▶️ Ver ahora → ${appUrl}/channels${ch.slug ? `?channel=${ch.slug}` : ''}`,
      ].filter(Boolean).join('\n\n');

      const insertResult = await query(
        `INSERT INTO chat_messages (room, user_id, username, first_name, photo_url, content, reply_to_id)
         VALUES ($1, $2, 'pnptv', 'PNPtv! News', NULL, $3, NULL)
         RETURNING id, room, user_id, username, first_name, content, created_at`,
        [`hangout:${ch.hangout_group_id}`, '8552451957', announcementContent]
      );

      if (previewUrl && insertResult.rows[0]) {
        await query(
          `UPDATE chat_messages SET media_url = $1, media_type = 'image' WHERE id = $2`,
          [previewUrl, insertResult.rows[0].id]
        );
      }

      try {
        const { getBotInstance } = require('../bot/core/bot');
        const botApp = getBotInstance();
        const io = botApp?.io;
        if (io) {
          const msg = insertResult.rows[0];
          io.to(`hangout:${ch.hangout_group_id}`).emit('hangout:message', {
            id: msg.id,
            room: msg.room,
            user_id: msg.user_id,
            username: 'pnptv',
            first_name: 'PNPtv! News',
            photo_url: null,
            content: announcementContent,
            media_url: previewUrl || null,
            media_type: previewUrl ? 'image' : null,
            media_mime: null,
            media_thumb_url: null,
            media_width: null,
            media_height: null,
            media_metadata: null,
            reply_to_id: null,
            created_at: msg.created_at,
            is_deleted: false,
            message_type: 'text',
            meta: null,
            reactions: [],
          });
        }
      } catch (_) { /* socket emit is non-critical */ }

      logger.info('channelVideoService: hangout announcement posted', {
        videoId, hangoutGroupId: ch.hangout_group_id, channelId: ch.id,
      });
    } catch (err) {
      logger.warn('channelVideoService: hangout announcement failed (non-fatal)', {
        videoId, channelId: ch.id, error: err.message,
      });
    }
  }

  // Fire-and-forget broadcast — never blocks publish. Skipped when the
  // creator unticked the "announce on social feed" toggle.
  if (shouldAnnounce) {
    void broadcastNewVideo({
      videoId,
      channelId: final.channel_id,
      creatorId: ch.creator_id,
      title: final.title,
      description: final.description || '',
      thumbnailUrl: final.thumbnail_url,
      gifUrl: final.gif_url,
    }).catch((err) => logger.warn('broadcastNewVideo: unexpected error', { videoId, error: err.message }));

    // Auto-announce to @PNPTelevision on X — creator opt-in + free content + rate-limited.
    // Fires only when the creator has enabled announcements in Documentation.
    void announceVideoOnX({
      videoId,
      promoPostId: final.promo_post_id || null,
      creatorId: ch.creator_id,
      creatorUsername: ch.creator_username || null,
      title: final.title,
      thumbnailUrl: final.thumbnail_url,
      gifUrl: final.gif_url,
      accessType: ch.access_type || 'free',
    }).catch((err) => logger.warn('announceVideoOnX: unexpected error', { videoId, error: err.message }));

    // Auto-announce to PNPtv Telegram groups the bot admins.
    // Same consent gate + free-content restriction. No X rate-limit here (small
    // number of groups; Telegram's own per-chat cooldown is enough).
    void announceVideoToTelegramGroups({
      videoId,
      promoPostId: final.promo_post_id || null,
      creatorId: ch.creator_id,
      creatorUsername: ch.creator_username || null,
      title: final.title,
      thumbnailUrl: final.thumbnail_url,
      gifUrl: final.gif_url,
      accessType: ch.access_type || 'free',
    }).catch((err) => logger.warn('announceVideoToTelegramGroups: unexpected error', { videoId, error: err.message }));

  }

  return shapeForApi(final, ch);
}

// ── Delete (soft) ───────────────────────────────────────────────────────────

async function deleteVideo({ videoId, userId, isAdmin }) {
  const v = await loadOwnedVideo(videoId, userId, isAdmin);
  if (v.status === 'removed') return { ok: true, alreadyRemoved: true };

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE channel_videos SET status = 'removed' WHERE id = $1`,
      [videoId]
    );
    if (v.promo_post_id) {
      await client.query(
        `UPDATE social_posts SET is_deleted = true WHERE id = $1`,
        [v.promo_post_id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { ok: true };
}

// ── List ────────────────────────────────────────────────────────────────────

async function listChannelVideos({ channelId, viewerId, includeDrafts = false }) {
  // Drafts are visible only to the channel owner / collaborators
  const visibilityClause = includeDrafts
    ? `cv.status IN ('published','processing','draft')`
    : `cv.status = 'published'`;
  const r = await query(
    `SELECT cv.id, cv.title, cv.description, cv.tags, cv.duration_sec,
            cv.thumbnail_url, cv.gif_url, cv.status, cv.created_at,
            cv.directus_file_id, cv.mux_playback_id, cv.mux_status,
            cv.uploader_id, cv.view_count, cv.promo_post_id,
            cv.tagged_creator_ids,
            cc.access_type, cc.price_usd, cc.creator_id, cc.slug AS channel_slug
       FROM channel_videos cv
       JOIN creator_channels cc ON cc.id = cv.channel_id
      WHERE cv.channel_id = $1
        AND ${visibilityClause}
      ORDER BY cv.created_at DESC
      LIMIT 100`,
    [channelId]
  );

  if (r.rows.length === 0) return [];

  const accessType = r.rows[0].access_type;
  const channelCreatorId = r.rows[0].creator_id;

  // Callers that own/manage the channel (includeDrafts=true) already went through
  // loadOwnedChannel() and are authorised to see everything.
  // For public viewers we evaluate entitlement once per list call.
  let viewerHasAccess = false;
  if (includeDrafts) {
    // Channel manager — full access.
    viewerHasAccess = true;
  } else if (accessType === 'free') {
    // Free channels: any authenticated user gets the URL; unauthenticated get null.
    viewerHasAccess = !!viewerId;
  } else {
    // Non-free channels (prime / subscription / paid): check entitlements.
    if (!viewerId) {
      viewerHasAccess = false;
    } else if (String(viewerId) === String(channelCreatorId)) {
      // Channel owner always has access.
      viewerHasAccess = true;
    } else {
      try {
        const decision = await EntitlementAccessService.hasResourceAccess(
          String(viewerId), 'channel', String(channelId)
        );
        viewerHasAccess = decision.allowed === true;
      } catch (err) {
        logger.warn('listChannelVideos: entitlement check failed, defaulting to no access', {
          channelId, viewerId, error: err.message,
        });
        viewerHasAccess = false;
      }
    }
  }

  return r.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags || [],
    duration_sec: row.duration_sec,
    thumbnail_url: row.thumbnail_url,
    gif_url: row.gif_url,
    video_url: viewerHasAccess
      ? (row.mux_playback_id
          ? `https://stream.mux.com/${row.mux_playback_id}.m3u8`
          : directusFileUrl(row.directus_file_id))
      : null,
    mux_playback_id: row.mux_playback_id || null,
    mux_status: row.mux_status || null,
    status: row.status,
    created_at: row.created_at,
    view_count: row.view_count ?? 0,
    promo_post_id: row.promo_post_id ?? null,
    tagged_creator_ids: row.tagged_creator_ids || [],
    channel: {
      slug: row.channel_slug,
      access_type: row.access_type,
      price_usd: row.price_usd ? Number(row.price_usd) : null,
    },
  }));
}

// ── ffmpeg GIF generation ───────────────────────────────────────────────────

/**
 * Generate a 3-second 480p GIF from the source video. Streams input from
 * Directus, writes GIF to a tmp file, uploads it back to Directus, returns
 * the public URL. Resolves on success; rejects on error/timeout.
 */
async function generateGifFromVideo(directusFileId) {
  const inputUrl = `${directusBaseUrl()}/assets/${directusFileId}?download&access_token=${process.env.DIRECTUS_ADMIN_TOKEN}`;
  const tmpDir = os.tmpdir();
  const tmpName = `cv-gif-${crypto.randomBytes(6).toString('hex')}.gif`;
  const tmpPath = path.join(tmpDir, tmpName);

  // 3 seconds of 15 fps GIF, 480px wide, lanczos scale, infinite loop. We seek
  // to t=2s so we skip black frames / leader. nice -19 keeps the bot's event
  // loop responsive when ffmpeg consumes a CPU.
  const args = [
    '-loglevel', 'error',
    '-y',
    '-ss', '2',
    '-i', inputUrl,
    '-t', '3',
    '-vf', 'fps=15,scale=480:-1:flags=lanczos',
    '-loop', '0',
    tmpPath,
  ];

  await new Promise((resolve, reject) => {
    const ff = spawn('nice', ['-n', '19', 'ffmpeg', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += String(d); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 200)}`));
    });
  });

  // Re-upload the GIF to Directus
  const buf = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath).catch(() => {});

  const fd = new FormData();
  fd.append('title', `Channel video promo GIF for ${directusFileId}`);
  fd.append('file', buf, { filename: tmpName, contentType: 'image/gif' });
  const { data } = await axios.post(`${directusBaseUrl()}/files`, fd, {
    headers: { ...fd.getHeaders(), ...directusHeaders() },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 30_000,
  });
  const gifId = data?.data?.id;
  if (!gifId) throw new Error('GIF re-upload returned no id');
  return `https://cms.pnptv.app/assets/${gifId}`;
}

// ── Shape for API ───────────────────────────────────────────────────────────

function shapeForApi(row, channel, extra = {}) {
  return {
    id: row.id,
    channel_id: row.channel_id,
    title: row.title,
    description: row.description,
    tags: row.tags || [],
    duration_sec: row.duration_sec,
    filesize_bytes: row.filesize_bytes ? Number(row.filesize_bytes) : null,
    thumbnail_url: row.thumbnail_url,
    gif_url: row.gif_url,
    video_url: row.mux_playback_id
      ? `https://stream.mux.com/${row.mux_playback_id}.m3u8`
      : directusFileUrl(row.directus_file_id),
    mux_playback_id: row.mux_playback_id || null,
    mux_status: row.mux_status || null,
    status: row.status,
    promo_post_id: row.promo_post_id ? Number(row.promo_post_id) : null,
    is_featured: row.is_featured ?? false,
    post_to_feed: row.post_to_feed ?? true,
    tagged_creator_ids: row.tagged_creator_ids || [],
    ai_generated_meta: row.ai_generated_meta || {},
    created_at: row.created_at,
    channel: channel
      ? {
          id: channel.id,
          slug: channel.slug,
          name: channel.name,
          access_type: channel.access_type,
          price_usd: channel.price_usd ? Number(channel.price_usd) : null,
        }
      : undefined,
    ...extra,
  };
}

// ── Mux: direct upload URL ────────────────────────────────────────────────────

async function createMuxUpload(userId, channelId) {
  const muxService = require('./muxService');
  await loadOwnedChannel(String(channelId), String(userId), false);
  const { uploadId, uploadUrl } = await muxService.createDirectUpload();
  const { rows: [video] } = await query(
    `INSERT INTO channel_videos
       (uploader_id, channel_id, title, status, mux_upload_id, mux_status)
     VALUES ($1, $2, 'Untitled', 'processing', $3, 'waiting')
     RETURNING id, mux_upload_id`,
    [userId, channelId, uploadId]
  );
  return { videoId: video.id, uploadId, uploadUrl };
}

// ── Mux: single AI call (title + description + tags) ─────────────────────────

async function aiMetadataAll(userId, channelId, videoId, oneLiner) {
  const { rows: [video] } = await query(
    'SELECT id, uploader_id FROM channel_videos WHERE id = $1 AND channel_id = $2',
    [videoId, channelId]
  );
  if (!video) throw Object.assign(new Error('Video not found'), { status: 404 });
  if (String(video.uploader_id) !== String(userId)) throw Object.assign(new Error('Forbidden'), { status: 403 });

  // Fire the three CSAM-safe helpers in parallel. Using them (instead of a
  // hand-rolled adult-persona prompt) avoids xAI's SAFETY_CHECK_TYPE_CSAM 403
  // — see memory: feedback_grok_csam_filter.md.
  const seed = oneLiner.trim();
  const [titleRes, descRes, tagsRes] = await Promise.allSettled([
    grokService.generateSafeVideoTitle({ prompt: seed }),
    grokService.generateImprovedVideoDescription({
      title: '', currentDescription: seed, tags: [],
    }),
    grokService.suggestSafeTags({ prompt: seed, taxonomy: TAG_TAXONOMY }),
  ]);

  const result = {
    title: titleRes.status === 'fulfilled' && titleRes.value
      ? String(titleRes.value).slice(0, 255)
      : seed.slice(0, 80),
    description: descRes.status === 'fulfilled' && descRes.value
      ? String(descRes.value)
      : seed,
    tags: tagsRes.status === 'fulfilled' && Array.isArray(tagsRes.value)
      ? tagsRes.value.slice(0, 8)
      : [],
  };

  const meta = {
    title: titleRes.status === 'fulfilled' ? 'ai' : 'fallback',
    description: descRes.status === 'fulfilled' ? 'ai' : 'fallback',
    tags: tagsRes.status === 'fulfilled' ? 'ai' : 'fallback',
  };
  if (titleRes.status === 'rejected') logger.warn('aiMetadataAll: safe title failed', { err: titleRes.reason?.message });
  if (descRes.status === 'rejected') logger.warn('aiMetadataAll: safe description failed', { err: descRes.reason?.message });
  if (tagsRes.status === 'rejected') logger.warn('aiMetadataAll: safe tags failed', { err: tagsRes.reason?.message });

  await query(
    `UPDATE channel_videos SET title = $1, description = $2, tags = $3,
       ai_generated_meta = $4 WHERE id = $5`,
    [result.title, result.description, result.tags,
     JSON.stringify(meta), videoId]
  );
  return result;
}

// ── Mux: thumbnail options ────────────────────────────────────────────────────

async function getMuxThumbnails(userId, channelId, videoId) {
  const muxService = require('./muxService');
  const { rows: [video] } = await query(
    'SELECT mux_playback_id, uploader_id FROM channel_videos WHERE id = $1 AND channel_id = $2',
    [videoId, channelId]
  );
  if (!video) throw Object.assign(new Error('Video not found'), { status: 404 });
  if (String(video.uploader_id) !== String(userId)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  if (!video.mux_playback_id) return [];
  return muxService.getThumbnailOptions(video.mux_playback_id);
}

// ── Mux: webhook handler ──────────────────────────────────────────────────────

async function handleMuxWebhook(event) {
  const muxService = require('./muxService');
  const { type, data } = event;

  if (type === 'video.upload.asset_created') {
    const { id: assetId, upload_id: uploadId } = data;
    await query(
      `UPDATE channel_videos SET mux_asset_id = $1, mux_status = 'preparing'
       WHERE mux_upload_id = $2`,
      [assetId, uploadId]
    );
    logger.info('mux webhook: upload linked to asset', { uploadId, assetId });
  }

  if (type === 'video.asset.ready') {
    const { id: assetId, playback_ids, duration } = data;
    const playbackId = playback_ids?.[0]?.id;
    if (!playbackId) { logger.warn('mux webhook: asset.ready missing playback_id', { assetId }); return; }
    const durationSec = duration ? Math.round(duration) : null;
    const thumbUrl = muxService.getThumbnailUrl(playbackId, { percentage: 25 });
    await query(
      `UPDATE channel_videos
       SET mux_playback_id = $1, mux_status = 'ready',
           status = CASE WHEN status = 'processing' THEN 'draft' ELSE status END,
           duration_sec = COALESCE($2, duration_sec),
           thumbnail_url = COALESCE(thumbnail_url, $3)
       WHERE mux_asset_id = $4`,
      [playbackId, durationSec, thumbUrl, assetId]
    );
    logger.info('mux webhook: asset ready', { assetId, playbackId });
  }

  if (type === 'video.asset.errored') {
    await query(
      `UPDATE channel_videos SET mux_status = 'errored', status = 'failed' WHERE mux_asset_id = $1`,
      [data.id]
    );
    logger.warn('mux webhook: asset errored', { assetId: data.id });
  }

  if (type === 'video.upload.cancelled') {
    const uploadId = data.id;
    await query(
      `UPDATE channel_videos SET mux_status = 'cancelled', status = 'failed' WHERE mux_upload_id = $1`,
      [uploadId]
    );
    logger.warn('mux webhook: upload cancelled', { uploadId });
  }

  if (type === 'video.upload.errored') {
    const uploadId = data.id;
    await query(
      `UPDATE channel_videos SET mux_status = 'errored', status = 'failed' WHERE mux_upload_id = $1`,
      [uploadId]
    );
    logger.warn('mux webhook: upload errored', { uploadId, error: data.error?.message });
  }
}

// ── Maintenance ──────────────────────────────────────────────────────────────

async function failStuckVideoUploads() {
  const result = await query(
    `UPDATE channel_videos
     SET status = 'failed', updated_at = NOW()
     WHERE status = 'processing'
       AND created_at < NOW() - INTERVAL '1 hour'
     RETURNING id`
  );
  const count = result.rowCount || 0;
  if (count > 0) {
    logger.warn('channel_videos: flipped stuck processing rows to failed', { count, ids: result.rows.map(r => r.id) });
  }
  return count;
}

module.exports = {
  loadOwnedChannel,
  getStorageQuota,
  assertStorageCapacity,
  uploadVideo,
  aiTitle,
  aiDescription,
  aiTags,
  updateVideo,
  publishVideo,
  deleteVideo,
  listChannelVideos,
  failStuckVideoUploads,
  TAG_TAXONOMY,
  createMuxUpload,
  aiMetadataAll,
  getMuxThumbnails,
  handleMuxWebhook,
};
