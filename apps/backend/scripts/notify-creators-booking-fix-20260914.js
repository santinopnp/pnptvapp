'use strict';
/**
 * One-shot script: notify creators that the pre-paid call booking bug is fixed.
 * Finds all creators with unbooked call credits (unused/partial, not expired).
 * Sends: Slack #ext-<handle> + push notification → /creators/availability
 *
 * Run via: docker run --rm --env-file ... pnptv-bot node apps/backend/scripts/notify-creators-booking-fix-20260914.js
 */

require('dotenv').config({ path: '/opt/pnptvapp/.env' });
require('dotenv').config({ path: '/opt/pnptvapp/.env.production', override: true });

const { query } = require('../config/postgres');
const PushNotificationService = require('../services/pushNotificationService');
const logger = require('../utils/logger');

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

async function slackPost(channel, text, blocks) {
  if (!SLACK_BOT_TOKEN || !channel) return;
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({ channel, text, blocks, unfurl_links: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) logger.warn('[notify-booking-fix] Slack post failed', { channel, error: data.error });
    else console.log(`  → Slack sent to ${channel}`);
  } catch (err) {
    logger.warn('[notify-booking-fix] Slack fetch error', { channel, error: err.message });
  }
}

async function main() {
  console.log('=== notify-creators-booking-fix-20260914 ===\n');

  // Find creators with unbooked credits (unused or partial, not expired)
  const { rows: creators } = await query(`
    SELECT
      u.id           AS user_id,
      u.username,
      TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) AS display_name,
      u.slack_channel_id,
      COUNT(cc.id)   AS unbooked_credits,
      STRING_AGG(DISTINCT mc.username, ', ' ORDER BY mc.username) AS member_usernames
    FROM call_credits cc
    JOIN users u  ON u.id = cc.creator_id
    JOIN users mc ON mc.id = cc.member_id
    WHERE cc.status IN ('unused', 'partial')
      AND (cc.expires_at IS NULL OR cc.expires_at > NOW())
      AND (cc.quantity_total - cc.quantity_used - cc.quantity_scheduled) > 0
    GROUP BY u.id, u.username, u.first_name, u.last_name, u.slack_channel_id
    ORDER BY unbooked_credits DESC
  `);

  if (creators.length === 0) {
    console.log('No creators with unbooked credits — nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${creators.length} creator(s) with unbooked credits:\n`);
  for (const c of creators) {
    console.log(`  @${c.username} — ${c.unbooked_credits} credit(s), members: ${c.member_usernames}`);
  }
  console.log('');

  for (const creator of creators) {
    const userId = String(creator.user_id);
    const handle = creator.username || userId;
    const name = creator.display_name || creator.username || 'Creator';
    const credits = Number(creator.unbooked_credits);
    const members = creator.member_usernames;

    console.log(`\n── Notifying @${handle} (${credits} unbooked credit${credits !== 1 ? 's' : ''}) ──`);

    // ── Push notification ──
    try {
      await PushNotificationService.sendToUser(userId, {
        title: `${credits} booking${credits !== 1 ? 's' : ''} waiting for you`,
        body: `${members} ${credits !== 1 ? 'have' : 'has'} paid for a private call. Set your availability to get started!`,
        url: '/creators/availability',
        tag: `booking-pending-${userId}`,
        notifType: 'call_booking',
      });
      console.log(`  → Push sent to ${handle}`);
    } catch (err) {
      console.log(`  → Push failed for ${handle}: ${err.message}`);
    }

    // ── Slack #ext-<handle> ──
    const slackChannel = creator.slack_channel_id;
    if (!slackChannel) {
      console.log(`  → No Slack channel for @${handle} — skipping Slack`);
      continue;
    }

    const slackText = `*Booking system fixed — ${credits} member${credits !== 1 ? 's are' : ' is'} waiting to book you!*\n` +
      `Member${credits !== 1 ? 's' : ''}: ${members}\n\n` +
      `There was a bug preventing pre-paid call bookings from going through — it's been fixed. ` +
      `Make sure your weekly availability is set at *pnptv.app/creators/availability* so members can pick a time slot.`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📅 ${credits} member${credits !== 1 ? 's are' : ' is'} waiting to book you, ${name}!*`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `There was a bug that prevented pre-paid call bookings — *it's been fixed*. ` +
            `The following member${credits !== 1 ? 's have' : ' has'} already paid and just need${credits === 1 ? 's' : ''} to pick a time:\n\n` +
            members.split(', ').map(m => `• @${m}`).join('\n'),
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `👉 *Set your weekly availability windows* so they can book:\n<https://pnptv.app/creators/availability|pnptv.app/creators/availability>`,
        },
      },
      { type: 'divider' },
    ];

    await slackPost(slackChannel, slackText, blocks);
  }

  console.log('\n✓ Done.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
