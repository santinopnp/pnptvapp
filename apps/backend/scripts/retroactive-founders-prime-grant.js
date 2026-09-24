#!/usr/bin/env node
/**
 * Extends all existing lifetime100 / lifetime80 holders' PRIME entitlement
 * to 18 months (540 days) from today, if their current expiry is sooner.
 *
 * Run inside a dedicated container:
 *   docker run --rm --env-file /opt/pnptvapp/.env.production \
 *     -e NODE_ENV=production \
 *     pnptv-bot node /app/scripts/retroactive-founders-prime-grant.js
 */

'use strict';

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const NEW_EXPIRY_DAYS = 540;
    const newExpiry = new Date(Date.now() + NEW_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Find all users who purchased lifetime100 or lifetime80
    const { rows: holders } = await client.query(`
      SELECT DISTINCT ue.user_id
      FROM user_entitlements ue
      WHERE ue.source_plan_id IN ('lifetime100', 'lifetime80')
    `);

    console.log(`Found ${holders.length} Founders plan holders.`);

    let updated = 0;
    let skipped = 0;

    for (const { user_id } of holders) {
      // Check current prime entitlement
      const { rows: existing } = await client.query(`
        SELECT id, expires_at, is_lifetime
        FROM user_entitlements
        WHERE user_id = $1 AND add_on_id = 'prime'
        ORDER BY expires_at DESC NULLS LAST
        LIMIT 1
      `, [user_id]);

      if (existing.length > 0) {
        const row = existing[0];
        const currentExpiry = row.expires_at;

        // Skip if already has a better (longer) expiry
        if (currentExpiry && new Date(currentExpiry) >= newExpiry) {
          skipped++;
          continue;
        }

        // Extend to 18 months from today
        await client.query(`
          UPDATE user_entitlements
          SET expires_at = $1, updated_at = NOW()
          WHERE id = $2
        `, [newExpiry, row.id]);
        updated++;
        console.log(`  Updated user ${user_id}: ${currentExpiry ? new Date(currentExpiry).toISOString() : 'null'} → ${newExpiry.toISOString()}`);
      } else {
        // No prime entitlement yet — create one
        await client.query(`
          INSERT INTO user_entitlements (user_id, add_on_id, source_plan_id, is_lifetime, expires_at, created_at, updated_at)
          VALUES ($1, 'prime', 'lifetime100', false, $2, NOW(), NOW())
          ON CONFLICT (user_id, add_on_id) DO UPDATE
          SET expires_at = $2, updated_at = NOW()
          WHERE user_entitlements.expires_at IS NULL OR user_entitlements.expires_at < $2
        `, [user_id, newExpiry]);
        updated++;
        console.log(`  Created prime entitlement for user ${user_id} → ${newExpiry.toISOString()}`);
      }
    }

    await client.query('COMMIT');
    console.log(`\nDone. Updated: ${updated}, Skipped (already better): ${skipped}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
