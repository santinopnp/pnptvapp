#!/usr/bin/env node
'use strict';

/**
 * Check USDC balances on Base for users with linked wallets who never
 * completed a checkout. Message those who still have funds sitting idle.
 *
 * Usage:
 *   docker cp ... pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/outreach-funded-wallets-2026-09-18.js --dry-run
 *   docker exec pnptv-bot node /tmp/outreach-funded-wallets-2026-09-18.js
 */

const path = require('path');
const fs   = require('fs');
const https = require('https');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';

const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/nodemailer'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }    = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));
const nodemailer   = nm('nodemailer');
const { Telegram } = nm('telegraf');

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message);
  process.exit(1);
});

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_DM       = process.argv.includes('--skip-dm');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_EMAIL    = process.argv.includes('--skip-email');

const SYSTEM_SENDER = '8552451957';
const CAMPAIGN      = 'funded-wallet-outreach-2026-09-18';
const SUBSCRIBE_URL = 'https://pnptv.app/subscribe';

// USDC on Base
const BASE_RPC       = 'https://mainnet.base.org';
const USDC_CONTRACT  = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDC_DECIMALS  = 6;
const MIN_USD_THRESHOLD = 3.00; // ignore dust

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEn  = (lang) => !lang || /^(en|zh|ar)/i.test(String(lang));

// ─── BASE RPC HELPER ────────────────────────────────────────────────────────

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url  = new URL(BASE_RPC);
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('RPC parse error: ' + data.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getUsdcBalance(walletAddress) {
  // balanceOf(address) = 0x70a08231 + address padded to 32 bytes
  const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = '0x70a08231' + paddedAddr;
  const result = await rpcCall('eth_call', [
    { to: USDC_CONTRACT, data },
    'latest',
  ]);
  if (result.error) throw new Error(result.error.message);
  const raw = BigInt(result.result || '0x0');
  return Number(raw) / Math.pow(10, USDC_DECIMALS); // USD value (USDC = 1:1)
}

// ─── MESSAGES ───────────────────────────────────────────────────────────────

function tgMsg(lang, name, usdAmount, promoCode) {
  const url = `${SUBSCRIBE_URL}?promo=${promoCode}`;
  if (lang === 'es') return `
💳 <b>Tienes fondos en tu wallet de PNPtv!</b>

Hola ${name} — detectamos que tienes <b>~$${usdAmount.toFixed(2)} USDC</b> en tu wallet conectada, listos para usar.

Úsalos para desbloquear PRIME ahora — te dejamos un 20% de descuento:

🏷 Código: <code>${promoCode}</code>
👉 <a href="${url}">Canjear ahora</a>

Tu código expira en 7 días.`.trim();

  return `
💳 <b>You have funds sitting in your PNPtv! wallet</b>

Hey ${name} — we noticed you have <b>~$${usdAmount.toFixed(2)} USDC</b> in your connected wallet, ready to spend.

Use it to unlock PRIME right now — here's 20% off on us:

🏷 Code: <code>${promoCode}</code>
👉 <a href="${url}">Claim now</a>

Code expires in 7 days.`.trim();
}

function dmMsg(lang, name, usdAmount, promoCode) {
  const url = `${SUBSCRIBE_URL}?promo=${promoCode}`;
  if (lang === 'es') return `Hola ${name} — tienes ~$${usdAmount.toFixed(2)} USDC en tu wallet de PNPtv! listos para usar.

Aquí tienes 20% de descuento para desbloquear PRIME ahora:

Código: ${promoCode}
${url}

Válido 7 días.`.trim();

  return `Hey ${name} — you've got ~$${usdAmount.toFixed(2)} USDC sitting in your connected PNPtv! wallet.

Here's 20% off to put it to use right now:

Code: ${promoCode}
${url}

Valid 7 days.`.trim();
}

const EMAIL_SUBJECT = {
  en: (amt) => `💳 You have $${amt} USDC ready to spend on PNPtv!`,
  es: (amt) => `💳 Tienes $${amt} USDC listos para usar en PNPtv!`,
};

function emailHtml(lang, name, usdAmount, promoCode) {
  const url  = `${SUBSCRIBE_URL}?promo=${promoCode}`;
  const en   = lang === 'en';
  const amt  = usdAmount.toFixed(2);
  const h    = en ? `You have $${amt} USDC ready in your wallet` : `Tienes $${amt} USDC listos en tu wallet`;
  const body = en
    ? `Your connected crypto wallet has <strong>$${amt} USDC</strong> waiting. Put it to work — unlock PNPtv! PRIME right now with 20% off.`
    : `Tu wallet cripto conectada tiene <strong>$${amt} USDC</strong> esperando. Úsalos — desbloquea PNPtv! PRIME ahora con 20% de descuento.`;
  const cta  = en ? 'Unlock PRIME Now →' : 'Desbloquear PRIME Ahora →';
  const note = en ? 'Valid 7 days · one use' : 'Válido 7 días · un solo uso';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
<tr><td style="height:4px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);"></td></tr>
<tr><td style="padding:28px 32px 8px;"><img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;"></td></tr>
<tr><td style="padding:16px 32px 32px;">
  <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">Hey ${name},</p>
  <h1 style="margin:0 0 16px;font-size:21px;font-weight:900;color:#5ED1C4;line-height:1.3;">💳 ${h}</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.7;">${body}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
  <tr><td style="padding:20px;background:rgba(94,209,196,0.08);border:1px solid rgba(94,209,196,0.3);border-radius:12px;text-align:center;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#9ca3af;margin-bottom:8px;">Your code</div>
    <div style="font-size:28px;font-weight:900;color:#5ED1C4;font-family:monospace;">${promoCode}</div>
    <div style="margin-top:8px;font-size:13px;color:#A78BFA;font-weight:600;">20% off any plan · ${note}</div>
  </td></tr></table>
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center">
    <a href="${url}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;">${cta}</a>
  </td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;font-size:11px;color:#6b7280;">🔒 Encrypted · Discreet billing · pnptv.app</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

// ─── PROMO ───────────────────────────────────────────────────────────────────

async function ensurePromo(userId, suffix) {
  const code     = `WALLET20-${suffix}`;
  const validUntil = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  const { rows } = await query(
    `SELECT code FROM promos WHERE UPPER(code) = $1 AND active=true AND valid_until > NOW() LIMIT 1`,
    [code]
  );
  if (rows.length) return code;

  if (!DRY_RUN) {
    await query(
      `INSERT INTO promos
         (code,name,name_es,description,base_plan_id,discount_type,discount_value,
          target_audience,max_spots,valid_from,valid_until,features,features_es,active,hidden,created_by)
       VALUES($1,$2,$3,$4,'any','percentage',20,'all',1,NOW(),$5,'[]','[]',true,true,$6)`,
      [
        code,
        `Wallet recovery 20% — ${userId}`,
        `Recuperación wallet 20% — ${userId}`,
        `20% off, 1 use. Funded-wallet outreach for user ${userId}. Campaign: ${CAMPAIGN}.`,
        validUntil,
        CAMPAIGN,
      ]
    );
  }
  return code;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` FUNDED WALLET OUTREACH — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  // Load candidates
  const { rows: users } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id, u.username, u.first_name, u.email, u.telegram, u.language,
      u.wallet_address,
      MAX(ci.amount_usd) OVER (PARTITION BY u.id) as max_attempted_usd
    FROM checkout_intents ci
    JOIN users u ON u.id = ci.user_id
    WHERE ci.status = 'expired'
      AND ci.tx_hash IS NULL
      AND u.deleted_at IS NULL
      AND u.wallet_address IS NOT NULL
      AND u.id NOT IN ('8599671840','8552451957','fafa6786-de29-4216-b788-4f11d703df4f')
    ORDER BY u.id, ci.created_at DESC
  `);

  console.log(` Candidates with linked wallets: ${users.length}`);
  console.log(' Checking USDC balances on Base...\n');

  const tg = (SKIP_TELEGRAM || DRY_RUN) ? null : new Telegram(process.env.BOT_TOKEN);
  const transporter = (SKIP_EMAIL || DRY_RUN) ? null : nodemailer.createTransport({
    host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
    port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
    secure: process.env.PNPTV_SMTP_SECURE === 'true',
    auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
  });

  const stats = { checked: 0, funded: 0, dm: 0, tg: 0, email: 0, skipped: 0 };

  for (const u of users) {
    stats.checked++;
    const lang = isEn(u.language) ? 'en' : 'es';
    const name = (() => {
      const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
      if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
      return u.username || (lang === 'en' ? 'there' : 'amigo');
    })();

    let balance = 0;
    try {
      balance = await getUsdcBalance(u.wallet_address);
      console.log(` @${u.username} — wallet ${u.wallet_address.slice(0,10)}… → $${balance.toFixed(2)} USDC`);
    } catch (err) {
      console.warn(` @${u.username} — balance check failed: ${err.message}`);
      continue;
    }
    await sleep(200);

    if (balance < MIN_USD_THRESHOLD) {
      console.log(`   → below threshold ($${MIN_USD_THRESHOLD}) — skip`);
      stats.skipped++;
      continue;
    }

    stats.funded++;
    console.log(`   → FUNDED — sending outreach`);

    const suffix    = u.id.toString().replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
    const promoCode = await ensurePromo(u.id, suffix);
    if (DRY_RUN) console.log(`   [DRY] promo: ${promoCode}`);
    else         console.log(`   ✓ promo: ${promoCode}`);

    // In-app DM
    if (!SKIP_DM) {
      const body = dmMsg(lang, name, balance, promoCode);
      if (DRY_RUN) {
        console.log(`   [DRY] DM → ${u.id}\n   ${body.split('\n')[0]}...`);
      } else {
        try {
          await sendSystemDM(SYSTEM_SENDER, u.id, body, query);
          stats.dm++;
          console.log(`   ✓ DM sent`);
        } catch (err) {
          console.warn(`   ✗ DM: ${err.message}`);
        }
        await sleep(200);
      }
    }

    // Telegram
    if (!SKIP_TELEGRAM && u.telegram) {
      const msg = tgMsg(lang, name, balance, promoCode);
      if (DRY_RUN) {
        console.log(`   [DRY] TG → ${u.telegram}`);
      } else {
        try {
          await tg.sendMessage(u.telegram, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
          stats.tg++;
          console.log(`   ✓ TG → ${u.telegram}`);
        } catch (err) {
          console.warn(`   ✗ TG [${u.telegram}]: ${err.message}`);
        }
        await sleep(300);
      }
    }

    // Email
    if (!SKIP_EMAIL && u.email && !u.email.includes('@telegram.pnptv.app')) {
      if (DRY_RUN) {
        console.log(`   [DRY] Email → ${u.email}`);
      } else {
        try {
          await transporter.sendMail({
            from:    '"PNPtv!" <noreply@pnptv.app>',
            to:      u.email,
            subject: EMAIL_SUBJECT[lang](balance.toFixed(2)),
            html:    emailHtml(lang, name, balance, promoCode),
          });
          stats.email++;
          console.log(`   ✓ Email → ${u.email}`);
        } catch (err) {
          console.warn(`   ✗ Email: ${err.message}`);
        }
        await sleep(300);
      }
    }

    console.log();
  }

  console.log('══════════════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'} — ${CAMPAIGN}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` Checked:  ${stats.checked}`);
  console.log(` Funded:   ${stats.funded}   (above $${MIN_USD_THRESHOLD})`);
  console.log(` Skipped:  ${stats.skipped}  (dust / zero)`);
  console.log(` DM:       ${stats.dm}`);
  console.log(` Telegram: ${stats.tg}`);
  console.log(` Email:    ${stats.email}`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message, err.stack);
  process.exit(1);
});
