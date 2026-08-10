#!/usr/bin/env node
/**
 * bio-cleanup-competitor-links-2026-08-10.js
 *
 * One-shot backfill (Sprint 1 grandfathering step): wipe existing user bios
 * that reference competitor platforms or off-platform payment methods.
 *
 * Rationale: the anti-leakage detection went live on 2026-08-10. Users whose
 * bios were saved BEFORE that date never had a chance to comply — the plan
 * (agreed with Santino) is a one-time nuke of pre-existing violating bios
 * WITHOUT logging strikes (grandfathering). Once this runs, any future edit
 * that re-introduces the pattern will be blocked at the write path and
 * counted as a strike normally.
 *
 * Usage:
 *   node bio-cleanup-competitor-links-2026-08-10.js            # dry-run (default)
 *   node bio-cleanup-competitor-links-2026-08-10.js --commit   # actually wipe
 *
 * Effects when --commit is set:
 *   1. UPDATE users SET bio = '' WHERE bio matches an anti-leakage pattern.
 *   2. Post summary to Slack #moderation (SLACK_MODERATION_CHANNEL).
 *   3. Log every affected user (id, username, matched terms, redacted excerpt)
 *      to stdout so ops can audit + reach out to individual creators if needed.
 *
 * Effects when dry-run:
 *   1. Same scan + logging; NO database writes; NO Slack post.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.production') });

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const {
  findForbiddenTerms,
  ANTI_LEAKAGE_CATEGORIES,
} = require('../services/contentModerationFilter');

const COMMIT = process.argv.includes('--commit');
const SKIP_DM = process.argv.includes('--skip-dm');
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? parseInt(arg.split('=')[1], 10) : null;
})();

// Grandfather list: user ids Santino explicitly asked us NOT to auto-wipe on
// the 2026-08-10 backfill even though the regex would catch them. Reasons:
//   - Elevenminutos is in an active peer-support program with Santino
//     (project_elevenminutos_program_2026_08_10) — any bio change should
//     come from Santino personally, not an automated sweep.
//   - AlexCst18 + cloudybuthydrated have MIXED bios (X/Twitter allowed +
//     Telegram flagged). The X portion is legit; Santino wants to leave
//     these alone until the "Share Profile" button ships so users have a
//     clean cross-post alternative.
// Ongoing enforcement (future writes) still applies to these users — the
// regex will block them the next time they try to save the same content.
const SKIP_USER_IDS = new Set([
  '1966945732',                                // @Elevenminutos
  '8296896065',                                // @AlexCst18
  'c466c0db-60c4-49ec-9290-4cd96d879627',      // @cloudybuthydrated
]);

// DM warning template. Kept short + in Spanish (matches primary user base;
// Telegram DMs are the delivery channel). Refers to the Anti-Poaching doc
// (Document 7 Section 4.7) so users can read the full policy.
function warningMessageEs(username, matchedTerms) {
  const termList = matchedTerms.map((t) => `"${t.term}"`).join(', ');
  return (
`Hola${username ? ` @${username}` : ''} 👋

Vaciamos tu bio en PNPtv! porque contenía referencias que ya no están permitidas: ${termList}.

Desde el 10 de agosto no se permite promover plataformas externas (OnlyFans, Chaturbate, mewe, motherless, etc.) ni pedir contacto por Telegram/WhatsApp desde tu bio, chat o DMs de PNPtv!.

✅ Sí podés mencionar Instagram / X / TikTok — son canales aliados. Muy pronto vas a tener un botón "Share Profile" para copiar tu link de PNPtv! y postearlo ahí directamente.

📖 Política completa: https://pnptv.app/docs/legal/creator/07-anti-poaching-non-circumvention.md

Podés reescribir tu bio cuando quieras. Si tenés preguntas, respondé este mensaje.

— PNPtv! Trust & Safety`
  );
}

async function sendTelegramWarning(telegramId, username, matchedTerms) {
  const token = process.env.BOT_TOKEN;
  if (!token) return { ok: false, reason: 'no BOT_TOKEN' };
  if (!telegramId) return { ok: false, reason: 'no telegram_id' };
  try {
    const { Telegram } = require('telegraf');
    const tg = new Telegram(token);
    await tg.sendMessage(String(telegramId), warningMessageEs(username, matchedTerms), {
      disable_web_page_preview: true,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function redact(text, terms) {
  let out = text;
  for (const t of terms) {
    if (t.term && t.term.length >= 3) {
      try {
        out = out.replace(
          new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          '█'.repeat(Math.min(t.term.length, 20))
        );
      } catch (_) { /* ignore bad regex chars */ }
    }
  }
  return out.length > 200 ? `${out.slice(0, 197)}...` : out;
}

async function postSummaryToSlack(summary) {
  try {
    const slackOps = require('../services/slackOpsService');
    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_MODERATION_CHANNEL
      || process.env.SLACK_OPS_ADMIN_CHANNEL;
    if (!token || !channel) {
      logger.warn('[bio-cleanup] Slack summary skipped (no token or channel)');
      return;
    }
    const {
      totalScanned, withBio, withHits, wiped, byCategory, sample,
      grandfathered = 0, dmResults = { sent: 0, failed: 0, skipped: 0 },
    } = summary;
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🧹 Bio Anti-Leakage Cleanup — ${COMMIT ? 'COMMITTED' : 'DRY RUN'}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total users:*\n${totalScanned}` },
          { type: 'mrkdwn', text: `*With bio:*\n${withBio}` },
          { type: 'mrkdwn', text: `*Bios with anti-leakage hits:*\n${withHits}` },
          { type: 'mrkdwn', text: `*Bios wiped:*\n${wiped}` },
          { type: 'mrkdwn', text: `*Grandfathered (skip list):*\n${grandfathered}` },
          { type: 'mrkdwn', text: `*DM warnings sent:*\n${dmResults.sent} (failed: ${dmResults.failed})` },
          { type: 'mrkdwn', text: `*Competitor hits:*\n${byCategory.off_platform_competitor || 0}` },
          { type: 'mrkdwn', text: `*Payment hits:*\n${byCategory.off_platform_payment || 0}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Sample (top 5, redacted):*\n${
            sample.length
              ? sample.map((s) => `• @${s.username || s.userId.slice(0, 8)} — [${s.cats.join(',')}] "${s.excerpt}"`).join('\n')
              : '_(none)_'
          }`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: COMMIT
              ? 'Wipe committed. Users with previously-legitimate bios that were caught by false positive can re-write; enforcement now runs on-write.'
              : '_This was a dry run — no changes made. Re-run with `--commit` to apply._',
          },
        ],
      },
    ];
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text: `Bio anti-leakage cleanup — ${COMMIT ? 'committed' : 'dry run'}: ${summary.wiped}/${summary.withHits} bios wiped`,
        blocks,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!data.ok) {
      logger.warn('[bio-cleanup] Slack post failed', { error: data.error });
    }
  } catch (e) {
    logger.warn('[bio-cleanup] Slack post error', { error: e.message });
  }
}

async function main() {
  const modeLabel = COMMIT ? '\x1b[31m*** COMMIT MODE — WILL WIPE BIOS ***\x1b[0m' : '\x1b[33m--- DRY RUN ---\x1b[0m';
  console.log(`\nbio-cleanup-competitor-links-2026-08-10.js  ${modeLabel}\n`);

  const totalRes = await query('SELECT COUNT(*)::int AS n FROM users');
  const withBioRes = await query(`SELECT COUNT(*)::int AS n FROM users WHERE bio IS NOT NULL AND length(trim(bio)) > 0`);
  const totalScanned = totalRes.rows[0].n;
  const withBio = withBioRes.rows[0].n;

  console.log(`Total users: ${totalScanned}`);
  console.log(`Users with non-empty bio: ${withBio}\n`);

  const rowsRes = await query(
    `SELECT id, username, bio
       FROM users
      WHERE bio IS NOT NULL AND length(trim(bio)) > 0
      ORDER BY id
      ${LIMIT ? `LIMIT ${parseInt(LIMIT, 10)}` : ''}`
  );

  // Pull telegram_id too so we can DM warnings on commit
  const idList = rowsRes.rows.map((r) => r.id);
  const contactRes = idList.length ? await query(
    `SELECT id, telegram FROM users WHERE id = ANY($1::varchar[])`,
    [idList]
  ) : { rows: [] };
  const tgById = new Map(contactRes.rows.map((r) => [String(r.id), r.telegram]));

  const hits = [];
  const skipped = [];
  const byCategory = { off_platform_competitor: 0, off_platform_payment: 0 };

  for (const r of rowsRes.rows) {
    const allHits = findForbiddenTerms(r.bio);
    const leakageHits = allHits.filter((h) => ANTI_LEAKAGE_CATEGORIES.has(h.category));
    if (leakageHits.length === 0) continue;
    const cats = [...new Set(leakageHits.map((h) => h.category))];
    for (const c of cats) byCategory[c] = (byCategory[c] || 0) + 1;
    const terms = leakageHits.map((h) => ({ category: h.category, term: h.term }));
    const record = {
      userId: r.id,
      username: r.username,
      telegramId: tgById.get(String(r.id)) || null,
      cats,
      terms,
      original: r.bio,
      excerpt: redact(r.bio, terms),
    };
    if (SKIP_USER_IDS.has(r.id)) {
      skipped.push(record);
    } else {
      hits.push(record);
    }
  }

  console.log(`Bios matching anti-leakage patterns: ${hits.length + skipped.length}`);
  console.log(`  → to wipe: ${hits.length}`);
  console.log(`  → grandfathered (SKIP_USER_IDS): ${skipped.length}\n`);

  // Per-user log — wipe candidates
  for (const h of hits) {
    const termList = h.terms.map((t) => `${t.category}:"${t.term}"`).join(', ');
    console.log(`  [WIPE] @${h.username || h.userId.slice(0, 8)} [${h.userId}] tg=${h.telegramId || '-'} — ${termList}`);
    console.log(`      excerpt: ${h.excerpt}`);
  }
  for (const h of skipped) {
    console.log(`  [SKIP] @${h.username || h.userId.slice(0, 8)} [${h.userId}] — grandfathered`);
  }
  console.log();

  let wiped = 0;
  const dmResults = { sent: 0, failed: 0, skipped: 0, errors: [] };

  if (COMMIT && hits.length > 0) {
    console.log(`Wiping ${hits.length} bios + sending DM warnings...\n`);
    for (const h of hits) {
      const upd = await query(
        `UPDATE users SET bio = '' WHERE id = $1 AND bio = $2`,
        [h.userId, h.original]
      );
      const rc = upd.rowCount || 0;
      wiped += rc;
      if (rc === 0) {
        console.log(`  ⚠ @${h.username || h.userId} — bio changed between scan and write, skipped`);
        continue;
      }

      if (SKIP_DM) {
        dmResults.skipped++;
        console.log(`  ✓ @${h.username || h.userId} — bio wiped (DM skipped by flag)`);
        continue;
      }
      const dm = await sendTelegramWarning(h.telegramId, h.username, h.terms);
      if (dm.ok) {
        dmResults.sent++;
        console.log(`  ✓ @${h.username || h.userId} — bio wiped + DM sent`);
      } else {
        dmResults.failed++;
        dmResults.errors.push({ username: h.username, userId: h.userId, reason: dm.reason });
        console.log(`  ⚠ @${h.username || h.userId} — bio wiped but DM failed: ${dm.reason}`);
      }
      // Polite pacing so Telegram doesn't rate-limit us
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(`\nWiped ${wiped} bios. DMs sent=${dmResults.sent} failed=${dmResults.failed} skipped=${dmResults.skipped}\n`);
  } else if (!COMMIT && hits.length > 0) {
    console.log(`Would wipe ${hits.length} bios + DM ${hits.filter((h) => h.telegramId).length} of them via Telegram.`);
    console.log(`Re-run with --commit to apply.\n`);
  }

  await postSummaryToSlack({
    totalScanned,
    withBio,
    withHits: hits.length + skipped.length,
    wiped,
    byCategory,
    sample: hits.slice(0, 5),
    grandfathered: skipped.length,
    dmResults,
  });

  console.log(`\n✓ done — ${COMMIT ? 'wiped' : 'would wipe'} ${COMMIT ? wiped : hits.length} of ${withBio} bios (${skipped.length} grandfathered, ${dmResults.sent} DMs sent)`);
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
