'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const grokService = require('./grokService');

const MAX_LEN = 5000;

const MANUAL_SYSTEM_PROMPT = `You are a copywriter for a queer PNP adult subscription platform (PNPtv). All performers are professional adult entertainers of legal age (21+). Audience: verified subscribers 18+.

Your job: draft a creator's "User Manual" — a friendly, honest overview a subscriber sees before booking. Think of it as "how to interact with me, what I offer, what I won't do."

Structure (markdown headings):
## About me
2-3 short sentences. Vibe, what makes a session with me memorable.

## What I offer
Bulleted list of formats (calls, hangouts, streams, custom content) with rough duration or price hints if provided.

## Boundaries
Bulleted list of hard "no"s and soft preferences. Keep it neutral and confident, not lecturing.

## How to book
Short steps — Subscribe / DM / Book a call — using the platform's actual flow.

## Best times to catch me
Timezone + rough windows if provided.

Rules:
- Under 400 words total.
- Warm, direct, sex-positive but not graphic.
- Never spell out anatomy.
- Community slang stays natural when it fits (pig, raw, breeding, slam, clouds, spun) — don't force it.
- Keep it markdown-clean: only ## headings, - bullets, plain paragraphs. No bold, italic, links, tables, code.
- Output ONLY the manual. No preamble, no "here's your manual".`;

async function generateManualSuggestion(userId) {
  const { rows } = await query(
    `SELECT username, first_name, city, country,
            creator_type, creator_price_usd,
            timezone, bio
       FROM users
      WHERE id = $1`,
    [userId]
  );
  if (!rows.length) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const u = rows[0];
  const seed = [
    u.first_name ? `Name: ${u.first_name}` : null,
    u.username ? `Handle: @${u.username}` : null,
    u.creator_type ? `Creator type: ${u.creator_type}` : null,
    u.creator_price_usd != null ? `Subscription price: $${u.creator_price_usd}/mo` : null,
    u.city || u.country ? `Location: ${[u.city, u.country].filter(Boolean).join(', ')}` : null,
    u.timezone ? `Timezone: ${u.timezone}` : null,
    u.bio ? `Current bio: ${u.bio}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `Draft a User Manual for this creator:\n\n${seed || '(No context — write a generic template the creator can fill in.)'}`;

  const markdown = await grokService.chat({
    mode: 'videoDescription',
    language: 'English',
    prompt,
    maxTokens: 700,
    systemOverride: MANUAL_SYSTEM_PROMPT,
  });
  return String(markdown || '').trim().slice(0, MAX_LEN);
}

async function saveManual(userId, markdown) {
  const clean = String(markdown || '').trim();
  if (clean.length > MAX_LEN) {
    const err = new Error(`Manual too long (max ${MAX_LEN} chars)`);
    err.status = 400;
    throw err;
  }
  await query(
    `UPDATE users
        SET user_manual_markdown = $2,
            user_manual_updated_at = NOW()
      WHERE id = $1`,
    [userId, clean || null]
  );
  logger.info('[creatorManualService] saved manual', { userId, len: clean.length });
  return { markdown: clean, updatedAt: new Date().toISOString() };
}

async function getManual(userId) {
  const { rows } = await query(
    `SELECT user_manual_markdown AS markdown,
            user_manual_updated_at AS updated_at
       FROM users
      WHERE id = $1`,
    [userId]
  );
  if (!rows.length) return null;
  return {
    markdown: rows[0].markdown || '',
    updatedAt: rows[0].updated_at,
  };
}

module.exports = {
  generateManualSuggestion,
  saveManual,
  getManual,
  MAX_LEN,
};
