'use strict';
/**
 * callWaitlistService — avisa a quien intentó reservar y no encontró huecos.
 *
 * Con la disponibilidad atada a la presencia, mucha gente abre el modal cuando
 * el creador no está y se va sin nada. Esto anota ese intento y le avisa en
 * cuanto el creador vuelve a estar disponible.
 *
 * Se anota el INTENTO, no una suscripción: el usuario no tiene que pulsar nada.
 * Si ya se le avisó por ese creador en las últimas 24 h no se le vuelve a
 * escribir — una lista de espera que insiste se convierte en spam y la gente
 * silencia el bot.
 */
const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const sendSystemDM = require('./sendSystemDM');
const PushNotificationService = require('./pushNotificationService');
const https = require('https');

const SYSTEM_SENDER = process.env.SYSTEM_SENDER_ID || '8552451957';
const RENOTIFY_COOLDOWN_HOURS = 24;

const DDL = `
CREATE TABLE IF NOT EXISTS call_booking_waitlist (
  id           BIGSERIAL PRIMARY KEY,
  member_id    TEXT        NOT NULL,
  creator_id   TEXT        NOT NULL,
  duration_min SMALLINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at  TIMESTAMPTZ,
  CONSTRAINT call_waitlist_unique UNIQUE (member_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_call_waitlist_pending
  ON call_booking_waitlist (creator_id) WHERE notified_at IS NULL;
`;

const BOT_TOKEN = process.env.BOT_TOKEN;

/** Envío directo a la API de Telegram. Devuelve true/false, nunca lanza. */
function tgSend(chatId, text, url) {
  return new Promise((resolve) => {
    if (!BOT_TOKEN || !chatId) return resolve(false);
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: { inline_keyboard: [[{ text: 'Reservar ahora', url }]] },
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function ensureSchema() {
  await query(DDL);
}

/**
 * Anota que alguien buscó hueco y no había. Idempotente por (miembro, creador):
 * refresca la fecha del intento pero no duplica ni reabre un aviso ya enviado
 * dentro del periodo de enfriamiento.
 */
async function recordMiss({ memberId, creatorId, durationMinutes = null }) {
  if (!memberId || !creatorId || String(memberId) === String(creatorId)) return;
  try {
    await query(
      `INSERT INTO call_booking_waitlist (member_id, creator_id, duration_min)
       VALUES ($1, $2, $3)
       ON CONFLICT (member_id, creator_id) DO UPDATE
         SET created_at = NOW(),
             duration_min = EXCLUDED.duration_min,
             notified_at = CASE
               WHEN call_booking_waitlist.notified_at < NOW() - INTERVAL '${RENOTIFY_COOLDOWN_HOURS} hours'
               THEN NULL ELSE call_booking_waitlist.notified_at END`,
      [String(memberId), String(creatorId), durationMinutes]
    );
  } catch (err) {
    // Nunca romper la carga del modal por no poder anotar una espera.
    logger.warn('[callWaitlist] no se pudo anotar el intento', { error: err.message });
  }
}

/**
 * Avisa a todos los que esperaban por este creador. Se llama cuando el creador
 * pasa a estar disponible (se pone en vivo).
 */
async function notifyAvailable(creatorId) {
  try {
    const { rows: creatorRows } = await query(
      `SELECT username FROM users WHERE id = $1::text LIMIT 1`, [String(creatorId)]
    );
    const username = creatorRows[0]?.username;
    if (!username) return { notified: 0 };

    const { rows: waiting } = await query(
      `SELECT w.id, w.member_id, w.duration_min, u.telegram
         FROM call_booking_waitlist w
         LEFT JOIN users u ON u.id::text = w.member_id
        WHERE w.creator_id = $1::text AND w.notified_at IS NULL
        LIMIT 500`,
      [String(creatorId)]
    );
    if (!waiting.length) return { notified: 0 };

    let sent = 0;
    const pushTargets = [];
    for (const w of waiting) {
      const dur = w.duration_min || 30;
      const url = `https://pnptv.app/c/${username}?action=book&duration=${dur}`;
      const text = [
        `@${username} está disponible ahora para llamadas.`,
        ``,
        `Intentaste reservar cuando no estaba. Ya puedes:`,
        url,
      ].join('\n');
      let reached = false;

      // 1. DM in-app — queda como registro dentro de la app.
      try {
        await sendSystemDM(SYSTEM_SENDER, w.member_id, text, query);
        reached = true;
      } catch (err) {
        logger.warn('[callWaitlist] DM falló', { memberId: w.member_id, error: err.message });
      }

      // 2. Telegram — donde de verdad se lee. Falla solo para quien bloqueó al
      //    bot o tiene la cuenta desactivada; no afecta a los demás.
      if (w.telegram) {
        const okTg = await tgSend(
          w.telegram,
          `<b>@${username} está disponible ahora</b>\n\nIntentaste reservar cuando no estaba.`,
          url
        );
        if (okTg) reached = true;
      }

      if (reached) sent++;
      pushTargets.push(w.member_id);
    }

    // 3. Push en un solo lote: sendToUsers consulta las suscripciones de golpe
    //    en vez de una por persona.
    if (pushTargets.length) {
      try {
        await PushNotificationService.sendToUsers(pushTargets, {
          title: `@${username} está disponible`,
          body: 'Ya puedes reservar tu llamada.',
          url: `https://pnptv.app/c/${username}?action=book`,
          icon: '/icon-192.png',
          tag: `waitlist-${creatorId}`,
        });
      } catch (err) {
        logger.warn('[callWaitlist] push falló', { error: err.message });
      }
    }

    await query(
      `UPDATE call_booking_waitlist SET notified_at = NOW()
        WHERE id = ANY($1::bigint[])`,
      [waiting.map((w) => w.id)]
    );

    logger.info('[callWaitlist] avisos enviados', { creatorId: String(creatorId), sent });
    return { notified: sent };
  } catch (err) {
    logger.error('[callWaitlist] notifyAvailable falló', { creatorId, error: err.message });
    return { notified: 0, error: err.message };
  }
}

module.exports = { ensureSchema, recordMiss, notifyAvailable, RENOTIFY_COOLDOWN_HOURS };
