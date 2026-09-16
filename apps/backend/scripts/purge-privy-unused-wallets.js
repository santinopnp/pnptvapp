#!/usr/bin/env node
'use strict';

/**
 * purge-privy-unused-wallets.js
 *
 * Deletes Privy users (and their embedded wallets) for PNPtv users who have
 * ZERO purchase records of any kind — they consumed a wallet slot but never
 * interacted with the payment system.
 *
 * After deletion: nulls out privy_id, wallet_address, wallet_linked_at in our
 * DB so the next Privy login creates a fresh account (no embedded wallet until
 * they actually click "Pay with Crypto").
 *
 * Safety:
 *   - Users with ANY token_purchases row (any status) are skipped.
 *   - Users with ANY successful gas topup are skipped.
 *   - Dry-run by default. Pass --execute to actually delete.
 *   - 200ms delay between Privy API calls to avoid rate limiting.
 *
 * Usage:
 *   node purge-privy-unused-wallets.js           # dry-run
 *   node purge-privy-unused-wallets.js --execute # live delete
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const PRIVY_ID     = process.env.PRIVY_APP_ID;
const PRIVY_SECRET = process.env.PRIVY_APP_SECRET;
if (!PRIVY_ID || !PRIVY_SECRET) { console.error('Missing PRIVY_APP_ID / PRIVY_APP_SECRET'); process.exit(1); }

const EXECUTE = process.argv.includes('--execute');
const DELAY_MS = 200;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function deletePrivyUser(privyId) {
  const url = `https://auth.privy.io/api/v1/users/${encodeURIComponent(privyId)}`;
  const auth = 'Basic ' + Buffer.from(`${PRIVY_ID}:${PRIVY_SECRET}`).toString('base64');
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: auth, 'privy-app-id': PRIVY_ID },
  });
  if (!r.ok && r.status !== 404) {
    const body = await r.text().catch(() => '');
    throw new Error(`Privy DELETE ${privyId} → ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.status;
}

async function main() {
  await initializePostgres();
  console.log(`\n=== Privy Unused Wallet Purge (${EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ===\n`);

  // Fetch candidates: privy users with zero purchases AND zero gas topups
  const { rows } = await query(`
    SELECT u.id, u.privy_id, u.wallet_address, u.created_at
    FROM users u
    WHERE u.privy_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM token_purchases tp WHERE tp.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM gas_topups gt WHERE gt.user_id::text = u.id::text AND gt.status = 'success'
      )
    ORDER BY u.created_at ASC
  `);

  console.log(`Candidates to purge: ${rows.length}`);
  if (rows.length === 0) { console.log('Nothing to do.'); process.exit(0); }

  let deleted = 0;
  let skipped = 0;
  let errors  = 0;

  for (const user of rows) {
    process.stdout.write(`  [${deleted + skipped + errors + 1}/${rows.length}] ${user.privy_id} (pnptv: ${user.id}) … `);

    if (!EXECUTE) {
      console.log('DRY RUN — skip');
      skipped++;
      continue;
    }

    try {
      const status = await deletePrivyUser(user.privy_id);
      await query(
        `UPDATE users
            SET privy_id         = NULL,
                wallet_address   = NULL,
                wallet_linked_at = NULL
          WHERE id = $1`,
        [user.id],
      );
      console.log(`deleted (privy ${status})`);
      deleted++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. deleted=${deleted}  skipped=${skipped}  errors=${errors}`);

  if (!EXECUTE && rows.length > 0) {
    console.log('\nRe-run with --execute to apply changes.');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
