#!/usr/bin/env node
'use strict';

/**
 * broadcast-lex-available-now-2026-08-02.js
 *
 * In-app DM from PNPLATINOBOY / Lex (7246621722) to all his followers
 * announcing he's available for private calls right now.
 *
 * Window: Sat 20:00-23:59 Bogota (schedule id 104).
 * Target: 114 followers of Lex.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-now-2026-08-02.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-lex-available-now-2026-08-02.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN      = process.argv.includes('--dry-run');
const SENDER_ID    = '7246621722'; // PNPLATINOBOY (Lex)
const BROADCAST_ID = 'lex-available-now-2026-08-02';
const BATCH_SIZE   = 200;

const MESSAGE = [
  `Hey papi 👋 estoy disponible ahora mismo para una llamada privada 🎥🔥`,
  ``,
  `Entrá a mi perfil y bookeá una sesión conmigo mientras esté online:`,
  `https://pnptv.app/c/@PNPLatinoBoy`,
  ``,
  `— Lex`,
].join('\n');

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Lex Available-Now DM — followers — 2026-08-02');
  console.log('═══════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be written\n');

  const { rows: followers } = await query(`
    SELECT uf.follower_id AS id
    FROM   user_follows uf
    JOIN   users u ON u.id = uf.follower_id
    WHERE  uf.following_id = $1
      AND  COALESCE(u.is_active, true) = true
      AND  COALESCE(u.role, 'user') != 'banned'
    ORDER BY uf.follower_id
  `, [SENDER_ID]);

  const { rows: alreadyRows } = await query(`
    SELECT recipient_id FROM direct_messages
    WHERE  sender_id = $1 AND meta->>'broadcastId' = $2
  `, [SENDER_ID, BROADCAST_ID]);
  const alreadySent = new Set(alreadyRows.map(r => r.recipient_id));

  const targets = followers.filter(u => !alreadySent.has(u.id));

  console.log(`\n   Followers:    ${followers.length}`);
  console.log(`   Already sent: ${alreadySent.size}`);
  console.log(`   New targets:  ${targets.length}`);

  if (DRY_RUN) {
    console.log('\n── Message ──\n');
    console.log(MESSAGE);
    console.log('\n═══════════════════════════════════════════════════');
    console.log(' DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════\n');
    process.exit(0);
  }

  if (!targets.length) { console.log('\n   Nothing to send.\n'); process.exit(0); }

  const meta = JSON.stringify({ broadcastId: BROADCAST_ID });
  let inserted = 0, failed = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    try {
      const result = await query(`
        INSERT INTO direct_messages (sender_id, recipient_id, content, meta)
        SELECT $1, t.id, $2, $3::jsonb
        FROM unnest($4::text[]) AS t(id)
        ON CONFLICT DO NOTHING
      `, [SENDER_ID, MESSAGE, meta, batch.map(u => u.id)]);
      inserted += result.rowCount ?? batch.length;
    } catch (err) {
      failed += batch.length;
      console.error(`   ✗ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' DONE');
  console.log('═══════════════════════════════════════════════════');
  console.log(` DMs inserted: ${inserted}`);
  if (failed) console.log(` Failed:       ${failed}`);
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
