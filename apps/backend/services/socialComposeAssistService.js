'use strict';

/**
 * socialComposeAssistService.js
 *
 * PNPtv Creator Copy Coach — LLM-powered post composition assistant.
 * Uses the Anthropic SDK to turn a raw creator idea into 3 voice-matched
 * post variants with hashtags and CTAs.
 *
 * Rate limits:
 *   - 10 requests / minute / user  (Redis key: compose:minute:<userId>)
 *   - 100 requests / day / user    (Redis key: compose:day:<userId>)
 */

const { query } = require('../config/postgres');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

// Warn at startup if the Anthropic key is absent so ops can spot it immediately.
if (!process.env.ANTHROPIC_API_KEY) {
  logger.warn('socialComposeAssistService: ANTHROPIC_API_KEY is not set — /compose-assist will return 503');
}

// Rate limit helpers
const MINUTE_TTL = 60;
const DAY_TTL = 86400;
const MINUTE_LIMIT = 10;
const DAY_LIMIT = 100;

async function checkRateLimit(userId) {
  const minKey = `compose:minute:${userId}`;
  const dayKey = `compose:day:${userId}`;

  const [minRaw, dayRaw] = await Promise.all([
    cache.get(minKey),
    cache.get(dayKey),
  ]);

  const minCount = parseInt(minRaw || '0', 10);
  const dayCount = parseInt(dayRaw || '0', 10);

  if (minCount >= MINUTE_LIMIT) return { blocked: true, reason: 'rate_limit_minute' };
  if (dayCount >= DAY_LIMIT) return { blocked: true, reason: 'rate_limit_day' };

  // Increment both counters
  await Promise.all([
    cache.set(minKey, minCount + 1, MINUTE_TTL),
    cache.set(dayKey, dayCount + 1, DAY_TTL),
  ]);

  return { blocked: false };
}

// The verbatim Creator Copy Coach system prompt
const SYSTEM_PROMPT = `You are the PNPtv Creator Copy Coach. You help creators on PNPtv (queer PnP community platform) turn a raw idea into a scroll-stopping social post in their OWN voice.

HARD RULES (never violate):
1. Reply ONLY in the audience_language. If es, write in natural Latin-American Spanish — no translator stiffness.
2. NEVER mention payment brand names (Stripe, MercadoPago, Nequi, Wompi, ePayco, Daimo, BTCPay, MoonPay, Meru). Say "pay with card" or "pay with crypto" instead.
3. NEVER promise results, cures, highs, or safety outcomes.
4. NEVER include: minors, non-consent, bug-chasing, IV drug use, firearms sales, external platform links (OnlyFans, Fansly, Chaturbate, Linktree), external payment handles (Cash App, Venmo, raw wallet addrs), or "DM me on Telegram".
5. Respect PNPtv harm-reduction tone — never glamorize unsafe use.
6. Lead with DESIRE, never fear.
7. Match the creator's voice from voice_samples. If voice_samples is empty, default to warm/direct/confident, no corporate copy.
8. Say "Ru$h 💎" (never "tokens") when referring to the on-platform currency.

OUTPUT FORMAT (always this exact JSON, no prose outside):
{
  "variants": [
    { "label": "short_punch", "hook": "...", "body": "...", "cta": "...", "full": "hook\\n\\nbody\\n\\ncta", "hashtags": ["#tag1","#tag2"], "emoji_rationale": "..." },
    { "label": "medium_story", ... },
    { "label": "long_tease", ... }
  ],
  "voice_match_notes": "1 sentence",
  "safety_notes": "any content I softened and why, or 'clean'"
}

STRUCTURE: HOOK (line 1, sensory/specific) → BODY (1-3 lines, one real detail) → CTA (one action only).

CTA LIBRARY by post_goal:
- hype_drop → "new drop. tap in."
- tease_exclusive → "full version is in my prime."
- event_invite → "catch me live [when]."
- personal_update → soft "say hi below" or no CTA.
- nsfw_tease → "see the uncut version in prime."
- call_to_tip → "if this made you feel something, send Ru$h 💎."
- flash_sale → "48h window. don't sleep."
- replies_bait → end with a question.

NEVER produce more than 3 variants. NEVER explain reasoning in prose. If raw_idea itself violates HARD RULES, return {"error":"content_blocked","reason":"<category>"} and stop.`;

/**
 * Build the user-turn message from the resolved creator context + request params.
 */
function buildUserMessage({ handle, tier, lang, audienceLanguage, goal, mediaAttached, rawIdea, voiceSamples }) {
  const samplesText = (voiceSamples || [])
    .map((s, i) => (i === 0 ? s : `---\n${s}`))
    .join('\n');

  return [
    `creator_handle: ${handle || 'unknown'}`,
    `creator_tier: ${tier || 'free'}`,
    `creator_language: ${lang || 'en'}`,
    `audience_language: ${audienceLanguage || lang || 'en'}`,
    `post_goal: ${goal || 'personal_update'}`,
    `media_attached: ${mediaAttached ? 'yes' : 'no'}`,
    `raw_idea: ${rawIdea}`,
    `voice_samples:`,
    samplesText || '(none)',
  ].join('\n');
}

/**
 * Main entry point.
 *
 * @param {string|number} userId
 * @param {object} opts
 * @param {string}  opts.rawIdea
 * @param {string}  [opts.postGoal]
 * @param {boolean} [opts.mediaAttached]
 * @param {string}  [opts.audienceLanguage]
 * @param {boolean} [opts.regenerate]  - true → use Sonnet (higher quality, slower)
 * @returns {Promise<object>}  The parsed JSON from the LLM, or an error object.
 */
async function assist(userId, { rawIdea, postGoal, mediaAttached, audienceLanguage, regenerate }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'service_unavailable', reason: 'ANTHROPIC_API_KEY not configured' };
  }

  if (!rawIdea || typeof rawIdea !== 'string' || !rawIdea.trim()) {
    return { error: 'invalid_input', reason: 'raw_idea is required' };
  }

  // Rate limit check
  const limit = await checkRateLimit(userId);
  if (limit.blocked) return { error: 'rate_limited', reason: limit.reason };

  // Fetch creator context
  let handle = 'creator';
  let tier = 'free';
  let lang = 'en';
  let voiceSamples = [];

  try {
    const { rows: userRows } = await query(
      `SELECT username, tier, language FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (userRows[0]) {
      handle = userRows[0].username || 'creator';
      tier = userRows[0].tier || 'free';
      lang = userRows[0].language || 'en';
    }

    const { rows: postRows } = await query(
      `SELECT content FROM social_posts
        WHERE user_id = $1
          AND is_deleted = false
          AND content IS NOT NULL
          AND LENGTH(TRIM(content)) > 0
        ORDER BY created_at DESC
        LIMIT 5`,
      [userId]
    );
    voiceSamples = postRows.map(r => (r.content || '').trim().slice(0, 280));
  } catch (err) {
    logger.warn('socialComposeAssistService: DB fetch failed, continuing with defaults', { userId, error: err.message });
  }

  const model = regenerate
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001';

  const userMessage = buildUserMessage({
    handle,
    tier,
    lang,
    audienceLanguage: audienceLanguage || lang,
    goal: postGoal,
    mediaAttached: !!mediaAttached,
    rawIdea: rawIdea.trim(),
    voiceSamples,
  });

  // Lazy-load Anthropic SDK so the module doesn't crash the whole process if
  // the package is missing from a legacy deploy.
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch (_) {
    logger.error('socialComposeAssistService: @anthropic-ai/sdk not installed');
    return { error: 'service_unavailable', reason: 'Anthropic SDK not installed' };
  }

  const client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rawText;
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    rawText = message.content?.[0]?.text || '';
  } catch (err) {
    logger.error('socialComposeAssistService: Anthropic API error', { userId, error: err.message });
    return { error: 'llm_error', reason: err.message };
  }

  // Parse the JSON response
  try {
    // The model should return pure JSON; strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch (_) {
    logger.warn('socialComposeAssistService: failed to parse LLM JSON', { rawText: rawText.slice(0, 200) });
    return { error: 'parse_error', reason: 'LLM returned non-JSON output', raw: rawText.slice(0, 500) };
  }
}

module.exports = { assist, checkRateLimit };
