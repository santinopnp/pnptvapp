#!/usr/bin/env node
'use strict';

/**
 * run-featured-promo-20260924.js
 *
 * Fires the featured-creator daily promo for 2026-09-24 (Stormytt).
 * Uses force=true so it runs even if the dedup key is already set.
 *
 * Usage:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     $(docker exec pnptv-bot printenv | grep -E '^(POSTGRES_|REDIS_|BOT_TOKEN|NODE_ENV)' | sed 's/^/-e /') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/run-featured-promo-20260924.js --dry-run
 *
 * Live: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (DRY_RUN) {
    const { getPool, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
    await initializePostgres();
    const pool = getPool();

    const { rows: featured } = await pool.query(`
      SELECT f.date, f.creator_id, f.pitch_en, f.media_url,
             u.username, u.first_name, u.cover_url
        FROM featured_creators f
        JOIN users u ON u.id = f.creator_id
       WHERE f.date = '2026-09-24'`);

    const { rows: audience } = await pool.query(`
      SELECT COUNT(*) AS cnt FROM users
       WHERE telegram IS NOT NULL
         AND age_verified = TRUE
         AND terms_accepted = TRUE
         AND deleted_at IS NULL`);

    const { rows: pushAudience } = await pool.query(`
      SELECT COUNT(*) AS cnt FROM push_subscriptions ps
        JOIN users u ON u.id = ps.user_id
       WHERE u.age_verified = TRUE AND u.terms_accepted = TRUE AND u.deleted_at IS NULL`);

    console.log('\n=== DRY RUN — Featured Promo 2026-09-24 ===');
    console.log('Featured creator row:', JSON.stringify(featured[0], null, 2));
    console.log(`Telegram audience:    ${audience[0].cnt} users`);
    console.log(`Push audience:        ${pushAudience[0].cnt} users`);
    console.log('\nAbsolute hero URL:');
    const raw = featured[0]?.media_url || featured[0]?.cover_url;
    console.log(raw ? `https://pnptv.app${raw}` : '(none — text-only)');
    console.log('\nX copy preview:');
    const name = featured[0]?.first_name || featured[0]?.username;
    const pitch = featured[0]?.pitch_en?.slice(0, 180) || 'Featured today on PNPtv — the ones setting the pace.';
    const link  = `https://pnptv.app/c/${encodeURIComponent(featured[0]?.username)}`;
    console.log(`Model of the day → ${name} (@${featured[0]?.username}) 💎\n${pitch}\n\n${link}\n#PNPtv #ModelOfTheDay`);
    console.log('\n=== Remove --dry-run to send live ===\n');
    process.exit(0);
  }

  // Live run
  const { initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
  const { initializeRedis }     = require(path.join(BACKEND, 'config/redis'));
  const featuredPromo           = require(path.join(BACKEND, 'services/featuredCreatorPromoService'));

  await initializePostgres();
  await initializeRedis();

  console.log('[featured-promo] starting live run for 2026-09-24 (stormytt)...');
  const result = await featuredPromo.runDailyPromo({ force: true });
  console.log('[featured-promo] result:', JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[featured-promo] fatal:', err);
  process.exit(1);
});
