#!/usr/bin/env node
'use strict';

/**
 * broadcast-winback-churned-2026-09-11.js
 *
 * Win-back broadcast targeting 606 churned users (subscription_status='churned').
 * They paid before — the barrier is lower. Message leads with what they're missing,
 * not with "you left."
 *
 * Audience: subscription_status='churned', tier='free', not deleted, not banned.
 *   ~606 total → DM all, TG ~470, email ~342.
 * Santino (8599671840) force-included as preview recipient.
 *
 * Channels: dm · tg (hero photo + button) · email (Hostinger SMTP)
 * Log table: broadcast_winback_churned_2026_09_11
 *
 * Usage (run in isolated container — never docker exec on live bot):
 *   docker run --rm --env-file <(docker exec pnptv-bot printenv | grep -v '^_') \
 *     pnptvapp-pnptv-bot node /app/apps/backend/scripts/broadcast-winback-churned-2026-09-11.js
 *
 *   Add --live to send. Default is dry run.
 *   Add --skip-email, --skip-tg, --skip-dm, or --only=dm,tg as needed.
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM  = require(path.join(BACKEND, 'services/sendSystemDM'));
const emailService  = require(path.join(BACKEND, 'services/emailservice'));

const DRY        = !process.argv.includes('--live');
const SKIP_DM    = process.argv.includes('--skip-dm');
const SKIP_TG    = process.argv.includes('--skip-tg') || process.argv.includes('--skip-telegram');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const ONLY_ARG   = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '';
const ONLY       = ONLY_ARG ? new Set(ONLY_ARG.split(',').map(s => s.trim().toLowerCase())) : null;

function channelEnabled(ch) {
  if (ONLY) return ONLY.has(ch);
  if (ch === 'dm'    && SKIP_DM)    return false;
  if (ch === 'tg'    && SKIP_TG)    return false;
  if (ch === 'email' && SKIP_EMAIL) return false;
  return true;
}

const WEBAPP_URL    = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const CTA_URL       = `${WEBAPP_URL}/subscribe`;
const BOT_TOKEN     = process.env.BOT_TOKEN;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';
const FROM_ADDR     = 'PNPtv! <support@pnptv.app>';

// Featured creator today: Alejotwink
const HERO_URL = 'https://pnptv.app/uploads/avatars/e0da5844-ce6a-4976-a14a-b5c9d0b643ed-1783169548311.webp';

const DM_DELAY_MS = 80;
const TG_DELAY_MS = 150;

const LOG_TABLE   = 'broadcast_winback_churned_2026_09_11';
const DM_CHANNEL  = 'winback_dm';
const TG_CHANNEL  = 'winback_tg';
const EMAIL_CHANNEL = 'winback_email';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Copy — desire-first, hook → development → single CTA ────────────────────

function dmText(lang) {
  if (isEs(lang)) {
    return `PNPtv ha crecido desde que te fuiste 🖤

Nuevos creadores, videollamadas privadas, hangouts en vivo — todo desde tu teléfono.

La comunidad sigue. Tu acceso te espera.

👉 ${CTA_URL}`;
  }
  return `PNPtv has grown since you left 🖤

New creators, private video calls, live hangouts — all from your phone.

The community kept going. Your access is waiting.

👉 ${CTA_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `<b>PNPtv ha crecido desde que te fuiste</b> 🖤\n\n` +
      `Hola${n} —\n\n` +
      `Nuevos creadores. Videollamadas 1:1. Hangouts en vivo cada semana.\n\n` +
      `La comunidad no paró. Tu acceso te espera — actívalo abajo.`
    );
  }
  return (
    `<b>PNPtv has grown since you left</b> 🖤\n\n` +
    `Hey${n} —\n\n` +
    `New creators. Private 1:1 video calls. Live hangouts every week.\n\n` +
    `The community kept going. Your access is waiting — get it back below.`
  );
}

function buildEmail(u) {
  const es   = isEs(u.language);
  const name = u.first_name || (es ? 'hola' : 'hey');

  const subject = es
    ? `PNPtv ha crecido — tu acceso te espera 🖤`
    : `PNPtv has grown since you left — your access is waiting 🖤`;

  const preheader = es
    ? `Nuevos creadores, videollamadas privadas, hangouts en vivo. La comunidad no paró.`
    : `New creators, private video calls, live hangouts every week. The community kept going.`;

  const bodyEs = `
<p>Hey ${name} 👋</p>
<p>Han pasado cosas desde la última vez que estuviste en PNPtv. Queríamos contarte.</p>

<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:20px 0;color:#eee">
  <div style="font-size:20px;font-weight:800;color:#FF69B4;margin-bottom:12px">🖤 Lo que te has perdido</div>
  <div style="color:#ccc;font-size:14px;line-height:1.9">
    ✔ Nuevos creadores exclusivos en la plataforma<br/>
    ✔ Videollamadas privadas 1:1 con tus favoritos<br/>
    ✔ Hangouts en vivo cada semana<br/>
    ✔ Nearby — conecta con personas de tu zona<br/>
    ✔ Feed más activo, más contenido exclusivo
  </div>
  <p style="text-align:center;margin:24px 0 0">
    <a href="${CTA_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Recuperar mi acceso 🔓</a>
  </p>
</div>

<p style="color:#aaa;font-size:13px;text-align:center;margin-top:8px">
  Paga con tarjeta o cripto — acceso inmediato.
</p>
<p style="color:#888;font-size:12px;margin-top:28px">— El equipo PNPtv!</p>
`;

  const bodyEn = `
<p>Hey ${name} 👋</p>
<p>A lot has happened since you were last on PNPtv. We wanted you to know.</p>

<div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:20px 0;color:#eee">
  <div style="font-size:20px;font-weight:800;color:#FF69B4;margin-bottom:12px">🖤 What you've been missing</div>
  <div style="color:#ccc;font-size:14px;line-height:1.9">
    ✔ New exclusive creators on the platform<br/>
    ✔ Private 1:1 video calls with your favorites<br/>
    ✔ Live hangouts every week<br/>
    ✔ Nearby — connect with people in your area<br/>
    ✔ More content, more active feed
  </div>
  <p style="text-align:center;margin:24px 0 0">
    <a href="${CTA_URL}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Get my access back 🔓</a>
  </p>
</div>

<p style="color:#aaa;font-size:13px;text-align:center;margin-top:8px">
  Pay with card or crypto — instant access.
</p>
<p style="color:#888;font-size:12px;margin-top:28px">— The PNPtv! team</p>
`;

  return { subject, html: htmlShell(preheader, es ? bodyEs : bodyEn) };
}

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

// ── Telegram raw API (no telegraf dep) ───────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, caption, btnLabel, btnUrl, photoUrl) {
  const kb = { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] };
  if (photoUrl) {
    const r = await _tgApi('sendPhoto', {
      chat_id: chatId, photo: photoUrl,
      caption: caption.slice(0, 1024), parse_mode: 'HTML', reply_markup: kb,
    });
    if (r.ok) return r;
  }
  return _tgApi('sendMessage', {
    chat_id: chatId, text: caption,
    parse_mode: 'HTML', disable_web_page_preview: false, reply_markup: kb,
  });
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

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
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function logSend(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

async function loadTargets() {
  const { rows } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id::text          AS user_id,
      u.username,
      u.first_name,
      u.telegram,
      u.email,
      LOWER(COALESCE(u.language,'en')) AS language
    FROM users u
    WHERE u.subscription_status = 'churned'
      AND u.tier = 'free'
      AND COALESCE(u.is_deleted, false) = false
      AND COALESCE(u.tier, 'free') <> 'banned'
      AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
    ORDER BY u.id
  `);

  // Force-include Santino as preview recipient if not already in audience
  const hasSantino = rows.some(r => r.user_id === SANTINO_ID);
  if (!hasSantino) {
    const { rows: sRows } = await query(
      `SELECT id::text AS user_id, username, first_name, telegram, email,
              LOWER(COALESCE(language,'en')) AS language
       FROM users WHERE id::text = $1`,
      [SANTINO_ID]
    );
    if (sRows.length) rows.unshift(sRows[0]);
  }

  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) await ensureLogTable();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Win-back churned users  2026-09-11');
  console.log(`  MODE       : ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Channels   : dm=${channelEnabled('dm')} tg=${channelEnabled('tg')} email=${channelEnabled('email')}`);
  console.log(`  CTA URL    : ${CTA_URL}`);
  console.log(`  HERO URL   : ${HERO_URL}`);
  console.log(`  Email FROM : ${FROM_ADDR}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const targets      = await loadTargets();
  const tgEligible   = targets.filter(t => t.telegram && String(t.telegram).trim());
  const emailEligible = targets.filter(t => t.email && t.email.trim() && !t.email.endsWith('@telegram.pnptv.app'));

  console.log(`  ${targets.length} churned users (in-app DM target)`);
  console.log(`  ${tgEligible.length} eligible for Telegram DM`);
  console.log(`  ${emailEligible.length} eligible for email\n`);

  if (targets.length === 0) { console.log('  No targets — done.'); process.exit(0); }

  if (DRY) {
    console.log('  ── DRY sample DM (en) ────────────────────────');
    console.log(dmText('en'));
    console.log('  ── DRY sample DM (es) ────────────────────────');
    console.log(dmText('es'));
    if (tgEligible[0]) {
      const s = tgEligible[0];
      console.log(`\n  ── DRY sample TG caption (user=${s.user_id} lang=${s.language}) ──`);
      console.log(tgCaption(s.first_name || s.username || null, s.language));
    }
    const sampleEn = emailEligible.find(t => !isEs(t.language)) || emailEligible[0];
    const sampleEs = emailEligible.find(t => isEs(t.language));
    if (sampleEn) {
      const m = buildEmail(sampleEn);
      console.log(`\n  ── DRY sample email EN (user=${sampleEn.user_id}) ──`);
      console.log(`     subject : ${m.subject}`);
    }
    if (sampleEs) {
      const m = buildEmail(sampleEs);
      console.log(`\n  ── DRY sample email ES (user=${sampleEs.user_id}) ──`);
      console.log(`     subject : ${m.subject}`);
    }
    console.log(`\n  DRY RUN — would DM ${targets.length}, TG ${tgEligible.length}, email ${emailEligible.length}.`);
    console.log(`  Re-run with --live (optionally --only=dm,tg or --skip-email).\n`);
    process.exit(0);
  }

  const stats = {
    dm: 0, dmSkipped: 0, dmFailed: 0,
    tg: 0, tgSkipped: 0, tgFailed: 0,
    email: 0, emailSkipped: 0, emailFailed: 0,
  };

  // ── Phase 1: DM + TG ──────────────────────────────────────────────────────
  if (channelEnabled('dm') || channelEnabled('tg')) {
    console.log('── Phase 1: in-app DM + Telegram ───────────────────────────────');
    for (let i = 0; i < targets.length; i++) {
      const { user_id, username, first_name, telegram, language } = targets[i];
      const name = first_name || username || null;
      const lang = language || 'en';

      if ((i + 1) % 100 === 0) {
        console.log(`  P1 progress: ${i + 1}/${targets.length}  dm=${stats.dm} tg=${stats.tg} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
      }

      if (channelEnabled('dm')) {
        if (await alreadySent(user_id, DM_CHANNEL)) {
          stats.dmSkipped++;
        } else {
          try {
            await sendSystemDM(SYSTEM_SENDER, user_id, dmText(lang), query, { mediaUrl: HERO_URL, mediaType: 'image' });
            stats.dm++;
            await logSend(user_id, DM_CHANNEL, 'sent');
          } catch (err) {
            stats.dmFailed++;
            await logSend(user_id, DM_CHANNEL, 'failed', (err.message || '?').slice(0, 500));
          }
          await sleep(DM_DELAY_MS);
        }
      }

      if (channelEnabled('tg') && BOT_TOKEN && telegram && String(telegram).trim()) {
        if (await alreadySent(user_id, TG_CHANNEL)) {
          stats.tgSkipped++;
        } else {
          const isEsUser = isEs(lang);
          const btnLabel = isEsUser ? 'Recuperar acceso' : 'Get access back';
          const r = await tgSend(telegram, tgCaption(name, lang), btnLabel, CTA_URL, HERO_URL);
          if (r.ok) {
            stats.tg++;
            await logSend(user_id, TG_CHANNEL, 'sent');
          } else {
            stats.tgFailed++;
            await logSend(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500));
          }
          await sleep(TG_DELAY_MS);
        }
      }
    }
    console.log(`  P1 done. dm=${stats.dm} tg=${stats.tg} dmFail=${stats.dmFailed} tgFail=${stats.tgFailed}`);
  }

  // ── Phase 2: Email (Hostinger SMTP, throttled) ────────────────────────────
  if (channelEnabled('email')) {
    console.log('\n── Phase 2: email (Hostinger SMTP, throttled) ──────────────────');
    let processed = 0;
    for (let i = 0; i < emailEligible.length; i++) {
      const u = emailEligible[i];
      if (await alreadySent(u.user_id, EMAIL_CHANNEL)) { stats.emailSkipped++; continue; }
      const mail = buildEmail(u);
      try {
        const r = await emailService.send({ to: u.email, from: FROM_ADDR, subject: mail.subject, html: mail.html });
        if (r && r.success === true) {
          stats.email++;
          await logSend(u.user_id, EMAIL_CHANNEL, 'sent');
        } else {
          stats.emailFailed++;
          await logSend(u.user_id, EMAIL_CHANNEL, 'failed', String(r?.error || r?.mode || 'unknown').slice(0, 500));
        }
      } catch (e) {
        stats.emailFailed++;
        await logSend(u.user_id, EMAIL_CHANNEL, 'failed', (e.message || '?').slice(0, 500));
      }
      processed++;
      // Hostinger cap ~200/hr. 20s base + 30s pause every 25 → ~180/hr.
      await sleep(20000);
      if (processed % 25 === 0) {
        await sleep(30000);
        console.log(`  email progress: sent=${stats.email} fail=${stats.emailFailed} skip=${stats.emailSkipped} / ${emailEligible.length}`);
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(`   In-app DMs   sent/skip/fail: ${stats.dm} / ${stats.dmSkipped} / ${stats.dmFailed}`);
  console.log(`   Telegram DMs sent/skip/fail: ${stats.tg} / ${stats.tgSkipped} / ${stats.tgFailed}`);
  console.log(`   Emails       sent/skip/fail: ${stats.email} / ${stats.emailSkipped} / ${stats.emailFailed}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
