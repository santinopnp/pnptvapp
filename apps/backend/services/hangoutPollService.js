'use strict';

/**
 * hangoutPollService.js
 *
 * Community polls for Hangout groups. Polls are surfaced as a special
 * message type in the hangout chat stream (message_type = 'poll').
 *
 * DB layout:
 *   hangout_polls       — poll definition + options (JSONB)
 *   hangout_poll_votes  — one row per (poll, user); option_ids TEXT[]
 *   chat_messages       — poll_id FK column; message_type = 'poll'
 */

const { query } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_QUESTION_LENGTH = 300;
const MAX_OPTION_TEXT_LENGTH = 100;
// Results TTL in Redis: 30 seconds (live-updated on every vote, kept short so
// a restart never shows stale totals for long)
const RESULTS_CACHE_TTL_S = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the results cache key for a poll.
 * @param {string} pollId
 */
function resultsCacheKey(pollId) {
  return `hangout:poll:results:${pollId}`;
}

/**
 * Fetch aggregated vote counts directly from PG and cache them briefly.
 * Returns { results: [{option_id, count}], total_votes }.
 * @param {string} pollId
 */
async function fetchAndCacheResults(pollId) {
  // Fetch the poll's option list so we can zero-fill options with no votes.
  const { rows: pollRows } = await query(
    'SELECT options FROM hangout_polls WHERE id = $1',
    [pollId]
  );
  if (pollRows.length === 0) return { results: [], total_votes: 0 };

  const options = pollRows[0].options; // [{id, text}]

  // Unnest voted option arrays and count per option_id.
  const { rows: countRows } = await query(
    `SELECT unnest(option_ids) AS option_id, COUNT(*)::int AS count
     FROM hangout_poll_votes
     WHERE poll_id = $1
     GROUP BY option_id`,
    [pollId]
  );

  const countMap = {};
  let total_votes = 0;
  for (const row of countRows) {
    countMap[row.option_id] = row.count;
    total_votes += row.count;
  }

  // Build zero-filled results array in option order.
  const results = options.map(opt => ({
    option_id: opt.id,
    count: countMap[opt.id] || 0,
  }));

  // Cache in Redis so concurrent socket broadcasts don't hammer PG.
  try {
    const redis = getRedis();
    if (redis) {
      await redis.setex(
        resultsCacheKey(pollId),
        RESULTS_CACHE_TTL_S,
        JSON.stringify({ results, total_votes })
      );
    }
  } catch (_) { /* non-fatal */ }

  return { results, total_votes };
}

/**
 * Invalidate the cached results for a poll (called after a vote is recorded).
 * @param {string} pollId
 */
async function invalidateResultsCache(pollId) {
  try {
    const redis = getRedis();
    if (redis) await redis.del(resultsCacheKey(pollId));
  } catch (_) { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new poll in a hangout, inserting both the hangout_polls row and a
 * corresponding chat_messages row with message_type='poll'.
 *
 * @param {number} hangoutId   - hangout_groups.id (integer)
 * @param {string} userId      - users.id (varchar)
 * @param {object} params
 * @param {string}   params.question
 * @param {string[]} params.options     - 2–4 non-empty option texts
 * @param {boolean}  [params.allowMultiple=false]
 * @param {Date|string|null} [params.closesAt]
 * @returns {{ poll: object, message: object }}
 */
async function createPoll(hangoutId, userId, { question, options, allowMultiple = false, closesAt = null }) {
  // ── Validation ──────────────────────────────────────────────────────────────
  if (!question || !question.trim()) {
    throw Object.assign(new Error('Poll question is required'), { code: 'VALIDATION_ERROR' });
  }
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    throw Object.assign(
      new Error(`Question must be ${MAX_QUESTION_LENGTH} characters or fewer`),
      { code: 'VALIDATION_ERROR' }
    );
  }
  if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    throw Object.assign(
      new Error(`A poll must have between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`),
      { code: 'VALIDATION_ERROR' }
    );
  }
  const cleanedOptions = options.map((text, i) => {
    const t = String(text || '').trim();
    if (!t) {
      throw Object.assign(new Error(`Option ${i + 1} text cannot be empty`), { code: 'VALIDATION_ERROR' });
    }
    if (t.length > MAX_OPTION_TEXT_LENGTH) {
      throw Object.assign(
        new Error(`Option ${i + 1} must be ${MAX_OPTION_TEXT_LENGTH} characters or fewer`),
        { code: 'VALIDATION_ERROR' }
      );
    }
    return { id: `opt_${i + 1}`, text: t };
  });

  // Validate closesAt: must be a future timestamp if provided.
  let closesAtValue = null;
  if (closesAt) {
    const d = new Date(closesAt);
    if (isNaN(d.getTime())) {
      throw Object.assign(new Error('closes_at is not a valid date'), { code: 'VALIDATION_ERROR' });
    }
    if (d <= new Date()) {
      throw Object.assign(new Error('closes_at must be in the future'), { code: 'VALIDATION_ERROR' });
    }
    closesAtValue = d.toISOString();
  }

  // ── DB inserts (two rows, single round-trip each) ──────────────────────────
  const room = `hangout:${hangoutId}`;

  const { rows: pollRows } = await query(
    `INSERT INTO hangout_polls
       (hangout_id, creator_user_id, question, options, allow_multiple, closes_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, hangout_id, creator_user_id, question, options, allow_multiple,
               closes_at, created_at, updated_at`,
    [hangoutId, userId, question.trim(), JSON.stringify(cleanedOptions), !!allowMultiple, closesAtValue]
  );
  const poll = pollRows[0];

  // chat_messages.content cannot be NULL (CHECK constraint).  We store an
  // empty string; the real poll payload lives in the poll table.
  const { rows: msgRows } = await query(
    `INSERT INTO chat_messages
       (room, user_id, content, message_type, poll_id)
     VALUES ($1, $2, '', 'poll', $3)
     RETURNING id, room, user_id, username, first_name, photo_url, content,
               message_type, poll_id, meta, created_at`,
    [room, userId, poll.id]
  );
  const message = msgRows[0];

  logger.info('hangoutPollService.createPoll', { pollId: poll.id, hangoutId, userId });

  return { poll, message };
}

/**
 * Record or update a vote on a poll, returning the current aggregate results
 * plus the voting user's chosen option IDs.
 *
 * Supports both single-choice and multi-choice polls (allow_multiple).
 * Uses ON CONFLICT to replace a previous vote (re-vote is allowed).
 *
 * @param {string}   pollId    - UUID
 * @param {string}   userId    - users.id
 * @param {string[]} optionIds - e.g. ['opt_1'] or ['opt_2','opt_3']
 * @returns {{ poll_id, results: [{option_id, count}], total_votes, user_vote: string[] }}
 */
async function votePoll(pollId, userId, optionIds) {
  // ── Fetch poll ──────────────────────────────────────────────────────────────
  const { rows: pollRows } = await query(
    'SELECT id, options, allow_multiple, closes_at FROM hangout_polls WHERE id = $1',
    [pollId]
  );
  if (pollRows.length === 0) {
    throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' });
  }
  const poll = pollRows[0];

  // Closed-poll check
  if (poll.closes_at && new Date(poll.closes_at) <= new Date()) {
    throw Object.assign(new Error('This poll has closed'), { code: 'POLL_CLOSED' });
  }

  // ── Validate optionIds ─────────────────────────────────────────────────────
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    throw Object.assign(new Error('At least one option must be selected'), { code: 'VALIDATION_ERROR' });
  }
  if (!poll.allow_multiple && optionIds.length > 1) {
    throw Object.assign(new Error('This poll only allows one selection'), { code: 'VALIDATION_ERROR' });
  }

  const validIds = new Set(poll.options.map(o => o.id));
  for (const oid of optionIds) {
    if (!validIds.has(oid)) {
      throw Object.assign(new Error(`Invalid option id: ${oid}`), { code: 'VALIDATION_ERROR' });
    }
  }

  // Deduplicate
  const deduped = [...new Set(optionIds)];

  // ── Upsert vote ─────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO hangout_poll_votes (poll_id, user_id, option_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (poll_id, user_id) DO UPDATE SET option_ids = EXCLUDED.option_ids`,
    [pollId, userId, deduped]
  );

  // ── Invalidate cache and return fresh results ────────────────────────────────
  await invalidateResultsCache(pollId);
  const { results, total_votes } = await fetchAndCacheResults(pollId);

  return { poll_id: pollId, results, total_votes, user_vote: deduped };
}

/**
 * Fetch poll definition, aggregate results, and the requesting user's vote.
 *
 * @param {string} pollId
 * @param {string} requestingUserId
 * @returns {{ poll: object, results: [{option_id, count}], total_votes, user_vote: string[]|null }}
 */
async function getPollResults(pollId, requestingUserId) {
  const { rows: pollRows } = await query(
    'SELECT id, hangout_id, creator_user_id, question, options, allow_multiple, closes_at, created_at FROM hangout_polls WHERE id = $1',
    [pollId]
  );
  if (pollRows.length === 0) {
    throw Object.assign(new Error('Poll not found'), { code: 'NOT_FOUND' });
  }
  const poll = pollRows[0];

  // Try cache first
  let results;
  let total_votes;
  try {
    const redis = getRedis();
    if (redis) {
      const cached = await redis.get(resultsCacheKey(pollId));
      if (cached) {
        ({ results, total_votes } = JSON.parse(cached));
      }
    }
  } catch (_) { /* non-fatal, fall through */ }

  if (!results) {
    ({ results, total_votes } = await fetchAndCacheResults(pollId));
  }

  // Fetch this user's vote (if any)
  let user_vote = null;
  if (requestingUserId) {
    const { rows: voteRows } = await query(
      'SELECT option_ids FROM hangout_poll_votes WHERE poll_id = $1 AND user_id = $2',
      [pollId, requestingUserId]
    );
    if (voteRows.length > 0) user_vote = voteRows[0].option_ids;
  }

  return { poll, results, total_votes, user_vote };
}

module.exports = { createPoll, votePoll, getPollResults };
