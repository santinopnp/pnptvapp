#!/usr/bin/env node
/**
 * One-shot: convert all public #ext-* creator channels to private.
 * Strategy: join → rename old → archive → create private → invite Santino + creator → update DB
 * Run: docker exec pnptv-bot node apps/backend/scripts/slack-convert-ext-channels-to-private.js
 */
'use strict';

const { query, pool } = require('../config/postgres');

const TOKEN   = process.env.SLACK_BOT_TOKEN;
const SANTINO = process.env.SLACK_ADMIN_DM_USER_ID;
const DELAY   = 600; // ms between calls — Slack Tier-2 ~20/min

async function api(method, body = null) {
  const isGet = body === null;
  const url = `https://slack.com/api/${method}`;
  const res = isGet
    ? await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    : await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
  return res.json();
}

async function get(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!TOKEN || !SANTINO) {
    console.error('Missing SLACK_BOT_TOKEN or SLACK_ADMIN_DM_USER_ID'); process.exit(1);
  }

  // Distinct channels with their creator's member ID
  const { rows } = await query(`
    SELECT DISTINCT ON (slack_channel_id)
      id, username, slack_channel_id, slack_member_id
    FROM users
    WHERE slack_channel_id IS NOT NULL
    ORDER BY slack_channel_id, id
  `);

  console.log(`Found ${rows.length} channels\n`);

  let converted = 0, already = 0, cleared = 0, failed = 0;

  for (const { id, username, slack_channel_id: ch, slack_member_id } of rows) {
    await sleep(DELAY);

    // ── Get current state ────────────────────────────────────────────────────
    const info = await get('conversations.info', { channel: ch });
    await sleep(200);

    if (!info.ok) {
      if (info.error === 'channel_not_found') {
        // Channel deleted or pruned — clear DB so cron recreates it when creator joins
        await query('UPDATE users SET slack_channel_id = NULL WHERE slack_channel_id = $1', [ch]);
        console.log(`⚠  ${ch} (${username}): not found — DB cleared`);
        cleared++;
      } else {
        console.warn(`✗  ${ch} (${username}): info error — ${info.error}`);
        failed++;
      }
      continue;
    }

    const { name, is_private, is_archived } = info.channel;

    // ── Already private — done ───────────────────────────────────────────────
    if (is_private) {
      console.log(`–  ${ch} (${username}): ${name} already private`);
      already++;
      continue;
    }

    // ── Archived public channel — create fresh private ───────────────────────
    if (is_archived) {
      // Name may still be taken by the archived channel; try original then with suffix
      let newCh = null;
      for (const candidate of [name, `${name}-2`, `${name}-prv`]) {
        const c = await api('conversations.create', { name: candidate, is_private: true });
        await sleep(300);
        if (c.ok) { newCh = c.channel.id; break; }
        if (c.error !== 'name_taken') {
          console.warn(`✗  ${ch} (${username}): create failed — ${c.error}`);
          break;
        }
      }
      if (!newCh) { failed++; continue; }

      await inviteMembers(newCh, slack_member_id);
      await query('UPDATE users SET slack_channel_id = $1 WHERE slack_channel_id = $2', [newCh, ch]);
      console.log(`✓  ${ch} → ${newCh} (${username}): new private channel (was archived public)`);
      converted++;
      continue;
    }

    // ── Public channel — full migration ──────────────────────────────────────
    process.stdout.write(`→  ${ch} (${username}): ${name} … `);

    // 1. Join so the bot can manage the channel
    const join = await api('conversations.join', { channel: ch });
    await sleep(200);
    if (!join.ok && join.error !== 'already_in_channel') {
      console.log(`join failed: ${join.error}`);
      failed++;
      continue;
    }

    // 2. Rename to free the name
    const rename = await api('conversations.rename', { channel: ch, name: `${name}-old` });
    await sleep(200);
    if (!rename.ok) {
      console.log(`rename failed: ${rename.error}`);
      failed++;
      continue;
    }

    // 3. Archive the old public channel
    const archive = await api('conversations.archive', { channel: ch });
    await sleep(200);
    if (!archive.ok) {
      // Undo rename
      await api('conversations.rename', { channel: ch, name });
      console.log(`archive failed: ${archive.error}`);
      failed++;
      continue;
    }

    // 4. Create new private channel with the original name
    const create = await api('conversations.create', { name, is_private: true });
    await sleep(200);
    if (!create.ok) {
      console.log(`create failed: ${create.error}`);
      failed++;
      continue;
    }
    const newId = create.channel.id;

    // 5. Invite Santino + creator (if they have a Slack ID)
    await inviteMembers(newId, slack_member_id);

    // 6. Update DB
    await query('UPDATE users SET slack_channel_id = $1 WHERE slack_channel_id = $2', [newId, ch]);

    console.log(`✓ → ${newId}`);
    converted++;
  }

  console.log(`\n── Summary ─────────────────────────────`);
  console.log(`  Converted  : ${converted}`);
  console.log(`  Already    : ${already}`);
  console.log(`  DB cleared : ${cleared}`);
  console.log(`  Failed     : ${failed}`);
  console.log(`────────────────────────────────────────`);

  if (pool?.end) await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

async function inviteMembers(channelId, creatorSlackId) {
  const users = [...new Set([SANTINO, creatorSlackId].filter(Boolean))].join(',');
  const r = await api('conversations.invite', { channel: channelId, users });
  await sleep(300);
  if (!r.ok && r.error !== 'already_in_channel') {
    console.warn(`    invite warning: ${r.error}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
