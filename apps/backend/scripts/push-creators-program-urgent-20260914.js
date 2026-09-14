#!/usr/bin/env node
'use strict';

/**
 * push-creators-program-urgent-20260914.js
 *
 * One-shot push notification to all active/eligible creators:
 * urgent call to action from Santino to join the Creators Hangout.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/push-creators-program-urgent-20260914.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/push-creators-program-urgent-20260914.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }               = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY_RUN = process.argv.includes('--dry-run');

const NOTIFICATION = {
  title: 'Santino needs your help 🚨',
  body:  'We need to get the Creators Program rolling ASAP — join the Creators Hangout for details',
  url:   'https://pnptv.app/hangouts/118',
  tag:   'creator-program-urgent-20260914',
  icon:  '/icon-192.png',
};

async function main() {
  console.log(`[push-creators] ${DRY_RUN ? 'DRY RUN — ' : ''}Starting push to creators`);

  PushNotificationService.initialize();

  // Fetch all active/eligible creators that have push subscriptions
  const { rows: creators } = await query(`
    SELECT DISTINCT u.id, u.username, u.creator_status
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE u.creator_status IN ('active', 'eligible')
       AND u.deleted_at IS NULL
       AND u.tier != 'banned'
     ORDER BY u.username
  `);

  console.log(`[push-creators] Found ${creators.length} creators with push subscriptions`);

  if (DRY_RUN) {
    creators.forEach(c => console.log(`  [dry-run] Would notify: @${c.username} (${c.creator_status})`));
    console.log('[push-creators] DRY RUN complete — no notifications sent');
    process.exit(0);
  }

  let totalSent = 0;
  for (const creator of creators) {
    const sent = await PushNotificationService.sendToUser(creator.id, NOTIFICATION);
    if (sent > 0) {
      console.log(`  ✓ @${creator.username} (${creator.creator_status}) — ${sent} device(s)`);
      totalSent += sent;
    } else {
      console.log(`  ✗ @${creator.username} — no active subscriptions`);
    }
  }

  console.log(`\n[push-creators] Done — ${totalSent} push(es) delivered to ${creators.length} creators`);
  process.exit(0);
}

main().catch(err => {
  console.error('[push-creators] FATAL:', err);
  process.exit(1);
});
