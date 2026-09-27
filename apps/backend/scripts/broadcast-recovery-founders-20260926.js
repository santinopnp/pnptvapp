#!/usr/bin/env node
'use strict';

/**
 * broadcast-recovery-founders-20260926.js
 *
 * Recovery DM to the 3 users who started a lifetime-pass checkout today
 * but whose NowPayments invoices expired before they could pay.
 *
 * Directs them to /founders for a fresh checkout at the current $99.99 price.
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-recovery-founders-20260926.js --dry-run
 *
 * Live: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY_RUN   = process.argv.includes('--dry-run');
const BATCH_ID  = 'recovery-founders-expired-20260926';
const SENDER_ID = '8599671840'; // Santino
const CTA_URL   = 'https://pnptv.app/founders';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function dmText(lang) {
  if (lang === 'es') {
    return `🖤 *Hola — link expirado, está listo de nuevo*

Santino aquí. Empezaste el checkout para la Membresía Founders hoy, pero el link de pago venció antes de que pudieras completarlo.

No pasa nada — aquí está fresco:
👉 ${CTA_URL}

*$99.99 · pago único · sin suscripción.*
Membresía de por vida + 18 meses PRIME incluidos.

— Santino`;
  }
  return `🖤 *Hey — your checkout link expired, here's a fresh one*

Santino here. You started the Founders Lifetime checkout today, but the payment link expired before you could complete it.

No worries — here it is fresh:
👉 ${CTA_URL}

*$99.99 · one-time · no subscription.*
Lifetime membership + 18 months of PRIME included.

— Santino`;
}

async function main() {
  await initializePostgres();

  // Pull all users who have a pending lifetime-pass order from today
  const { rows: targets } = await query(`
    SELECT DISTINCT
      u.id,
      u.telegram,
      u.username,
      CASE WHEN LOWER(u.language) = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM dash_subscription_orders dso
    JOIN users u ON u.id = dso.user_id
    WHERE dso.plan_id = 'lifetime-pass'
      AND dso.status = 'pending'
      AND dso.created_at > NOW() - INTERVAL '24 hours'
      AND u.id != 'support@pnptv.app'
      AND COALESCE(u.tier, 'free') != 'banned'
  `);

  // Always include Santino for verification
  if (!targets.some(u => u.id === SENDER_ID)) {
    targets.unshift({ id: SENDER_ID, telegram: SENDER_ID, username: 'pnptv', lang: 'en' });
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Founders recovery → /founders');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Targets   : ${targets.length} users`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── Users ──');
    targets.forEach(u => console.log(`  ${u.id} (@${u.username}) [${u.lang}]`));
    console.log('\n── EN sample ──\n');
    console.log(dmText('en'));
    console.log('\n── ES sample ──\n');
    console.log(dmText('es'));
    console.log('\n-- DRY RUN complete --\n');
    process.exit(0);
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const u of targets) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { console.log(`  skip ${u.id} (already sent)`); skipped++; continue; }

    try {
      await sendSystemDM(SENDER_ID, u.id, dmText(u.lang), query);
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      console.log(`  ✓ sent to ${u.id} (@${u.username}) [${u.lang}]`);
      sent++;
    } catch (err) {
      console.error(`  ✗ ${u.id}: ${err.message}`);
      errors++;
    }
    await sleep(400);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Sent    : ${sent}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
