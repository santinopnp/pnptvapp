/**
 * Seed Zoho Contacts with all active PNPtv creators.
 *
 * One-shot. Idempotent (upsert keyed by PNPtv_ID).
 * Batches of 100 (Zoho hard limit).
 *
 * Run: docker exec pnptv-bot node scripts/seed-zoho-contacts.js
 */

require('dotenv').config({ path: '/app/.env' });
require('dotenv').config({ path: '/app/.env.production', override: true });

const { initializePostgres, query, closePool } = require('../config/postgres');
const zoho = require('../services/zohoService');

const BASE_URL = 'https://pnptv.app';
const BATCH_SIZE = 100;

function tierFor(row) {
  if (row.role === 'superadmin' || row.role === 'admin') return 'co_founder';
  if (row.role === 'star') return 'star';
  return 'creator';
}

async function loadCreators() {
  const { rows } = await query(`
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.email,
      u.username,
      u.role,
      u.creator_status,
      u.creator_type,
      u.bio,
      u.city,
      u.country,
      COALESCE(p.status, 'none')                        AS performer_status,
      COALESCE(SUM(ce.amount_creator) FILTER (
        WHERE ce.status IN ('available','paid_out','holding')
      ), 0)::numeric                                    AS lifetime_earnings,
      COALESCE(SUM(ce.amount_creator) FILTER (
        WHERE ce.status IN ('available','paid_out','holding')
          AND ce.created_at >= date_trunc('month', NOW())
      ), 0)::numeric                                    AS month_earnings,
      COALESCE(sub.active_count, 0)                     AS active_subs,
      EXISTS (
        SELECT 1 FROM creator_2257_records r
         WHERE r.user_id = u.id AND r.verification_status='approved'
      )                                                 AS verified_2257,
      (
        SELECT (verified_at + INTERVAL '1 year')::date
          FROM creator_2257_records r
         WHERE r.user_id = u.id AND r.verification_status='approved'
         ORDER BY verified_at DESC LIMIT 1
      )                                                 AS verify_expiry
    FROM users u
    LEFT JOIN performers p           ON p.user_id = u.id
    LEFT JOIN creator_earnings ce    ON ce.creator_id = u.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS active_count
        FROM creator_subscriptions cs
       WHERE cs.creator_id = u.id AND cs.status='active'
    ) sub ON true
    WHERE u.creator_status IN ('approved','active')
       OR u.role IN ('creator','admin','superadmin','star')
       OR p.status = 'active'
    GROUP BY u.id, p.status, sub.active_count
    ORDER BY u.id;
  `);
  return rows;
}

function toZohoContact(row) {
  return {
    PNPtv_ID: String(row.id),
    First_Name: (row.first_name || '').slice(0, 40) || 'PNPtv',
    Last_Name: (row.last_name || row.username || row.first_name || 'Creator').slice(0, 80),
    Email: row.email || null,
    Telegram_ID: String(row.id),
    Telegram_Handle: row.username || null,
    Creator_Tier: tierFor(row),
    Content_Types: row.creator_type || null,
    Total_Lifetime_Earnings_USD: Number(row.lifetime_earnings) || 0,
    Monthly_Earnings_USD: Number(row.month_earnings) || 0,
    Active_Subscribers: Number(row.active_subs) || 0,
    Verified_2257: !!row.verified_2257,
    Verification_Expires: row.verify_expiry
      ? new Date(row.verify_expiry).toISOString().slice(0, 10)
      : null,
    Is_Performer: row.performer_status === 'active',
    Profile_URL: `${BASE_URL}/profile/${row.id}`,
    Mailing_City: row.city || null,
    Mailing_Country: row.country || null,
    Description: (row.bio || '').slice(0, 32000) || null,
  };
}

async function main() {
  if (!zoho.isConfigured()) {
    console.error('Zoho not configured — check ZOHO_* env vars');
    process.exit(1);
  }

  const isDryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : null;

  await initializePostgres();
  const creators = await loadCreators();
  console.log(`Loaded ${creators.length} creators from DB`);

  let contacts = creators.map(toZohoContact);
  if (limit) contacts = contacts.slice(0, limit);

  if (isDryRun) {
    console.log(`\n--dry-run: showing first 3 payloads (${contacts.length} would be sent)\n`);
    contacts.slice(0, 3).forEach(c => console.log(JSON.stringify(c, null, 2)));
    await closePool();
    process.exit(0);
  }

  const stats = { created: 0, updated: 0, failed: 0, errors: [] };

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`Batch ${batchNum} (${batch.length} records)... `);
    try {
      const results = await zoho.bulkUpsert('Contacts', batch, ['PNPtv_ID']);
      results.forEach((r, idx) => {
        if (r.status === 'success') {
          if (r.action === 'insert') stats.created++;
          else stats.updated++;
        } else {
          stats.failed++;
          stats.errors.push({ pnptvId: batch[idx].PNPtv_ID, code: r.code, message: r.message, details: r.details });
        }
      });
      console.log(`ok`);
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      stats.failed += batch.length;
      stats.errors.push({ batchStart: i, error: err.message, response: err.response?.data });
      if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
    }
  }

  console.log('');
  console.log(`Created:  ${stats.created}`);
  console.log(`Updated:  ${stats.updated}`);
  console.log(`Failed:   ${stats.failed}`);
  if (stats.errors.length > 0) {
    console.log('');
    console.log('First 10 errors:');
    stats.errors.slice(0, 10).forEach(e => console.log(JSON.stringify(e)));
  }

  await closePool();
  process.exit(stats.failed > 0 ? 2 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
