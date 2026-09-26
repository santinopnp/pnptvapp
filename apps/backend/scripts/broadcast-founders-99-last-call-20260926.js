#!/usr/bin/env node
'use strict';

/**
 * broadcast-founders-99-last-call-20260926.js
 *
 * CORRECTED resend — Founders $99.99 last call for existing members.
 * Prior broadcast (founders-lifetime-249-last-call-20260926) used wrong price ($249.99).
 * This resends the correct Founders price to the full audience.
 *
 * Audience : all active, non-banned, non-deleted users who do NOT already
 *            hold a lifetime PRIME plan.
 * Channels : Telegram DM + web push
 * Dedup    : founders-99-last-call-20260926  (independent namespace — resends to full audience)
 * CC       : Santino (8599671840) always included first
 *
 * Dry run:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-founders-99-last-call-20260926.js --dry-run
 *
 * Live:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-founders-99-last-call-20260926.js
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY_RUN   = process.argv.includes('--dry-run');
const SKIP_PUSH = process.argv.includes('--skip-push');

const BATCH_ID   = 'founders-99-v2-last-call-20260926';
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';
const CTA_URL    = 'https://pnptv.app/founders';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function caption(lang) {
  if (lang === 'es') {
    return `🖤 <b>PNPtv! Founders — últimas horas</b>

El acceso de por vida cierra esta noche.

<b>$99.99 una sola vez</b> — sin renovaciones, sin vencimiento. Membresía completa en PNPtv! para siempre.

Esta oferta es exclusiva para miembros actuales. Después de esta noche, no estará disponible para cuentas existentes.`;
  }
  return `🖤 <b>PNPtv! Founders — last hours</b>

Lifetime access closes tonight.

<b>$99.99 one time</b> — no renewals, no expiry. Full membership on PNPtv! forever.

This offer is exclusive to existing members. After tonight, it won't be available to current accounts.`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '🖤 Founders — últimas horas',
      body:  'Membresía vitalicia $99.99 · cierra esta noche para miembros actuales',
      url:   CTA_URL,
    };
  }
  return {
    title: '🖤 Founders — last hours',
    body:  'Lifetime membership $99.99 · closing tonight for existing members',
    url:   CTA_URL,
  };
}

function buttons(lang) {
  if (lang === 'es') {
    return [[{ text: '🖤 Obtener Founders — $99.99 de por vida', url: CTA_URL }]];
  }
  return [[{ text: '🖤 Get Founders — $99.99 lifetime', url: CTA_URL }]];
}

function _tgApi(method, payload) {
  return new Promise(resolve => {
    const body = JSON.stringify(payload);
    const req  = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, lang) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption(lang),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons(lang) },
  });
}

async function main() {
  await initializePostgres();

  const { rows: users } = await query(`
    SELECT u.id, u.telegram,
           CASE WHEN u.language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users u
    WHERE u.is_active   = true
      AND u.is_deleted  = false
      AND u.tier        != 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        JOIN plans pl ON pl.id = p.plan_id
        WHERE p.user_id    = u.id
          AND p.status     = 'completed'
          AND pl.is_lifetime = true
      )
    ORDER BY u.last_active DESC NULLS LAST
  `);

  const hasSantino = users.some(u => u.id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, telegram, CASE WHEN language='es' THEN 'es' ELSE 'en' END AS lang
       FROM users WHERE id = $1`,
      [SANTINO_ID]
    );
    if (s.length && s[0].telegram) users.unshift(s[0]);
  } else {
    const idx = users.findIndex(u => u.id === SANTINO_ID);
    if (idx > 0) users.unshift(users.splice(idx, 1)[0]);
  }

  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    [`${BATCH_ID}%`]
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);
  const withTg = users.filter(u => u.telegram && String(u.telegram).trim() !== '').length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv! — Founders $99.99 — Last Call · 2026-09-26 (CORRECTED)');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${withTg} with Telegram, ${alreadySent} already sent)`);
  console.log(`  CTA       : ${CTA_URL}`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('── EN caption ──\n' + caption('en'));
    console.log('\n── ES caption ──\n' + caption('es'));
    console.log('\n── EN push ──');
    console.log(JSON.stringify(pushPayload('en'), null, 2));
    console.log('\n── ES push ──');
    console.log(JSON.stringify(pushPayload('es'), null, 2));
    console.log(`\n... to ${users.length} users total (${withTg} via Telegram)\n`);
    console.log('-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let tgOk = 0, pushOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { skipped++; continue; }

    const hasTg = u.telegram && String(u.telegram).trim() !== '';
    if (hasTg) {
      try {
        const r = await tgSend(u.telegram, u.lang);
        if (r.ok) {
          await query(
            `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [BATCH_ID, u.id]
          );
          tgOk++;
        } else {
          if (r.error_code === 403 || r.error_code === 400) {
            await query(
              `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [BATCH_ID, u.id]
            );
          }
          console.error(`  ✗ TG ${u.id}: ${r.description || r.error || 'unknown'}`);
          errors++;
        }
      } catch (err) {
        console.error(`  ✗ TG ${u.id}: ${err.message}`);
        errors++;
      }
    }

    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    if ((tgOk + skipped) % 200 === 0 && (tgOk + skipped) > 0) {
      console.log(`  → ${tgOk} TG sent, ${pushOk} push sent, ${skipped} skipped, ${errors} errors`);
    }

    await sleep(80);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Telegram : ${tgOk}`);
  console.log(`  Push     : ${pushOk}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 10 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
