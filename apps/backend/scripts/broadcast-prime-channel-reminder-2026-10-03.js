#!/usr/bin/env node
'use strict';

/**
 * In-platform DM from @pnptv to all active PRIME holders reminding them
 * their subscription unlocks the Santino + Lex "PNPtv! PRIME" channel
 * (slug `pnptv-prime`, 58 videos). Deep-links straight to the channel.
 *
 * Bilingual (EN default, ES for language='es*'). Hero image attached.
 * Idempotent via meta.broadcastId.
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN      = process.argv.includes('--dry-run');
const SENDER_ID    = '8552451957';
const BROADCAST_ID = 'prime-reminder-channel-2026-10-03';
const BATCH_SIZE   = 200;
const DEEP_LINK    = 'https://pnptv.app/channels?channel=pnptv-prime';

const FORCE_IDS = [
  '8599671840',                            // Santino
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91',  // Lex
];

const HERO = {
  en: {
    media_url:       'https://pnptv.app/videos/subscribe-pnptv-vertical-en.jpg',
    media_thumb_url: 'https://pnptv.app/videos/subscribe-pnptv-vertical-en.jpg',
  },
  es: {
    media_url:       'https://pnptv.app/videos/subscribe-pnptv-vertical-es.jpg',
    media_thumb_url: 'https://pnptv.app/videos/subscribe-pnptv-vertical-es.jpg',
  },
};

const COPY = {
  en:
`Hey PRIME member — a reminder of what's inside your subscription.

Santino + Lex's exclusive PNPtv! PRIME channel has 58 videos (and growing). Full access, zero paywalls. You already have it unlocked.

👉 Open PRIME now → ${DEEP_LINK}

See what's new. 🖤
— PNPtv!`,

  es:
`Hola miembro PRIME — un recordatorio de lo que tenés incluido en tu suscripción.

El canal exclusivo PNPtv! PRIME de Santino + Lex tiene 58 videos (y sigue creciendo). Acceso completo, sin pagos extra. Ya lo tenés desbloqueado.

👉 Abrir PRIME ahora → ${DEEP_LINK}

Vení a ver lo nuevo. 🖤
— PNPtv!`,
};

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');

async function main() {
  console.log(`\n═ PRIME channel reminder — ${BROADCAST_ID} ═`);
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');

  // Target: active PRIME holders (paid or lifetime) + force-include QA.
  const { rows: users } = await query(`
    SELECT DISTINCT u.id, COALESCE(u.language, 'en') AS language
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND u.role != 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.id != $1
       AND (
         u.id = ANY($2::text[])
         OR EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id = u.id
              AND ue.add_on_id = 'prime'
              AND (ue.expires_at > NOW() OR ue.is_lifetime = true)
         )
       )
     ORDER BY u.id
  `, [SENDER_ID, FORCE_IDS]);

  const { rows: alreadyRows } = await query(`
    SELECT recipient_id FROM direct_messages
     WHERE sender_id = $1 AND meta->>'broadcastId' = $2
  `, [SENDER_ID, BROADCAST_ID]);
  const alreadySent = new Set(alreadyRows.map((r) => r.recipient_id));

  const targets = users.filter((u) => !alreadySent.has(u.id));
  const byLang = targets.reduce((acc, u) => {
    const l = resolveLang(u.language);
    acc[l] = (acc[l] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n   Eligible: ${users.length} · already sent: ${alreadySent.size} · new: ${targets.length}`);
  console.log(`     EN: ${byLang.en || 0} · ES: ${byLang.es || 0}`);

  if (DRY_RUN) {
    console.log('\n── EN ──\n' + COPY.en);
    console.log('\n── ES ──\n' + COPY.es);
    process.exit(0);
  }
  if (!targets.length) { console.log('nothing to send'); process.exit(0); }

  const meta = JSON.stringify({ broadcastId: BROADCAST_ID });
  const byLangTargets = { en: [], es: [] };
  for (const u of targets) byLangTargets[resolveLang(u.language)].push(u.id);

  let dmInserted = 0, failed = 0;
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

        await query(`
          INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at,
                                   unread_for_a, unread_for_b, last_message_id)
          SELECT LEAST($1, r.recipient_id), GREATEST($1, r.recipient_id),
                 LEFT($2, 100), NOW(),
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
        `, [SENDER_ID, content, inserted.map((r) => r.id), inserted.map((r) => r.recipient_id)]);
      } catch (err) {
        failed += batch.length;
        console.error(`   ✗ ${lang} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      }
      const done = Math.min(i + BATCH_SIZE, ids.length);
      console.log(`   [${lang}] ${done}/${ids.length}`);
    }
  }

  console.log(`\n═ done — sent ${dmInserted} · failed ${failed} ═\n`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
