'use strict';

/**
 * callNotificationService.js
 * Email + Telegram notifications for Book a Call bookings.
 *
 * Depends on:
 *  - emailservice.js  (singleton EmailService with transporters.pnptv / transporters.easybots)
 *  - notificationBotDelivery.js  ({ sendNotificationViaTelegram })
 */

const emailService = require('./emailservice');
const { sendNotificationViaTelegram } = require('./notificationBotDelivery');
const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const PushNotificationService = require('./pushNotificationService');
const sendSystemDM = require('./sendSystemDM');

const SYSTEM_DM_SENDER_ID = process.env.SYSTEM_DM_SENDER_ID || '8552451957';

const APP_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';

// Admin group + Video Calls topic
const SUPPORT_GROUP_ID = process.env.SUPPORT_GROUP_ID || null;
const VIDEO_CALLS_TOPIC_ID = process.env.VIDEO_CALLS_TOPIC_ID ? Number(process.env.VIDEO_CALLS_TOPIC_ID) : null;

/**
 * Post a message to the Video Calls topic in the admin/support group.
 * Fire-and-forget — never throws.
 */
async function notifyAdminVideoCall(text) {
  if (!SUPPORT_GROUP_ID) return;
  try {
    const { getBotInstance } = require('../bot/core/bot');
    const bot = getBotInstance();
    if (!bot) return;
    const opts = { parse_mode: 'HTML' };
    if (VIDEO_CALLS_TOPIC_ID) opts.message_thread_id = VIDEO_CALLS_TOPIC_ID;
    await bot.telegram.sendMessage(SUPPORT_GROUP_ID, text, opts);
  } catch (err) {
    logger.warn('[callNotificationService] admin group notify failed', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Escape user-supplied strings before interpolation into HTML or Telegram
 * HTML parse_mode messages. & must be escaped first to avoid double-encoding.
 */
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a UTC ISO timestamp for display.
 * Uses the recipient's stored timezone when provided; otherwise shows relative
 * time ("starts in X minutes") which is always correct regardless of locale.
 */
function formatDateTime(isoString, tz) {
  if (!isoString) return 'Scheduled';
  const d = new Date(isoString);
  const diffMs  = d.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rel = diffMin <= 0 ? 'right now'
    : diffMin < 60 ? `in ${diffMin} minute${diffMin === 1 ? '' : 's'}`
    : null; // for calls far in the future, use absolute time

  if (tz) {
    try {
      const localStr = d.toLocaleString('en-US', {
        timeZone: tz, year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
      });
      return rel ? `${localStr} (${rel})` : localStr;
    } catch { /* fall through */ }
  }

  // No timezone — use relative if < 60 min away, otherwise UTC absolute
  if (rel) return `Starts ${rel}`;
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}

/**
 * Fetch user email + username for a given internal user id.
 * Returns { email, username, display_name } — email may be null if not stored.
 */
async function fetchUserInfo(userId) {
  try {
    const { rows } = await query(
      `SELECT email, username, timezone,
              COALESCE(NULLIF(TRIM(first_name || ' ' || COALESCE(last_name, '')), ''), username) AS display_name
       FROM users WHERE id = $1`,
      [userId]
    );
    return rows[0] || { email: null, username: String(userId), display_name: null, timezone: null };
  } catch (err) {
    logger.warn('[callNotificationService] fetchUserInfo error', { userId, error: err.message });
    return { email: null, username: String(userId), display_name: null, timezone: null };
  }
}

/**
 * Send a booking email via the pnptv transporter (or easybots if pnptv is unavailable).
 * Falls back silently if no transporter is configured.
 */
async function sendBookingEmail({ to, subject, html }) {
  if (!to) return;

  // Prefer the pnptv transporter; fall back to easybots
  const transporter = emailService.transporters.pnptv || emailService.transporters.easybots;
  if (!transporter) {
    logger.warn('[callNotificationService] No email transporter configured — skipping booking email', { to, subject });
    return;
  }

  try {
    const result = await transporter.sendMail({
      from: '"PNPtv" <hello@pnptv.app>',
      to,
      subject,
      html,
    });
    logger.info('[callNotificationService] booking email sent', { to, subject, messageId: result.messageId });
  } catch (err) {
    logger.warn('[callNotificationService] booking email failed', { to, subject, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// HTML generators
// ---------------------------------------------------------------------------

function buildBaseEmailHtml({ title, headerSubtitle, contentHtml }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #667eea; }
    .header h1 { color: #667eea; margin: 0; font-size: 28px; }
    .header p { color: #888; margin: 6px 0 0; }
    .badge { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .badge h2 { margin: 0; font-size: 20px; }
    .details { background: #f8f9fa; padding: 16px 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
    .details p { margin: 8px 0; }
    .info-block { background: #e8f4ff; padding: 16px 20px; border-radius: 6px; margin: 20px 0; }
    .info-block h3 { color: #667eea; margin: 0 0 10px; }
    .info-block ul { margin: 0; padding-left: 20px; }
    .info-block li { margin: 6px 0; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PNPtv!</h1>
      <p>${headerSubtitle}</p>
    </div>
    <div class="badge"><h2>${title}</h2></div>
    ${contentHtml}
    <div class="footer">
      <p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p>
      <p>For help, contact <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

function memberConfirmationHtml({ creatorName, startAt, durationMinutes, joinUrl, timezone }) {
  const formattedTime = formatDateTime(startAt, timezone);
  return buildBaseEmailHtml({
    headerSubtitle: 'Book a Call',
    title: 'Your call is booked!',
    contentHtml: `
    <p>Hi there,</p>
    <p>Your 1-on-1 call with <strong>${creatorName}</strong> is confirmed for <strong>${formattedTime}</strong> (${durationMinutes} min).</p>

    <div class="details">
      <p><strong>Creator:</strong> ${creatorName}</p>
      <p><strong>Date &amp; Time:</strong> ${formattedTime}</p>
      <p><strong>Duration:</strong> ${durationMinutes} minutes</p>
      ${joinUrl ? `<p><strong>Join Link:</strong> <a href="${joinUrl}">${joinUrl}</a></p>` : ''}
    </div>

    ${joinUrl ? `<div style="text-align:center;"><a href="${joinUrl}" class="btn">Join Your Call</a></div>` : ''}

    <div class="info-block">
      <h3>Tips</h3>
      <ul>
        <li>Join a minute early — your camera &amp; mic will turn on automatically.</li>
        <li>Find a quiet, well-lit space.</li>
        <li>Calls are private — recording is not permitted.</li>
      </ul>
    </div>

    <p>See you soon!<br><strong>The PNPtv Team</strong></p>
    `,
  });
}

function creatorConfirmationHtml({ memberUsername, startAt, durationMinutes, joinUrl, timezone, clientNotes }) {
  const formattedTime = formatDateTime(startAt, timezone);
  const notesBlock = clientNotes
    ? `<div class="info-block"><h3>Client notes</h3><p>${escHtml(clientNotes)}</p></div>`
    : '';
  return buildBaseEmailHtml({
    headerSubtitle: 'Book a Call',
    title: 'New call booking!',
    contentHtml: `
    <p>Hi there,</p>
    <p>New 1-on-1 call with <strong>${memberUsername}</strong> on <strong>${formattedTime}</strong> (${durationMinutes} min).</p>

    <div class="details">
      <p><strong>Member:</strong> ${memberUsername}</p>
      <p><strong>Date &amp; Time:</strong> ${formattedTime}</p>
      <p><strong>Duration:</strong> ${durationMinutes} minutes</p>
      ${joinUrl ? `<p><strong>Join Link:</strong> <a href="${joinUrl}">${joinUrl}</a></p>` : ''}
    </div>
    ${notesBlock}

    ${joinUrl ? `<div style="text-align:center;"><a href="${joinUrl}" class="btn">Open Call Room</a></div>` : ''}

    <div class="info-block">
      <h3>Reminders</h3>
      <ul>
        <li>Be on time — your camera &amp; mic will turn on automatically.</li>
        <li>Ensure good lighting and a quiet space.</li>
        <li>Calls are private — recording without consent is prohibited.</li>
      </ul>
    </div>

    <p>Thank you for being part of PNPtv!<br><strong>The PNPtv Team</strong></p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send booking confirmation to the member.
 *
 * @param {string} memberId  - users.id of the member
 * @param {{ creator_name?: string, start_at: string, duration_minutes: number }} booking
 * @param {{ token?: string, roomName?: string, meetingUrl?: string }|null} callInfo
 */
async function sendBookingConfirmationToMember(memberId, booking, callInfo) {
  const memberInfo = await fetchUserInfo(memberId);
  const creatorName = booking.creator_name || 'your creator';
  const joinUrl = callInfo?.meetingUrl || null;

  // Email
  if (memberInfo.email) {
    await sendBookingEmail({
      to: memberInfo.email,
      subject: 'Your call is booked! — PNPtv',
      html: memberConfirmationHtml({
        creatorName,
        startAt: booking.start_at,
        durationMinutes: booking.duration_minutes,
        joinUrl,
        timezone: memberInfo.timezone,
      }),
    });
  }

  // Telegram
  const formattedTime = booking.start_at ? formatDateTime(booking.start_at, memberInfo.timezone) : 'Now';
  const joinLine = joinUrl ? `\n\n🔗 Join your call:\n${joinUrl}` : '';
  const tgMsg = `✅ Your 1-on-1 call with <b>${creatorName}</b> is confirmed!\n\n⏰ ${formattedTime}\n⏱ ${booking.duration_minutes} min${joinLine}`;
  await sendNotificationViaTelegram(memberId, {
    type: 'hangout_call',
    message: tgMsg,
    entityType: 'call',
    entityId: null,
  }).catch((err) => logger.warn('[callNotificationService] Telegram member confirm failed', { memberId, error: err.message }));

  // Push notification with deep link to call room
  try {
    const callId = booking.creditId || booking.credit_id || booking.bookingId || booking.booking_id || null;
    await PushNotificationService.sendToUser(memberId, {
      title: '📞 Your call is confirmed!',
      body: `Call with ${creatorName} is booked. Tap to view details.`,
      url: callId ? `/call/${callId}` : '/my-access',
      tag: `call_confirmed_${callId || memberId}`,
    });
  } catch (pushErr) {
    logger.warn('[callNotificationService] push (member confirm) failed', { error: pushErr.message });
  }

  // System DM from @pnptv
  try {
    const timeStr = booking.start_at
      ? new Date(booking.start_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
      : 'por coordinar';
    const callId = booking.creditId || booking.credit_id || booking.bookingId || booking.booking_id || null;
    const callUrl = callId ? `${APP_URL}/call/${callId}` : `${APP_URL}/my-access`;
    await sendSystemDM(SYSTEM_DM_SENDER_ID, String(memberId), `📞 Tu llamada privada con ${escHtml(creatorName)} está confirmada!\n\n⏰ Horario: ${timeStr}\n\n👉 Únete aquí: ${callUrl}`, query);
  } catch (dmErr) {
    logger.warn('[callNotificationService] system DM (member confirm) failed', { error: dmErr.message });
  }

  // Admin group — Video Calls topic
  const callId = booking.creditId || booking.credit_id || booking.bookingId || booking.booking_id || null;
  const timeLabel = booking.start_at ? formatDateTime(booking.start_at) : 'TBD';
  const callUrl = callId ? `${APP_URL}/call/${callId}` : `${APP_URL}/my-access`;
  notifyAdminVideoCall(
    `📞 <b>NEW BOOKING</b>\n\n` +
    `👤 Member: <code>${escHtml(String(memberId))}</code>\n` +
    `🎭 Creator: <b>${escHtml(creatorName)}</b>\n` +
    `⏰ Time: ${timeLabel}\n` +
    `⏱ Duration: ${booking.duration_minutes} min\n` +
    `🔗 <a href="${callUrl}">Open Call Room</a>`
  ).catch(() => {});
}

/**
 * Send booking confirmation to the creator.
 *
 * @param {string} creatorId  - users.id of the creator
 * @param {{ start_at: string, duration_minutes: number }} booking
 * @param {{ username?: string, display_name?: string }} memberInfo
 * @param {{ token?: string, roomName?: string, meetingUrl?: string }|null} callInfo
 */
async function sendBookingConfirmationToCreator(creatorId, booking, memberInfo, callInfo) {
  const creatorUserInfo = await fetchUserInfo(creatorId);
  const memberUsername = memberInfo?.display_name || memberInfo?.username || 'a member';
  const joinUrl = callInfo?.meetingUrl || null;
  const clientNotes = booking.client_notes || null;

  // Email
  if (creatorUserInfo.email) {
    await sendBookingEmail({
      to: creatorUserInfo.email,
      subject: 'New call booking! — PNPtv',
      html: creatorConfirmationHtml({
        memberUsername,
        startAt: booking.start_at,
        durationMinutes: booking.duration_minutes,
        joinUrl,
        timezone: creatorUserInfo.timezone,
        clientNotes,
      }),
    });
  }

  // Telegram
  const formattedTime = booking.start_at ? formatDateTime(booking.start_at, creatorUserInfo.timezone) : 'Now';
  const joinLine = joinUrl ? `\n\n🔗 Join the call:\n${joinUrl}` : '';
  const notesLine = clientNotes ? `\n\n📝 Notes from client:\n${escHtml(clientNotes)}` : '';
  const tgMsg = `🔔 New call booking from <b>${memberUsername}</b>!\n\n⏰ ${formattedTime}\n⏱ ${booking.duration_minutes} min${notesLine}${joinLine}`;
  await sendNotificationViaTelegram(creatorId, {
    type: 'hangout_call',
    message: tgMsg,
    entityType: 'call',
    entityId: null,
  }).catch((err) => logger.warn('[callNotificationService] Telegram creator confirm failed', { creatorId, error: err.message }));

  // Push notification
  try {
    const callId = booking.creditId || booking.credit_id || booking.bookingId || booking.booking_id || null;
    await PushNotificationService.sendToUser(creatorId, {
      title: '📞 Nueva llamada privada reservada',
      body: `${memberUsername} reservó una llamada contigo. Revisa los detalles.`,
      url: callId ? `/call/${callId}` : '/my-access',
      tag: `call_confirmed_creator_${callId || creatorId}`,
    });
  } catch (pushErr) {
    logger.warn('[callNotificationService] push (creator confirm) failed', { error: pushErr.message });
  }

  // System DM
  try {
    const timeStr = booking.start_at
      ? new Date(booking.start_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
      : 'por coordinar';
    const callId = booking.creditId || booking.credit_id || booking.bookingId || booking.booking_id || null;
    const callUrl = callId ? `${APP_URL}/call/${callId}` : `${APP_URL}/my-access`;
    await sendSystemDM(SYSTEM_DM_SENDER_ID, String(creatorId), `📞 Nueva llamada privada!\n\n${escHtml(memberUsername)} reservó una sesión contigo.\n⏰ Horario: ${timeStr}\n\n👉 Entra aquí: ${callUrl}`, query);
  } catch (dmErr) {
    logger.warn('[callNotificationService] system DM (creator confirm) failed', { error: dmErr.message });
  }
}

// End-of-call warning schedule (minutes remaining when each DM fires).
// One push at T-10m is enough; T-5 → T-1 are DM-only to avoid notification spam.
const END_OF_CALL_WARNINGS_MIN = [10, 5, 4, 3, 2, 1];

/**
 * Schedule DM warnings at end-minus-{10,5,4,3,2,1} minutes so both parties know
 * when the call is about to wrap. Uses in-process setTimeout (same pattern as
 * scheduleCallReminders); reconcileReminders restores them on container restart.
 */
function scheduleEndOfCallWarnings({ bookingId, creatorId, memberId, endMs, creatorHandle, memberHandle }) {
  const nowMs = Date.now();
  const memberName = memberHandle || 'the caller';
  const creatorName = creatorHandle || 'the creator';

  for (const minLeft of END_OF_CALL_WARNINGS_MIN) {
    const targetMs = endMs - minLeft * 60 * 1000;
    const delayMs = targetMs - nowMs;
    if (delayMs <= 0) continue; // past or too close — skip

    const t = setTimeout(() => {
      const memberBody = `⏰ ${minLeft} minute${minLeft === 1 ? '' : 's'} left in your call with ${creatorName}. Wrap up gracefully — the room will close automatically at the end.`;
      const creatorBody = `⏰ ${minLeft} minuto${minLeft === 1 ? '' : 's'} restante${minLeft === 1 ? '' : 's'} en tu llamada con ${memberName}. Ve cerrando con calma — la sala se cierra automáticamente al final.`;

      sendSystemDM(SYSTEM_DM_SENDER_ID, String(memberId), memberBody, query)
        .catch((err) => logger.warn('[callNotificationService] end-of-call member DM failed', { bookingId, minLeft, error: err.message }));
      sendSystemDM(SYSTEM_DM_SENDER_ID, String(creatorId), creatorBody, query)
        .catch((err) => logger.warn('[callNotificationService] end-of-call creator DM failed', { bookingId, minLeft, error: err.message }));

      // Single push at T-10m — enough to prompt them; the rest ride on DMs so we
      // don't spam the notification tray six times per call.
      if (minLeft === 10) {
        PushNotificationService.sendToUser(memberId, {
          title: '⏰ 10 minutes left in your call',
          body: `Wrap up with ${creatorName} — the room closes automatically.`,
          url: `/call/${bookingId}`,
          tag: `call_end_10m_${bookingId}`,
        }).catch(() => {});
        PushNotificationService.sendToUser(creatorId, {
          title: '⏰ 10 minutos para cerrar',
          body: `Ve cerrando con ${memberName} — la sala se cierra sola.`,
          url: `/call/${bookingId}`,
          tag: `call_end_10m_creator_${bookingId}`,
        }).catch(() => {});
      }
    }, delayMs);
    if (t.unref) t.unref();
  }
  logger.info('[callNotificationService] end-of-call warnings scheduled', { bookingId, endMs, warningCount: END_OF_CALL_WARNINGS_MIN.length });
}

/**
 * Schedule 1h and 15min pre-call reminders + end-of-call countdown warnings.
 * Uses setTimeout for simplicity. In production, replace with a job queue (BullMQ / pg-boss).
 *
 * @param {number|string} bookingId - call_credits.id OR bookings.id (used as an identifier in logs)
 * @param {string}  creatorId
 * @param {string}  memberId
 * @param {string}  startAt         - ISO timestamp of call start
 * @param {{ token?: string, roomName?: string, meetingUrl?: string }|null} callInfo
 * @param {number}  [durationMinutes] - when provided, also schedules end-of-call countdown warnings
 */
function scheduleCallReminders(bookingId, creatorId, memberId, startAt, callInfo, durationMinutes) {
  const startMs = new Date(startAt).getTime();
  const nowMs = Date.now();

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;

  const joinUrl = callInfo?.meetingUrl || APP_URL;

  async function sendReminder(label, includeEmail) {
    const formattedTime = formatDateTime(startAt);
    const tgMsg = `${label} Your call starts at ${formattedTime}. ${callInfo ? `Join: ${joinUrl}` : ''}`;

    await Promise.allSettled([
      sendNotificationViaTelegram(memberId, { type: 'hangout_call', message: tgMsg, entityType: 'call', entityId: null }),
      sendNotificationViaTelegram(creatorId, { type: 'hangout_call', message: tgMsg, entityType: 'call', entityId: null }),
    ]);

    if (includeEmail) {
      const [memberInfo, creatorUserInfo] = await Promise.all([
        fetchUserInfo(memberId),
        fetchUserInfo(creatorId),
      ]);

      const html = buildBaseEmailHtml({
        headerSubtitle: 'Upcoming Call Reminder',
        title: label,
        contentHtml: `
        <div class="details">
          <p><strong>Date &amp; Time:</strong> ${formattedTime}</p>
          ${joinUrl ? `<p><strong>Join Link:</strong> <a href="${joinUrl}">${joinUrl}</a></p>` : ''}
        </div>
        ${joinUrl ? `<div style="text-align:center;"><a href="${joinUrl}" class="btn">Join Now</a></div>` : ''}
        `,
      });

      await Promise.allSettled([
        memberInfo.email
          ? sendBookingEmail({ to: memberInfo.email, subject: `${label} — Your PNPtv call`, html })
          : Promise.resolve(),
        creatorUserInfo.email
          ? sendBookingEmail({ to: creatorUserInfo.email, subject: `${label} — Upcoming call on PNPtv`, html })
          : Promise.resolve(),
      ]);
    }
  }

  // 1h before reminder
  const msUntil1h = startMs - ONE_HOUR_MS - nowMs;
  if (msUntil1h > 0) {
    const t = setTimeout(() => {
      sendReminder('Your call starts in 1 hour!', true)
        .catch((err) => logger.warn('[callNotificationService] 1h reminder failed', { bookingId, error: err.message }));
      // Push — fire-and-forget
      PushNotificationService.sendToUser(memberId, {
        title: '⏰ Tu llamada empieza en 1 hora',
        body: 'Tu sesión privada comienza pronto — prepárate!',
        url: joinUrl ? joinUrl.replace(/^https?:\/\/[^/]+/, '') : '/my-access',
        tag: `call_reminder_1h_${bookingId}`,
      }).catch(() => {});
      PushNotificationService.sendToUser(creatorId, {
        title: '⏰ Llamada privada en 1 hora',
        body: 'Tu próxima sesión privada empieza en 1 hora — prepara tu setup.',
        url: joinUrl ? joinUrl.replace(/^https?:\/\/[^/]+/, '') : '/my-access',
        tag: `call_reminder_1h_creator_${bookingId}`,
      }).catch(() => {});
    }, msUntil1h);
    if (t.unref) t.unref(); // don't hold Node process open
    logger.info('[callNotificationService] 1h reminder scheduled', { bookingId, inMs: msUntil1h });
  } else {
    logger.info('[callNotificationService] 1h reminder skipped — call is less than 1h away', { bookingId });
  }

  // 15min before reminder
  const msUntil15m = startMs - FIFTEEN_MIN_MS - nowMs;
  if (msUntil15m > 0) {
    const t = setTimeout(() => {
      sendReminder('Your call starts in 15 minutes!', true)
        .catch((err) => logger.warn('[callNotificationService] 15min reminder failed', { bookingId, error: err.message }));
      // Push — fire-and-forget
      PushNotificationService.sendToUser(memberId, {
        title: '🔴 Tu llamada empieza en 15 minutos',
        body: 'Entra ahora para estar listo.',
        url: joinUrl ? joinUrl.replace(/^https?:\/\/[^/]+/, '') : '/my-access',
        tag: `call_reminder_15m_${bookingId}`,
      }).catch(() => {});
      PushNotificationService.sendToUser(creatorId, {
        title: '🔴 Llamada en 15 minutos',
        body: 'Tu próxima sesión privada empieza en 15 minutos — entra al cuarto.',
        url: joinUrl ? joinUrl.replace(/^https?:\/\/[^/]+/, '') : '/my-access',
        tag: `call_reminder_15m_creator_${bookingId}`,
      }).catch(() => {});
    }, msUntil15m);
    if (t.unref) t.unref();
    logger.info('[callNotificationService] 15min reminder scheduled', { bookingId, inMs: msUntil15m });
  } else {
    logger.info('[callNotificationService] 15min reminder skipped — call is less than 15min away', { bookingId });
  }

  // End-of-call countdown warnings (T-10, T-5, T-4, T-3, T-2, T-1 minutes)
  if (durationMinutes && Number(durationMinutes) > 0) {
    const endMs = startMs + Number(durationMinutes) * 60 * 1000;
    // Resolve display names once per booking so each warning DM addresses the other party by handle.
    Promise.all([fetchUserInfo(memberId), fetchUserInfo(creatorId)])
      .then(([memberInfo, creatorInfo]) => {
        const memberHandle = memberInfo?.username ? `@${memberInfo.username}` : (memberInfo?.first_name || 'your caller');
        const creatorHandle = creatorInfo?.username ? `@${creatorInfo.username}` : (creatorInfo?.first_name || 'the creator');
        scheduleEndOfCallWarnings({ bookingId, creatorId, memberId, endMs, creatorHandle, memberHandle });
      })
      .catch((err) => {
        logger.warn('[callNotificationService] end-of-call handle lookup failed — scheduling anyway with defaults', { bookingId, error: err.message });
        scheduleEndOfCallWarnings({ bookingId, creatorId, memberId, endMs });
      });
  } else {
    logger.info('[callNotificationService] end-of-call warnings skipped — no durationMinutes', { bookingId });
  }
}

/**
 * Re-schedule in-memory reminders for all confirmed future bookings.
 * Must be called on server startup after the DB is ready so that reminders
 * lost during container restarts (setTimeout is in-process memory) are restored.
 */
async function reconcileReminders() {
  try {
    const { rows } = await query(
      `SELECT b.id AS booking_id,
              b.user_id    AS member_id,
              p.user_id    AS creator_id,
              b.start_time_utc AS start_at,
              b.end_time_utc   AS end_at,
              b.duration_minutes,
              b.credit_id
       FROM bookings b
       JOIN performers p ON p.id = b.performer_id
       WHERE b.status = 'confirmed'
         AND b.end_time_utc > NOW()`
    );

    let count = 0;
    for (const row of rows) {
      try {
        const callInfo = { joinUrl: `${APP_URL}/call/${row.credit_id || row.booking_id}` };
        scheduleCallReminders(row.booking_id, row.creator_id, row.member_id, row.start_at, callInfo, row.duration_minutes);
        count++;
      } catch (schedErr) {
        logger.warn('[callNotificationService] reconcileReminders: failed to schedule reminder', {
          bookingId: row.booking_id,
          error: schedErr.message,
        });
      }
    }

    logger.info(`[callNotificationService] Reconciled ${count} pending call reminders on startup`);
  } catch (err) {
    logger.error('[callNotificationService] reconcileReminders failed', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Post-call survey prompt
// ---------------------------------------------------------------------------

function postCallSurveyHtml({ creatorName, surveyUrl }) {
  return buildBaseEmailHtml({
    headerSubtitle: 'Book a Call',
    title: `How was your call with ${escHtml(creatorName)}?`,
    contentHtml: `
    <p>Hi there,</p>
    <p>Your private call with <strong>${escHtml(creatorName)}</strong> has ended. We hope it was an amazing experience!</p>
    <p>We'd love your feedback — it takes less than 2 minutes and helps improve the experience for everyone.</p>
    <p style="margin:16px 0 8px;font-weight:600;">You'll be asked to rate:</p>
    <ul style="margin:0 0 16px;padding-left:20px;line-height:1.8;">
      <li>&#11088; <strong>Tech Quality</strong> — How was the video/audio connection?</li>
      <li>&#11088; <strong>Performance</strong> — How was the overall experience with the creator?</li>
      <li>&#11088; <strong>Presentation</strong> — How was the creator's appearance and setting?</li>
      <li>&#11088; <strong>Politeness</strong> — How courteous and professional was the creator?</li>
    </ul>
    <p style="margin:0 0 8px;">Plus a few quick questions about what we could improve in tech quality, your thoughts on the app, and the creator's equipment setup.</p>
    <div style="text-align:center;margin:24px 0;"><a href="${escHtml(surveyUrl)}" class="btn">Rate Your Call</a></div>
    <p>Your feedback is private by default. You'll have the option to share it directly with ${escHtml(creatorName)} if you'd like.</p>
    <p>Thank you!<br><strong>The PNPtv Team</strong></p>
    `,
  });
}

/**
 * Send a post-call survey prompt to the member after a booking ends.
 * Non-fatal — all errors are swallowed and logged as warnings.
 *
 * @param {string} memberId
 * @param {string} bookingId
 * @param {string} creatorDisplayName
 */
async function sendPostCallSurveyPrompt(memberId, bookingId, creatorDisplayName) {
  try {
    const memberInfo = await fetchUserInfo(memberId);
    const surveyUrl = `${APP_URL}/booking/${encodeURIComponent(bookingId)}/confirm?survey=1`;
    const creatorName = creatorDisplayName || 'the creator';

    const tgMsg =
      `✅ Your call with ${creatorName} has ended!\n\n` +
      `How did it go? Leave a quick rating (takes 30 seconds):\n${surveyUrl}`;

    await sendNotificationViaTelegram(memberId, {
      type: 'hangout_call',
      message: tgMsg,
      entityType: 'call',
      entityId: null,
    });

    if (memberInfo.email) {
      await sendBookingEmail({
        to: memberInfo.email,
        subject: `How was your call with ${creatorName}?`,
        html: postCallSurveyHtml({ creatorName, surveyUrl }),
      });
    }

    // Push notification
    try {
      await PushNotificationService.sendToUser(memberId, {
        title: '⭐ ¿Cómo fue tu llamada?',
        body: 'Deja tu calificación — solo toma 10 segundos.',
        url: `/booking/${encodeURIComponent(bookingId)}/confirm?survey=1`,
        tag: `call_survey_${bookingId}`,
      });
    } catch (pushErr) {
      logger.warn('[callNotificationService] push (survey) failed', { error: pushErr.message });
    }

    // System DM
    try {
      await sendSystemDM(SYSTEM_DM_SENDER_ID, String(memberId), `⭐ ¿Cómo estuvo tu llamada?\n\nTu opinión ayuda a la comunidad. Deja tu calificación aquí:\n${surveyUrl}`, query);
    } catch (dmErr) {
      logger.warn('[callNotificationService] system DM (survey) failed', { error: dmErr.message });
    }

    logger.info('[callNotificationService] post-call survey prompt sent', { memberId, bookingId });
  } catch (err) {
    logger.warn('[callNotificationService] sendPostCallSurveyPrompt failed', { memberId, bookingId, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Dispatch pending DB-scheduled notifications (called by cron)
// ---------------------------------------------------------------------------

/**
 * Flush all due `booking_notifications` rows. Called every 5 minutes by cron.js.
 * Dispatches reminder_60 / reminder_15 / reminder_5 notifications via email + Telegram.
 * Marks each row sent or failed; retries up to 3 times before giving up.
 */
async function sendPendingNotifications() {
  const BookingNotificationModel = require('../models/bookingNotificationModel');
  const pending = await BookingNotificationModel.getDuePending();
  if (pending.length === 0) return;

  logger.info('[callNotificationService] dispatching pending booking notifications', { count: pending.length });

  for (const notif of pending) {
    try {
      const { userId, bookingId, type, performerName, startTimeUtc, durationMinutes, recipientType } = notif;
      const userInfo = await fetchUserInfo(userId);
      const joinUrl = bookingId ? `${APP_URL}/call/${encodeURIComponent(bookingId)}` : null;
      const timeLabel = startTimeUtc ? formatDateTime(startTimeUtc, userInfo.timezone) : 'soon';
      const joinLine = joinUrl ? `\n\n🔗 Join here:\n${joinUrl}` : '';

      let minutesBefore = 60;
      if (type === 'reminder_15') minutesBefore = 15;
      if (type === 'reminder_5') minutesBefore = 5;

      if (type === 'reminder_60' || type === 'reminder_15' || type === 'reminder_5') {
        const label = minutesBefore === 60 ? '1 hour' : `${minutesBefore} minutes`;
        const party = recipientType === 'performer' ? performerName || 'a member' : performerName || 'your creator';
        const tgMsg = `⏰ Reminder: your call with <b>${party}</b> starts in <b>${label}</b>!\n\n${timeLabel}${joinLine}`;
        await sendNotificationViaTelegram(userId, {
          type: 'hangout_call',
          message: tgMsg,
          entityType: 'call',
          entityId: bookingId,
        }).catch(() => {});

        if (userInfo.email) {
          await sendBookingEmail({
            to: userInfo.email,
            subject: `Your call starts in ${label} — PNPtv`,
            html: memberConfirmationHtml({
              creatorName: party,
              startAt: startTimeUtc,
              durationMinutes,
              joinUrl,
              timezone: userInfo.timezone,
            }),
          });
        }
      }

      await BookingNotificationModel.markSent(notif.id);
    } catch (dispatchErr) {
      logger.warn('[callNotificationService] notification dispatch failed', { notifId: notif.id, error: dispatchErr.message });
      if ((notif.retryCount || 0) >= 3) {
        await BookingNotificationModel.markFailed(notif.id, dispatchErr.message).catch(() => {});
      }
    }
  }
}

/**
 * Send a copy of the member's completed survey to the creator (only when member opted in).
 * Non-fatal — all errors are swallowed.
 */
async function sendSurveyToCreator({
  creatorId, memberUsername, rating,
  techQuality, performanceQuality, presentation, politeness,
  techImprovement, appFeedback, equipmentFeedback, feedback,
}) {
  try {
    const creatorInfo = await fetchUserInfo(creatorId);
    if (!creatorInfo.email) {
      logger.info('[callNotificationService] sendSurveyToCreator: no email for creator', { creatorId });
      return;
    }

    const stars = (n) => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : 'N/A';

    const rows = [
      ['Overall', stars(rating)],
      ['Tech Quality', stars(techQuality)],
      ['Performance', stars(performanceQuality)],
      ['Presentation', stars(presentation)],
      ['Politeness', stars(politeness)],
    ].map(([label, val]) =>
      `<tr><td style="padding:6px 12px;color:#8E8E93;font-size:14px;">${label}</td><td style="padding:6px 12px;font-size:14px;font-weight:600;">${val}</td></tr>`
    ).join('');

    const openEnded = [
      ['Tech quality improvements', techImprovement],
      ['App feedback', appFeedback],
      ['Equipment/setup feedback', equipmentFeedback],
      ['General feedback', feedback],
    ].filter(([, v]) => v).map(([label, val]) =>
      `<div style="margin-bottom:12px;"><p style="font-weight:600;margin:0 0 4px;font-size:13px;color:#8E8E93;">${escHtml(label)}</p><p style="margin:0;font-size:14px;">${escHtml(val)}</p></div>`
    ).join('');

    const html = buildBaseEmailHtml({
      headerSubtitle: 'Survey Results',
      title: 'A member shared their call feedback with you',
      contentHtml: `
      <p>Hi ${escHtml(creatorInfo.display_name || creatorInfo.username || 'there')},</p>
      <p>A member (<strong>${escHtml(memberUsername)}</strong>) chose to share their call feedback with you:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">${rows}</table>
      ${openEnded ? `<div style="margin-top:16px;">${openEnded}</div>` : ''}
      <p style="margin-top:20px;font-size:13px;color:#8E8E93;">This feedback was submitted by the member. If you have questions, contact support.</p>
      <p><strong>The PNPtv Team</strong></p>
      `,
    });

    await sendBookingEmail({
      to: creatorInfo.email,
      subject: `New call feedback from ${memberUsername}`,
      html,
    });

    logger.info('[callNotificationService] survey copy sent to creator', { creatorId, memberUsername });
  } catch (err) {
    logger.warn('[callNotificationService] sendSurveyToCreator failed', { creatorId, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Cancellation notifications — all 4 channels
// ---------------------------------------------------------------------------

/**
 * Notify both member and creator when a booking is cancelled.
 * cancelledByRole: 'member' | 'creator' | 'system'
 * Fire-and-forget from callers; all errors are swallowed internally.
 */
async function sendCancellationNotifications({ memberId, creatorId, creditId, bookingId, memberDisplayName, creatorDisplayName, cancelledByRole, startAt }) {
  const timeStr = startAt
    ? new Date(startAt).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const timeNote = timeStr ? ` programada para el ${timeStr}` : '';

  const memberSubject = cancelledByRole === 'creator'
    ? `Tu llamada con ${creatorDisplayName} fue cancelada`
    : 'Tu llamada privada fue cancelada';
  const creatorSubject = cancelledByRole === 'member'
    ? `${memberDisplayName} canceló su llamada contigo`
    : 'Llamada privada cancelada';

  const memberBody = cancelledByRole === 'creator'
    ? `Tu llamada${timeNote} fue cancelada por ${creatorDisplayName}. Tu crédito ha sido devuelto y puedes reservar otra sesión cuando quieras.`
    : `Tu llamada${timeNote} fue cancelada. Tu crédito ha sido devuelto.`;
  const creatorBody = cancelledByRole === 'member'
    ? `${memberDisplayName} canceló su llamada${timeNote}. El crédito fue devuelto al cliente.`
    : `La llamada${timeNote} con ${memberDisplayName} fue cancelada.`;

  // --- Email ---
  try {
    const transporter = emailService.transporters.pnptv || emailService.transporters.easybots;
    if (transporter) {
      const [mResult, cResult] = await Promise.allSettled([
        query('SELECT email FROM users WHERE id = $1', [memberId]),
        query('SELECT email FROM users WHERE id = $1', [creatorId]),
      ]);
      const memberEmail = mResult.status === 'fulfilled' ? mResult.value.rows[0]?.email : null;
      const creatorEmail = cResult.status === 'fulfilled' ? cResult.value.rows[0]?.email : null;

      if (memberEmail) {
        await transporter.sendMail({
          from: `PNPtv! <${process.env.SMTP_FROM || 'support@pnptv.app'}>`,
          to: memberEmail,
          subject: memberSubject,
          html: buildBaseEmailHtml({
            headerSubtitle: 'Book a Call',
            title: 'Llamada cancelada',
            contentHtml: `<p>${escHtml(memberBody)}</p><div style="text-align:center;margin:20px 0;"><a href="${APP_URL}/my-access" class="btn">Ver mis créditos</a></div>`,
          }),
        });
      }
      if (creatorEmail) {
        await transporter.sendMail({
          from: `PNPtv! <${process.env.SMTP_FROM || 'support@pnptv.app'}>`,
          to: creatorEmail,
          subject: creatorSubject,
          html: buildBaseEmailHtml({
            headerSubtitle: 'Book a Call',
            title: 'Llamada cancelada',
            contentHtml: `<p>${escHtml(creatorBody)}</p>`,
          }),
        });
      }
    }
  } catch (emailErr) {
    logger.warn('[callNotificationService] cancellation email failed', { error: emailErr.message });
  }

  // --- Telegram ---
  try {
    await sendNotificationViaTelegram(memberId, {
      type: 'call_booking',
      message: escHtml(memberBody),
      entityType: 'booking',
      entityId: creditId || bookingId || null,
    });
  } catch (tgErr) {
    logger.warn('[callNotificationService] cancellation TG (member) failed', { error: tgErr.message });
  }
  try {
    await sendNotificationViaTelegram(creatorId, {
      type: 'call_booking',
      message: escHtml(creatorBody),
      entityType: 'booking',
      entityId: creditId || bookingId || null,
    });
  } catch (tgErr) {
    logger.warn('[callNotificationService] cancellation TG (creator) failed', { error: tgErr.message });
  }

  // --- Push ---
  PushNotificationService.sendToUser(memberId, {
    title: '📞 Llamada cancelada',
    body: memberSubject,
    url: '/my-access',
    tag: `call_cancelled_${creditId || bookingId}`,
  }).catch(() => {});
  PushNotificationService.sendToUser(creatorId, {
    title: '📞 Llamada cancelada',
    body: creatorSubject,
    url: '/my-access',
    tag: `call_cancelled_creator_${creditId || bookingId}`,
  }).catch(() => {});

  // --- System DM ---
  sendSystemDM(SYSTEM_DM_SENDER_ID, String(memberId), `❌ ${memberBody}`, query).catch(() => {});
  sendSystemDM(SYSTEM_DM_SENDER_ID, String(creatorId), `❌ ${creatorBody}`, query).catch(() => {});

  // --- Admin group: Video Calls topic ---
  const cancelTimeLabel = startAt ? formatDateTime(startAt) : 'TBD';
  const cancelledBy = cancelledByRole === 'member' ? `👤 ${escHtml(memberDisplayName)}` : cancelledByRole === 'creator' ? `🎭 ${escHtml(creatorDisplayName)}` : '⚙️ System';
  notifyAdminVideoCall(
    `❌ <b>BOOKING CANCELLED</b>\n\n` +
    `👤 Member: <b>${escHtml(memberDisplayName)}</b> (<code>${escHtml(String(memberId))}</code>)\n` +
    `🎭 Creator: <b>${escHtml(creatorDisplayName)}</b>\n` +
    `⏰ Was scheduled: ${cancelTimeLabel}\n` +
    `🚫 Cancelled by: ${cancelledBy}`
  ).catch(() => {});
}

module.exports = {
  sendBookingConfirmationToMember,
  sendBookingConfirmationToCreator,
  scheduleCallReminders,
  reconcileReminders,
  sendPostCallSurveyPrompt,
  sendPendingNotifications,
  sendSurveyToCreator,
  sendCancellationNotifications,
};
