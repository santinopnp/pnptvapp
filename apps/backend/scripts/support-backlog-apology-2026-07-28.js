#!/usr/bin/env node
'use strict';

/**
 * support-backlog-apology-2026-07-28.js
 *
 * Clears the Cristina support backlog:
 * - 191 users whose last message is unanswered by staff.
 * - Classifies each open ticket via Grok as MEMBERSHIP / REFUND_COMPLAINT / OTHER.
 * - For MEMBERSHIP without active PRIME: grants 28 days of PRIME (grant_source
 *   tagged 'support-backlog-apology-2026-07-28' for idempotency + audit).
 * - Posts an in-thread reply from "PNPtv Support" apologizing for the delay.
 * - Never DMs the user (per feedback_dm_sales_only.md — support replies stay in
 *   the ticket thread).
 * - Idempotent: skips users who already got a grant tagged with this batch.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/support-backlog-apology-2026-07-28.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/support-backlog-apology-2026-07-28.js
 */

const path = require('path');
const fs = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { chat: grokChat } = require(path.join(BACKEND, 'services/grokService'));

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_TAG = 'support-backlog-apology-2026-07-28';
const GRANT_DAYS = 28;
const GROK_CONCURRENCY = 3;
const REPLY_DELAY_MS = 150;

const REPORT_PATH = `/tmp/${BATCH_TAG}${DRY_RUN ? '-dryrun' : ''}.csv`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Reply copy ───────────────────────────────────────────────────────────────

function replyText(name, lang, granted) {
  const es = typeof lang === 'string' && lang.toLowerCase().startsWith('es');
  const n = name ? `, ${name}` : '';

  if (es) {
    return granted
      ? `Hola${n} — perdón por la demora en responderte. Hemos estado con poco personal ` +
        `y este mes estamos trabajando en ponernos al día con la cola de soporte.\n\n` +
        `Como agradecimiento por tu paciencia te acabamos de agregar **4 semanas de PRIME** en tu cuenta. ` +
        `Ya está activo — puedes verlo en https://pnptv.app/plans\n\n` +
        `Vamos a revisar tu mensaje original y te respondemos en específico en los próximos días. ` +
        `Gracias por seguir con nosotros. 🖤\n\n— Equipo PNPtv`
      : `Hola${n} — perdón por la demora en responderte. Hemos estado con poco personal ` +
        `y este mes estamos trabajando en ponernos al día con la cola de soporte.\n\n` +
        `Vemos que ya tienes PRIME activo — gracias por tu paciencia. Vamos a revisar tu mensaje ` +
        `original y te respondemos en específico en los próximos días.\n\n` +
        `Gracias por seguir con nosotros. 🖤\n\n— Equipo PNPtv`;
  }

  return granted
    ? `Hi${n} — sorry for the slow reply. We've been short-staffed and are working ` +
      `through the support backlog this month.\n\n` +
      `As a thank-you for your patience we've just added **4 weeks of PRIME** to your account. ` +
      `It's already active — you can see it at https://pnptv.app/plans\n\n` +
      `We'll review your original message and follow up specifically in the next few days. ` +
      `Thanks for sticking with us. 🖤\n\n— PNPtv Team`
    : `Hi${n} — sorry for the slow reply. We've been short-staffed and are working ` +
      `through the support backlog this month.\n\n` +
      `We can see you already have PRIME active — thanks for your patience. We'll review ` +
      `your original message and follow up specifically in the next few days.\n\n` +
      `Thanks for sticking with us. 🖤\n\n— PNPtv Team`;
}

// ── Grok classifier ──────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM = `You are a support ticket classifier. Read the user's last unanswered message and any thread context, then output EXACTLY one word — no explanation, no punctuation:

MEMBERSHIP — anything about their subscription, PRIME, member, plans, payment activation, "I paid but…", access to prime features, membership renewal, payment success confirmation, upgrade/downgrade.

REFUND_COMPLAINT — they are asking for a refund, disputing a charge, saying they were charged twice, want their money back, or complaining about being wrongly billed.

OTHER — everything else: technical bugs, feature questions, content moderation, account/login issues, creator support, hangouts, streams, video playback, general questions.

If in doubt between MEMBERSHIP and OTHER, prefer MEMBERSHIP. If in doubt between MEMBERSHIP and REFUND_COMPLAINT, prefer REFUND_COMPLAINT (safer — do not auto-grant).`;

async function classify(threadText) {
  try {
    const out = await grokChat({
      mode: 'broadcast',
      language: 'English',
      prompt: threadText,
      maxTokens: 8,
      systemOverride: CLASSIFIER_SYSTEM,
    });
    const label = String(out || '').trim().toUpperCase().replace(/[^A-Z_]/g, '');
    if (label === 'MEMBERSHIP' || label === 'REFUND_COMPLAINT' || label === 'OTHER') {
      return label;
    }
    return 'OTHER';
  } catch (err) {
    return `ERROR:${err.message.slice(0, 60)}`;
  }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

async function loadOpenTickets() {
  const { rows } = await query(`
    WITH last_msg AS (
      SELECT DISTINCT ON (user_id) user_id, sender_type, content, created_at
      FROM support_ticket_messages
      ORDER BY user_id, created_at DESC
    )
    SELECT lm.user_id, lm.content AS last_content, lm.created_at AS last_at,
           u.first_name, u.language
    FROM last_msg lm
    LEFT JOIN users u ON u.id = lm.user_id
    WHERE lm.sender_type = 'user'
    ORDER BY lm.created_at ASC
  `);
  return rows;
}

async function loadThread(userId, sinceIso) {
  const { rows } = await query(
    `SELECT sender_type, content, created_at
       FROM support_ticket_messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 6`,
    [userId],
  );
  return rows.reverse().map(r => `[${r.sender_type}] ${String(r.content || '').slice(0, 500)}`).join('\n');
}

async function hasActivePrime(userId) {
  const { rows } = await query(
    `SELECT 1
       FROM user_entitlements
      WHERE user_id = $1
        AND add_on_id IN ('prime', 'pnp-member')
        AND (is_lifetime = true OR expires_at > NOW())
      LIMIT 1`,
    [String(userId)],
  );
  return rows.length > 0;
}

async function alreadyProcessed(userId) {
  const { rows } = await query(
    `SELECT 1
       FROM user_entitlements
      WHERE user_id = $1 AND grant_source = $2
      LIMIT 1`,
    [String(userId), BATCH_TAG],
  );
  return rows.length > 0;
}

async function grantPrime(userId) {
  await query(
    `INSERT INTO user_entitlements
       (user_id, add_on_id, is_lifetime, expires_at, auto_renew, grant_source)
     VALUES
       ($1, 'prime', false, NOW() + ($2 || ' days')::interval, false, $3)
     ON CONFLICT (user_id, add_on_id, creator_id) WHERE creator_id IS NULL
     DO UPDATE SET
       expires_at = CASE
         WHEN user_entitlements.is_lifetime THEN user_entitlements.expires_at
         WHEN user_entitlements.expires_at IS NOT NULL AND user_entitlements.expires_at > NOW()
           THEN GREATEST(user_entitlements.expires_at, EXCLUDED.expires_at)
         ELSE EXCLUDED.expires_at
       END,
       is_consumed = false,
       updated_at = NOW(),
       grant_source = CASE
         WHEN user_entitlements.source_payment_id IS NOT NULL
           OR user_entitlements.stripe_subscription_id IS NOT NULL
           OR user_entitlements.source_plan_id IS NOT NULL
         THEN user_entitlements.grant_source
         ELSE EXCLUDED.grant_source
       END
     WHERE NOT user_entitlements.is_lifetime`,
    [String(userId), String(GRANT_DAYS), BATCH_TAG],
  );

  await query(
    `INSERT INTO payment_audit_log (user_id, event_type, status, details)
     VALUES ($1, 'entitlement_grant', 'completed', $2::jsonb)`,
    [
      String(userId),
      JSON.stringify({
        batch: BATCH_TAG,
        addOnId: 'prime',
        durationDays: GRANT_DAYS,
        reason: 'support backlog apology',
      }),
    ],
  );
}

async function postReply(userId, text) {
  const { rows } = await query(
    `INSERT INTO support_ticket_messages (user_id, sender_type, sender_name, content)
     VALUES ($1, 'agent', 'PNPtv Support', $2)
     RETURNING id, created_at`,
    [String(userId), text],
  );
  return rows[0];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const startedAt = Date.now();
  console.log(`\n[${BATCH_TAG}] mode=${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log('Loading open tickets…');
  const tickets = await loadOpenTickets();
  console.log(`Found ${tickets.length} users with unanswered last message.`);

  const rows = [];
  let idx = 0;
  const workers = new Array(GROK_CONCURRENCY).fill(0).map(async () => {
    while (idx < tickets.length) {
      const i = idx++;
      const t = tickets[i];
      const thread = await loadThread(t.user_id);
      const label = await classify(thread);
      const activePrime = await hasActivePrime(t.user_id);
      const processed = await alreadyProcessed(t.user_id);

      let action;
      if (processed) action = 'SKIP_ALREADY_PROCESSED';
      else if (label === 'MEMBERSHIP' && !activePrime) action = 'GRANT_AND_REPLY';
      else if (label === 'MEMBERSHIP' && activePrime) action = 'REPLY_ONLY';
      else if (label === 'REFUND_COMPLAINT') action = 'SKIP_REFUND_FLAG_MANUAL';
      else action = 'SKIP_OTHER';

      rows.push({
        user_id: t.user_id,
        first_name: t.first_name || '',
        language: t.language || 'en',
        last_at: t.last_at.toISOString(),
        last_snippet: String(t.last_content || '').replace(/[\r\n"]/g, ' ').slice(0, 160),
        label,
        active_prime: activePrime,
        already_processed: processed,
        action,
      });

      if ((i + 1) % 20 === 0) console.log(`  progress: ${i + 1}/${tickets.length}`);
    }
  });
  await Promise.all(workers);

  rows.sort((a, b) => a.last_at.localeCompare(b.last_at));

  const header = 'user_id,first_name,language,last_at,label,active_prime,already_processed,action,last_snippet';
  const csv = [header].concat(rows.map(r =>
    [r.user_id, r.first_name, r.language, r.last_at, r.label, r.active_prime, r.already_processed, r.action,
      `"${r.last_snippet.replace(/"/g, "'")}"`].join(',')
  )).join('\n');
  fs.writeFileSync(REPORT_PATH, csv);
  console.log(`\nCSV report written to ${REPORT_PATH}`);

  const summary = rows.reduce((acc, r) => { acc[r.action] = (acc[r.action] || 0) + 1; return acc; }, {});
  console.log('\nSummary:');
  Object.entries(summary).sort().forEach(([k, v]) => console.log(`  ${k.padEnd(28)} ${v}`));

  if (DRY_RUN) {
    console.log('\nDry-run complete. Re-run without --dry-run to execute.');
    process.exit(0);
  }

  console.log('\nExecuting actions…');
  let granted = 0, replied = 0, failed = 0, socketEmits = 0;

  let io = null;
  try { io = require(path.join(BACKEND, 'services/socketSingleton')).get(); } catch {}

  for (const r of rows) {
    if (r.action !== 'GRANT_AND_REPLY' && r.action !== 'REPLY_ONLY') continue;

    try {
      const grantThisOne = r.action === 'GRANT_AND_REPLY';
      if (grantThisOne) { await grantPrime(r.user_id); granted++; }

      const text = replyText(r.first_name, r.language, grantThisOne);
      const saved = await postReply(r.user_id, text);
      replied++;

      if (io && saved) {
        try {
          io.to(`user:${r.user_id}`).emit('support:newMessage', {
            id: saved.id,
            sender_type: 'agent',
            sender_name: 'PNPtv Support',
            content: text,
            created_at: (saved.created_at || new Date()).toISOString(),
          });
          socketEmits++;
        } catch {}
      }

      await sleep(REPLY_DELAY_MS);
    } catch (err) {
      failed++;
      console.error(`  fail user=${r.user_id} action=${r.action} error=${err.message}`);
    }
  }

  console.log(`\nDone. granted=${granted} replied=${replied} socketEmits=${socketEmits} failed=${failed}`);
  console.log(`Elapsed: ${Math.round((Date.now() - startedAt) / 1000)}s`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL', err);
  process.exit(1);
});
