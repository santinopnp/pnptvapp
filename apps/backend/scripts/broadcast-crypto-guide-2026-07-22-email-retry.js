#!/usr/bin/env node
'use strict';

/**
 * broadcast-crypto-guide-2026-07-22-email-retry.js
 *
 * Retries the crypto-guide email that failed for ~795/1244 users during the
 * initial resume run due to Hostinger HTTP API rate limits.
 *
 * Uses direct SMTP via nodemailer (not the Hostinger HTTP API) with 1.5s
 * pacing to stay under Hostinger's outbound rate limits.
 *
 * Idempotent: after each success we insert a row into `notifications` with
 * entity_id = 'crypto-guide-2026-07-22-email'. Re-runs skip users already
 * recorded. Failures are appended to /tmp/crypto-guide-email-failures.csv.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-email-retry.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-email-retry.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-email-retry.js --delay 3000
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-crypto-guide-2026-07-22-email-retry.js --force
 */

const path = require('path');
const fs   = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const nodemailer = require('nodemailer');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const delayIdx = process.argv.indexOf('--delay');
const DELAY_MS = delayIdx !== -1 ? Math.max(200, parseInt(process.argv[delayIdx + 1], 10) || 1500) : 1500;

const ENTITY_ID = 'crypto-guide-2026-07-22-email';
const APP_URL   = 'https://pnptv.app';
const GUIDE_URL = `${APP_URL}/crypto-guide`;
const FAILURE_LOG = '/tmp/crypto-guide-email-failures.csv';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');

// ── Copy (identical to the resume script) ─────────────────────────────────────

const EMAIL_SUBJECT = {
  en: 'You asked, we shipped: the new crypto checkout + a 5-minute guide',
  es: 'Nos lo pediste, lo hicimos: nuevo checkout cripto + guía de 5 minutos',
};

function buildEmailHtml(lang, name) {
  const en = lang === 'en';
  const greeting = en ? `Hi ${name}!` : `¡Hola ${name}!`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#121220;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138)"></td></tr>
        <tr><td style="padding:28px 32px 8px"><p style="margin:0;font-size:22px;font-weight:900;color:#fff">PNPtv!</p></td></tr>
        <tr><td style="padding:8px 32px 32px">
          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">${greeting}</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:900;color:#fff;line-height:1.25">💸 ${en ? 'You asked, we shipped.' : 'Nos lo pediste, lo hicimos.'}</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6">${en ? 'You told us paying with crypto felt intimidating. We listened.' : 'Nos dijiste que pagar con cripto se sentía intimidante. Te escuchamos.'}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr><td style="padding:18px 20px;background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.2);border-radius:12px">
            <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#4ade80">✅ ${en ? 'Rebuilt crypto checkout' : 'Checkout cripto rediseñado'}</p>
            <p style="margin:0;font-size:13px;color:#d1d5db;line-height:1.55">${en ? 'Faster, cleaner, fewer steps. Same coins (BTC, ETH, USDC, Dash and 100+ more).' : 'Más rápido, más limpio, menos pasos. Las mismas monedas (BTC, ETH, USDC, Dash y más de 100).'}</p>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td style="padding:18px 20px;background:rgba(212,0,122,0.07);border:1px solid rgba(212,0,122,0.2);border-radius:12px">
            <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#f472b6">🆕 ${en ? 'Crypto 101 wizard' : 'Asistente Cripto 101'}</p>
            <p style="margin:0 0 12px;font-size:13px;color:#d1d5db;line-height:1.55">${en ? 'For anyone who\'s never touched crypto before. Step-by-step: download a wallet, buy the coin, pay. Under 5 minutes, no jargon.' : 'Para quien nunca haya usado cripto. Paso a paso: descargar una wallet, comprar la moneda, pagar. Menos de 5 minutos, sin tecnicismos.'}</p>
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#fff">${en ? 'You\'ll learn:' : 'Aprenderás a:'}</p>
            <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">1. ${en ? 'Pick and install a wallet (Trust Wallet, Dash Wallet)' : 'Elegir e instalar una wallet (Trust Wallet, Dash Wallet)'}</p>
            <p style="margin:0 0 3px;font-size:12px;color:#9ca3af">2. ${en ? 'Buy the coin (BTC, ETH, USDC, Dash…)' : 'Comprar la moneda (BTC, ETH, USDC, Dash…)'}</p>
            <p style="margin:0;font-size:12px;color:#9ca3af">3. ${en ? 'Pay at pnptv.app/subscribe — done' : 'Pagar en pnptv.app/subscribe — listo'}</p>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr><td align="center">
            <a href="${GUIDE_URL}" style="display:inline-block;padding:15px 44px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:12px">${en ? 'Open the Crypto 101 wizard →' : 'Abrir el asistente Cripto 101 →'}</a>
          </td></tr></table>
          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center">${en ? 'Why crypto? No bank can freeze our community. No processor can censor what PNP means. Privacy, freedom, control.' : '¿Por qué cripto? Ningún banco puede congelar a nuestra comunidad. Ningún procesador puede censurar lo que significa PNP. Privacidad, libertad, control.'}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;line-height:1.6">${en ? 'Thanks for pushing us to make this better. 🖤' : 'Gracias por empujarnos a mejorar esto. 🖤'}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08)"><p style="margin:0;font-size:11px;color:#6b7280">${en ? 'You received this as a member of PNPtv!.' : 'Recibiste esto por ser miembro de PNPtv!.'} 🔒 pnptv.app</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Crypto Guide — Email RETRY (SMTP)');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN — nothing will be sent');
  console.log(` DELAY_MS: ${DELAY_MS}`);
  console.log(` FAILURE_LOG: ${FAILURE_LOG}`);

  const { rows: users } = await query(`
    SELECT u.id, u.first_name, u.username, u.email, u.language
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role != 'banned'
      AND u.email IS NOT NULL
      AND u.email NOT LIKE '%@telegram.pnptv.app'
    ORDER BY u.id
  `);

  // Idempotency: skip users already recorded as email-sent for this entity_id
  let alreadySent = new Set();
  if (!FORCE) {
    const { rows: doneRows } = await query(
      `SELECT target_user_id FROM notifications WHERE entity_id = $1 AND entity_type = 'email' AND actor_id IS NULL`,
      [ENTITY_ID],
    );
    alreadySent = new Set(doneRows.map(r => r.target_user_id));
  }
  const targets = users.filter(u => !alreadySent.has(u.id));

  console.log(`\n   Total email users:  ${users.length}`);
  console.log(`   Already sent:       ${alreadySent.size}`);
  console.log(`   Retry targets:      ${targets.length}`);
  console.log(`   Est. duration:      ~${Math.ceil((targets.length * DELAY_MS) / 60000)} min\n`);

  if (DRY_RUN) {
    console.log(' [DRY] Sample first 3 targets:');
    targets.slice(0, 3).forEach(u => console.log(`   ${u.id}  ${u.email}  lang=${u.language}`));
    process.exit(0);
  }

  // Direct SMTP transport (bypasses the HTTP API's ratelimit)
  const transporter = nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST,
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    pool: true,
    maxConnections: 2,
    rateDelta: 1000,
    rateLimit: 3,
    auth: {
      user: process.env.PNPTV_SMTP_USER,
      pass: process.env.PNPTV_SMTP_PASS,
    },
  });
  const FROM = `"PNPtv!" <${process.env.PNPTV_SMTP_USER}>`;

  // Ensure failure log exists with header
  if (!fs.existsSync(FAILURE_LOG)) {
    fs.writeFileSync(FAILURE_LOG, 'timestamp,user_id,email,error\n');
  }

  const stats = { sent: 0, failed: 0 };
  const start = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = u.first_name || u.username || (lang === 'en' ? 'Member' : 'Miembro');
    try {
      await transporter.sendMail({
        from: FROM,
        to: u.email,
        subject: EMAIL_SUBJECT[lang],
        html: buildEmailHtml(lang, name),
      });
      stats.sent++;

      // Record success (idempotency)
      await query(
        `INSERT INTO notifications (type, category, priority, actor_id, target_user_id, entity_type, entity_id, message)
         VALUES ('email_delivery', 'system', 'low', NULL, $1, 'email', $2, 'crypto-guide sent via SMTP retry')
         ON CONFLICT (type, target_user_id, entity_type, entity_id) WHERE actor_id IS NULL
         DO NOTHING`,
        [u.id, ENTITY_ID],
      ).catch(() => {}); // non-fatal
    } catch (err) {
      stats.failed++;
      const line = `${new Date().toISOString()},${u.id},${u.email},"${String(err.message).replace(/"/g, '""')}"\n`;
      try { fs.appendFileSync(FAILURE_LOG, line); } catch {}
      if (stats.failed <= 5 || stats.failed % 25 === 0) {
        console.warn(`     Email err [${u.email}]: ${err.message}`);
      }
    }

    await sleep(DELAY_MS);
    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`     progress ${i + 1}/${targets.length}  sent=${stats.sent} failed=${stats.failed}  elapsed=${elapsed}s`);
    }
  }

  transporter.close();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` EMAIL RETRY COMPLETE`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Sent:   ${stats.sent}`);
  console.log(` Failed: ${stats.failed}  → see ${FAILURE_LOG}`);
  console.log(` Elapsed: ${((Date.now() - start) / 1000 / 60).toFixed(1)} min`);
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
