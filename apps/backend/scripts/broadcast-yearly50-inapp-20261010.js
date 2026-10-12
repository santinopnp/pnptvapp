#!/usr/bin/env node
'use strict';

/**
 * broadcast-yearly50-inapp-20261010.js
 *
 * Mass in-app DM to all non-PRIME users promoting the $50/year PRIME plan.
 *
 * Audience : all non-PRIME, non-banned, non-deleted users (≈10 891)
 *            + Santino force-included first for QA
 * Channel  : in-app DM only (no TG, no email)
 * Sender   : Santino (8599671840)
 * Dedup    : broadcast_dedup LIKE 'yearly50-inapp-20261010%'
 *
 * Dry run:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-yearly50-inapp-20261010.js --dry-run
 *
 * Live (remove --dry-run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-yearly50-inapp-20261010.js
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

const CAMPAIGN   = 'yearly50-inapp-20261012';
const SANTINO_ID = '8599671840';
const SENDER_ID  = '8552451957'; // @pnptv / PNPtv! News
const VIDEO_URL  = 'https://pnptv.app/uploads/092902_promo_yearly50.mp4';
const CTA_URL    = 'https://pnptv.app/yearly50';

const DM_DELAY_MS = 80;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || null;
}

function dmText(lang, name) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `💎 Ey${n} — un año completo de PRIME, por $50.\n\n` +
      `El contenido exclusivo más hot, Prime Channel, shows en vivo y sesiones privadas con tus creadores favoritos — todo desbloqueado por 12 meses con un solo pago.\n\n` +
      `✅ Acceso inmediato a todo el contenido PRIME\n` +
      `✅ Prime Channel + shows en vivo exclusivos\n` +
      `✅ Sesiones privadas, sin límites\n` +
      `✅ Un solo pago. Sin cobros recurrentes.\n\n` +
      `👉 ${CTA_URL}\n\n` +
      `— PNPtv!`
    );
  }
  return (
    `💎 Hey${n} — a full year of PRIME, for $50.\n\n` +
    `The hottest exclusive content, Prime Channel, live shows, and private sessions with your favorite creators — all unlocked for 12 months with a single payment.\n\n` +
    `✅ Instant access to all PRIME content\n` +
    `✅ Prime Channel + exclusive live shows\n` +
    `✅ Private sessions, no limits\n` +
    `✅ One payment. No recurring charges.\n\n` +
    `👉 ${CTA_URL}\n\n` +
    `— PNPtv!`
  );
}

async function main() {
  await initializePostgres();

  // Audience: all non-PRIME, non-banned, non-deleted users
  const { rows: audience } = await query(`
    SELECT id, username, first_name,
           CASE WHEN LOWER(COALESCE(language,'en')) LIKE 'es%' THEN 'es' ELSE 'en' END AS lang
    FROM users
    WHERE COALESCE(is_deleted, false) = false
      AND UPPER(COALESCE(tier,'free')) NOT IN ('PRIME','BANNED')
    ORDER BY id
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `);

  // Force-include Santino first for QA
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
  console.log('  PNPtv! — PRIME Annual $50 — In-App Mass DM — 2026-10-12');
  console.log(`  Audience  : ${targets.length} users`);
  console.log(`  EN        : ${targets.length - esCount}  |  ES : ${esCount}`);
  console.log(`  Campaign  : ${CAMPAIGN}`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    const sample = targets.slice(0, 2);
    for (const u of sample) {
      const name = pickName(u);
      console.log(`  [${u.id}] ${u.username || ''} (${u.lang})`);
      console.log(dmText(u.lang, name));
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

    const name = pickName(u);
    try {
      await sendSystemDM(
        SENDER_ID,
        String(u.id),
        dmText(u.lang, name),
        query,
        { mediaUrl: VIDEO_URL, mediaType: 'video' }
      );
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [CAMPAIGN, u.id]
      );
      sent++;
      if (sent % 500 === 0) console.log(`  … ${sent} sent`);
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
