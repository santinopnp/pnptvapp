'use strict';

/**
 * Tester checklist report intake.
 *
 * The tester (Chase) fills out /testing-chase.html — each sub-item marked
 * ok / bad / warn + optional note. On submit, the page POSTs the whole state
 * to POST /api/webhooks/tester-report. This service:
 *   1. Persists the raw report to tester_feedback (one row per submission)
 *   2. Extracts the ❌/⚠️ items + notes and asks Grok for a one-paragraph
 *      dev-facing triage summary
 *   3. Posts a formatted Slack message via SLACK_TESTER_INCOMING_WEBHOOK
 *      so the whole team sees the outcome without needing Events API wiring.
 *
 * No auth on the endpoint — rate limited by webhookLimiter. Bad payloads
 * get 400s and are not persisted.
 */

const crypto = require('crypto');
const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const tokenLedger = require('./tokenLedgerService');

const REWARD_TOKENS  = 180; // 180 Ru$h = $30 at 6-per-USD rate
const REWARD_SOURCE  = 'tester_reward_v1';
const REWARD_RUN_ID  = '2026_08_03';

const cfg = () => ({
  botToken:    process.env.SLACK_BOT_TOKEN,
  channelId:   (String(process.env.SLACK_TESTER_CHANNELS || '').split(',')[0] || '').trim(),
  grokKey:     process.env.GROK_API_KEY,
  grokModel:   process.env.GROK_MODEL || 'grok-3-mini',
  grokBase:    process.env.GROK_BASE_URL || 'https://api.x.ai/v1',
});

// ── Grok summary of a full report ────────────────────────────────────────────
const REPORT_SYSTEM = `You are a QA lead reading a checklist submission from a beta tester of PNPtv (a social-video platform).
The user gives you a JSON payload with counts (ok/bad/warn/skipped) and every failing/weird item with the tester's note.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "headline": "one-sentence status for the dev team (max 120 chars)",
  "severity": "critical" | "high" | "medium" | "low" | "clean",
  "top_issues": ["short bullets, most severe first, 0-5 items"],
  "quick_wins": ["easy fixes we should ship first, 0-3 items"]
}

Rules:
- "severity" reflects the WORST issue found (not the average).
- "clean" = zero ❌/⚠️.
- "critical" = payment/auth/data-loss/broken-flow.
- Bullets must be action-oriented, no fluff ("Fix Mux 404 on channel 209 videos", not "Videos have issues").`;

async function summarizeReport(payload) {
  const c = cfg();
  if (!c.grokKey) throw new Error('GROK_API_KEY not set');
  const res = await fetch(`${c.grokBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.grokKey}` },
    body: JSON.stringify({
      model: c.grokModel,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: 'system', content: REPORT_SYSTEM },
        { role: 'user',   content: JSON.stringify(payload) },
      ],
    }),
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Grok returned no content');
  const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(stripped);
  return {
    headline:   String(parsed.headline || '').slice(0, 220),
    severity:   String(parsed.severity || 'low').toLowerCase(),
    top_issues: Array.isArray(parsed.top_issues) ? parsed.top_issues.slice(0, 6) : [],
    quick_wins: Array.isArray(parsed.quick_wins) ? parsed.quick_wins.slice(0, 4) : [],
    raw:        parsed,
  };
}

// ── Slack posting ────────────────────────────────────────────────────────────
const SEV_EMOJI = {
  critical: ':rotating_light:',
  high:     ':red_circle:',
  medium:   ':large_yellow_circle:',
  low:      ':white_circle:',
  clean:    ':tada:',
};

// ── $30 tester reward ────────────────────────────────────────────────────────
// Looks up user by pnptv_username (case-insensitive), grants 180 Ru$h
// (gifted first — spendable only on Santino+Lex per monetizationConfig).
// Idempotent by source_type/source_id. Returns { status, message } for the
// Slack post to render.
async function grantTesterReward({ pnptv_username, scope }) {
  const uname = String(pnptv_username || '').trim();
  if (!uname) return { status: 'skipped', message: 'no PNPtv username provided — reward not credited' };
  const scopeTag = String(scope || 'live').toLowerCase();
  const sourceId = `${scopeTag}_${REWARD_RUN_ID}`;

  // Case-insensitive username match
  const { rows: userRows } = await query(
    `SELECT id, username, role FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [uname],
  );
  if (!userRows.length) {
    return { status: 'not_found', message: `no PNPtv user matching *${uname}* — reward pending, grant manually` };
  }
  const user = userRows[0];

  // Idempotency check
  const { rows: prior } = await query(
    `SELECT id FROM token_ledger
      WHERE user_id = $1 AND source_type = $2 AND source_id = $3
      LIMIT 1`,
    [String(user.id), REWARD_SOURCE, sourceId],
  );
  if (prior.length) {
    return { status: 'already_granted', message: `reward already credited to *${user.username}* for this scope` };
  }

  // Prefer gifted (auto-scoped to Santino+Lex spend). Creators can't receive
  // gifted — tokenLedger drops giftedDelta silently for role=creator/model.
  const isCreator = user.role === 'creator' || user.role === 'model';
  const opts = {
    userId:  String(user.id),
    reason:  'admin_grant',
    sourceType: REWARD_SOURCE,
    sourceId,
    actorId: 'system_tester_reward',
    metadata: { scope: scopeTag, tester_username: user.username, run: REWARD_RUN_ID },
  };
  if (isCreator) opts.balanceDelta = REWARD_TOKENS;
  else           opts.giftedDelta  = REWARD_TOKENS;

  const result = await tokenLedger.credit(opts);
  const flavor = isCreator ? 'regular (creator role — gifted-guard fallback)' : 'gifted (spendable on Santino+Lex only)';
  return {
    status: 'granted',
    message: `🎁 $30 (180 Ru$h) credited to *${user.username}* — ${flavor}`,
    ledger_id: result.ledger_id,
  };
}

async function postToSlack({ tester, counts, summary, permalink, reward }) {
  const c = cfg();
  if (!c.botToken)  throw new Error('SLACK_BOT_TOKEN not set');
  if (!c.channelId) throw new Error('SLACK_TESTER_CHANNELS not set');
  const sev = SEV_EMOJI[summary.severity] || ':white_circle:';
  const total = counts.ok + counts.bad + counts.warn + counts.skip;
  const lines = [
    `${sev} *Test run submitted by ${tester}*`,
    `:white_check_mark: ${counts.ok}  :x: ${counts.bad}  :warning: ${counts.warn}  :black_medium_square: ${counts.skip}  · ${total} items · severity *${summary.severity}*`,
    ``,
    `*${summary.headline}*`,
  ];
  if (summary.top_issues.length) {
    lines.push(``, `*Top issues*`);
    summary.top_issues.forEach(x => lines.push(`• ${x}`));
  }
  if (summary.quick_wins.length) {
    lines.push(``, `*Quick wins*`);
    summary.quick_wins.forEach(x => lines.push(`• ${x}`));
  }
  if (reward && reward.message) {
    lines.push(``, reward.message);
  }
  if (permalink) lines.push(``, `_Full report_ → ${permalink}`);

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: c.channelId, text: lines.join('\n') }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Slack chat.postMessage ${res.status}: ${data.error || 'unknown'}`);
  }
}

// ── endpoint ─────────────────────────────────────────────────────────────────
/**
 * POST /api/webhooks/tester-report
 * Body:
 *   {
 *     tester: "Chase",                // display name
 *     results: { "1a":"ok", "1b":"bad", ... },
 *     notes:   { "1b":"screen went blank", ... },
 *     report_text: "PNPtv test run — Chase\n✅ 45 ❌ 8 ⚠️ 7 ⬜ 0..."  // full paste-ready text
 *   }
 */
async function handleReport(req, res) {
  const b = req.body || {};
  const tester = String(b.tester || 'anonymous').slice(0, 60);
  const pnptvUsername = String(b.pnptv_username || '').slice(0, 80).trim();
  const scope  = String(b.scope || 'live').toLowerCase().slice(0, 20);
  const results = (b.results && typeof b.results === 'object') ? b.results : {};
  const notes   = (b.notes   && typeof b.notes   === 'object') ? b.notes   : {};
  const reportText = String(b.report_text || '').slice(0, 20000);
  if (!Object.keys(results).length) {
    return res.status(400).json({ error: 'no results in payload' });
  }

  const counts = { ok: 0, bad: 0, warn: 0, skip: 0 };
  const failing = [];
  for (const [code, mark] of Object.entries(results)) {
    if (mark === 'ok') counts.ok++;
    else if (mark === 'bad') { counts.bad++; failing.push({ code, mark, note: notes[code] || '' }); }
    else if (mark === 'warn') { counts.warn++; failing.push({ code, mark, note: notes[code] || '' }); }
    else counts.skip++;
  }

  const c = cfg();
  const syntheticTs = `report-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await query(
    `INSERT INTO tester_feedback
       (slack_ts, slack_channel, slack_channel_name, slack_user, slack_user_name, text)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      syntheticTs,
      c.channelId || 'checklist',
      'testing-team',
      tester,
      tester,
      reportText,
    ]
  );

  // Ack the tester right away — Grok + Slack post happen in background.
  res.status(200).json({ ok: true, counts });

  (async () => {
    try {
      const summary = await summarizeReport({ tester, counts, failing });
      await query(
        `UPDATE tester_feedback SET
           triage_severity = $2, triage_category = 'checklist_report',
           triage_summary  = $3, triage_actions  = $4::jsonb,
           triage_raw      = $5::jsonb, triaged_at = now()
         WHERE slack_ts = $1`,
        [
          syntheticTs, summary.severity, summary.headline,
          JSON.stringify(summary.top_issues.concat(summary.quick_wins)),
          JSON.stringify(summary.raw),
        ]
      );
      let reward = { status: 'skipped', message: '' };
      try {
        reward = await grantTesterReward({ pnptv_username: pnptvUsername, scope });
      } catch (rewardErr) {
        logger.error('Tester reward grant failed', { error: rewardErr.message, tester, pnptvUsername, scope });
        reward = { status: 'error', message: `⚠️ reward grant failed: ${rewardErr.message}` };
      }
      await postToSlack({ tester, counts, summary, reward });
      logger.info('Tester report posted to Slack', { tester, scope, counts, severity: summary.severity, reward: reward.status });
    } catch (err) {
      logger.error('Tester report background triage failed', {
        error: err.message, tester,
      });
      // Best-effort fallback post so the team still sees it landed
      try {
        let reward = { status: 'skipped', message: '' };
        try { reward = await grantTesterReward({ pnptv_username: pnptvUsername, scope }); } catch (_) {}
        await postToSlack({
          tester, counts, reward,
          summary: {
            severity: counts.bad > 0 ? 'high' : counts.warn > 0 ? 'medium' : 'low',
            headline: `Report received (Grok triage failed — see DB row ${syntheticTs})`,
            top_issues: failing.slice(0, 5).map(f => `${f.code} · ${f.mark} — ${f.note || '(no note)'}`),
            quick_wins: [],
          },
        });
      } catch (_) { /* swallow — logs are enough */ }
    }
  })();
}

module.exports = { handleReport };
