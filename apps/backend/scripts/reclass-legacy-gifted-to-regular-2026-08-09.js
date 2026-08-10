#!/usr/bin/env node
'use strict';

/**
 * reclass-legacy-gifted-to-regular-2026-08-09.js
 *
 * One-shot: move pre-2026-08-04 gifted_balance to balance_tokens.
 *
 * BACKGROUND
 * On 2026-08-04 tokenLedger.debit() default flipped to allowGifted=false,
 * scoping gifted_balance to Santino+Lex live tips only. Anything that landed
 * in gifted_balance BEFORE that date (the wallet_backfill migration on
 * 2026-08-03/04, plus SHIMATYO's real Mercado Pago payment credited by mistake
 * as gifted on 2026-08-08) became retroactively unspendable outside Santino.
 *
 * ~$3,753 stuck across ~130 active users → this script releases it.
 *
 * INCLUDED (moved gifted → regular):
 *   - all delta_gifted from source_type='wallet_backfill'
 *   - explicit SHIMATYO admin_grant (actor 8552451957, user 5519461158, 2026-08-08)
 *
 * EXCLUDED (stay as gifted — designed that way):
 *   - onboarding_bonus (180 Ru$h signup gift)
 *   - tester_reward_v1 (Chase cohort)
 *   - reclassify_promo_to_gifted (2026-08-08 fix for pre-existing promo grants)
 *
 * IDEMPOTENT: writes a token_ledger row with source_type='gifted_reclass_2026_08_09'
 * per user; re-runs are no-ops.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/reclass-legacy-gifted-to-regular-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/reclass-legacy-gifted-to-regular-2026-08-09.js --live
 */

const { Pool } = require('pg');

const DRY_RUN = !process.argv.includes('--live');
const RECLASS_SOURCE_TYPE = 'gifted_reclass_2026_08_09';
const SHIMATYO_USER_ID = '5519461158';
const SHIMATYO_GRANT_LEDGER_ID_SOURCE = 'shimatyo_mp_2026_08_08';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
});

async function computeCandidates(client) {
  // Sum of wallet_backfill gifted deltas per user + SHIMATYO's specific grant.
  const { rows } = await client.query(`
    WITH backfill AS (
      SELECT user_id, SUM(delta_gifted)::int AS legacy_gifted
      FROM token_ledger
      WHERE source_type = 'wallet_backfill' AND delta_gifted > 0
      GROUP BY user_id
    ),
    shimatyo AS (
      SELECT user_id, SUM(delta_gifted)::int AS legacy_gifted
      FROM token_ledger
      WHERE user_id = $1
        AND actor_id = '8552451957'
        AND reason = 'admin_grant'
        AND metadata->>'reason' = 'Pago con mercado pago'
        AND delta_gifted > 0
      GROUP BY user_id
    ),
    combined AS (
      SELECT user_id, SUM(legacy_gifted)::int AS legacy_gifted
      FROM (SELECT * FROM backfill UNION ALL SELECT * FROM shimatyo) u
      GROUP BY user_id
    )
    SELECT
      c.user_id,
      c.legacy_gifted,
      w.balance_tokens AS current_regular,
      w.gifted_balance AS current_gifted,
      LEAST(c.legacy_gifted, w.gifted_balance)::int AS migrate_amount,
      u.username,
      u.tier,
      EXISTS (
        SELECT 1 FROM token_ledger
        WHERE user_id = c.user_id AND source_type = $2
      ) AS already_reclassed
    FROM combined c
    JOIN user_token_wallets w ON w.user_id = c.user_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE w.gifted_balance > 0
    ORDER BY LEAST(c.legacy_gifted, w.gifted_balance) DESC
  `, [SHIMATYO_USER_ID, RECLASS_SOURCE_TYPE]);
  return rows;
}

async function migrateOne(client, row) {
  const amount = row.migrate_amount;
  const userId = row.user_id;

  await client.query('BEGIN');
  try {
    // Lock wallet row
    const { rows: wRows } = await client.query(
      `SELECT balance_tokens, gifted_balance FROM user_token_wallets
       WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (!wRows.length) throw new Error('wallet missing');
    const curGifted = Number(wRows[0].gifted_balance);
    // Re-check migrate_amount against current gifted (may have changed since SELECT)
    const finalAmount = Math.min(amount, curGifted);
    if (finalAmount <= 0) {
      await client.query('ROLLBACK');
      return { userId, skipped: true, reason: 'no gifted to migrate' };
    }

    // Update wallet
    const { rows: updRows } = await client.query(
      `UPDATE user_token_wallets
       SET balance_tokens = balance_tokens + $2,
           gifted_balance = gifted_balance - $2,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING balance_tokens, gifted_balance`,
      [userId, finalAmount]
    );

    // Ledger entry
    await client.query(
      `INSERT INTO token_ledger
         (user_id, delta_balance, delta_gifted, reason, source_type, source_id,
          actor_id, balance_after, gifted_after, metadata)
       VALUES ($1, $2, $3, 'admin_grant', $4, $1, 'system_gifted_reclass',
               $5, $6, $7::jsonb)`,
      [
        userId,
        finalAmount,
        -finalAmount,
        RECLASS_SOURCE_TYPE,
        updRows[0].balance_tokens,
        updRows[0].gifted_balance,
        JSON.stringify({
          note: 'Reclassify legacy gifted_balance (pre-2026-08-04) to regular; released after gifted-scope tightening on 2026-08-04 left users unable to spend legitimate credits.',
          amount: finalAmount,
          run: 'gifted_reclass_2026_08_09',
        }),
      ]
    );

    await client.query('COMMIT');
    return {
      userId,
      username: row.username,
      migrated: finalAmount,
      newRegular: updRows[0].balance_tokens,
      newGifted: updRows[0].gifted_balance,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return { userId, error: err.message };
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const candidates = await computeCandidates(client);
    const pending = candidates.filter(c => !c.already_reclassed && c.migrate_amount > 0);
    const already = candidates.filter(c => c.already_reclassed);

    const totalRush = pending.reduce((s, r) => s + Number(r.migrate_amount), 0);
    const totalUsd = (totalRush / 6).toFixed(2);

    console.log(`\n=== reclass-legacy-gifted-to-regular-2026-08-09 (${DRY_RUN ? 'DRY-RUN' : 'LIVE'}) ===`);
    console.log(`Candidates: ${candidates.length}`);
    console.log(`Already reclassed (skip): ${already.length}`);
    console.log(`Pending: ${pending.length}`);
    console.log(`Total Ru$h to migrate: ${totalRush.toLocaleString()} (~$${totalUsd})\n`);

    console.log('Top 10 pending:');
    console.table(pending.slice(0, 10).map(r => ({
      user: r.username || r.user_id,
      tier: r.tier,
      cur_regular: r.current_regular,
      cur_gifted: r.current_gifted,
      migrate: r.migrate_amount,
      usd: (r.migrate_amount / 6).toFixed(2),
    })));

    if (DRY_RUN) {
      console.log('\nDRY-RUN — no changes made. Rerun with --live to execute.');
      return;
    }

    console.log('\nExecuting migration...');
    const results = [];
    for (const c of pending) {
      const r = await migrateOne(client, c);
      results.push(r);
      if (r.error) console.error(`  ✗ ${c.username || c.user_id}: ${r.error}`);
    }

    const ok = results.filter(r => r.migrated > 0);
    const errs = results.filter(r => r.error);
    const totalMigrated = ok.reduce((s, r) => s + r.migrated, 0);

    console.log(`\nDone: ${ok.length} users migrated, ${errs.length} errors.`);
    console.log(`Total migrated: ${totalMigrated.toLocaleString()} Ru$h (~$${(totalMigrated / 6).toFixed(2)})`);
    if (errs.length) {
      console.log('\nErrors:');
      errs.forEach(e => console.log(`  ${e.userId}: ${e.error}`));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
