#!/usr/bin/env node
'use strict';

/**
 * broadcast-lifetime100-lastcall-2026-10-16.js
 *
 * Last call — Lifetime PRIME ($99.99) closes tonight at midnight COT.
 * Audience : all active non-banned users WITHOUT a lifetime entitlement.
 *            Santino + Lex always force-included regardless.
 * Hero     : Lex (@PNPLATINOBOY) creator media photo.
 * Channels : Telegram DM (sendPhoto → fallback sendMessage) · web push · email.
 *
 * Run (ALWAYS isolated docker run — NEVER docker exec pnptv-bot):
 *
 *   docker run --rm \
 *     $(docker exec pnptv-bot printenv | grep -E '^(BOT_TOKEN|DATABASE_URL|REDIS_URL|SMTP|PNPTV|WEBAPP|NODE_ENV|SESSION)' | sed 's/^/-e /') \
 *     pnptvapp-pnptv-bot \
 *     node /app/apps/backend/scripts/broadcast-lifetime100-lastcall-2026-10-16.js
 *
 * Flags:
 *   (none)           — dry run, no sends
 *   --live           — actually send
 *   --skip-telegram  — skip Telegram channel
 *   --skip-push      — skip web push channel
 *   --skip-email     — skip email channel
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
const LEX_ID      = '8f5f4dd1-7bdb-4571-b026-e09d91113c91';
const FORCE_IDS   = [SANTINO_ID, LEX_ID];
const LOG_TABLE   = 'broadcast_lifetime100_lastcall_20261016';
const CTA_URL     = 'https://pnptv.app/lifetime100';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;

// Hero: Lex creator media — absolutize for Telegram
const HERO_URL = 'https://pnptv.app/uploads/creator-media/8f5f4dd1-7bdb-4571-b026-e09d91113c91-1788493817256.webp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    pushTitle:      'Last call — Lifetime PRIME closes tonight 🔓',
    pushBody:       'One payment, forever. $99.99. Closes at midnight.',
    btn:            '🔓 Get Lifetime PRIME',
    emailSubject:   'Last call — Lifetime PRIME closes tonight 🔓',
    emailPreheader: '$99.99 once — PRIME forever. Closes tonight at midnight COT.',
    tgCaption: (name) => {
      const hi = name ? `Hey ${name}` : 'Hey';
      return (
        `${hi} 👋\n\n` +
        `<b>This closes tonight at midnight.</b>\n\n` +
        `Lifetime PRIME — <b>$99.99 once.</b> Every exclusive video, every private call, every live event on PNPtv! — forever. No renewals.\n\n` +
        `✅ Unlock everything, right now\n` +
        `✅ One payment — never again\n` +
        `✅ Founder price closes tonight\n\n` +
        `After midnight it's gone for good.\n\n` +
        `— PNPtv! 🏳️‍🌈`
      );
    },
    emailBody: (name) => {
      const hi = name && name.length > 1 ? name : 'there';
      return `<p>Hey ${hi} 👋</p>
<p><strong>This is the last chance.</strong> Lifetime PRIME closes tonight at midnight COT.</p>
<div style="background:#1a0d1f;border:1px solid #E6913844;border-radius:12px;padding:24px;margin:24px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#E69138;margin-bottom:12px">🔓 Lifetime PRIME — $99.99 once</div>
  <ul style="color:#ccc;margin:8px 0;padding-left:20px;line-height:2">
    <li>All exclusive content, forever</li>
    <li>Private calls with creators</li>
    <li>Every live event included</li>
    <li>Ru$h 💎 spending &amp; earnings</li>
    <li>Every future feature, included</li>
  </ul>
  <div style="color:#aaa;font-size:13px;margin-top:12px">Pay with card, Apple Pay, or crypto. No renewals — ever.</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${CTA_URL}" style="display:inline-block;background:linear-gradient(90deg,#E69138,#c97a1e);color:#000;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">🔓 Get Lifetime PRIME — $99.99</a>
</p>
<p style="color:#888;font-size:12px;margin-top:24px">Offer closes tonight at midnight COT (Oct 17). — The PNPtv! team</p>`;
    },
  },

  es: {
    pushTitle:      'Última hora — Lifetime PRIME cierra esta noche 🔓',
    pushBody:       'Un pago, de por vida. $99.99. Cierra a medianoche.',
    btn:            '🔓 PRIME de por vida',
    emailSubject:   'Última hora — Lifetime PRIME cierra esta noche 🔓',
    emailPreheader: '$99.99 una vez — PRIME para siempre. Cierra esta noche a medianoche.',
    tgCaption: (name) => {
      const hi = name ? `Hola ${name}` : 'Hola';
      return (
        `${hi} 👋\n\n` +
        `<b>Esta noche a la medianoche se cierra.</b>\n\n` +
        `Lifetime PRIME — <b>$99.99 una vez.</b> Cada video exclusivo, cada llamada privada, cada evento en vivo en PNPtv! — para siempre. Sin renovaciones.\n\n` +
        `✅ Acceso a todo, ahora mismo\n` +
        `✅ Un solo pago — nunca más\n` +
        `✅ Precio de fundador cierra esta noche\n\n` +
        `Después de medianoche desaparece para siempre.\n\n` +
        `— PNPtv! 🏳️‍🌈`
      );
    },
    emailBody: (name) => {
      const hi = name && name.length > 1 ? name : 'ahí';
      return `<p>Hola ${hi} 👋</p>
<p><strong>Esta es la última oportunidad.</strong> Lifetime PRIME cierra esta noche a medianoche (hora Colombia).</p>
<div style="background:#1a0d1f;border:1px solid #E6913844;border-radius:12px;padding:24px;margin:24px 0;color:#eee">
  <div style="font-size:22px;font-weight:800;color:#E69138;margin-bottom:12px">🔓 Lifetime PRIME — $99.99 una vez</div>
  <ul style="color:#ccc;margin:8px 0;padding-left:20px;line-height:2">
    <li>Todo el contenido exclusivo, de por vida</li>
    <li>Llamadas privadas con creadores</li>
    <li>Cada evento en vivo incluido</li>
    <li>Ru$h 💎 — gastar y ganar</li>
    <li>Cada función futura, incluida</li>
  </ul>
  <div style="color:#aaa;font-size:13px;margin-top:12px">Pagá con tarjeta, Apple Pay o cripto. Sin renovaciones, jamás.</div>
</div>
<p style="text-align:center;margin:32px 0">
  <a href="${CTA_URL}" style="display:inline-block;background:linear-gradient(90deg,#E69138,#c97a1e);color:#000;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">🔓 PRIME de por vida — $99.99</a>
</p>
<p style="color:#888;font-size:12px;margin-top:24px">Oferta cierra esta noche a medianoche COT (17 oct). — El equipo PNPtv!</p>`;
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
       AND u.role != 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) <> ''
       AND (
         u.id::text = ANY($1)
         OR NOT EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id::text = u.id::text AND ue.is_lifetime = true
         )
       )
     ORDER BY (u.id::text = $2) DESC, u.last_active DESC NULLS LAST`,
    [FORCE_IDS, SANTINO_ID]);
  return rows;
}

async function loadPushTargets(excludedIds) {
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id, u.language
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_active, true) = true
       AND u.role != 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND (
         u.id::text = ANY($1)
         OR NOT EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id::text = u.id::text AND ue.is_lifetime = true
         )
       )`,
    [FORCE_IDS]);
  const santino = rows.find((r) => r.id === SANTINO_ID && !excludedIds.has(r.id));
  const rest    = rows.filter((r) => r.id !== SANTINO_ID && !excludedIds.has(r.id));
  return santino ? [santino, ...rest] : rest;
}

async function loadEmailTargets(excludedIds) {
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
         AND u.role != 'banned'
         AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
         AND u.email IS NOT NULL AND u.email <> ''
         AND u.email NOT LIKE '%@telegram.pnptv.app'
         AND u.email NOT LIKE '%@example%'
         AND u.is_deleted IS NOT TRUE
         AND NOT EXISTS (
           SELECT 1 FROM user_entitlements ue
            WHERE ue.user_id::text = u.id::text AND ue.is_lifetime = true
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

async function tgSend(chatId, caption, btnLabel, btnUrl) {
  // Try sendPhoto first; fall back to sendMessage if Telegram can't accept the image
  const photoRes = await _tgApi('sendPhoto', {
    chat_id:      chatId,
    photo:        HERO_URL,
    caption,
    parse_mode:   'HTML',
    reply_markup: { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] },
  });
  if (photoRes.ok) return photoRes;
  return _tgApi('sendMessage', {
    chat_id:    chatId,
    text:       caption,
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
    const opts = { url: '/lifetime100', icon: '/icon-192.png', tag: 'lifetime100-lastcall-2026-10-16', title: c.pushTitle, body: c.pushBody };
    console.log(`  [PUSH ${langKey}] ${ids.length} subscribers`);
    if (DRY) { console.log(`      "${opts.title}"\n      "${opts.body}"`); continue; }
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
  console.log('  PNPtv — Lifetime PRIME last call  2026-10-16');
  console.log(`  MODE: ${DRY ? 'DRY RUN (pass --live to send)' : 'LIVE'}`);
  console.log(`  skip-tg: ${SKIP_TG}   skip-push: ${SKIP_PUSH}   skip-email: ${SKIP_EMAIL}`);
  console.log(`  Hero: ${HERO_URL}`);
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
      console.log(c.tgCaption(name).replace(/<\/?b>/g, '**'));
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
      const res     = await tgSend(t.telegram, c.tgCaption(name), c.btn, CTA_URL);
      if (res.ok) {
        await logSend(t.user_id, 'tg', 'sent');
        tgReachedIds.add(t.user_id);
        sent++;
      } else {
        const err = res.description || JSON.stringify(res);
        await logSend(t.user_id, 'tg', 'failed', String(err).slice(0, 500));
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
        const ex = emailTargets.find((r) => (langKey === 'es' ? r.language.startsWith('es') : !r.language.startsWith('es')));
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
