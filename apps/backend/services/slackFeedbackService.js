'use strict';

/**
 * Slack tester-feedback bot.
 *
 * Listens on Slack Events API for messages in channels listed in
 * SLACK_TESTER_CHANNELS. Each incoming user message is:
 *   1. Stored in tester_feedback (raw text + Slack metadata)
 *   2. Acknowledged with a :eyes: reaction (so testers see we got it)
 *   3. Triaged via Grok — classify severity/category, one-sentence summary
 *   4. Replied to in-thread with a compact triage summary
 *   5. DM'd to SLACK_ADMIN_DM_USER_ID when severity=critical
 *
 * All Slack HTTP work uses the bot token in SLACK_BOT_TOKEN.
 * Signature verification uses SLACK_SIGNING_SECRET per Slack's HMAC spec.
 * Triage runs async (fire-and-forget) so the Events API webhook acks < 3s.
 */

const crypto = require('crypto');
const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const SLACK_API = 'https://slack.com/api';
const SIG_VERSION = 'v0';
const MAX_TS_SKEW_SEC = 60 * 5;

// ── env ──────────────────────────────────────────────────────────────────────
const cfg = () => ({
  botToken:       process.env.SLACK_BOT_TOKEN,
  signingSecret:  process.env.SLACK_SIGNING_SECRET,
  channels:       new Set(
    String(process.env.SLACK_TESTER_CHANNELS || '')
      .split(',').map(s => s.trim()).filter(Boolean)
  ),
  adminDmUser:    process.env.SLACK_ADMIN_DM_USER_ID || '',
  grokKey:        process.env.GROK_API_KEY,
  grokModel:      process.env.GROK_MODEL || 'grok-3-mini',
  grokBase:       process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
});

// ── signature verify ─────────────────────────────────────────────────────────
function verifySignature(req) {
  const c = cfg();
  if (!c.signingSecret) return false;
  const ts  = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_TS_SKEW_SEC) return false;
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  const base = `${SIG_VERSION}:${ts}:${raw}`;
  const hmac = crypto.createHmac('sha256', c.signingSecret).update(base).digest('hex');
  const expected = `${SIG_VERSION}=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

// ── Slack REST helper ────────────────────────────────────────────────────────
async function slackPost(method, body) {
  const c = cfg();
  if (!c.botToken) throw new Error('SLACK_BOT_TOKEN not set');
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${c.botToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    logger.warn(`Slack ${method} failed`, { error: data.error, warning: data.warning });
  }
  return data;
}

async function addReaction(channel, ts, name) {
  return slackPost('reactions.add', { channel, timestamp: ts, name });
}
async function postThreadReply(channel, thread_ts, text, blocks) {
  return slackPost('chat.postMessage', { channel, thread_ts, text, blocks });
}
async function openIm(user) {
  const r = await slackPost('conversations.open', { users: user });
  return r?.channel?.id || null;
}
async function dmAdmin(text, blocks) {
  const c = cfg();
  if (!c.adminDmUser) return;
  const channelId = await openIm(c.adminDmUser);
  if (!channelId) return;
  await slackPost('chat.postMessage', { channel: channelId, text, blocks });
}
async function getChannelName(channelId) {
  const r = await slackPost('conversations.info', { channel: channelId });
  return r?.channel?.name || null;
}
async function getUserName(userId) {
  const r = await slackPost('users.info', { user: userId });
  return r?.user?.real_name || r?.user?.name || null;
}

// ── Grok triage ──────────────────────────────────────────────────────────────
const TRIAGE_SYSTEM = `You classify Slack messages from beta testers of PNPtv (a social-video platform).
Reply with a single JSON object and nothing else — no prose, no markdown fences.

Schema:
{
  "severity": "low" | "medium" | "high" | "critical",
  "category": "bug" | "weird" | "question" | "positive" | "noise",
  "summary": "one-sentence tester report (max 100 chars, no emoji)",
  "actions": ["short imperatives for the dev team, 0-3 items"]
}

Guidelines:
- "bug" = tester says a feature is broken or missing (❌).
- "weird" = tester says something is off or unclear (⚠️).
- "question" = tester asks for clarification.
- "positive" = ✅ works confirmations or explicit praise.
- "noise" = greetings, meta, off-topic.
- severity: critical = blocks all users / data loss / paid flow broken.
             high     = broken feature that a normal user hits.
             medium   = UX flaw or edge case.
             low      = polish / nice-to-have.
- If the tester lists many items in one message, summarize the MOST SEVERE and set severity from that.`;

async function triage(text) {
  const c = cfg();
  if (!c.grokKey) throw new Error('GROK_API_KEY not set');
  const res = await fetch(`${c.grokBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${c.grokKey}`,
    },
    body: JSON.stringify({
      model: c.grokModel,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: 'system', content: TRIAGE_SYSTEM },
        { role: 'user',   content: JSON.stringify({ text }) },
      ],
    }),
  });
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Grok returned no content');
  // Strip fences defensively
  const stripped = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(stripped);
  return {
    severity: String(parsed.severity || 'low').toLowerCase(),
    category: String(parsed.category || 'noise').toLowerCase(),
    summary:  String(parsed.summary  || '').slice(0, 200),
    actions:  Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : [],
    raw:      parsed,
  };
}

// ── formatting ───────────────────────────────────────────────────────────────
const SEV_EMOJI = { critical: ':rotating_light:', high: ':red_circle:', medium: ':large_yellow_circle:', low: ':white_circle:' };
const CAT_EMOJI = { bug: ':beetle:', weird: ':thinking_face:', question: ':question:', positive: ':white_check_mark:', noise: ':speech_balloon:' };

function formatTriageReply(t) {
  const sev = SEV_EMOJI[t.severity] || ':white_circle:';
  const cat = CAT_EMOJI[t.category] || ':speech_balloon:';
  const actions = (t.actions && t.actions.length)
    ? '\n' + t.actions.map(a => `• ${a}`).join('\n')
    : '';
  return `${sev} *${t.severity.toUpperCase()}* · ${cat} ${t.category}\n${t.summary}${actions}`;
}

// ── message dispatch ─────────────────────────────────────────────────────────
async function handleUserMessage(event) {
  const c = cfg();
  if (event.bot_id || event.subtype === 'bot_message') return;
  if (event.subtype && event.subtype !== 'thread_broadcast') return;
  // Open mode: if no channel allowlist is set, accept messages from any channel
  // the bot is invited to (useful during onboarding). Once channels are locked,
  // only those channels are processed.
  if (c.channels.size > 0 && !c.channels.has(event.channel)) return;
  if (!event.text || !event.text.trim()) return;

  // Persist raw first (idempotent by slack_ts)
  const [channelName, userName] = await Promise.all([
    getChannelName(event.channel).catch(() => null),
    getUserName(event.user).catch(() => null),
  ]);
  await query(
    `INSERT INTO tester_feedback
       (slack_ts, slack_channel, slack_channel_name, slack_user, slack_user_name, thread_ts, text)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (slack_ts) DO NOTHING`,
    [
      event.ts, event.channel, channelName,
      event.user, userName, event.thread_ts || null, event.text,
    ]
  );

  // Immediate ack reaction
  addReaction(event.channel, event.ts, 'eyes').catch(() => {});

  // Triage
  let t;
  try {
    t = await triage(event.text);
  } catch (err) {
    logger.warn('Tester feedback triage failed', { error: err.message, ts: event.ts });
    return;
  }

  await query(
    `UPDATE tester_feedback SET
       triage_severity = $2, triage_category = $3,
       triage_summary  = $4, triage_actions  = $5::jsonb,
       triage_raw      = $6::jsonb, triaged_at = now()
     WHERE slack_ts = $1`,
    [event.ts, t.severity, t.category, t.summary,
     JSON.stringify(t.actions), JSON.stringify(t.raw)]
  );

  // Post threaded triage reply (skip pure noise to reduce clutter)
  if (t.category !== 'noise') {
    await postThreadReply(event.channel, event.ts, formatTriageReply(t))
      .catch(err => logger.warn('Slack thread reply failed', { error: err.message }));
  }

  // DM admin on critical
  if (t.severity === 'critical' && c.adminDmUser) {
    const permalink = `https://slack.com/archives/${event.channel}/p${String(event.ts).replace('.', '')}`;
    await dmAdmin(
      `:rotating_light: CRITICAL feedback from ${userName || event.user} in #${channelName || event.channel}\n${t.summary}\n${permalink}`
    ).catch(err => logger.warn('Slack admin DM failed', { error: err.message }));
  }
}

// ── express handler ──────────────────────────────────────────────────────────
async function handleEvent(req, res) {
  if (!verifySignature(req)) {
    return res.status(401).send('bad signature');
  }
  const b = req.body || {};

  // URL verification handshake (only fires once, when the endpoint is registered)
  if (b.type === 'url_verification' && b.challenge) {
    return res.status(200).type('text/plain').send(b.challenge);
  }

  // Ack fast; process async
  res.status(200).send();

  if (b.type === 'event_callback' && b.event) {
    const ev = b.event;
    if (ev.type === 'message' || ev.type === 'app_mention') {
      handleUserMessage(ev).catch(err =>
        logger.error('handleUserMessage failed', { error: err.message, stack: err.stack })
      );
    }
  }
}

module.exports = {
  handleEvent,
  // exported for tests / manual retriage
  triage,
  verifySignature,
};
