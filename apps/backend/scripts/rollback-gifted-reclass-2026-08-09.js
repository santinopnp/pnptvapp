#!/usr/bin/env node
'use strict';

/**
 * rollback-gifted-reclass-2026-08-09.js
 *
 * Reverses reclass-legacy-gifted-to-regular-2026-08-09.js after realizing that
 * spendable regular Ru$h creates creator-payout liability (creators expect USD
 * for tips/calls/content). Keeping gifted Ru$h Santino-scoped avoids that.
 *
 * Per user: move_back = MIN(reclassed_amount, current balance_tokens).
 * If they already spent some (e.g. Stefano's -90 on membership_purchase), only
 * the unspent remainder rolls back. Platform revenue spends stay honored.
 *
 * IDEMPOTENT: writes token_ledger row with source_type='gifted_reclass_rollback_2026_08_09';
 * re-runs skip already-rolled users.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/rollback-gifted-reclass-2026-08-09.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/rollback-gifted-reclass-2026-08-09.js --live
 */

const { Pool } = require('pg');

const DRY_RUN = !process.argv.includes('--live');
const ROLLBACK_SOURCE_TYPE = 'gifted_reclass_rollback_2026_08_09';
const RECLASS_SOURCE_TYPE = 'gifted_reclass_2026_08_09';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
});

async function computeCandidates(client) {
  // move_back = MIN(unspent_of_reclassed, current_regular)
  // where unspent_of_reclassed = MAX(0, reclassed - regular_spent_since_reclass)
  // This preserves the user's pre-migration regular balance (e.g. SHIMATYO had
  // 5 original + 1575 reclassed, spent 186 since — leave his 5, only roll back
  // the 1389 unspent-from-reclassed portion).
  const { rows } = await client.query(`
    WITH reclass_entries AS (
      SELECT user_id, MIN(created_at) AS reclass_at, SUM(delta_balance)::int AS reclassed_amount
      FROM token_ledger
      WHERE source_type = $1 AND delta_balance > 0
      GROUP BY user_id
    ),
    spent_since AS (
      SELECT r.user_id,
             COALESCE(SUM(-l.delta_balance), 0)::int AS regular_spent
      FROM reclass_entries r
      LEFT JOIN token_ledger l
        ON l.user_id = r.user_id
       AND l.created_at > r.reclass_at
       AND l.delta_balance < 0
      GROUP BY r.user_id
    ),
    rolled AS (
      SELECT user_id FROM token_ledger WHERE source_type = $2
    )
    SELECT
      r.user_id,
      r.reclassed_amount,
      s.regular_spent,
      GREATEST(0, r.reclassed_amount - s.regular_spent)::int AS unspent_of_reclassed,
      w.balance_tokens AS current_regular,
      w.gifted_balance AS current_gifted,
      LEAST(
        GREATEST(0, r.reclassed_amount - s.regular_spent),
        w.balance_tokens
      )::int AS move_back,
      u.username,
      u.tier,
      (r.user_id IN (SELECT user_id FROM rolled)) AS already_rolled
    FROM reclass_entries r
    JOIN spent_since s ON s.user_id = r.user_id
    JOIN user_token_wallets w ON w.user_id = r.user_id
    LEFT JOIN users u ON u.id = r.user_id
    ORDER BY LEAST(
      GREATEST(0, r.reclassed_amount - s.regular_spent),
      w.balance_tokens
    ) DESC
  `, [RECLASS_SOURCE_TYPE, ROLLBACK_SOURCE_TYPE]);
  return rows;
}

async function rollbackOne(client, row) {
  const userId = row.user_id;
  await client.query('BEGIN');
  try {
    const { rows: wRows } = await client.query(
      `SELECT balance_tokens, gifted_balance FROM user_token_wallets
       WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (!wRows.length) throw new Error('wallet missing');
    const curRegular = Number(wRows[0].balance_tokens);
    // Use the pre-computed unspent_of_reclassed to preserve pre-migration regular.
    const moveBack = Math.min(Number(row.unspent_of_reclassed), curRegular);
    if (moveBack <= 0) {
      await client.query('ROLLBACK');
      return { userId, skipped: true, reason: 'no regular to move back' };
    }

    const { rows: updRows } = await client.query(
      `UPDATE user_token_wallets
       SET balance_tokens = balance_tokens - $2,
           gifted_balance = gifted_balance + $2,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING balance_tokens, gifted_balance`,
      [userId, moveBack]
    );

    await client.query(
      `INSERT INTO token_ledger
         (user_id, delta_balance, delta_gifted, reason, source_type, source_id,
          actor_id, balance_after, gifted_after, metadata)
       VALUES ($1, $2, $3, 'admin_grant', $4, $1, 'system_gifted_reclass_rollback',
               $5, $6, $7::jsonb)`,
      [
        userId,
        -moveBack,
        moveBack,
        ROLLBACK_SOURCE_TYPE,
        updRows[0].balance_tokens,
        updRows[0].gifted_balance,
        JSON.stringify({
          note: 'Reverse gifted_reclass_2026_08_09: creator-payout liability check reversed the migration. Gifted stays scoped to Santino/Lex tips + platform (member/prime) membership purchases.',
          amount: moveBack,
          reclassed_originally: Number(row.reclassed_amount),
          run: 'gifted_reclass_rollback_2026_08_09',
        }),
      ]
    );

    await client.query('COMMIT');
    return {
      userId,
      username: row.username,
      moved_back: moveBack,
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
    const pending = candidates.filter(c => !c.already_rolled && c.move_back > 0);
    const already = candidates.filter(c => c.already_rolled);
    const zeroMove = candidates.filter(c => !c.already_rolled && c.move_back === 0);

    const totalRush = pending.reduce((s, r) => s + Number(r.move_back), 0);
    const totalUsd = (totalRush / 6).toFixed(2);

    console.log(`\n=== rollback-gifted-reclass-2026-08-09 (${DRY_RUN ? 'DRY-RUN' : 'LIVE'}) ===`);
    console.log(`Reclassed users: ${candidates.length}`);
    console.log(`Already rolled (skip): ${already.length}`);
    console.log(`Zero move-back (already spent, skip): ${zeroMove.length}`);
    console.log(`Pending: ${pending.length}`);
    console.log(`Total Ru$h to roll back: ${totalRush.toLocaleString()} (~$${totalUsd})\n`);

    if (zeroMove.length) {
      console.log('Users with zero move-back (spent all reclassed regular):');
      console.table(zeroMove.map(r => ({
        user: r.username || r.user_id,
        reclassed: r.reclassed_amount,
        current_regular: r.current_regular,
      })));
    }

    console.log('\nTop 10 pending:');
    console.table(pending.slice(0, 10).map(r => ({
      user: r.username || r.user_id,
      tier: r.tier,
      reclassed: r.reclassed_amount,
      cur_regular: r.current_regular,
      cur_gifted: r.current_gifted,
      move_back: r.move_back,
    })));

    if (DRY_RUN) {
      console.log('\nDRY-RUN — no changes made. Rerun with --live to execute.');
      return;
    }

    console.log('\nExecuting rollback...');
    const results = [];
    for (const c of pending) {
      const r = await rollbackOne(client, c);
      results.push(r);
      if (r.error) console.error(`  ✗ ${c.username || c.user_id}: ${r.error}`);
    }

    const ok = results.filter(r => r.moved_back > 0);
    const errs = results.filter(r => r.error);
    const totalMoved = ok.reduce((s, r) => s + r.moved_back, 0);

    console.log(`\nDone: ${ok.length} users rolled back, ${errs.length} errors.`);
    console.log(`Total moved back: ${totalMoved.toLocaleString()} Ru$h (~$${(totalMoved / 6).toFixed(2)})`);
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
