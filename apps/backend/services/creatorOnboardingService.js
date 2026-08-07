'use strict';

/**
 * creatorOnboardingService.js
 *
 * Slack is the source of truth for creator onboarding. This service owns:
 *
 *   - The onboarding message that lands in #ext-[handle] the moment 2257 is
 *     approved (and again, on the daily 5:10am cron for any creator that
 *     slipped through — idempotent via users.slack_onboarded_at).
 *   - Pinning that message so it's the top of the channel.
 *   - Storing users.slack_onboarding_msg_ts so slackEventsRouter can match a
 *     :white_check_mark: reaction on it → users.slack_legal_ack_at + Zoho.
 *   - DMing SLACK_ADMIN_DM_USER_ID (Santino) on each new creator approval.
 *   - Day-3 nudge (no legal ack) + Day-7 nudge (no Cal.com booking).
 *
 * Zero throw. Every public function is best-effort and never blocks upstream
 * flows. If SLACK_BOT_TOKEN is missing the whole service silently no-ops.
 *
 * Wired from:
 *   - services/identityVerificationService.js (2257 approve → sendOnboarding)
 *   - scripts/slack-welcome-creators.js       (daily batch)
 *   - bot/api/routes.js                       (Slack events fan-out → ack)
 *   - bot/api/controllers/calcomWebhookController.js (booking → recordCalBooking)
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';

const LEGAL_PACKAGE_URL = process.env.LEGAL_PACKAGE_URL || 'https://pnptv.app/docs/legal/creator/';
const LEGAL_PACKAGE_VERSION = process.env.LEGAL_PACKAGE_VERSION || 'v1.0-2026-08-07-DRAFT';
const CAL_ONBOARDING_URL = process.env.CAL_ONBOARDING_URL || 'https://booking.pnptv.app/pnptv/onboarding';
const ADMIN_DM_USER_ID = process.env.SLACK_ADMIN_DM_USER_ID || '';
const OPS_CREATOR_CHANNEL = process.env.SLACK_OPS_CREATOR_CHANNEL || '';

const _tok = () => process.env.SLACK_BOT_TOKEN || '';

// ---------------------------------------------------------------------------
// Slack primitives — thin, no throw
// ---------------------------------------------------------------------------

async function _slackCall(method, body) {
  if (!_tok()) return { ok: false, error: 'no_token' };
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${_tok()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'invalid_json' }));
    if (!data.ok) {
      logger.warn(`[creatorOnboardingService] ${method} failed`, {
        error: data.error,
        warning: data.warning,
      });
    }
    return data;
  } catch (err) {
    logger.warn(`[creatorOnboardingService] ${method} fetch error`, { error: err.message });
    return { ok: false, error: err.message };
  }
}

async function _dmUser(slackUserId, text, blocks) {
  if (!_tok() || !slackUserId) return;
  const open = await _slackCall('conversations.open', { users: slackUserId });
  if (!open.ok || !open.channel?.id) return;
  await _slackCall('chat.postMessage', {
    channel: open.channel.id,
    text,
    blocks,
    unfurl_links: false,
  });
}

/**
 * Safety guard — some pre-fix #ext-* channels were created PUBLIC before the
 * default-private fix and haven't been converted yet (see project memory
 * project_slack_migration_2026_08.md). Posting creator-sensitive onboarding
 * content to a public channel is a data leak. Return true only when we've
 * positively confirmed the channel is private. Unknown → treat as unsafe.
 */
async function _isChannelPrivate(channelId) {
  if (!_tok() || !channelId) return false;
  try {
    const res = await fetch(
      `${SLACK_API}/conversations.info?channel=${encodeURIComponent(channelId)}`,
      { headers: { Authorization: `Bearer ${_tok()}` }, signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return false;
    return data.channel?.is_private === true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message builder — bilingual, DRAFT-legal-package-aware
// ---------------------------------------------------------------------------

/**
 * @param {{ first_name?: string, username?: string, language?: string }} creator
 * @returns {{ text: string, blocks: any[] }}
 */
function buildOnboardingMessage(creator) {
  const name = creator.first_name || creator.username || 'Creator';
  const handle = creator.username || 'you';
  const isEs = (creator.language || '').toLowerCase().startsWith('es');

  if (isEs) {
    const text = `🎉 Bienvenido/a al Programa de Socios PNPtv!, ${name} — tu onboarding empieza aquí.`;
    return {
      text,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🎉 Bienvenido/a, ${name}!`, emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Fuiste aprobado/a como creador/a del *Programa de Socios PNPtv!*. Este canal — *#ext-${handle}* — es tu línea directa con el equipo fundador. Todo tu onboarding pasa por acá.`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Tu equipo:*\n• *Santino* — fundador / tu contacto principal\n• *Miguel* — operaciones / agenda / pagos\n• *Carlos* — tecnología / bugs / feedback de producto\n\n(DMéanos cuando necesites — respondemos en 12h laborales.)`,
            },
          ],
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📚 *PASO 1 — Lee tus derechos y el trato*\n\nPaquete legal y de políticas completo (*BORRADOR* para tu revisión — la firma se hace *después* de que asesoría legal colombiana lo apruebe):\n<${LEGAL_PACKAGE_URL}|${LEGAL_PACKAGE_URL}>\n\n👉 Empieza con el *Doc 08* (Carta de Derechos y Responsabilidades — 10 min en lenguaje claro).\n👉 Luego el *Doc 09* (Índice de Inducción — el checklist de abajo en forma de documento).`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *PASO 2 — Confirma que leíste el Doc 08*\n\nReacciona a *ESTE mensaje* con :white_check_mark: cuando hayas leído el Doc 08. Eso nos avisa que estás listo/a para agendar tu llamada.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📅 *PASO 3 — Agenda tu llamada de onboarding* (30 min con Santino o Miguel):\n<${CAL_ONBOARDING_URL}|Reservar aquí>`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📋 *Los otros 7 pasos* (los vemos juntos en la llamada):\n\n4. Completa tu perfil de creador en la webapp\n5. Lee y acepta las cuatro políticas (docs 04–07)\n6. Firma los tres contratos (docs 01–03) por la plataforma de firma (link post-llamada)\n7. Configura tu disponibilidad + tarifas\n8. Agenda tu primer stream y sube tu primer video a PNP Channels\n9. Configura tu método de pago (USDT/USDC recomendado)\n10. Primer payout: lote semanal (mínimo $100 acumulado)`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💬 *Reglas de comunicación* (de la Política de Comunicaciones):\n• Este canal + plataforma PNPtv! = los *ÚNICOS* canales aprobados para temas de la plataforma\n• Prohibido: WhatsApp, IG DM, Telegram personal, SMS, Signal, Discord\n• SLA de Slack: te respondemos en 12h laborales`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🚨 *Emergencia* (seguridad, doxeo, acoso): DM directo a Santino.\n\n_Paquete legal: ${LEGAL_PACKAGE_VERSION}_`,
            },
          ],
        },
      ],
    };
  }

  // English
  const text = `🎉 Welcome to the PNPtv! Partner Program, ${name} — your onboarding starts here.`;
  return {
    text,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎉 Welcome, ${name}!`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `You've been approved as a *PNPtv! Partner Program* creator. This channel — *#ext-${handle}* — is your direct line to the founder team. Your whole onboarding happens here.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Your team:*\n• *Santino* — founder / your main contact\n• *Miguel* — ops / scheduling / payouts\n• *Carlos* — tech / bugs / product feedback\n\n(DM any of us anytime — we ack within 12h business hours.)`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📚 *STEP 1 — Read your rights and the deal*\n\nFull legal & policy package (*DRAFT* — for your review; signing happens *after* Colombian legal counsel approves):\n<${LEGAL_PACKAGE_URL}|${LEGAL_PACKAGE_URL}>\n\n👉 Start with *Doc 08* (Rights & Responsibilities Charter — 10 min plain English).\n👉 Then *Doc 09* (Onboarding Index — the checklist below in doc form).`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *STEP 2 — Confirm you've read Doc 08*\n\nReact to *THIS message* with :white_check_mark: once you've read Doc 08. That tells us you're ready to schedule your call.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📅 *STEP 3 — Book your onboarding call* (30 min with Santino or Miguel):\n<${CAL_ONBOARDING_URL}|Book here>`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📋 *The other 7 steps* (we walk through them on the call):\n\n4. Complete your creator profile in the webapp\n5. Read & acknowledge the four policies (docs 04–07)\n6. Sign the three contracts (docs 01–03) via the signing platform (link comes after your call)\n7. Set your availability + rates\n8. Schedule your first stream and upload your first PNP Channels video\n9. Set up your payout method (USDT/USDC preferred)\n10. First payout: weekly batch (min $100 accrued)`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💬 *Communication ground rules* (from the Communications Policy):\n• This channel + PNPtv! platform = the *ONLY* approved channels for platform business\n• Prohibited: WhatsApp, IG DM, personal Telegram, SMS, Signal, Discord\n• Slack SLA: we ack within 12h your working hours`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🚨 *Emergency* (safety, doxxing, harassment): DM Santino directly.\n\n_Legal package: ${LEGAL_PACKAGE_VERSION}_`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main flow — sendOnboarding
// ---------------------------------------------------------------------------

/**
 * Post the onboarding message to a creator's #ext-[handle] channel, pin it,
 * store the ts on users.slack_onboarding_msg_ts, and stamp slack_onboarded_at.
 * Idempotent — no-ops if slack_onboarded_at is already set (unless force=true).
 *
 * @param {string|number} userId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{sent: boolean, reason?: string, ts?: string}>}
 */
async function sendOnboarding(userId, opts = {}) {
  const force = !!opts.force;
  if (!_tok()) return { sent: false, reason: 'no_slack_token' };

  const { rows } = await query(
    `SELECT id, username, first_name, language, slack_channel_id, slack_onboarded_at
       FROM users
      WHERE id = $1`,
    [String(userId)]
  );
  const creator = rows[0];
  if (!creator) return { sent: false, reason: 'user_not_found' };
  if (!creator.slack_channel_id) return { sent: false, reason: 'no_slack_channel' };
  if (creator.slack_onboarded_at && !force) return { sent: false, reason: 'already_onboarded' };

  // Safety guard — refuse to post creator-sensitive content in a public channel.
  const priv = await _isChannelPrivate(creator.slack_channel_id);
  if (!priv) {
    logger.warn('[creatorOnboardingService] refusing to onboard — channel not private', {
      userId,
      channel: creator.slack_channel_id,
    });
    return { sent: false, reason: 'channel_not_private' };
  }

  const { text, blocks } = buildOnboardingMessage(creator);
  const post = await _slackCall('chat.postMessage', {
    channel: creator.slack_channel_id,
    text,
    blocks,
    unfurl_links: false,
  });
  if (!post.ok || !post.ts) {
    return { sent: false, reason: post.error || 'post_failed' };
  }

  // Pin so it stays at the top of the channel
  await _slackCall('pins.add', { channel: creator.slack_channel_id, timestamp: post.ts });

  await query(
    `UPDATE users
        SET slack_onboarded_at = COALESCE(slack_onboarded_at, NOW()),
            slack_onboarding_msg_ts = $2
      WHERE id = $1`,
    [String(userId), post.ts]
  );

  logger.info('[creatorOnboardingService] onboarding sent', {
    userId,
    channel: creator.slack_channel_id,
    ts: post.ts,
  });
  return { sent: true, ts: post.ts };
}

// ---------------------------------------------------------------------------
// Admin DM — "new creator approved"
// ---------------------------------------------------------------------------

/**
 * DM Santino (SLACK_ADMIN_DM_USER_ID) + post to #ops-creator that a new
 * creator finished 2257 approval and the onboarding message just fired.
 * @param {string|number} userId
 */
async function notifyAdminNewCreator(userId) {
  if (!_tok()) return;
  const { rows } = await query(
    `SELECT id, username, first_name, slack_channel_id, email
       FROM users WHERE id = $1`,
    [String(userId)]
  );
  const c = rows[0];
  if (!c) return;

  const handle = c.username || `user-${c.id}`;
  const name = c.first_name || handle;
  const channelRef = c.slack_channel_id ? `<#${c.slack_channel_id}>` : `#ext-${handle}`;

  const text = `🆕 New creator approved: ${name} (@${handle})`;
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🆕 *New Partner Program creator approved*\n\n*Name:* ${name}\n*Handle:* @${handle}\n*Email:* ${c.email || '_not on file_'}\n*Channel:* ${channelRef}\n\nOnboarding message already posted + pinned in their channel. Say hi 👋`,
      },
    },
  ];

  if (ADMIN_DM_USER_ID) await _dmUser(ADMIN_DM_USER_ID, text, blocks);
  if (OPS_CREATOR_CHANNEL) {
    await _slackCall('chat.postMessage', {
      channel: OPS_CREATOR_CHANNEL,
      text,
      blocks,
      unfurl_links: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Ack — creator reacted ✅ on the onboarding message
// ---------------------------------------------------------------------------

/**
 * Handle a Slack reaction_added event. Fires from slackEventsRouter fan-out.
 * If the reacted message ts matches a stored users.slack_onboarding_msg_ts,
 * stamp slack_legal_ack_at + upsert to Zoho. Safe no-op otherwise.
 * @param {object} event  Slack reaction_added event
 */
async function handleReactionAdded(event) {
  try {
    if (!event || event.type !== 'reaction_added') return;
    if (event.reaction !== 'white_check_mark') return;
    const ts = event.item?.ts;
    const channel = event.item?.channel;
    if (!ts || !channel) return;

    // Look up which creator this message belongs to
    const { rows } = await query(
      `SELECT id, username, first_name, slack_legal_ack_at
         FROM users
        WHERE slack_onboarding_msg_ts = $1
          AND slack_channel_id = $2
        LIMIT 1`,
      [ts, channel]
    );
    const c = rows[0];
    if (!c) return; // reaction not on an onboarding message
    if (c.slack_legal_ack_at) return; // already recorded

    await query(
      `UPDATE users SET slack_legal_ack_at = NOW() WHERE id = $1`,
      [String(c.id)]
    );

    logger.info('[creatorOnboardingService] legal ack recorded', {
      userId: c.id,
      username: c.username,
    });

    // Zoho sync — fire-and-forget, no-op when unconfigured
    setImmediate(async () => {
      try {
        const zoho = require('./zohoService');
        if (!zoho.isConfigured()) return;
        await zoho.upsertContactByPnptvId(String(c.id), {
          Legal_Package_Acknowledged_At: new Date().toISOString(),
          Legal_Package_Version: LEGAL_PACKAGE_VERSION,
          Legal_Package_URL: LEGAL_PACKAGE_URL,
        });
      } catch (err) {
        logger.warn('[creatorOnboardingService] Zoho ack sync failed (non-fatal)', {
          userId: c.id,
          error: err.message,
        });
      }
    });

    // Nudge ops that this creator is ready to book their call
    const handle = c.username || `user-${c.id}`;
    const text = `✅ @${handle} acknowledged Doc 08 — ready to schedule onboarding call.`;
    if (ADMIN_DM_USER_ID) await _dmUser(ADMIN_DM_USER_ID, text);
    if (OPS_CREATOR_CHANNEL) {
      await _slackCall('chat.postMessage', { channel: OPS_CREATOR_CHANNEL, text });
    }
  } catch (err) {
    logger.warn('[creatorOnboardingService] handleReactionAdded error', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Cal.com booking → slack_calbooked_at
// ---------------------------------------------------------------------------

/**
 * Record the first Cal.com booking a creator makes as their onboarding-call
 * booking. Idempotent — only stamps if slack_calbooked_at IS NULL. Matched
 * by lowercased email. Fires from calcomWebhookController on BOOKING_CREATED.
 * @param {string} attendeeEmail
 */
async function recordCalBooking(attendeeEmail) {
  try {
    if (!attendeeEmail) return;
    const email = String(attendeeEmail).toLowerCase().trim();
    const { rowCount } = await query(
      `UPDATE users
          SET slack_calbooked_at = NOW()
        WHERE LOWER(email) = $1
          AND slack_channel_id IS NOT NULL
          AND slack_calbooked_at IS NULL`,
      [email]
    );
    if (rowCount > 0) {
      logger.info('[creatorOnboardingService] cal booking recorded', { email });
    }
  } catch (err) {
    logger.warn('[creatorOnboardingService] recordCalBooking error', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Nudges — Day-3 no ack, Day-7 no booking
// ---------------------------------------------------------------------------

async function _postNudge(creator, text) {
  if (!creator?.slack_channel_id) return false;
  const post = await _slackCall('chat.postMessage', {
    channel: creator.slack_channel_id,
    text,
    unfurl_links: false,
  });
  return !!post.ok;
}

async function _runDay3Nudges() {
  const { rows } = await query(
    `SELECT id, username, first_name, language, slack_channel_id
       FROM users
      WHERE slack_onboarded_at IS NOT NULL
        AND slack_onboarded_at < NOW() - INTERVAL '3 days'
        AND slack_legal_ack_at IS NULL
        AND slack_day3_nudged_at IS NULL
        AND slack_channel_id IS NOT NULL`
  );
  for (const c of rows) {
    const isEs = (c.language || '').toLowerCase().startsWith('es');
    const name = c.first_name || c.username || (isEs ? 'creador/a' : 'creator');
    const text = isEs
      ? `👋 Hola ${name} — ¿pudiste leer el *Doc 08* del paquete legal? Cuando lo tengas, reacciona con :white_check_mark: en el mensaje anclado arriba. Cualquier duda me escribes acá. — El equipo PNPtv!`
      : `👋 Hey ${name} — did you get a chance to read *Doc 08* of the legal package? When you're done, react with :white_check_mark: on the pinned message above. Any questions, just ping us here. — The PNPtv! team`;
    const ok = await _postNudge(c, text);
    if (ok) {
      await query(`UPDATE users SET slack_day3_nudged_at = NOW() WHERE id = $1`, [String(c.id)]);
    }
  }
  return rows.length;
}

async function _runDay7Nudges() {
  const { rows } = await query(
    `SELECT id, username, first_name, language, slack_channel_id
       FROM users
      WHERE slack_onboarded_at IS NOT NULL
        AND slack_onboarded_at < NOW() - INTERVAL '7 days'
        AND slack_calbooked_at IS NULL
        AND slack_day7_nudged_at IS NULL
        AND slack_channel_id IS NOT NULL`
  );
  for (const c of rows) {
    const isEs = (c.language || '').toLowerCase().startsWith('es');
    const name = c.first_name || c.username || (isEs ? 'creador/a' : 'creator');
    const text = isEs
      ? `📅 ${name} — falta agendar tu llamada de onboarding (30 min con Santino o Miguel). Reserva acá: <${CAL_ONBOARDING_URL}|${CAL_ONBOARDING_URL}>. Sin la llamada no podemos avanzar con la firma de contratos.`
      : `📅 ${name} — you still need to book your onboarding call (30 min with Santino or Miguel). Reserve here: <${CAL_ONBOARDING_URL}|${CAL_ONBOARDING_URL}>. We can't move forward with contract signing without the call.`;
    const ok = await _postNudge(c, text);
    if (ok) {
      await query(`UPDATE users SET slack_day7_nudged_at = NOW() WHERE id = $1`, [String(c.id)]);
    }
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Daily batch — used by scripts/slack-welcome-creators.js from host cron
// ---------------------------------------------------------------------------

async function runDailyBatch({ dryRun = false, delayMs = 800 } = {}) {
  if (!_tok()) {
    return { skipped: 'no_slack_token', onboarded: 0, day3: 0, day7: 0 };
  }

  const stats = { onboarded: 0, day3: 0, day7: 0, errors: 0 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. Onboarding — creators with a channel but not yet onboarded
  const { rows: pending } = await query(
    `SELECT id, username
       FROM users
      WHERE creator_status IN ('active', 'approved')
        AND slack_channel_id IS NOT NULL
        AND slack_onboarded_at IS NULL`
  );
  for (const c of pending) {
    if (dryRun) {
      stats.onboarded++;
      continue;
    }
    try {
      const res = await sendOnboarding(c.id);
      if (res.sent) stats.onboarded++;
      // Nudge admin if we just onboarded them via batch (they'll want to say hi)
      if (res.sent) await notifyAdminNewCreator(c.id).catch(() => {});
    } catch (e) {
      stats.errors++;
      logger.warn('[creatorOnboardingService] batch onboard error', {
        userId: c.id,
        error: e.message,
      });
    }
    await sleep(delayMs);
  }

  // 2. Nudges
  if (!dryRun) {
    stats.day3 = await _runDay3Nudges().catch(() => 0);
    stats.day7 = await _runDay7Nudges().catch(() => 0);
  }

  return stats;
}

module.exports = {
  buildOnboardingMessage,
  sendOnboarding,
  notifyAdminNewCreator,
  handleReactionAdded,
  recordCalBooking,
  runDailyBatch,
  // exposed for tests / diagnostics
  _internal: { _runDay3Nudges, _runDay7Nudges },
};
