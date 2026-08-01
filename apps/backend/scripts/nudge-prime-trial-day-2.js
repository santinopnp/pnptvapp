'use strict';

/**
 * PRIME trial day-2 nudge — one-shot manual run.
 *
 * Sends an in-app DM from @pnptv (8552451957) to users who are ~48h into
 * their prime-trial-3d entitlement and haven't converted yet. Goal: convert
 * before the trial silently expires.
 *
 * DM-only (no email, no Telegram bot broadcast). Per feedback_dm_sales_only.md
 * this is sales-appropriate. Per feedback_no_broadcast_crontab.md this is
 * intentionally one-shot manual — not scheduled in host crontab.
 *
 * Idempotent via nudge_trial_day_2_log table.
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/nudge-prime-trial-day-2.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/nudge-prime-trial-day-2.js
 */

const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const SYSTEM_SENDER_ID = process.env.SYSTEM_DM_SENDER_ID || '8552451957';

const COPY_ES = (name) => `Hola ${name || 'crack'} 👋

Tu prueba PRIME termina en ~24h. Antes de que se apague:

• Contenido exclusivo, hangouts y prioridad en Nearby siguen abiertos por 1 día más.
• Si quieres seguir después, PRIME arranca en $9.99/mes o Lifetime con un solo pago.

Sigue con PRIME 👉 https://pnptv.app/subscribe

Si prefieres dejarlo, ignora este mensaje — no te cobramos nada.`;

const COPY_EN = (name) => `Hey ${name || 'there'} 👋

Your PRIME trial ends in ~24h. Before it wraps:

• Exclusive content, hangouts, and Nearby priority are still on for 1 more day.
• If you want to keep going, PRIME starts at $9.99/mo or Lifetime for one payment.

Keep PRIME 👉 https://pnptv.app/subscribe

If you'd rather let it lapse, ignore this — no charge.`;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'pg-pnptv',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'pnptvbot',
  user: process.env.POSTGRES_USER || 'pnptvbot',
  password: process.env.POSTGRES_PASSWORD,
  max: 3,
});

async function ensureLog(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS nudge_trial_day_2_log (
      user_id text NOT NULL,
      run_date date NOT NULL DEFAULT CURRENT_DATE,
      status text NOT NULL,
      error text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, run_date)
    )
  `);
}

async function fetchTargets(client) {
  const { rows } = await client.query(`
    SELECT DISTINCT ON (u.id)
           u.id,
           COALESCE(NULLIF(u.first_name,''), u.username) AS name,
           COALESCE(u.language,'en') AS lang,
           ue.created_at AS trial_started,
           ue.expires_at AS trial_expires
      FROM user_entitlements ue
      JOIN users u ON u.id = ue.user_id
     WHERE ue.source_plan_id = 'prime-trial-3d'
       AND ue.is_lifetime = false
       AND ue.expires_at > NOW()
       AND ue.expires_at <= NOW() + INTERVAL '36 hours'
       AND ue.created_at <= NOW() - INTERVAL '36 hours'
       AND u.deleted_at IS NULL
       AND u.is_active = true
       -- exclude users who already bought a paid plan on top of the trial
       AND NOT EXISTS (
         SELECT 1 FROM user_entitlements ue2
         WHERE ue2.user_id = u.id
           AND ue2.source_plan_id IS DISTINCT FROM 'prime-trial-3d'
           AND (ue2.is_lifetime = true OR ue2.expires_at > NOW() + INTERVAL '7 days')
       )
     ORDER BY u.id, ue.expires_at DESC
  `);
  return rows;
}

async function alreadySent(client, userId) {
  const { rows } = await client.query(
    `SELECT 1 FROM nudge_trial_day_2_log
      WHERE user_id = $1 AND run_date > CURRENT_DATE - INTERVAL '3 days' AND status = 'sent'`,
    [String(userId)]
  );
  return rows.length > 0;
}

async function logRow(client, userId, status, error) {
  await client.query(
    `INSERT INTO nudge_trial_day_2_log (user_id, run_date, status, error)
     VALUES ($1, CURRENT_DATE, $2, $3)
     ON CONFLICT (user_id, run_date) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [String(userId), status, error || null]
  );
}

async function sendDM(client, recipientId, text) {
  const { rows } = await client.query(
    `INSERT INTO direct_messages (sender_id, recipient_id, content)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [SYSTEM_SENDER_ID, String(recipientId), text]
  );
  const messageId = rows[0].id;

  const [a, b] = [SYSTEM_SENDER_ID, String(recipientId)].sort();
  const incrementB = SYSTEM_SENDER_ID === a;

  await client.query(
    `INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at, unread_for_a, unread_for_b)
     VALUES ($1, $2, $3, NOW(), CASE WHEN $4 THEN 0 ELSE 1 END, CASE WHEN $4 THEN 1 ELSE 0 END)
     ON CONFLICT (user_a, user_b) DO UPDATE SET
       last_message    = EXCLUDED.last_message,
       last_message_at = NOW(),
       unread_for_a    = dm_threads.unread_for_a + CASE WHEN $4 THEN 0 ELSE 1 END,
       unread_for_b    = dm_threads.unread_for_b + CASE WHEN $4 THEN 1 ELSE 0 END`,
    [a, b, text.slice(0, 100), incrementB]
  );
  return messageId;
}

async function main() {
  console.log(`=== PRIME trial day-2 nudge ${DRY ? '(DRY-RUN)' : ''} ===`);
  const client = await pool.connect();
  try {
    await ensureLog(client);
    const targets = await fetchTargets(client);
    console.log(`Fetched ${targets.length} targets (trial expiring in ≤36h, started ≥36h ago, no paid plan on top)`);

    let sent = 0, skipped = 0, failed = 0;

    for (const u of targets) {
      const isEs = String(u.lang).toLowerCase().startsWith('es');
      const text = isEs ? COPY_ES(u.name) : COPY_EN(u.name);

      if (await alreadySent(client, u.id)) {
        skipped++;
        continue;
      }

      if (DRY) {
        console.log(`  DRY → ${u.id} (${u.name}, ${u.lang}, exp ${u.trial_expires.toISOString().slice(0,16)}): ${text.split('\n')[0]}`);
        sent++;
        continue;
      }

      try {
        await sendDM(client, u.id, text);
        await logRow(client, u.id, 'sent');
        sent++;
      } catch (e) {
        failed++;
        await logRow(client, u.id, 'failed', String(e.message || e).slice(0, 500));
        console.error(`  FAIL → ${u.id}: ${e.message}`);
      }
    }

    console.log(`\n=== FINAL ===`);
    console.log(`  sent=${sent} skipped=${skipped} failed=${failed}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
