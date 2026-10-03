#!/usr/bin/env node
'use strict';

/**
 * In-app DM from @pnptv (user 8552451957, "PNPtv! News") to every
 * non-banned non-PRIME user. Explains the platform + PRIME upsell.
 * Bilingual (EN default, ES for language='es*'). Hero image attached.
 * Idempotent via meta.broadcastId.
 *
 * Usage:
 *   docker run --rm --network pnptvapp_default \
 *     -e DATABASE_URL="$(docker exec pnptv-bot printenv DATABASE_URL)" \
 *     -v /opt/pnptvapp:/app -w /app pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-platform-explainer-2026-10-02.js --dry-run
 *   (drop --dry-run to actually send)
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN      = process.argv.includes('--dry-run');
const SENDER_ID    = '8552451957'; // @pnptv / PNPtv! News
const BROADCAST_ID = 'platform-explainer-2026-10-02';
const BATCH_SIZE   = 200;

// Force-include recipients even if they'd normally be excluded (e.g. active PRIME).
// Santino (CEO/CTO) + Lex (CBCO) must see what users see.
const FORCE_IDS = [
  '8599671840',                            // Santino
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91',  // Lex / PNPLATINOBOY
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
`Hey — we built PNPtv! for you. Here's everything you can do inside 👇

🎥 Live — creators streaming right now, solo and group. Tip them, request private moments.

🏠 Hangouts — themed video rooms, 24/7. Jump in, hang out, cam up.

📍 Nearby — see who's online around you right now. DM, flirt, meet.

🎬 PNP Channels — on-demand library of exclusive videos. Fresh drops daily.

📞 Private Calls — book 1:1 cam time with Santino, Lex, or any available creator.

💳 Pay with your card using your wallet — just tap the 💎 icon and follow the steps.

━━━━━━━━━━━━━━━━━━

🔥 PRIME unlocks the Santino + Lex exclusive channel.

Full access to every video in Santino's and Lex's PRIME channel — the stuff you can't get anywhere else.

From $14.99/week — Lifetime from $249.

👉 Go PRIME → https://pnptv.app/subscribe

See you inside. 🖤
— PNPtv!`,

  es:
`Hola — construimos PNPtv! para vos. Esto es todo lo que podés hacer 👇

🎥 Live — creadores transmitiendo en vivo ahora, solos o en grupo. Dales propina, pedí momentos privados.

🏠 Hangouts — salas de video temáticas, 24/7. Entrá, charlá, prendé cámara.

📍 Nearby — mirá quién está cerca y en línea ahora mismo. DM, coqueteá, conocé.

🎬 PNP Channels — biblioteca on-demand de videos exclusivos. Material nuevo cada día.

📞 Llamadas Privadas — reservá tiempo 1:1 en cámara con Santino, Lex, o cualquier creador disponible.

💳 Pagá con tu tarjeta usando tu wallet — solo tocá el ícono de 💎 y seguí las instrucciones.

━━━━━━━━━━━━━━━━━━

🔥 PRIME desbloquea el canal exclusivo de Santino + Lex.

Acceso completo a cada video del canal PRIME de Santino y Lex — lo que no vas a encontrar en ningún otro lado.

Desde $14.99/semana — Lifetime desde $249.

👉 Hacete PRIME → https://pnptv.app/subscribe

Nos vemos adentro. 🖤
— PNPtv!`,
};

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Platform Explainer DM — in-app — 2026-10-02');
  console.log('═══════════════════════════════════════════════════');
  console.log(` Sender: ${SENDER_ID} (@pnptv)`);
  console.log(` Broadcast ID: ${BROADCAST_ID}`);
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be written\n');

  // Target: non-banned, non-deleted, no active PRIME entitlement.
  // Force-include FORCE_IDS even if they'd be excluded.
  const { rows: users } = await query(`
    SELECT u.id, COALESCE(u.language, 'en') AS language
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND u.role != 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.id != $1
       AND (
         u.id = ANY($2::text[])
         OR NOT EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id = u.id
              AND ue.add_on_id = 'prime'
              AND ue.expires_at > NOW()
         )
       )
     ORDER BY u.id
  `, [SENDER_ID, FORCE_IDS]);

  // Idempotency: skip anyone we already sent this broadcast to
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
    console.log(' DRY RUN COMPLETE — re-run without --dry-run to send');
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

  // Batch by language so each batch gets the right content + hero image
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
        // 1) Insert DMs — returning id + recipient so we can upsert threads
        const { rows: inserted } = await query(`
          INSERT INTO direct_messages
            (sender_id, recipient_id, content, media_url, media_type, media_thumb_url, meta)
          SELECT $1, t.id, $2, $3, 'image', $4, $5::jsonb
            FROM unnest($6::text[]) AS t(id)
          RETURNING id, recipient_id
        `, [SENDER_ID, content, media_url, media_thumb_url, meta, batch]);
        dmInserted += inserted.length;

        // 2) Upsert dm_threads (CHECK constraint requires user_a < user_b)
        //    SENDER_ID is numeric string, UUID recipients sort differently —
        //    LEAST/GREATEST on text handles both.
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
      if (done % 1000 === 0 || done >= ids.length) {
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
