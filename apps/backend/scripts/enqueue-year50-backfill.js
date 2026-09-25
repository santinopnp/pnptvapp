'use strict';
/**
 * One-time: enqueue year50_funnel_promo jobs for all existing trial users.
 * The handler is idempotent (checks year50_promo_sent_at), so safe to run
 * even if some jobs already exist.
 */
const { query } = require('../config/postgres');
const { getQueue } = require('../services/queueService');

async function main() {
  const { rows } = await query(`
    SELECT id, founders_offer_expires_at
    FROM users
    WHERE subscription_type IN ('prime-trial-3d', 'trial')
      AND founders_offer_expires_at IS NOT NULL
      AND year50_promo_sent_at IS NULL
  `);

  console.log(`Found ${rows.length} users to enqueue`);
  const queue = getQueue('notifications');
  let count = 0;

  for (const row of rows) {
    // Fire at founders_offer_expires_at + 47h (= ~48h after reset)
    const fireAt = new Date(row.founders_offer_expires_at).getTime() + 47 * 3600 * 1000;
    const delay = Math.max(0, fireAt - Date.now());
    await queue.add('year50_funnel_promo', { userId: row.id }, { delay });
    count++;
    if (count % 500 === 0) console.log(`  Enqueued ${count}/${rows.length}`);
  }

  console.log(`Done. Enqueued ${count} jobs.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
