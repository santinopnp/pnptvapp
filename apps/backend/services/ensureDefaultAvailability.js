'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

/**
 * ensureDefaultAvailability(creatorId)
 *
 * If a creator has ZERO active availability windows, insert a modest
 * Sat 12:00–20:00 default window in their best-guess timezone (from
 * users.timezone; falls back to a country map, then UTC).
 *
 * Idempotent: no-op if any active window already exists.
 * Returns: { inserted: bool, timezone: string, day, start, end }
 */

// Free-text country → IANA timezone. Covers ~90% of PNPtv creator base.
const COUNTRY_TZ_MAP = new Map([
  ['us', 'America/New_York'],
  ['usa', 'America/New_York'],
  ['united states', 'America/New_York'],
  ['mexico', 'America/Mexico_City'],
  ['méxico', 'America/Mexico_City'],
  ['mx', 'America/Mexico_City'],
  ['colombia', 'America/Bogota'],
  ['brazil', 'America/Sao_Paulo'],
  ['brasil', 'America/Sao_Paulo'],
  ['argentina', 'America/Argentina/Buenos_Aires'],
  ['chile', 'America/Santiago'],
  ['peru', 'America/Lima'],
  ['perú', 'America/Lima'],
  ['spain', 'Europe/Madrid'],
  ['españa', 'Europe/Madrid'],
  ['uk', 'Europe/London'],
  ['united kingdom', 'Europe/London'],
  ['england', 'Europe/London'],
  ['bulgaria', 'Europe/Sofia'],
  ['denmark', 'Europe/Copenhagen'],
  ['germany', 'Europe/Berlin'],
  ['france', 'Europe/Paris'],
  ['italy', 'Europe/Rome'],
  ['canada', 'America/Toronto'],
  ['australia', 'Australia/Sydney'],
  ['puerto rico', 'America/Puerto_Rico'],
  ['uae', 'Asia/Dubai'],
  ['united arab emirates', 'Asia/Dubai'],
  ['singapore', 'Asia/Singapore'],
  ['iran', 'Asia/Tehran'],
]);

function guessTimezone(userTz, country) {
  if (userTz && typeof userTz === 'string' && userTz.includes('/')) return userTz;
  if (!country || typeof country !== 'string') return 'UTC';
  const cleaned = country
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
  return COUNTRY_TZ_MAP.get(cleaned) || 'UTC';
}

async function ensureDefaultAvailability(creatorId) {
  if (!creatorId) return { inserted: false, reason: 'no_creator_id' };

  const existing = await query(
    'SELECT 1 FROM creator_availability_schedules WHERE creator_id = $1 AND is_active = TRUE LIMIT 1',
    [creatorId]
  );
  if (existing.rows.length > 0) {
    return { inserted: false, reason: 'already_has_windows' };
  }

  const userRes = await query(
    'SELECT timezone, country FROM users WHERE id = $1',
    [creatorId]
  );
  const u = userRes.rows[0] || {};
  const tz = guessTimezone(u.timezone, u.country);

  // Saturday (day_of_week=6, ISO Sun=0..Sat=6 per our schema), 12:00-20:00 local
  try {
    await query(
      `INSERT INTO creator_availability_schedules (creator_id, day_of_week, start_time, end_time, timezone, is_active)
       VALUES ($1, 6, '12:00', '20:00', $2, TRUE)
       ON CONFLICT (creator_id, day_of_week, start_time) DO NOTHING`,
      [creatorId, tz]
    );
    logger.info('[ensureDefaultAvailability] inserted default window', { creatorId, timezone: tz });
    return { inserted: true, timezone: tz, day: 6, start: '12:00', end: '20:00' };
  } catch (err) {
    logger.warn('[ensureDefaultAvailability] insert failed', { creatorId, error: err.message });
    return { inserted: false, reason: 'insert_error', error: err.message };
  }
}

module.exports = { ensureDefaultAvailability, guessTimezone };
