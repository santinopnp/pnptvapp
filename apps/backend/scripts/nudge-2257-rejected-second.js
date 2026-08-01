'use strict';

/**
 * Second nudge for 2257-rejected creators — one-shot manual run.
 *
 * Targets creators whose 2257 record is in 'rejected' state AND who haven't
 * resubmitted since our last nudge (2026-07-31). Meant to run ~14 days after
 * the first-round rejection nudge to catch stragglers before enforcement.
 *
 * DM-only (matches the trial-day-2 nudge pattern). Idempotent via
 * nudge_2257_rejected_second_log table.
 *
 * Run:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/nudge-2257-rejected-second.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/nudge-2257-rejected-second.js
 */

const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const SYSTEM_SENDER_ID = process.env.SYSTEM_DM_SENDER_ID || '8552451957';
const STUDIO_URL = 'https://pnptv.app/creators/setup';

const COPY_ES = (name) => `Hola ${name || 'crack'} 👋

Tu verificación 2257 sigue en estado *rechazado* — no hemos recibido un reenvío.

Recuerda: sin verificar, tu cuenta de creator se pausa automáticamente el ${'{{DEADLINE}}'}. Sin publicar, sin cobrar, sin nuevos suscriptores.

Reenviar (3 min): ${STUDIO_URL}

Si ves un motivo específico del rechazo en el portal, corrígelo:
• ID borroso / recortado → foto entera y nítida
• Selfie sin ID → tienes que salir tú con tu ID en la misma foto
• ID vencido → usa uno vigente

Cualquier duda, respóndenos aquí.

— PNPtv! Support`;

const COPY_EN = (name) => `Hi ${name || 'there'} 👋

Your 2257 verification is still marked *rejected* — we haven't received a resubmission.

Reminder: without verifying, your creator account is paused automatically on ${'{{DEADLINE}}'}. No publishing, no earnings, no new subscribers.

Resubmit (3 min): ${STUDIO_URL}

If you see a specific rejection reason in the portal, address it:
• Blurry / cropped ID → whole card, in focus
• Selfie without the ID → you need to be visible holding the same ID
• Expired ID → use a current one

Reply here if you're stuck.

— PNPtv! Support`;

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
    CREATE TABLE IF NOT EXISTS nudge_2257_rejected_second_log (
      user_id text PRIMARY KEY,
      status text NOT NULL,
      error text,
      sent_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function fetchTargets(client) {
  const { rows } = await client.query(`
    SELECT u.id, COALESCE(NULLIF(u.first_name,''), u.username) AS name,
           COALESCE(u.language,'en') AS lang,
           u.identity_verification_required_by::date AS deadline
      FROM users u
      JOIN creator_2257_records r ON r.user_id = u.id::text
     WHERE u.creator_status = 'active'
       AND u.deleted_at IS NULL
       AND u.identity_verified IS DISTINCT FROM true
       AND r.verification_status = 'rejected'
       AND (r.submitted_at < NOW() - INTERVAL '10 days' OR r.submitted_at IS NULL)
     ORDER BY u.identity_verification_required_by ASC NULLS LAST
  `);
  return rows;
}

async function alreadySent(client, userId) {
  const { rows } = await client.query(
    `SELECT 1 FROM nudge_2257_rejected_second_log WHERE user_id = $1 AND status = 'sent' AND sent_at > NOW() - INTERVAL '20 days'`,
    [String(userId)]
  );
  return rows.length > 0;
}

async function logRow(client, userId, status, error) {
  await client.query(
    `INSERT INTO nudge_2257_rejected_second_log (user_id, status, error)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET status = EXCLUDED.status, error = EXCLUDED.error, sent_at = NOW()`,
    [String(userId), status, error || null]
  );
}

async function sendDM(client, recipientId, text) {
  const { rows } = await client.query(
    `INSERT INTO direct_messages (sender_id, recipient_id, content)
     VALUES ($1, $2, $3) RETURNING id`,
    [SYSTEM_SENDER_ID, String(recipientId), text]
  );
  const [a, b] = [SYSTEM_SENDER_ID, String(recipientId)].sort();
  const incrementB = SYSTEM_SENDER_ID === a;
  await client.query(
    `INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at, unread_for_a, unread_for_b)
     VALUES ($1, $2, $3, NOW(), CASE WHEN $4 THEN 0 ELSE 1 END, CASE WHEN $4 THEN 1 ELSE 0 END)
     ON CONFLICT (user_a, user_b) DO UPDATE SET
       last_message = EXCLUDED.last_message,
       last_message_at = NOW(),
       unread_for_a = dm_threads.unread_for_a + CASE WHEN $4 THEN 0 ELSE 1 END,
       unread_for_b = dm_threads.unread_for_b + CASE WHEN $4 THEN 1 ELSE 0 END`,
    [a, b, text.slice(0, 100), incrementB]
  );
  return rows[0].id;
}

function formatDeadline(dateVal, isEs) {
  if (!dateVal) return isEs ? 'la fecha límite' : 'the deadline';
  const d = new Date(dateVal);
  return isEs
    ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

async function main() {
  console.log(`=== 2257 rejected — second nudge ${DRY ? '(DRY-RUN)' : ''} ===`);
  const client = await pool.connect();
  try {
    await ensureLog(client);
    const targets = await fetchTargets(client);
    console.log(`Fetched ${targets.length} targets (rejected + no update in ≥10d)`);

    let sent = 0, skipped = 0, failed = 0;

    for (const u of targets) {
      const isEs = String(u.lang).toLowerCase().startsWith('es');
      const deadlineFmt = formatDeadline(u.deadline, isEs);
      const template = isEs ? COPY_ES(u.name) : COPY_EN(u.name);
      const text = template.replace('{{DEADLINE}}', deadlineFmt);

      if (await alreadySent(client, u.id)) {
        skipped++;
        continue;
      }

      if (DRY) {
        console.log(`  DRY → ${u.id} (${u.name}, ${u.lang}, deadline ${deadlineFmt})`);
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
