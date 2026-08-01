#!/usr/bin/env node
'use strict';

/**
 * One-shot publish for the 2026-08-03 Lex+Santino Founders Live announcement.
 * Creates 1 event + 2 posts (ES + EN carousels) + broadcasts a language-aware
 * push notification with a deep link to each user's language-matched post.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/publish-founders-live-2026-08-01.js
 */

const db = require('../utils/db');
const logger = require('../utils/logger');
const NotificationEmitter = require('../services/notificationEmitter');

const OFFICIAL_USER_ID = '8552451957';
const HANGOUT_ID = 26;
const EVENT_AT_UTC = '2026-08-03 15:00:00+00'; // 10:00 AM America/Bogota (UTC-5)
const DURATION_MIN = 120;
const APP_URL = (process.env.APP_PUBLIC_URL || 'https://pnptv.app').replace(/\/$/, '');

const IMAGES_ES = [
  '/uploads/announcements/01-hook.png',
  '/uploads/announcements/02-why-now.png',
  '/uploads/announcements/03-formacion.png',
  '/uploads/announcements/04-bienestar.png',
  '/uploads/announcements/05-comunidad.png',
  '/uploads/announcements/06-ciencia.png',
  '/uploads/announcements/07-cta.png',
];
const IMAGES_EN = [
  '/uploads/announcements/en-01-hook.png',
  '/uploads/announcements/en-02-why-now.png',
  '/uploads/announcements/en-03-formacion.png',
  '/uploads/announcements/en-04-bienestar.png',
  '/uploads/announcements/en-05-comunidad.png',
  '/uploads/announcements/en-06-ciencia.png',
  '/uploads/announcements/en-07-cta.png',
];

const BODY_ES = `🔴 Videollamada en vivo con Lex y Santino, fundadores de PNPtv.

📅 Lunes 3 de agosto · 🕙 10:00 AM (Colombia)
📍 En vivo dentro del hangout PNPtv Community

Queremos contarles la historia detrás del proyecto y escuchar sus ideas para seguir construyendo juntos. Espacio abierto — vengan con preguntas, propuestas y visión.

👇 Toca para confirmar asistencia`;

const BODY_EN = `🔴 Live video call with Lex and Santino, founders of PNPtv.

📅 Monday, August 3 · 🕙 10:00 AM (Colombia time)
📍 Live inside the PNPtv Community hangout

We want to share the story behind the project and hear your ideas for continuing to build together. Open floor — bring questions, proposals, and your vision.

👇 Tap to RSVP`;

async function main() {
  const started = Date.now();

  // 1. Insert the event (single row — one real event, bilingual description)
  const eventRes = await db.query(
    `INSERT INTO events (creator_id, type, title, description, cover_image,
        scheduled_at, duration_minutes, status, is_featured, hangout_group_id, tags)
     VALUES ($1, 'hangout_event', $2, $3, $4, $5, $6, 'upcoming', true, $7, $8)
     RETURNING id`,
    [
      OFFICIAL_USER_ID,
      'Videollamada con Lex y Santino — Fundadores de PNPtv',
      BODY_ES + '\n\n---\n\n' + BODY_EN,
      IMAGES_ES[0],
      EVENT_AT_UTC,
      DURATION_MIN,
      HANGOUT_ID,
      ['fundadores', 'comunidad', 'manifiesto'],
    ]
  );
  const eventId = eventRes.rows[0].id;
  const hangoutUrl = `${APP_URL}/hangouts/${HANGOUT_ID}`;

  // 2. Insert Spanish carousel post
  const postEsRes = await db.query(
    `INSERT INTO social_posts
       (user_id, content, media_url, media_urls, media_type, hangout_group_id,
        is_promoted, promoted_link, promoted_link_label, promoted_thumbnail,
        content_tier, metadata, is_shareable, created_at)
     VALUES ($1, $2, $3, $4::jsonb, 'image', $5,
             true, $6, $7, $3,
             'free', $8::jsonb, true, NOW())
     RETURNING id`,
    [
      OFFICIAL_USER_ID,
      BODY_ES,
      IMAGES_ES[0],
      JSON.stringify(IMAGES_ES),
      HANGOUT_ID,
      hangoutUrl,
      'Ver hangout',
      JSON.stringify({ language: 'es', kind: 'announcement', event_id: eventId, carousel: true }),
    ]
  );
  const postEsId = postEsRes.rows[0].id;

  // 3. Insert English carousel post
  const postEnRes = await db.query(
    `INSERT INTO social_posts
       (user_id, content, media_url, media_urls, media_type, hangout_group_id,
        is_promoted, promoted_link, promoted_link_label, promoted_thumbnail,
        content_tier, metadata, is_shareable, created_at)
     VALUES ($1, $2, $3, $4::jsonb, 'image', $5,
             true, $6, $7, $3,
             'free', $8::jsonb, true, NOW())
     RETURNING id`,
    [
      OFFICIAL_USER_ID,
      BODY_EN,
      IMAGES_EN[0],
      JSON.stringify(IMAGES_EN),
      HANGOUT_ID,
      hangoutUrl,
      'Open hangout',
      JSON.stringify({ language: 'en', kind: 'announcement', event_id: eventId, carousel: true }),
    ]
  );
  const postEnId = postEnRes.rows[0].id;

  logger.info('[publish-founders-live] event + posts created', { eventId, postEsId, postEnId });

  // 4. Fanout notification per user (language-aware, deep-link to matching post)
  const usersRes = await db.query(
    `SELECT id, language FROM users
      WHERE is_deleted = false AND is_active = true
      ORDER BY id`
  );
  const users = usersRes.rows;

  let sent = 0;
  let failed = 0;
  const BATCH = 25;
  const DELAY_MS_BETWEEN_BATCHES = 40;

  for (let i = 0; i < users.length; i += BATCH) {
    const chunk = users.slice(i, i + BATCH);
    await Promise.all(chunk.map(async (u) => {
      const es = u.language === 'es';
      const postId = es ? postEsId : postEnId;
      const image = `${APP_URL}${es ? IMAGES_ES[0] : IMAGES_EN[0]}`;
      const deepLink = `${APP_URL}/social/post/${postId}`;
      try {
        await NotificationEmitter.emit({
          type: 'announcement',
          category: 'social',
          priority: 'normal',
          targetUserId: String(u.id),
          entityType: 'post',
          entityId: String(postId),
          message: es
            ? 'Videollamada con Lex y Santino, fundadores de PNPtv. Lunes 3 de agosto, 10:00 AM COL.'
            : 'Live call with Lex and Santino, PNPtv founders. Monday, Aug 3, 10:00 AM Colombia time.',
          metadata: {
            language: u.language || 'en',
            url: deepLink,
            pushTitle: es ? 'PNPtv en vivo' : 'PNPtv Live',
            pushBody: es
              ? 'Videollamada con los fundadores — Lunes 3 de agosto, 10 AM COL'
              : 'Video call with the founders — Monday Aug 3, 10 AM Colombia',
            image,
            pushTag: `founders-live-${eventId}`,
          },
        });
        sent++;
      } catch (err) {
        failed++;
        logger.warn('[publish-founders-live] emit failed', { userId: u.id, error: err.message });
      }
    }));
    if (i + BATCH < users.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS_BETWEEN_BATCHES));
    }
  }

  const elapsedMs = Date.now() - started;
  console.log(JSON.stringify({
    eventId,
    postEsId,
    postEnId,
    hangoutUrl,
    users: users.length,
    sent,
    failed,
    elapsedMs,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('publish fatal:', err);
    process.exit(1);
  });
