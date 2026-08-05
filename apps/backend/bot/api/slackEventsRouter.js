'use strict';

/**
 * slackEventsRouter.js
 *
 * Slack Events API webhook receiver for the support escalation bridge.
 *
 * This router is mounted ALONGSIDE the existing slackFeedbackService webhook
 * (which handles tester-feedback). If you configure a separate Slack app for
 * support, point its Request URL here:
 *
 *   POST /api/webhooks/slack/support-events
 *
 * Alternatively, the existing /api/webhooks/slack/events handler has been
 * extended (in routes.js) to also fan-out support events inline — so a single
 * Slack app subscription works for both use-cases without requiring a second
 * verified endpoint.
 *
 * Signature verification uses SLACK_SIGNING_SECRET + HMAC-SHA256 per Slack spec.
 * rawBody is available on req.rawBody via the global express.json verify callback.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../../utils/logger');

const SIG_VERSION = 'v0';
const MAX_TS_SKEW_SEC = 60 * 5; // 5 minutes

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySlackSignature(req) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;

  const sig = req.headers['x-slack-signature'];
  const ts = req.headers['x-slack-request-timestamp'];
  if (!sig || !ts) return false;

  // Reject stale requests
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_TS_SKEW_SEC) return false;

  // rawBody is set by the global express.json verify callback (lines ~380-384 in routes.js)
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  const base = `${SIG_VERSION}:${ts}:${raw}`;
  const expected = `${SIG_VERSION}=${crypto.createHmac('sha256', secret).update(base).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

router.post('/api/webhooks/slack/support-events', async (req, res) => {
  if (!verifySlackSignature(req)) {
    logger.warn('[slackEventsRouter] rejected request: bad Slack signature');
    return res.status(403).send('Forbidden');
  }

  const body = req.body || {};

  // Slack URL verification challenge — fires once when the endpoint is registered
  if (body.type === 'url_verification' && body.challenge) {
    return res.status(200).json({ challenge: body.challenge });
  }

  // ACK immediately — Slack requires a response within 3 seconds
  res.sendStatus(200);

  if (body.type !== 'event_callback' || !body.event) return;

  const event = body.event;

  // Fan-out to support service handlers (fire-and-forget)
  try {
    const slackSupport = require('../../services/slackSupportService');

    // Thread reply in #support-human → forward to user
    if (
      event.type === 'message' &&
      event.thread_ts &&
      !event.bot_id &&
      !event.subtype
    ) {
      slackSupport.handleTeamReply(event).catch((err) =>
        logger.warn('[slackEventsRouter] handleTeamReply error', { error: err.message })
      );
    }

    // ✅ reaction → mark ticket resolved
    if (event.type === 'reaction_added' && event.reaction === 'white_check_mark') {
      slackSupport.handleResolveReaction(event).catch((err) =>
        logger.warn('[slackEventsRouter] handleResolveReaction error', { error: err.message })
      );
    }
  } catch (err) {
    logger.warn('[slackEventsRouter] dispatch error', { error: err.message });
  }

  // Hangout bridge — creator replies in a hangout thread → insert into hangout chat
  if (
    event.type === 'message' &&
    event.thread_ts &&
    event.thread_ts !== event.ts &&
    !event.bot_id &&
    !event.subtype &&
    event.text
  ) {
    const slackHangoutBridgeService = require('../../services/slackHangoutBridgeService');
    slackHangoutBridgeService.bridgeSlackReplyToHangout(
      event.channel,
      event.text,
      event.thread_ts,
      event.user || null
    ).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Slack Interactive Components — button click handler
// POST /api/webhooks/slack/interactions
//
// Slack sends application/x-www-form-urlencoded with a single `payload` field
// containing a JSON string. We must use urlencoded middleware here because the
// global express.json verify callback only captures JSON bodies, and rawBody
// won't be set for urlencoded requests. We attach a fresh verify callback so
// that rawBody IS set for the signature check.
// ---------------------------------------------------------------------------

router.post(
  '/api/webhooks/slack/interactions',
  express.urlencoded({
    extended: false,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  async (req, res) => {
    if (!verifySlackSignature(req)) {
      logger.warn('[slackEventsRouter] interactions: rejected request: bad Slack signature');
      return res.status(403).send('Forbidden');
    }

    // ACK immediately — Slack requires response within 3 seconds
    res.sendStatus(200);

    let payload;
    try {
      payload = JSON.parse(req.body?.payload || '{}');
    } catch (e) {
      logger.warn('[slackEventsRouter] interactions: failed to parse payload', { error: e.message });
      return;
    }

    if (payload.type !== 'block_actions' || !Array.isArray(payload.actions)) return;

    const action = payload.actions[0]?.action_id;
    const responseUrl = payload.response_url;
    const triggeredBy = payload.user?.name || 'unknown';

    if (!action || !responseUrl) return;

    async function _respondToAction(url, text) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, response_type: 'in_channel', replace_original: false }),
        });
      } catch (_) {}
    }

    if (action === 'probe_np_auth') {
      (async () => {
        try {
          const NP_API = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io';
          const NP_EMAIL = process.env.NOWPAYMENTS_EMAIL || '';
          const NP_PASS = process.env.NOWPAYMENTS_PASSWORD || '';
          const res2 = await fetch(`${NP_API}/v1/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: NP_EMAIL, password: NP_PASS }),
          });
          const data = await res2.json().catch(() => ({}));
          const ok = res2.ok && data.token;
          await _respondToAction(
            responseUrl,
            ok
              ? `✅ NP Auth OK — JWT obtained (triggered by @${triggeredBy})`
              : `❌ NP Auth FAILED: ${data.message || res2.status} (triggered by @${triggeredBy})`
          );
        } catch (e) {
          await _respondToAction(responseUrl, `❌ Probe error: ${e.message} (triggered by @${triggeredBy})`);
        }
      })();
    }

    if (action === 'check_redis') {
      (async () => {
        try {
          const { getRedis } = require('../../config/redis');
          const redis = getRedis();
          const start = Date.now();
          await redis.ping();
          const latency = Date.now() - start;
          const info = await redis.info('memory').catch(() => '');
          const usedMem = info.match(/used_memory_human:(.+)/)?.[1]?.trim() || 'unknown';
          await _respondToAction(
            responseUrl,
            `✅ Redis OK — latency: ${latency}ms, memory: ${usedMem} (triggered by @${triggeredBy})`
          );
        } catch (e) {
          await _respondToAction(
            responseUrl,
            `❌ Redis error: ${e.message} (triggered by @${triggeredBy})`
          );
        }
      })();
    }

    if (action === 'reregister_webhook') {
      (async () => {
        try {
          const TOKEN = process.env.BOT_TOKEN;
          const WEBHOOK_URL = `${process.env.BOT_WEBHOOK_DOMAIN}/api/telegram-webhook`;
          const SECRET = process.env.WEBHOOK_SECRET_TOKEN || '';
          const res2 = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: WEBHOOK_URL, secret_token: SECRET }),
          });
          const data = await res2.json().catch(() => ({}));
          const ok = res2.ok && data.ok;
          await _respondToAction(
            responseUrl,
            ok
              ? `✅ Telegram webhook re-registered → \`${WEBHOOK_URL}\` (triggered by @${triggeredBy})`
              : `❌ Webhook re-registration failed: ${data.description || `HTTP ${res2.status}`} (triggered by @${triggeredBy})`
          );
        } catch (e) {
          await _respondToAction(
            responseUrl,
            `❌ Webhook error: ${e.message} (triggered by @${triggeredBy})`
          );
        }
      })();
    }
  }
);

module.exports = router;
