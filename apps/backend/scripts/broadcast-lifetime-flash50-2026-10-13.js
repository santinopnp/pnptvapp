#!/usr/bin/env node
'use strict';

/**
 * Flash sale: lifetime100-promo at $50 for 1 hour.
 * Coupon FLASH50 already inserted in DB (id 102, valid_until = creation + 1h).
 * Audience: active non-banned users WITHOUT any is_lifetime entitlement.
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN      = process.argv.includes('--dry-run');
const TEST_ONLY    = process.argv.includes('--test');
const SENDER_ID    = '8552451957'; // @pnptv platform account
const BROADCAST_ID = 'lifetime-flash50-2026-10-13';
const BATCH_SIZE   = 200;

const FORCE_IDS = [
  '8599671840',                            // Santino
  '8f5f4dd1-7bdb-4571-b026-e09d91113c91',  // Lex
];

const HERO = {
  en: {
    media_url:       'https://pnptv.app/broadcast/flash50-2026-10-13.mp4',
    media_thumb_url: 'https://pnptv.app/broadcast/flash50-thumb-2026-10-13.jpg',
    media_type:      'video',
  },
  es: {
    media_url:       'https://pnptv.app/broadcast/flash50-2026-10-13.mp4',
    media_thumb_url: 'https://pnptv.app/broadcast/flash50-thumb-2026-10-13.jpg',
    media_type:      'video',
  },
};

const COPY = {
  en: `⏳ 1 HOUR ONLY — Lifetime at $50.

Santino & Lex are making this happen RIGHT NOW. After this hour it's gone — back to $100, no exceptions.

Forever in The Circle. Every live event. VIP access. Pay once, never again.

👉 https://pnptv.app/lifetime100

— PNPtv!`,

  es: `⏳ SOLO 1 HORA — Lifetime a $50.

Santino y Lex lo están haciendo posible AHORA MISMO. Cuando pase esta hora se acabó — vuelve a $100, sin excepciones.

Para siempre en El Círculo. Cada evento en vivo. Acceso VIP. Pagas una vez, nunca más.

👉 https://pnptv.app/lifetime100

— PNPtv!`,
};

const AUDIENCE_SQL = `
  SELECT u.id, COALESCE(u.language, 'en') AS language
    FROM users u
   WHERE COALESCE(u.is_active, true) = true
     AND u.role != 'banned'
     AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
     AND u.id != $1
     AND (
       u.id = ANY($2::text[])
       OR (
         NOT $3
         AND NOT EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id = u.id
              AND ue.is_lifetime = true
         )
       )
     )
   ORDER BY u.id
`;

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');

async function main() {
  console.log(`\n═ broadcast — ${BROADCAST_ID} ═`);
  console.log(` Sender: ${SENDER_ID}`);
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');

  if (TEST_ONLY) console.log(' MODE: TEST (Santino + Lex only)\n');
  const { rows: users } = await query(AUDIENCE_SQL, [SENDER_ID, FORCE_IDS, TEST_ONLY]);

  const { rows: alreadyRows } = await query(`
    SELECT recipient_id FROM direct_messages
     WHERE sender_id = $1 AND meta->>'broadcastId' = $2
  `, [SENDER_ID, BROADCAST_ID]);
  const alreadySent = new Set(alreadyRows.map((r) => r.recipient_id));

  const targets = users.filter((u) => !alreadySent.has(u.id));
  const byLang = { en: 0, es: 0 };
  for (const u of targets) byLang[resolveLang(u.language)]++;

  console.log(`   Eligible: ${users.length} · already sent: ${alreadySent.size} · new: ${targets.length}`);
  console.log(`     • EN: ${byLang.en} · ES: ${byLang.es}`);

  if (DRY_RUN) {
    console.log('\n── EN ──\n' + COPY.en + '\n\n── ES ──\n' + COPY.es + '\n');
    process.exit(0);
  }
  if (!targets.length) { console.log('nothing to send'); process.exit(0); }

  const meta = JSON.stringify({ broadcastId: BROADCAST_ID });
  const byLangTargets = { en: [], es: [] };
  for (const u of targets) byLangTargets[resolveLang(u.language)].push(u.id);

  let inserted = 0;
  for (const lang of ['en', 'es']) {
    const ids = byLangTargets[lang];
    if (!ids.length) continue;
    const content = COPY[lang];
    const { media_url, media_thumb_url } = HERO[lang];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const { rows: ins } = await query(`
        INSERT INTO direct_messages
          (sender_id, recipient_id, content, media_url, media_type, media_thumb_url, meta)
        SELECT $1, t.id, $2, $3, 'video', $4, $5::jsonb
          FROM unnest($6::text[]) AS t(id)
        RETURNING id, recipient_id
      `, [SENDER_ID, content, media_url, media_thumb_url, meta, batch]);
      inserted += ins.length;

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
          last_message = EXCLUDED.last_message,
          last_message_at = NOW(),
          last_message_id = EXCLUDED.last_message_id,
          unread_for_a = dm_threads.unread_for_a + CASE WHEN dm_threads.user_a = $1 THEN 0 ELSE 1 END,
          unread_for_b = dm_threads.unread_for_b + CASE WHEN dm_threads.user_a = $1 THEN 1 ELSE 0 END
      `, [SENDER_ID, content, ins.map((r) => r.id), ins.map((r) => r.recipient_id)]);

      const done = Math.min(i + BATCH_SIZE, ids.length);
      if (done % 500 === 0 || done >= ids.length) console.log(`   [${lang}] ${done}/${ids.length}`);
    }
  }

  console.log(`\n═ done — ${inserted} DMs ═\n`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
