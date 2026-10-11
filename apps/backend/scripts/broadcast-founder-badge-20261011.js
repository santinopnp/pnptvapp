#!/usr/bin/env node
'use strict';

/**
 * broadcast-founder-badge-20261011.js
 *
 * Inform all Founder badge holders that their badge is now live on their profile.
 *
 * Audience : users WHERE 'founder' = ANY(badges)  (~273)
 *            + Santino force-included first for QA
 * Channel  : in-app DM only
 * Sender   : PNPtv system (8552451957)
 * Dedup    : broadcast_dedup LIKE 'founder-badge-announce-20261011%'
 *
 * Dry run:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-founder-badge-20261011.js --dry-run
 *
 * Live:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-founder-badge-20261011.js
 */

const path = require('path');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/dotenv'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

const CAMPAIGN      = 'founder-badge-announce-20261011';
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

const DM_DELAY_MS = 80;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function dmText(lang) {
  if (isEs(lang)) {
    return (
      `💎 Eres Founder.\n\n` +
      `Tu pase de por vida te acaba de dar la insignia Founder — ya visible en tu perfil.\n\n` +
      `Llegaste antes que casi todos. Eso significa algo para nosotros.\n\n` +
      `— PNPtv`
    );
  }
  return (
    `💎 You're a Founder.\n\n` +
    `Your lifetime pass just earned you the Founder badge — now live on your profile.\n\n` +
    `You were here before most. That means something to us.\n\n` +
    `— PNPtv`
  );
}

async function main() {
  await initializePostgres();

  const { rows: audience } = await query(`
    SELECT id, username, first_name,
           CASE WHEN LOWER(COALESCE(language,'en')) LIKE 'es%' THEN 'es' ELSE 'en' END AS lang
    FROM users
    WHERE 'founder' = ANY(COALESCE(badges, '{}'))
      AND COALESCE(is_deleted, false) = false
    ORDER BY id
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `);

  const targets = [...audience];
  if (!targets.some(u => String(u.id) === SANTINO_ID)) {
    const { rows: s } = await query(
      `SELECT id, username, first_name,
              CASE WHEN LOWER(COALESCE(language,'en')) LIKE 'es%' THEN 'es' ELSE 'en' END AS lang
       FROM users WHERE id::text = $1`, [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  const esCount = targets.filter(t => t.lang === 'es').length;

  console.log('══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — Founder Badge Announcement — 2026-10-11');
  console.log(`  Audience  : ${targets.length} users`);
  console.log(`  EN        : ${targets.length - esCount}  |  ES : ${esCount}`);
  console.log(`  Campaign  : ${CAMPAIGN}`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    for (const u of targets.slice(0, 2)) {
      console.log(`  [${u.id}] ${u.username || ''} (${u.lang})`);
      console.log(dmText(u.lang));
      console.log('');
    }
    console.log(`  DRY RUN — would DM ${targets.length} users. Remove --dry-run to send.\n`);
    process.exit(0);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const u of targets) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [CAMPAIGN + '%', u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    try {
      await sendSystemDM(SYSTEM_SENDER, String(u.id), dmText(u.lang), query);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [CAMPAIGN, u.id]
      );
      sent++;
      if (sent % 100 === 0) console.log(`  … ${sent} sent`);
    } catch (err) {
      console.error(`  ✗ ${u.id} ${u.username || ''}: ${err.message}`);
      failed++;
    }
    await sleep(DM_DELAY_MS);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Sent    : ${sent}`);
  console.log(`  Failed  : ${failed}`);
  console.log(`  Skipped : ${skipped}`);
  console.log('══════════════════════════════════════════════════════════════\n');
  process.exit(failed > 50 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
