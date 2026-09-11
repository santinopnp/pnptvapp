#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-2026-09-10.js
 *
 * Lifetime PRIME promo — full-audience blast across all 3 channels.
 *
 * Channels:
 *   1. Telegram DM  (~6,765 users with telegram_id)
 *   2. Web push     (~645 subscribers not already hit by TG)
 *   3. Email        (~2,400 non-PRIME users with real email)
 *
 * Idempotency: broadcast_lifetime100_2026_09_10 log table (user_id, channel) PK
 * CC:          Santino (8599671840) force-first in all channels
 *
 * Run (ALWAYS in isolated docker run — not docker exec pnptv-bot):
 *   docker run --rm \
 *     $(docker exec pnptv-bot printenv | grep -E '^(BOT_TOKEN|DATABASE_URL|REDIS_URL|SMTP|PNPTV|WEBAPP|NODE_ENV|SESSION)' | sed 's/^/-e /') \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-lifetime100-2026-09-10.js
 *
 *   Add --live to actually send. Default is dry run.
 *   Add --skip-telegram / --skip-push / --skip-email to skip a channel.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));
const emailService                  = require(path.join(BACKEND, 'services/emailservice'));

const DRY        = !process.argv.includes('--live');
const SKIP_TG    = process.argv.includes('--skip-telegram');
const SKIP_PUSH  = process.argv.includes('--skip-push');
const SKIP_EMAIL = process.argv.includes('--skip-email');

const SANTINO_ID  = '8599671840';
const LOG_TABLE   = 'broadcast_lifetime100_2026_09_10';
const CTA_URL     = 'https://pnptv.app/lifetime100';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    pushTitle:      'Lifetime PRIME — $100, forever 🖤',
    pushBody:       'One payment. Every feature. No renewals, ever.',
    btn:            '🖤 Get Lifetime PRIME',
    emailSubject:   'One payment. PRIME forever. 🖤',
    emailPreheader: 'Lock in lifetime access to PNPtv! for $100 — no renewals, ever.',
    tgMsg: (name) => {
      const hi = name ? `Hey ${name}` : 'Hey';
      return `${hi} 👋

One payment. PRIME forever.

Lifetime PRIME is the no-subscription way into PNPtv! — exclusive content, private calls, live streams, Ru$h 💎 — everything, for good.

<b>✅ Pay once — never think about it again</b>
<b>✅ Every feature, every future update included</b>
<b>✅ Founder price: $100</b>

Only a handful of people have it. The price won't stay here forever.

— PNPtv! 🏳️‍🌈`;
    },
    emailBody: (name) => {
      const hi = name && name.length > 1 ? name : 'there';
      return `<p>Hey ${hi} 👋</p>
<p>This is the best deal we offer — and we don't know how much longer we'll keep it at this price.</p>
<p><strong>Lifetime PRIME · $100 · one payment.</strong> Every current feature, everything we ship next, forever.</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:24px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#FF69B4;margin-bottom:12px">🔓 One payment — PRIME forever</div>
  <ul style="color:#ccc;margin:8px 0;padding-left:20px;line-height:2">
    <li>All exclusive content</li>
    <li>Private calls with creators</li>
    <li>Ru$h 💎 spending &amp; earnings</li>
    <li>Every future update, included</li>
  </ul>
  <div style="color:#aaa;font-size:13px;margin-top:12px">Pay with card, Apple Pay, or crypto. Activated within 2h.</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${CTA_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">🖤 Get Lifetime PRIME — $100</a>
</p>
<p style="color:#888;font-size:12px;margin-top:24px">— The PNPtv! team</p>`;
    },
  },

  es: {
    pushTitle:      'PRIME de por vida — $100, para siempre 🖤',
    pushBody:       'Un pago. Todo incluido. Sin renovaciones, jamás.',
    btn:            '🖤 PRIME de por vida',
    emailSubject:   'Un pago. PRIME para siempre. 🖤',
    emailPreheader: 'Lifetime PRIME en PNPtv! por $100 — sin renovaciones, de por vida.',
    tgMsg: (name) => {
      const hi = name ? `Hola ${name}` : 'Hola';
      return `${hi} 👋

Un pago. PRIME para siempre.

Lifetime PRIME es la forma de entrar a PNPtv! sin suscripción — contenido exclusivo, llamadas privadas, streams en vivo, Ru$h 💎 — todo, de por vida.

<b>✅ Pagás una vez — nunca más te preocupás</b>
<b>✅ Todas las funciones actuales y futuras incluidas</b>
<b>✅ Precio fundador: $100</b>

Solo un puñado de personas lo tiene. El precio no va a quedarse en $100 para siempre.

— PNPtv! 🏳️‍🌈`;
    },
    emailBody: (name) => {
      const hi = name && name.length > 1 ? name : 'ahí';
      return `<p>Hola ${hi} 👋</p>
<p>Esta es la mejor oferta que tenemos — y no sabemos cuánto tiempo más vamos a mantener este precio.</p>
<p><strong>Lifetime PRIME · $100 · un solo pago.</strong> Todas las funciones actuales, todo lo que vamos a lanzar, de por vida.</p>
<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:24px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#FF69B4;margin-bottom:12px">🔓 Un pago — PRIME para siempre</div>
  <ul style="color:#ccc;margin:8px 0;padding-left:20px;line-height:2">
    <li>Todo el contenido exclusivo</li>
    <li>Llamadas privadas con creadores</li>
    <li>Ru$h 💎 — gastar y ganar</li>
    <li>Cada actualización futura incluida</li>
  </ul>
  <div style="color:#aaa;font-size:13px;margin-top:12px">Pagá con tarjeta, Apple Pay o cripto. Activación en menos de 2h.</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${CTA_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">🖤 PRIME de por vida — $100</a>
</p>
<p style="color:#888;font-size:12px;margin-top:24px">— El equipo PNPtv!</p>`;
    },
  },
};

function resolveLang(raw) {
  return String(raw || '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';
}

const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function htmlShell(preheader, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PNPtv!</title></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#eee">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</div>
<div style="max-width:600px;margin:0 auto;padding:32px 20px;background:#0a0a14;color:#eee;line-height:1.6">
  <div style="text-align:center;margin-bottom:24px">
    <img src="https://pnptv.app/logo-final.png" alt="PNPtv!" width="80" height="80" style="border-radius:16px"/>
  </div>
  ${body}
</div>
</body></html>`;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]);
  return rows.length > 0;
}

async function logSend(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]);
}

// ── DB queries ────────────────────────────────────────────────────────────────

async function loadTelegramTargets() {
  const { rows } = await query(`
    SELECT u.id::text AS user_id,
           u.username, u.first_name, u.telegram, u.language
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) <> ''
     ORDER BY (u.id::text = $1) DESC, u.last_active DESC NULLS LAST`,
    [SANTINO_ID]);
  return rows;
}

async function loadPushTargets(excludedIds) {
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id, u.language
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')`);
  const santino = rows.find((r) => r.id === SANTINO_ID && !excludedIds.has(r.id));
  const rest    = rows.filter((r) => r.id !== SANTINO_ID && !excludedIds.has(r.id));
  return santino ? [santino, ...rest] : rest;
}

async function loadEmailTargets(excludedIds) {
  // Always include Santino regardless of tier; rest = non-PRIME without active entitlement
  const { rows } = await query(`
    (
      SELECT u.id::text AS user_id, u.email, u.first_name, u.username,
             LOWER(COALESCE(u.language, 'en')) AS language
        FROM users u
       WHERE u.id::text = $1
         AND u.email IS NOT NULL AND u.email <> ''
    )
    UNION ALL
    (
      SELECT u.id::text AS user_id, u.email, u.first_name, u.username,
             LOWER(COALESCE(u.language, 'en')) AS language
        FROM users u
       WHERE u.id::text <> $1
         AND COALESCE(u.is_active, true) = true
         AND COALESCE(u.tier, 'free') <> 'banned'
         AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
         AND u.email IS NOT NULL AND u.email <> ''
         AND u.email NOT LIKE '%@telegram.pnptv.app'
         AND u.email NOT LIKE '%@example%'
         AND u.is_deleted IS NOT TRUE
         AND NOT EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id::text = u.id::text
              AND ue.add_on_id IN ('prime', 'pnp-member')
              AND ue.is_consumed = false
              AND (ue.is_lifetime = true OR ue.expires_at > NOW())
         )
    )`,
    [SANTINO_ID]);
  return rows.filter((r) => !excludedIds.has(r.user_id));
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req  = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/${method}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout:  10000,
    }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error',   () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, text, btnLabel, btnUrl) {
  return _tgApi('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] },
  });
}

// ── Push ──────────────────────────────────────────────────────────────────────

async function runPush(targets) {
  const byLang = new Map();
  for (const r of targets) {
    const k = resolveLang(r.language);
    if (!byLang.has(k)) byLang.set(k, []);
    byLang.get(k).push(r.id);
  }
  let sent = 0;
  for (const [langKey, ids] of byLang.entries()) {
    const c    = COPY[langKey] || COPY.en;
    const opts = { url: '/lifetime100', icon: '/icon-192.png', tag: 'lifetime100-2026-09-10', title: c.pushTitle, body: c.pushBody };
    console.log(`  [PUSH ${langKey}] ${ids.length} subscribers`);
    if (DRY) { console.log(`      "${opts.title}"`); continue; }
    const n = await PushNotificationService.sendToUsers(ids, opts);
    sent += n;
    console.log(`  [PUSH ${langKey}] delivered ${n}/${ids.length}`);
    for (const uid of ids) { try { await logSend(uid, 'push', 'sent'); } catch {} }
  }
  return sent;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) {
    await PushNotificationService.initialize();
    await ensureLogTable();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Lifetime PRIME broadcast  2026-09-10');
  console.log(`  MODE: ${DRY ? 'DRY RUN (pass --live to send)' : 'LIVE'}`);
  console.log(`  skip-tg: ${SKIP_TG}   skip-push: ${SKIP_PUSH}   skip-email: ${SKIP_EMAIL}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tgReachedIds   = new Set();
  const pushReachedIds = new Set();

  // ── 1. Telegram DM ──────────────────────────────────────────────────────────

  const tgTargets = SKIP_TG ? [] : await loadTelegramTargets();

  const langCount = new Map();
  for (const t of tgTargets) { const k = resolveLang(t.language); langCount.set(k, (langCount.get(k) || 0) + 1); }
  console.log(`  Telegram: ${tgTargets.length} users — ${[...langCount.entries()].map(([k, n]) => `${k}:${n}`).join('  ')}`);

  if (DRY) {
    for (const langKey of ['en', 'es']) {
      const ex   = tgTargets.find((t) => resolveLang(t.language) === langKey);
      const name = ex ? escapeHtml((ex.first_name || ex.username || '').trim()).slice(0, 64) : 'TestUser';
      const c    = COPY[langKey] || COPY.en;
      console.log(`\n── TG sample [${langKey}] ──`);
      console.log(c.tgMsg(name).replace(/<\/?b>/g, '**'));
      console.log(`\n  [button] ${c.btn} → ${CTA_URL}`);
    }
    console.log('');
  } else {
    let sent = 0; let skipped = 0; let failed = 0;
    for (let i = 0; i < tgTargets.length; i++) {
      const t = tgTargets[i];
      if (await alreadySent(t.user_id, 'tg')) { skipped++; tgReachedIds.add(t.user_id); continue; }
      const langKey = resolveLang(t.language);
      const c       = COPY[langKey] || COPY.en;
      const name    = escapeHtml((t.first_name || t.username || '').trim()).slice(0, 64);
      const text    = c.tgMsg(name);
      const res     = await tgSend(t.telegram, text, c.btn, CTA_URL);
      if (res.ok) {
        await logSend(t.user_id, 'tg', 'sent');
        tgReachedIds.add(t.user_id);
        sent++;
      } else {
        const err = res.description || JSON.stringify(res);
        await logSend(t.user_id, 'tg', 'failed', err.slice(0, 500));
        failed++;
        if (failed <= 5) console.error(`  ✗ tg ${t.username} — ${err}`);
      }
      if (i % 200 === 0 && i > 0) process.stdout.write(`\r  TG: ${i}/${tgTargets.length} (sent ${sent}, failed ${failed})`);
      await sleep(TG_DELAY_MS);
    }
    process.stdout.write('\n');
    console.log(`  TG done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  }

  // ── 2. Web push ──────────────────────────────────────────────────────────────

  if (!SKIP_PUSH) {
    const pushTargets = await loadPushTargets(tgReachedIds);
    console.log(`\n  Push: ${pushTargets.length} subscribers not yet reached by TG`);
    if (!DRY) {
      await runPush(pushTargets);
      for (const r of pushTargets) pushReachedIds.add(r.id);
    } else {
      const c = COPY.en;
      console.log(`  [DRY] "${c.pushTitle}"`);
      console.log(`  [DRY] "${c.pushBody}"`);
    }
  }

  // ── 3. Email ─────────────────────────────────────────────────────────────────

  if (!SKIP_EMAIL) {
    const alreadyReached = new Set([...tgReachedIds, ...pushReachedIds]);
    const emailTargets   = await loadEmailTargets(alreadyReached);
    console.log(`\n  Email: ${emailTargets.length} users with reachable email`);

    if (DRY) {
      for (const langKey of ['en', 'es']) {
        const ex = emailTargets.find((r) => r.language.startsWith(langKey === 'es' ? 'es' : 'en') || (!r.language.startsWith('es') && langKey === 'en'));
        if (!ex) continue;
        const c = COPY[langKey] || COPY.en;
        console.log(`\n── Email sample [${langKey}] to ${ex.email} ──`);
        console.log(`  Subject: ${c.emailSubject}`);
      }
      console.log('\n(dry run — pass --live to send)\n');
    } else {
      let sent = 0; let skipped = 0; let failed = 0;
      for (let i = 0; i < emailTargets.length; i++) {
        const u = emailTargets[i];
        if (await alreadySent(u.user_id, 'email')) { skipped++; continue; }
        const langKey = resolveLang(u.language);
        const c       = COPY[langKey] || COPY.en;
        const name    = (u.first_name || u.username || '').trim();
        const html    = htmlShell(c.emailPreheader, c.emailBody(name));
        try {
          const r = await emailService.send({ to: u.email, subject: c.emailSubject, html });
          if (r && r.success !== false) {
            await logSend(u.user_id, 'email', 'sent');
            sent++;
          } else {
            const err = ((r && r.error) || '?').slice(0, 500);
            await logSend(u.user_id, 'email', 'failed', err);
            failed++;
            if (failed <= 5) console.error(`  ✗ email ${u.email}: ${err}`);
          }
        } catch (e) {
          const err = (e.message || '?').slice(0, 500);
          await logSend(u.user_id, 'email', 'failed', err);
          failed++;
          if (failed <= 5) console.error(`  ✗ email ${u.email}: ${err}`);
        }
        // pace: 800ms per email, extra 2s every 25 to respect SMTP limits
        await sleep(800);
        if ((sent + failed) % 25 === 0 && sent + failed > 0) {
          await sleep(2000);
          console.log(`  Email: sent=${sent} fail=${failed} skip=${skipped} / ${emailTargets.length}`);
        }
      }
      console.log(`  Email done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
    }
  }

  console.log('\n  Done.\n');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
