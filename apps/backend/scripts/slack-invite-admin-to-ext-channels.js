#!/usr/bin/env node
/**
 * One-shot: invite Santino + support@pnptv.app to every #ext-* creator channel.
 * Run once inside pnptv-bot container:
 *   docker exec pnptv-bot node apps/backend/scripts/slack-invite-admin-to-ext-channels.js
 */
'use strict';

const { query, pool } = require('../config/postgres');
const logger = require('../utils/logger');

const TOKEN   = process.env.SLACK_BOT_TOKEN;
const SANTINO = process.env.SLACK_ADMIN_DM_USER_ID; // U0BM6L7GFQT
const SLACK_API = 'https://slack.com/api';

async function slackPost(method, body) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function lookupByEmail(email) {
  const res = await fetch(`${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

async function main() {
  if (!TOKEN)   { console.error('SLACK_BOT_TOKEN not set'); process.exit(1); }
  if (!SANTINO) { console.error('SLACK_ADMIN_DM_USER_ID not set'); process.exit(1); }

  // ── 1. Resolve support@pnptv.app → Slack user ID ──────────────────────────
  let supportId = null;
  try {
    const r = await lookupByEmail('support@pnptv.app');
    if (r.ok && r.user?.id) {
      supportId = r.user.id;
      console.log(`support@pnptv.app → ${supportId}`);
    } else {
      console.warn(`Could not resolve support@pnptv.app: ${r.error || 'unknown'}`);
    }
  } catch (e) {
    console.warn(`lookupByEmail error: ${e.message}`);
  }

  const targets = [...new Set([SANTINO, supportId].filter(Boolean))];
  const userList = targets.join(',');
  console.log(`Inviting Slack user(s): ${userList}\n`);

  // ── 2. Fetch all distinct creator channel IDs ──────────────────────────────
  const { rows } = await query(
    'SELECT DISTINCT slack_channel_id FROM users WHERE slack_channel_id IS NOT NULL'
  );
  console.log(`${rows.length} channels to process…\n`);

  let invited = 0, already = 0, failed = 0;

  for (const { slack_channel_id } of rows) {
    const data = await slackPost('conversations.invite', {
      channel: slack_channel_id,
      users: userList,
    });

    if (data.ok) {
      console.log(`✓  ${slack_channel_id}`);
      invited++;
    } else if (data.error === 'already_in_channel' || data.error === 'cant_invite_self') {
      console.log(`–  ${slack_channel_id}  (${data.error})`);
      already++;
    } else {
      console.warn(`✗  ${slack_channel_id}  [${data.error}]`);
      failed++;
    }

    // 300 ms gap — Slack Tier-2 rate limit (~20 req/min) for conversations.invite
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n── Summary ─────────────────────────────`);
  console.log(`  Invited : ${invited}`);
  console.log(`  Already : ${already}`);
  console.log(`  Failed  : ${failed}`);
  console.log(`────────────────────────────────────────`);

  if (pool?.end) await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
