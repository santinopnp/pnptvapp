'use strict';

/**
 * Main Stage private-call promo — features the most recently active creator
 * on main stage who has call packages active. Sent to all active users.
 * From: SantinoFurioso (8599671840)
 * Dedup: Redis pnpapp:mainstage-calls-promo-2026-10-15:{userId}
 */

const { Pool } = require('pg');
const Redis   = require('ioredis');

const DRY_RUN   = process.argv.includes('--dry-run');
const SENDER_ID = '8552451957'; // PNPtv! News
const CC_ID     = '8599671840'; // Santino — receives as a regular recipient
const CAMPAIGN  = 'pnpapp:mainstage-calls-promo-2026-10-15';

// ── helpers ──────────────────────────────────────────────────────────────────

function photoUrl(photo_file_id) {
  if (!photo_file_id) return null;
  if (photo_file_id.startsWith('http')) return photo_file_id;
  return `https://pnptv.app${photo_file_id}`;
}

function buildMsg(lang, name, username) {
  const profileUrl = `https://pnptv.app/c/${username}`;
  if (lang === 'es') {
    return (
      `🔴 <b>${name}</b> está en vivo en Main Stage ahora mismo\n\n` +
      `Reserva una llamada privada 1 a 1 — conecta directo, sin sala de espera. Los slots se agotan rápido.\n\n` +
      `👉 ${profileUrl}`
    );
  }
  return (
    `🔴 <b>${name}</b> is live on Main Stage right now\n\n` +
    `Book a private 1-on-1 call tonight — connect directly, no waiting room. Slots go fast.\n\n` +
    `👉 ${profileUrl}`
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool  = new Pool({ connectionString: process.env.DATABASE_URL });
  const redis = new Redis(process.env.REDIS_URL || 'redis://redis-pnptv:6379');

  // 1. Find featured creator — most recently on main stage with call packages
  //    Try last 2h first, then 12h fallback.
  let creator = null;
  for (const interval of ['2 hours', '12 hours']) {
    const { rows } = await pool.query(`
      SELECT mcs.user_id, u.username, u.first_name, u.photo_file_id, mcs.last_seen_at
      FROM mainstage_cammer_stats mcs
      JOIN users u ON u.id = mcs.user_id
      WHERE mcs.last_seen_at > NOW() - INTERVAL '${interval}'
        AND EXISTS (
          SELECT 1 FROM call_packages cp
          WHERE cp.creator_id = mcs.user_id AND cp.is_active = true
        )
      ORDER BY mcs.last_seen_at DESC
      LIMIT 1
    `);
    if (rows.length) { creator = rows[0]; break; }
  }

  if (!creator) {
    console.error('No main-stage creator with active call packages found in the last 12h. Aborting.');
    await pool.end(); await redis.quit(); return;
  }

  const displayName = creator.first_name || creator.username;
  console.log(`Featured creator: ${displayName} (@${creator.username}) — last seen ${creator.last_seen_at}`);
  console.log(`Photo: ${photoUrl(creator.photo_file_id) || '(none)'}`);

  if (DRY_RUN) console.log('\n[DRY-RUN mode — no messages will be sent]\n');

  // 2. Recipients: all active users (including CC, excluding featured creator)
  const { rows: recipients } = await pool.query(`
    SELECT id, COALESCE(language, 'en') AS lang
    FROM users
    WHERE COALESCE(is_active, true) = true
      AND role != 'banned'
      AND id != $1
    ORDER BY id
  `, [creator.user_id]);

  // Force-include CC (Santino) even if he would otherwise be excluded
  // (he's excluded only as the featured creator; otherwise he's in the list)
  console.log(`Total recipients: ${recipients.length}`);

  // 3. Filter already-sent via Redis
  const toSend = [];
  for (const r of recipients) {
    const sent = await redis.get(`${CAMPAIGN}:${r.id}`);
    if (!sent) toSend.push(r);
  }
  console.log(`After dedup: ${toSend.length} new recipients`);

  if (DRY_RUN) {
    console.log('Dry-run complete.');
    await pool.end(); await redis.quit(); return;
  }

  // 4. Send
  const mediaUrl  = photoUrl(creator.photo_file_id);
  const mediaType = mediaUrl ? 'image' : null;
  let sent = 0, errors = 0;

  for (const { id: recipientId, lang } of toSend) {
    const content = buildMsg(lang, displayName, creator.username);

    try {
      // Insert in-app DM
      await pool.query(
        `INSERT INTO direct_messages
           (sender_id, recipient_id, content, media_url, media_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [SENDER_ID, recipientId, content, mediaUrl, mediaType]
      );

      // Upsert DM thread
      const [a, b]    = [SENDER_ID, recipientId].sort();
      const senderIsA = SENDER_ID === a;
      await pool.query(
        `INSERT INTO dm_threads
           (user_a, user_b, last_message, last_message_at, unread_for_a, unread_for_b)
         VALUES ($1, $2, $3, NOW(),
           CASE WHEN $4 THEN 0 ELSE 1 END,
           CASE WHEN $4 THEN 1 ELSE 0 END)
         ON CONFLICT (user_a, user_b) DO UPDATE SET
           last_message    = EXCLUDED.last_message,
           last_message_at = NOW(),
           unread_for_a    = dm_threads.unread_for_a + CASE WHEN $4 THEN 0 ELSE 1 END,
           unread_for_b    = dm_threads.unread_for_b + CASE WHEN $4 THEN 1 ELSE 0 END`,
        [a, b, content.slice(0, 100), senderIsA]
      );

      // Mark dedup (30-day TTL)
      await redis.set(`${CAMPAIGN}:${recipientId}`, '1', 'EX', 60 * 60 * 24 * 30);

      sent++;
      process.stdout.write(`\r  Sent ${sent} / ${toSend.length}`);
    } catch (err) {
      errors++;
      console.error(`\n  ERROR for ${recipientId}:`, err.message);
    }
  }

  console.log(`\nDone. Sent: ${sent}, Errors: ${errors}`);
  await pool.end();
  await redis.quit();
}

main().catch(err => { console.error(err); process.exit(1); });
