#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-push-2026-08-21.js
 *
 * Week-of-Aug-19 campaign — Send 3/4.
 * Channel:  Web push (via pushNotificationService)
 * Segment:  non-PRIME users with a push subscription (~476)
 * Angle:    "Weekend PRIME — 30 seconds to unlock."
 * Idempotency: broadcast_lifetime100_week_2026_08_19 log table, channel=fri_push
 *
 * Push copy is batched by language (ES/EN) — same payload per language cohort.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-push-2026-08-21.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-lifetime100-push-2026-08-21.js --live
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY = !process.argv.includes('--live');
const LOG_TABLE = 'broadcast_lifetime100_week_2026_08_19';

const PUSH_COMMON = {
  icon: '/icon-192.png',
  tag: 'lifetime100-2026-08-21',
  url: '/lifetime100',
};

const PUSH_ES = {
  title: '🖤 PRIME de por vida · $100',
  body: 'Un pago. Para siempre. Tarjeta o cripto — 30 seg.',
};

const PUSH_EN = {
  title: '🖤 Lifetime PRIME · $100',
  body: 'One payment. Forever. Card or crypto — 30 sec.',
};

// ── Plumbing ─────────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function loadTargets() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text AS user_id,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    JOIN push_subscriptions ps ON ps.user_id = u.id
    WHERE COALESCE(u.is_active, true) = true
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id::text = u.id::text
          AND ue.add_on_id IN ('prime', 'pnp-member')
          AND ue.is_consumed = false
          AND (ue.is_lifetime = true OR ue.expires_at > NOW())
      )
    ORDER BY u.id
  `);
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — /lifetime100 push broadcast (Fri 2026-08-21)');
  console.log(`  MODE : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const users = await loadTargets();
  console.log(`  ${users.length} push-subscribed non-PRIME user(s)\n`);

  if (users.length === 0) {
    console.log('  No targets — done.');
    process.exit(0);
  }

  const esUsers = users.filter(u => u.language.startsWith('es'));
  const enUsers = users.filter(u => !u.language.startsWith('es'));

  console.log(`  ES: ${esUsers.length}   EN: ${enUsers.length}\n`);

  if (DRY) {
    console.log('  DRY sample ES payload:', { ...PUSH_COMMON, ...PUSH_ES });
    console.log('  DRY sample EN payload:', { ...PUSH_COMMON, ...PUSH_EN });
    console.log(`\n  DRY RUN — would push to ${users.length} user(s). Re-run with --live.\n`);
    process.exit(0);
  }

  // Skip already-sent
  async function filterUnsent(list) {
    if (list.length === 0) return list;
    const { rows } = await query(
      `SELECT user_id FROM ${LOG_TABLE} WHERE channel='fri_push' AND status='sent' AND user_id = ANY($1::text[])`,
      [list.map(u => u.user_id)]
    );
    const done = new Set(rows.map(r => r.user_id));
    return list.filter(u => !done.has(u.user_id));
  }

  const esToSend = await filterUnsent(esUsers);
  const enToSend = await filterUnsent(enUsers);

  console.log(`  After dedup — ES to send: ${esToSend.length}   EN to send: ${enToSend.length}\n`);

  let esDelivered = 0, enDelivered = 0;

  if (esToSend.length) {
    const ids = esToSend.map(u => u.user_id);
    try {
      esDelivered = await PushNotificationService.sendToUsers(ids, { ...PUSH_COMMON, ...PUSH_ES });
      console.log(`  [PUSH ES] delivered=${esDelivered}/${ids.length}`);
      for (const id of ids) await log(id, 'fri_push', esDelivered > 0 ? 'sent' : 'no_subs');
    } catch (e) {
      console.error(`  [PUSH ES] FAILED: ${e.message}`);
      for (const id of ids) await log(id, 'fri_push', 'failed', e.message.slice(0, 500));
    }
  }

  if (enToSend.length) {
    const ids = enToSend.map(u => u.user_id);
    try {
      enDelivered = await PushNotificationService.sendToUsers(ids, { ...PUSH_COMMON, ...PUSH_EN });
      console.log(`  [PUSH EN] delivered=${enDelivered}/${ids.length}`);
      for (const id of ids) await log(id, 'fri_push', enDelivered > 0 ? 'sent' : 'no_subs');
    } catch (e) {
      console.error(`  [PUSH EN] FAILED: ${e.message}`);
      for (const id of ids) await log(id, 'fri_push', 'failed', e.message.slice(0, 500));
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   ES delivered : ${esDelivered}`);
  console.log(`   EN delivered : ${enDelivered}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
