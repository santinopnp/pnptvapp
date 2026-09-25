#!/usr/bin/env node
'use strict';

/**
 * dm-waitlist-santino-available-20260923.js
 *
 * One-shot targeted DM to Santino's call waitlist (5 users).
 * Santino is available now → next 72 h (until 2026-09-26).
 *
 * Channels:
 *   - Telegram DM (bot) for 4 users with Telegram
 *   - Email (SMTP) for 1 user without Telegram (WESTCOASTBEAR1)
 *   - CC attempt to Santino (chat_id 8599671840)
 *
 * Usage (isolated container):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)" \
 *     -e SMTP_HOST="$(docker exec pnptv-bot printenv SMTP_HOST)" \
 *     -e SMTP_PORT="$(docker exec pnptv-bot printenv SMTP_PORT)" \
 *     -e SMTP_USER="$(docker exec pnptv-bot printenv SMTP_USER)" \
 *     -e SMTP_PASS="$(docker exec pnptv-bot printenv SMTP_PASS)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/dm-waitlist-santino-available-20260923.js --dry-run
 *
 * Live run: remove --dry-run
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN       = process.argv.includes('--dry-run');
const BOT_TOKEN     = process.env.BOT_TOKEN;
const SANTINO_TG_ID = '8599671840'; // CC — try direct chat_id
const CREATOR_USER  = 'SantinoFurioso';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Telegram ─────────────────────────────────────────────────────────────────

function tgSend(chatId, text, bookingUrl, durationMin) {
  return new Promise((resolve) => {
    if (!BOT_TOKEN || !chatId) return resolve({ ok: false, reason: 'no token/chatid' });
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: `📅 Book your ${durationMin}-min call`, url: bookingUrl },
        ]],
      },
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', (e) => resolve({ ok: false, reason: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.write(body); req.end();
  });
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmail(to, firstName, durationMin, bookingUrl) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || process.env.PNPTV_FROM_EMAIL || 'support@pnptv.app',
      pass: process.env.SMTP_PASS,
    },
  });
  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
  <p>Hey ${firstName}!</p>
  <p>Santino here. 👋</p>
  <p>I just opened up my schedule for the <strong>next 72 hours</strong> — and you're on my call waitlist, so I wanted to reach out personally.</p>
  <p>Grab your spot before it fills up:</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${bookingUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block">
      📅 Book your ${durationMin}-min call
    </a>
  </p>
  <p style="font-size:13px;color:#666">This window closes in 72 hours. See you soon 🔥</p>
  <p>— Santino<br><a href="https://pnptv.app">pnptv.app</a></p>
</div>`;
  return transporter.sendMail({
    from: 'Santino at PNPtv! <support@pnptv.app>',
    to,
    subject: `Hey ${firstName} — I'm available to call for the next 72 hours 👋`,
    html,
  });
}

// ── Message copy ──────────────────────────────────────────────────────────────

function dmText(firstName, durationMin) {
  return [
    `Hey ${firstName}! 👋`,
    ``,
    `<b>Santino here.</b> I just opened up my schedule for the next <b>72 hours</b> — and you're on my call waitlist, so I wanted to reach out personally.`,
    ``,
    `Grab your spot before it fills up 🔥`,
  ].join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  const { rows: waitlist } = await query(`
    SELECT w.id, w.member_id, w.duration_min,
           u.username, u.first_name, u.telegram, u.email
    FROM call_booking_waitlist w
    JOIN users u ON u.id::text = w.member_id
    WHERE w.creator_id = '8599671840'
      AND w.notified_at IS NULL
    ORDER BY w.created_at ASC
  `);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — Santino available 72h · waitlist DM · 2026-09-23');
  console.log(`  Audience  : ${waitlist.length} users`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    for (const w of waitlist) {
      const dur = w.duration_min || 30;
      const url = `https://pnptv.app/c/${CREATOR_USER}?action=book&duration=${dur}`;
      console.log(`  @${w.username} (${w.first_name}) — ${w.telegram ? 'TG:' + w.telegram : 'email:' + w.email}`);
      console.log(`  URL: ${url}`);
      console.log(`  MSG:\n${dmText(w.first_name, dur)}`);
      console.log(`  [Button: 📅 Book your ${dur}-min call → ${url}]`);
      console.log('  ───');
    }
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  const notifiedIds = [];

  for (const w of waitlist) {
    const dur = w.duration_min || 30;
    const url = `https://pnptv.app/c/${CREATOR_USER}?action=book&duration=${dur}`;
    let reached = false;

    if (w.telegram) {
      const res = await tgSend(w.telegram, dmText(w.first_name, dur), url, dur);
      reached = res.ok === true;
      console.log(`  TG @${w.username} (${w.telegram}) → ${reached ? '✅ sent' : '❌ ' + JSON.stringify(res)}`);
    } else if (w.email) {
      try {
        await sendEmail(w.email, w.first_name, dur, url);
        reached = true;
        console.log(`  Email @${w.username} (${w.email}) → ✅ sent`);
      } catch (err) {
        console.log(`  Email @${w.username} → ❌ ${err.message}`);
      }
    } else {
      console.log(`  @${w.username} — no telegram or email, skipping`);
    }

    if (reached) notifiedIds.push(w.id);
    await sleep(600);
  }

  // CC Santino
  const santinoUrl = `https://pnptv.app/c/${CREATOR_USER}?action=book`;
  const ccRes = await tgSend(
    SANTINO_TG_ID,
    `[CC] Sent availability DM to ${notifiedIds.length} waitlisted users:\n${waitlist.map(w => `• @${w.username}`).join('\n')}`,
    santinoUrl,
    60
  );
  console.log(`\n  CC Santino (${SANTINO_TG_ID}) → ${ccRes.ok ? '✅' : '❌ ' + JSON.stringify(ccRes)}`);

  if (notifiedIds.length) {
    await query(
      `UPDATE call_booking_waitlist SET notified_at = NOW() WHERE id = ANY($1::bigint[])`,
      [notifiedIds]
    );
    console.log(`\n  ✅ Marked ${notifiedIds.length} waitlist entries as notified.`);
  }

  console.log('\n  Done.\n');
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
