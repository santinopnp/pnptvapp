'use strict';

/**
 * hypeBotScheduler.js
 *
 * Every 60 seconds: for each live stream with ≥2 viewers and a creator who has
 * hype_bot_enabled=true, emit a random bilingual engagement message into the
 * stream's Socket.IO room. A per-stream Redis key (TTL 120s) prevents more
 * than one message per 2 minutes per stream.
 *
 * Socket event: stream:hype  →  room live:<streamId>
 * Payload: { id, username, text, ts }
 * System sender: id 8552451957 / @pnptv (PNPtv! News)
 */

const { getRedis } = require('../../../config/redis');
const { query } = require('../../../config/postgres');
const logger = require('../../../utils/logger');
const { v4: uuidv4 } = require('uuid');

const CHECK_INTERVAL_MS = 60 * 1000; // 60s
const HYPE_DEDUP_TTL = 120;          // 2 min cooldown per stream

const HYPE_EN = [
  '🔥 The show is heating up — drop a tip to keep it going!',
  '💦 Tip 10 tokens and watch him react 👀',
  '😈 Show him some love — send a tip',
  '💨 Feeling the vibe? Tip to make it hotter',
  '🎁 First 3 tippers get a shoutout',
  '⚡ Running low on tokens? Tap Add Tokens up top',
  '🏆 Climb the leaderboard — tap the trophy',
  '💥 Tips fuel bigger shows next time',
  '🚀 5 tips in a row = special reaction from the streamer',
  '💎 PRIME members: your tips count 2x on the leaderboard tonight',
  '🎬 Enjoying the show? Even 5 tokens means a lot',
  '🌟 Say hi in chat — he\'s reading everything',
  '🔥 Big tip = big reaction — try it',
  '💸 Every tip keeps the lights on. Thanks papis',
  '👑 Top tipper gets pinned at the top',
];

const HYPE_ES = [
  '🔥 La cosa se está calentando — tirá una propina para que siga!',
  '💦 Regalá 10 tokens y mirá cómo reacciona 👀',
  '😈 Dale amor al papi — envía una propina',
  '💨 Sintiendo la onda? Propina para que suba',
  '🎁 Los primeros 3 tippers reciben un shoutout',
  '⚡ Sin tokens? Tocá \'Add Tokens\' arriba',
  '🏆 Subí al leaderboard — tocá el trofeo',
  '💥 Las propinas hacen shows más grandes la próxima',
  '🚀 5 tips seguidos = reacción especial del streamer',
  '💎 PRIME: hoy tus propinas cuentan 2x en el leaderboard',
  '🎬 Te gusta el show? Aunque sea 5 tokens ayuda',
  '🌟 Salúdalo en el chat — está leyendo todo',
  '🔥 Propina grande = reacción grande — probá',
  '💸 Cada propina mantiene las luces prendidas. Gracias papis',
  '👑 El top tipper queda fijado arriba',
];

function pickHype(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

class HypeBotScheduler {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.isProcessing = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    // Delay initial run by 30s so IO is fully initialised
    setTimeout(() => this.runChecks(), 30_000);
    this.interval = setInterval(() => this.runChecks(), CHECK_INTERVAL_MS);
    logger.info('[hypeBotScheduler] Started (60s interval, 120s cooldown per stream)');
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.isRunning = false;
    logger.info('[hypeBotScheduler] Stopped');
  }

  async runChecks() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this._emitHypeMessages();
    } catch (err) {
      logger.error('[hypeBotScheduler] runChecks error', { error: err.message });
    } finally {
      this.isProcessing = false;
    }
  }

  async _emitHypeMessages() {
    const redis = getRedis();
    if (!redis) return;

    // Get socket.io instance
    const socketSingleton = require('../../../services/socketSingleton');
    const io = socketSingleton.get();
    if (!io) return;

    // Find all live:viewers:* keys that have ≥2 viewers
    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'live:viewers:*', 'COUNT', '100');
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return;

    // Gather stream IDs with ≥2 viewers
    const eligibleStreamIds = [];
    for (const key of keys) {
      const count = parseInt(await redis.get(key), 10) || 0;
      if (count >= 2) {
        // Key format: live:viewers:<streamId>
        const streamId = key.slice('live:viewers:'.length);
        eligibleStreamIds.push(streamId);
      }
    }

    if (eligibleStreamIds.length === 0) return;

    // Look up creator hype_bot_enabled + language for all eligible streams.
    // streamId in the socket room / redis viewers key is whatever the client
    // sent to live:join — this can be either:
    //   (a) a live_streams.id UUID (DB-tracked ticketed/scheduled show), or
    //   (b) a Restreamer channel slug matched against users.live_channel
    //       (e.g. "pnptv-lex" — the common case for regular creator streams).
    // Query both mappings and dedupe.
    let dbRows = [];
    try {
      const { rows } = await query(
        `SELECT stream_id, hype_bot_enabled, language FROM (
           SELECT ls.id::text AS stream_id, u.hype_bot_enabled,
                  COALESCE(u.language, 'en') AS language
             FROM live_streams ls
             JOIN users u ON u.id = ls.creator_id
            WHERE ls.id::text = ANY($1::text[])
              AND ls.is_live = true
           UNION
           SELECT u.live_channel AS stream_id, u.hype_bot_enabled,
                  COALESCE(u.language, 'en') AS language
             FROM users u
            WHERE u.live_channel = ANY($1::text[])
         ) rows`,
        [eligibleStreamIds]
      );
      dbRows = rows;
    } catch (err) {
      logger.warn('[hypeBotScheduler] DB query failed', { error: err.message });
      return;
    }

    let emitted = 0;
    for (const row of dbRows) {
      if (!row.hype_bot_enabled) continue;

      const streamId = row.stream_id;
      const dedupKey = `hype:last:${streamId}`;

      // Check cooldown
      const exists = await redis.get(dedupKey);
      if (exists) continue;

      // Pick message based on creator language (es → Spanish, else English)
      const isSpanish = row.language && row.language.startsWith('es');
      const pool = isSpanish ? HYPE_ES : HYPE_EN;
      const text = pickHype(pool);

      const payload = {
        id: uuidv4(),
        username: '@pnptv',
        userId: '8552451957',
        text,
        ts: Date.now(),
        isHype: true,
      };

      io.to(`live:${streamId}`).emit('stream:hype', payload);

      // Set cooldown
      await redis.set(dedupKey, '1', 'EX', HYPE_DEDUP_TTL);
      emitted++;
    }

    if (emitted > 0) {
      logger.info(`[hypeBotScheduler] Emitted ${emitted} hype message(s)`);
    }
  }
}

module.exports = HypeBotScheduler;
