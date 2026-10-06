#!/usr/bin/env node
'use strict';

/**
 * broadcast-founders-urgency-2026-10-05.js
 *
 * Urgency push for the PNPtv! Founders plan ($99.99 lifetime).
 * Deadline: Sunday October 12 — after that the price increases.
 *
 * Audience : all active non-banned users who are NOT already Founders/Lifetime
 * Channels : TG photo DM + in-app DM (sendSystemDM) + web push notification
 * Dedup key: founders-urgency-2026-10-05-*  (campaign-wide LIKE prefix)
 * Hero      : /uploads/promos/founders-promo-hero.jpg
 *
 * Usage (isolated container — NEVER docker exec on live bot):
 *
 *   DRY RUN (default):
 *   docker run --rm --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     pnptvapp-pnptv-bot node /app/apps/backend/scripts/broadcast-founders-urgency-2026-10-05.js
 *
 *   LIVE:
 *   docker run --rm --env-file <(docker exec $(docker ps -q --filter name=pnptv-bot | head -1) printenv | grep -v '^_') \
 *     pnptvapp-pnptv-bot node /app/apps/backend/scripts/broadcast-founders-urgency-2026-10-05.js --live
 *
 *   PUSH ONLY (web push, no TG/DM):
 *   ... --live --push-only
 */

const path  = require('path');
const https = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY        = !process.argv.includes('--live');
const PUSH_ONLY  = process.argv.includes('--push-only');
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const BOT_TOKEN  = process.env.BOT_TOKEN;
const SANTINO_ID = '8599671840';

const HERO_URL   = `${WEBAPP_URL}/uploads/promos/founders-promo-hero.jpg`;
const CTA_URL    = `${WEBAPP_URL}/lifetime100`;

const CAMPAIGN   = 'founders-urgency-2026-10-05';
const BATCH_DM   = `${CAMPAIGN}-dm`;
const BATCH_TG   = `${CAMPAIGN}-tg`;
const DM_DELAY   = 80;   // ms between in-app DMs
const TG_DELAY   = 150;  // ms between Telegram sends

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (isEs(lang)) return `Hey 🖤

El acceso Founders a PNPtv! — membresía de por vida al precio más bajo que habrá — está disponible solo hasta el domingo 12 de octubre.

Lo que incluye:
→ Acceso PRIME de por vida (todo el contenido exclusivo, para siempre)
→ Badge Founders permanente en tu perfil
→ Precio de $99.99 — solo hasta el domingo

Después de esa fecha el precio sube. Esta es la última vez que lo ofrecemos a este precio.

¿Listo?
👉 ${CTA_URL}

— Santino & Lex`;

  return `Hey 🖤

PNPtv! Founders access — lifetime membership at the lowest price we'll ever offer — is available through Sunday, October 12 only.

What's included:
→ Lifetime PRIME access (all exclusive content, forever)
→ Permanent Founders badge on your profile
→ $99.99 — this Sunday is the last day at this price

After that, the price goes up. This is your window.

Ready?
👉 ${CTA_URL}

— Santino & Lex`;
}

function tgCaption(lang) {
  if (isEs(lang)) return `🖤 Acceso Founders de por vida — $99.99 solo hasta el domingo 12 de octubre. Después el precio sube. Esta es tu oportunidad.`;
  return `🖤 Lifetime Founders access — $99.99 through Sunday October 12 only. Price goes up after that. This is your window.`;
}

// ── Telegram send ─────────────────────────────────────────────────────────────

function tgRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(
      {
        hostname: 'api.telegram.org',
        path    : `/bot${BOT_TOKEN}/${method}`,
        method  : 'POST',
        headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(JSON.parse(b))); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendTgPhoto(telegramId, lang) {
  if (!BOT_TOKEN || !telegramId) return false;
  try {
    const res = await tgRequest('sendPhoto', {
      chat_id     : telegramId,
      photo       : HERO_URL,
      caption     : tgCaption(lang),
      parse_mode  : 'HTML',
      reply_markup: {
        inline_keyboard: [[{
          text: lang && isEs(lang) ? '🔒 Obtener acceso Founders' : '🔒 Get Founders Access',
          url : CTA_URL,
        }]],
      },
    });
    return res.ok;
  } catch { return false; }
}

// ── Push notification ─────────────────────────────────────────────────────────

async function sendWebPush() {
  try {
    const sent = await PushNotificationService.sendToAll({
      title : '🖤 PNPtv! Founders — Last Days',
      body  : 'Lifetime PRIME access at $99.99 — available through Sunday Oct 12 only.',
      url   : CTA_URL,
      icon  : `${WEBAPP_URL}/icon-192.png`,
      tag   : CAMPAIGN,
    });
    console.log(`PUSH → delivered: ${sent}`);
  } catch (e) {
    console.error('PUSH error:', e.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  // ── Web push (fire-and-forget in background) ──
  if (DRY) {
    console.log('[DRY] Would send web push notification to all push subscribers');
  } else {
    sendWebPush(); // intentionally not awaited — let it run in parallel
  }

  if (PUSH_ONLY) {
    if (!DRY) { await new Promise(r => setTimeout(r, 3000)); } // let push finish
    process.exit(0);
  }

  // ── Audience: non-founders with Telegram/DM, not yet hit by this campaign ──
  // Force-include Santino regardless of prior dedup (preview/verify)
  const { rows } = await query(`
    SELECT u.id, u.telegram, u.language
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.tier != 'banned'
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements ue
        WHERE ue.user_id = u.id
          AND ue.is_lifetime = true
          AND ue.is_consumed = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM broadcast_dedup
        WHERE user_id = u.id::text
          AND batch_id LIKE '${CAMPAIGN}%'
      )
    UNION
    -- Always include Santino so he can verify what users receive
    SELECT id, telegram, language FROM users WHERE id::text = '${SANTINO_ID}'
    ORDER BY id
  `);

  console.log(`[${DRY ? 'DRY RUN' : 'LIVE'}] Audience: ${rows.length} users`);
  if (DRY) {
    const withTg = rows.filter(r => r.telegram).length;
    console.log(`  → ${withTg} have Telegram, ${rows.length} get in-app DM`);
    console.log('Pass --live to send. Add --push-only to send only web push.');
    process.exit(0);
  }

  let dmOk = 0, dmFail = 0, tgOk = 0, tgFail = 0;

  for (const u of rows) {
    const lang = u.language || 'en';

    // In-app DM
    try {
      await sendSystemDM(u.id, dmText(lang));
      dmOk++;
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_DM, u.id]
      );
    } catch { dmFail++; }
    await sleep(DM_DELAY);

    // Telegram photo
    if (u.telegram) {
      const ok = await sendTgPhoto(u.telegram, lang);
      ok ? tgOk++ : tgFail++;
      if (ok) await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_TG, u.id]
      );
      await sleep(TG_DELAY);
    }

    if ((dmOk + dmFail) % 100 === 0) process.stdout.write('.');
  }

  console.log(`\nDM   → sent: ${dmOk}  / failed: ${dmFail}`);
  console.log(`TG   → sent: ${tgOk}  / failed: ${tgFail}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
