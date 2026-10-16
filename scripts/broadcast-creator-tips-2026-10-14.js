'use strict';

/**
 * Creator tips DM blast — language-aware (EN or ES per user.language).
 * Single-language per user. URLs appear once, raw (renderer linkifies them).
 * From: Creators Support (b13ef0bb-48fe-49e7-8330-4d179018d32b)
 * Dedup: Redis key pnpapp:creator_tips_blast_2026-10-14:{userId}
 */

const { Pool } = require('pg');
const Redis = require('ioredis');

const SENDER_ID = 'b13ef0bb-48fe-49e7-8330-4d179018d32b';
const CC_USER_ID = '8599671840'; // Santino — verify what recipients see
const CAMPAIGN_KEY = 'pnpapp:creator_tips_blast_2026-10-14';

const MSG_EN = `Hey! 👋 A few quick tips to get more bookings on PNPtv:

📸 Add photos to your profile — members browse Live before booking and creators with photos get seen first:
https://pnptv.app/creators/setup

🟢 Go online on Main Stage — when you're live or available you appear in "Available Now" at the top of Live, the #1 spot where new clients land:
https://pnptv.app/main-stage

📦 Check your call packages — make sure you have at least one active package with price + duration so members can book you:
https://pnptv.app/creators

— Creators Support @ PNPtv 💜`;

const MSG_ES = `¡Hola! 👋 Algunos tips rápidos para conseguir más reservas en PNPtv:

📸 Agrega fotos a tu perfil — los miembros exploran Live antes de reservar y los creadores con fotos se ven primero:
https://pnptv.app/creators/setup

🟢 Conéctate en Main Stage — cuando estás en vivo o disponible aparecés en "Available Now" arriba en Live, el spot #1 donde llegan los nuevos clientes:
https://pnptv.app/main-stage

📦 Revisá tus paquetes de llamadas — aseguráte de tener al menos uno activo con precio y duración para que los miembros puedan reservarte:
https://pnptv.app/creators

— Creators Support @ PNPtv 💜`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const redis = new Redis(process.env.REDIS_URL || 'redis://redis-pnptv:6379');

  // Get active performers with their language preference
  const { rows: performers } = await pool.query(`
    SELECT DISTINCT p.user_id, COALESCE(u.language, 'en') AS lang
    FROM performers p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.status = 'active' AND p.user_id IS NOT NULL
  `);

  // Add Santino CC with his language
  const { rows: santinoRow } = await pool.query(
    `SELECT language FROM users WHERE id = $1`, [CC_USER_ID]
  );
  const allRecipients = [
    ...performers,
    { user_id: CC_USER_ID, lang: santinoRow[0]?.language || 'en' },
  ];

  // Deduplicate user_id (in case Santino is already a performer)
  const seen = new Set();
  const recipients = allRecipients.filter(r => {
    if (seen.has(r.user_id)) return false;
    seen.add(r.user_id);
    return true;
  });

  console.log(`Sending to ${recipients.length} recipients (${performers.length} performers + CC)`);

  let sent = 0, skipped = 0;

  for (const { user_id: recipientId, lang } of recipients) {
    if (String(recipientId) === String(SENDER_ID)) { skipped++; continue; }

    const dedupKey = `${CAMPAIGN_KEY}:${recipientId}`;
    if (await redis.get(dedupKey)) { skipped++; continue; }

    const text = (lang === 'es' ? MSG_ES : MSG_EN).trim();

    try {
      await pool.query(
        `INSERT INTO direct_messages (sender_id, recipient_id, content) VALUES ($1, $2, $3)`,
        [SENDER_ID, recipientId, text]
      );

      const [a, b] = [SENDER_ID, recipientId].sort();
      const incrementB = SENDER_ID === a;
      await pool.query(
        `INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at, unread_for_a, unread_for_b)
         VALUES ($1, $2, $3, NOW(),
           CASE WHEN $4 THEN 0 ELSE 1 END,
           CASE WHEN $4 THEN 1 ELSE 0 END)
         ON CONFLICT (user_a, user_b) DO UPDATE SET
           last_message    = EXCLUDED.last_message,
           last_message_at = NOW(),
           unread_for_a    = dm_threads.unread_for_a + CASE WHEN $4 THEN 0 ELSE 1 END,
           unread_for_b    = dm_threads.unread_for_b + CASE WHEN $4 THEN 1 ELSE 0 END`,
        [a, b, text.slice(0, 100), incrementB]
      );

      await redis.set(dedupKey, '1', 'EX', 60 * 60 * 24 * 30);
      sent++;
      process.stdout.write(`\r  Sent ${sent} / ${recipients.length - skipped}`);
    } catch (err) {
      console.error(`\n  ERROR for ${recipientId}:`, err.message);
    }
  }

  console.log(`\nDone. Sent: ${sent}, Skipped: ${skipped}`);
  await pool.end();
  await redis.quit();
}

main().catch(err => { console.error(err); process.exit(1); });
