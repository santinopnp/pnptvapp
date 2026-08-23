#!/usr/bin/env node
'use strict';

/**
 * push-santino-39-bday-2026-08-23.js
 *
 * Follow-up web-push for the Santino 39th birthday DM. Same audience rules
 * as the DM (age-verified, non-banned, non-deleted, != Santino), filtered
 * to users with at least one active push_subscriptions row.
 *
 * Idempotent log table: push_santino_39_bday_2026_08_23.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/push-santino-39-bday-2026-08-23.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/push-santino-39-bday-2026-08-23.js --live
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY = !process.argv.includes('--live');

const WEBAPP_URL  = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const SANTINO_ID  = '8599671840';
const DM_URL      = `${WEBAPP_URL}/dm/${SANTINO_ID}`;
const LOG_TABLE   = 'push_santino_39_bday_2026_08_23';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

function pushPayload(lang) {
  if (isEs(lang)) {
    return {
      title: '🎂 Hoy cumplo 39 💜',
      body:  'Papi, mira tu DM — te guardé algo privado para este finde.',
      url:   DM_URL,
    };
  }
  return {
    title: "🎂 It's my 39th today 💜",
    body:  'Papi, check your DMs — I saved something private for us this weekend.',
    url:   DM_URL,
  };
}

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL PRIMARY KEY,
      status  text NOT NULL,
      sent_count int,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadTargets() {
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS user_id,
           LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    JOIN push_subscriptions ps ON ps.user_id = u.id::text
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
      AND u.age_verified = true
      AND u.id::text <> $1
      AND NOT EXISTS (
        SELECT 1 FROM ${LOG_TABLE} lg
        WHERE lg.user_id = u.id::text AND lg.status = 'sent'
      )
  `, [SANTINO_ID]);
  return rows;
}

async function main() {
  await initializePostgres();
  await ensureLogTable();

  const targets = await loadTargets();
  console.log(`\n  ${targets.length} push-eligible users\n`);

  if (targets.length === 0) { console.log('  Nothing to do.'); process.exit(0); }

  if (DRY) {
    console.log('  DRY sample payload (en):', JSON.stringify(pushPayload('en')));
    console.log('  DRY sample payload (es):', JSON.stringify(pushPayload('es')));
    console.log(`  Would push to ${targets.length} users. Re-run with --live.\n`);
    process.exit(0);
  }

  let sent = 0, delivered = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const { user_id, language } = targets[i];
    try {
      const count = await PushNotificationService.sendToUser(user_id, pushPayload(language));
      delivered += count;
      sent++;
      await query(
        `INSERT INTO ${LOG_TABLE} (user_id, status, sent_count) VALUES ($1,'sent',$2)
         ON CONFLICT (user_id) DO UPDATE SET status='sent', sent_count=EXCLUDED.sent_count, sent_at=NOW()`,
        [user_id, count]
      );
    } catch (err) {
      fail++;
      await query(
        `INSERT INTO ${LOG_TABLE} (user_id, status, error) VALUES ($1,'failed',$2)
         ON CONFLICT (user_id) DO UPDATE SET status='failed', error=EXCLUDED.error, sent_at=NOW()`,
        [user_id, (err.message || '?').slice(0,500)]
      );
    }
    if ((i + 1) % 100 === 0) {
      console.log(`  progress ${i + 1}/${targets.length}  sent=${sent} delivered=${delivered} fail=${fail}`);
    }
    await sleep(30);
  }

  console.log(`\n── Summary ──`);
  console.log(`  Users pushed : ${sent}`);
  console.log(`  Deliveries   : ${delivered} (some users have multi-device subs)`);
  console.log(`  Failed       : ${fail}`);
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err); process.exit(1); });
