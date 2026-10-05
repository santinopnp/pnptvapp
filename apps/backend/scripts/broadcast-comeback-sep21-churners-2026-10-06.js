#!/usr/bin/env node
'use strict';

/**
 * In-app comeback DM from @pnptv (user 8552451957) to users whose PRIME
 * entitlement expired in the week-of-Sep-21-to-Oct-02 wave (mostly the
 * 7,528 prime-trial-3d grants) AND who have NOT re-upgraded since.
 *
 * Bilingual (EN default, ES for language starting 'es'). Hero image attached.
 * Idempotent via meta.broadcastId. Target audience ~3,805 users.
 *
 * SCHEDULED to fire Sunday 2026-10-06 ~12:00 UTC (72h gap after today's
 * platform-explainer DM to avoid same-day spam).
 *
 * Usage (same isolated-docker pattern as platform-explainer-2026-10-02.js):
 *   DBURL=$(docker exec pnptv-bot printenv DATABASE_URL) ... see runner script.
 *
 *   --dry-run   show audience + sample copy, no writes
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN      = process.argv.includes('--dry-run');
const SENDER_ID    = '8552451957'; // @pnptv / PNPtv! News
const BROADCAST_ID = 'comeback-sep21-churners-2026-10-06';
const BATCH_SIZE   = 200;

// Window of entitlement expirations that defines this cohort.
// Sep 18 → Oct 02 covers the Sep-21 week + spill-over trial expiries into
// week-of-Sep-28. Users who re-upgraded since are excluded by the NOT EXISTS clause.
const EXPIRY_FROM = '2026-09-18';
const EXPIRY_TO   = '2026-10-02';

const FORCE_IDS = [
  '8599671840',                            // Santino (QA)
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91',  // Lex (QA)
];

const HERO = {
  en: {
    media_url:        'https://pnptv.app/videos/subscribe-pnptv-vertical-en.jpg',
    media_thumb_url:  'https://pnptv.app/videos/subscribe-pnptv-vertical-en.jpg',
  },
  es: {
    media_url:        'https://pnptv.app/videos/subscribe-pnptv-vertical-es.jpg',
    media_thumb_url:  'https://pnptv.app/videos/subscribe-pnptv-vertical-es.jpg',
  },
};

const COPY = {
  en:
`Hey — we noticed your PRIME expired.

Santino + Lex have been dropping fresh exclusive content every week since. Stuff only PRIME members see.

Your profile is still here. Come back when you're ready.

👉 https://pnptv.app/subscribe

— PNPtv!`,

  es:
`Hola — vimos que tu PRIME se venció.

Santino + Lex están dropeando contenido nuevo exclusivo cada semana desde entonces. Lo que solo los miembros PRIME ven.

Tu perfil sigue acá. Volvé cuando estés listo.

👉 https://pnptv.app/subscribe

— PNPtv!`,
};

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Comeback DM — Sep-21 PRIME churners — 2026-10-06');
  console.log('═══════════════════════════════════════════════════');
  console.log(` Sender: ${SENDER_ID} (@pnptv)`);
  console.log(` Broadcast ID: ${BROADCAST_ID}`);
  console.log(` Expiry window: ${EXPIRY_FROM} → ${EXPIRY_TO}`);
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be written\n');

  // Target: unique users whose PRIME expired in the window AND who have
  // no currently-active PRIME entitlement AND who were active in last 60d.
  const { rows: users } = await query(`
    SELECT DISTINCT u.id, COALESCE(u.language, 'en') AS language
      FROM user_entitlements ue
      JOIN users u ON u.id = ue.user_id
     WHERE ue.add_on_id = 'prime'
       AND ue.expires_at BETWEEN $1::timestamptz AND $2::timestamptz
       AND u.is_active = true
       AND u.role != 'banned'
       AND u.id != $3
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.last_active > NOW() - INTERVAL '60 days'
       AND (
         u.id = ANY($4::text[])
         OR NOT EXISTS (
           SELECT 1 FROM user_entitlements ue2
            WHERE ue2.user_id = u.id
              AND ue2.add_on_id = 'prime'
              AND ue2.expires_at > NOW()
         )
       )
     ORDER BY u.id
  `, [EXPIRY_FROM, EXPIRY_TO, SENDER_ID, FORCE_IDS]);

  const { rows: alreadyRows } = await query(`
    SELECT recipient_id
      FROM direct_messages
     WHERE sender_id = $1
       AND meta->>'broadcastId' = $2
  `, [SENDER_ID, BROADCAST_ID]);
  const alreadySent = new Set(alreadyRows.map((r) => r.recipient_id));

  const targets = users.filter((u) => !alreadySent.has(u.id));
  const byLang = targets.reduce((acc, u) => {
    const l = resolveLang(u.language);
    acc[l] = (acc[l] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n   Eligible:     ${users.length}`);
  console.log(`   Already sent: ${alreadySent.size}`);
  console.log(`   New targets:  ${targets.length}`);
  console.log(`     • EN: ${byLang.en || 0}`);
  console.log(`     • ES: ${byLang.es || 0}`);

  if (DRY_RUN) {
    console.log('\n── Sample DM (EN) ──\n');
    console.log(COPY.en);
    console.log('\n── Sample DM (ES) ──\n');
    console.log(COPY.es);
    console.log('\n═══════════════════════════════════════════════════');
    console.log(' DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════\n');
    process.exit(0);
  }

  if (!targets.length) {
    console.log('\n   Nothing to send.\n');
    process.exit(0);
  }

  const meta = JSON.stringify({ broadcastId: BROADCAST_ID });
  let dmInserted      = 0;
  let threadsUpserted = 0;
  let failed          = 0;

  const byLangTargets = { en: [], es: [] };
  for (const u of targets) byLangTargets[resolveLang(u.language)].push(u.id);

  for (const lang of ['en', 'es']) {
    const ids = byLangTargets[lang];
    if (!ids.length) continue;
    const content = COPY[lang];
    const { media_url, media_thumb_url } = HERO[lang];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      try {
        const { rows: inserted } = await query(`
          INSERT INTO direct_messages
            (sender_id, recipient_id, content, media_url, media_type, media_thumb_url, meta)
          SELECT $1, t.id, $2, $3, 'image', $4, $5::jsonb
            FROM unnest($6::text[]) AS t(id)
          RETURNING id, recipient_id
        `, [SENDER_ID, content, media_url, media_thumb_url, meta, batch]);
        dmInserted += inserted.length;

        const result = await query(`
          INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at,
                                   unread_for_a, unread_for_b, last_message_id)
          SELECT LEAST($1, r.recipient_id),
                 GREATEST($1, r.recipient_id),
                 LEFT($2, 100),
                 NOW(),
                 CASE WHEN LEAST($1, r.recipient_id) = $1 THEN 0 ELSE 1 END,
                 CASE WHEN LEAST($1, r.recipient_id) = $1 THEN 1 ELSE 0 END,
                 r.id
            FROM unnest($3::bigint[], $4::text[]) AS r(id, recipient_id)
          ON CONFLICT (user_a, user_b) DO UPDATE SET
            last_message    = EXCLUDED.last_message,
            last_message_at = NOW(),
            last_message_id = EXCLUDED.last_message_id,
            unread_for_a    = dm_threads.unread_for_a + CASE WHEN dm_threads.user_a = $1 THEN 0 ELSE 1 END,
            unread_for_b    = dm_threads.unread_for_b + CASE WHEN dm_threads.user_a = $1 THEN 1 ELSE 0 END
        `, [
          SENDER_ID,
          content,
          inserted.map((r) => r.id),
          inserted.map((r) => r.recipient_id),
        ]);
        threadsUpserted += result.rowCount ?? inserted.length;
      } catch (err) {
        failed += batch.length;
        console.error(`   ✗ ${lang} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      }

      const done = Math.min(i + BATCH_SIZE, ids.length);
      if (done % 500 === 0 || done >= ids.length) {
        console.log(`   [${lang}] ${done}/${ids.length}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' DONE');
  console.log('═══════════════════════════════════════════════════');
  console.log(` DMs inserted:    ${dmInserted}`);
  console.log(` Threads touched: ${threadsUpserted}`);
  if (failed) console.log(` Failed:          ${failed}`);
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
