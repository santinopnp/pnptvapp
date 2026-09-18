#!/usr/bin/env node
'use strict';

/**
 * One-off outreach to COYOTEE1214 — wallet completion.
 * User bought USDC via MoonPay, initiated 6 checkout intents (all expired),
 * never completed the send. Their USDC is in their crypto wallet. We're
 * explaining the 3 steps and giving a 20% off code so their $25 covers any plan.
 *
 * Usage:
 *   docker cp ... pnptv-bot:/tmp/
 *   docker exec pnptv-bot node /tmp/outreach-coyotee1214-wallet.js --dry-run
 *   docker exec pnptv-bot node /tmp/outreach-coyotee1214-wallet.js
 */

const path = require('path');
const fs   = require('fs');

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
const crypto       = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');

const USER_ID        = 'a1dc4daf-a9e1-48ea-bc47-a2167d4f87ea';
const SYSTEM_SENDER  = '8552451957';
const PROMO_CODE     = 'COYOTE20';
const SUBSCRIBE_URL  = `https://pnptv.app/subscribe?promo=${PROMO_CODE}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── MESSAGES ───────────────────────────────────────────────────────────────

const DM_BODY =
`Hey — it's PNPtv! support here.

We saw you tried to unlock PRIME a few times and noticed your payment didn't go through. Your money is safe — it's still in your crypto wallet, not lost.

Here's how to complete it in 3 steps:

1. Go to pnptv.app/subscribe
2. Pick your plan and tap "Pay with crypto"
3. Your wallet will pop up — confirm the send and you're in ✅

We also set up a personal 20% off code for you:

Code: COYOTE20
→ ${SUBSCRIBE_URL}

Just paste the code at checkout or use the link above. Offer's good for 7 days.

Any issues, reply here and we'll sort it out.
— PNPtv! Team`;

const EMAIL_SUBJECT = 'Your $25 is safe — here\'s how to unlock PRIME (20% off inside)';

const EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${EMAIL_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d14;border-radius:16px;overflow:hidden;border:1px solid rgba(94,209,196,0.2);">
        <tr><td style="height:4px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);"></td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <img src="https://pnptv.app/logo-header.png" alt="PNPtv!" height="32" style="display:block;">
        </td></tr>
        <tr><td style="padding:16px 32px 32px;">
          <p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">Hey there,</p>
          <h1 style="margin:0 0 16px;font-size:21px;font-weight:900;color:#5ED1C4;line-height:1.3;">Your money is safe — you're one step away from PRIME 🔐</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.7;">We noticed you tried to unlock PRIME a few times but your payment didn't go through. Don't worry — your funds are still in your crypto wallet. Nothing was lost.</p>

          <p style="margin:0 0 12px;font-size:15px;color:#d1d5db;font-weight:700;">Here's how to complete it in 3 easy steps:</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:12px 16px;background:rgba(94,209,196,0.06);border-left:3px solid #5ED1C4;border-radius:4px;margin-bottom:8px;">
                <span style="font-size:18px;font-weight:900;color:#5ED1C4;">1.</span>
                <span style="font-size:14px;color:#d1d5db;margin-left:10px;">Go to <a href="${SUBSCRIBE_URL}" style="color:#5ED1C4;text-decoration:none;">pnptv.app/subscribe</a></span>
              </td>
            </tr>
            <tr><td style="height:6px;"></td></tr>
            <tr>
              <td style="padding:12px 16px;background:rgba(94,209,196,0.06);border-left:3px solid #5ED1C4;border-radius:4px;">
                <span style="font-size:18px;font-weight:900;color:#5ED1C4;">2.</span>
                <span style="font-size:14px;color:#d1d5db;margin-left:10px;">Pick any plan, tap <strong>"Pay with crypto"</strong></span>
              </td>
            </tr>
            <tr><td style="height:6px;"></td></tr>
            <tr>
              <td style="padding:12px 16px;background:rgba(94,209,196,0.06);border-left:3px solid #5ED1C4;border-radius:4px;">
                <span style="font-size:18px;font-weight:900;color:#5ED1C4;">3.</span>
                <span style="font-size:14px;color:#d1d5db;margin-left:10px;">Your wallet opens — confirm the send. That's it ✅</span>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="padding:20px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);border-radius:12px;text-align:center;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.15em;color:#9ca3af;margin-bottom:8px;">Your personal discount</div>
              <div style="font-size:32px;font-weight:900;color:#A78BFA;letter-spacing:0.08em;font-family:monospace;">${PROMO_CODE}</div>
              <div style="margin-top:8px;font-size:13px;color:#5ED1C4;font-weight:600;">20% off any plan · Valid 7 days</div>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr><td align="center">
              <a href="${SUBSCRIBE_URL}" style="display:inline-block;padding:16px 40px;background:linear-gradient(90deg,#5ED1C4,#A78BFA);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;">Unlock PRIME Now →</a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">Questions? Just reply to this email — we'll help you through it.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:11px;color:#6b7280;">🔒 Encrypted · Discreet billing · pnptv.app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── PROMO CREATION ─────────────────────────────────────────────────────────

async function ensurePromo() {
  const validUntil = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  const { rows } = await query(
    `SELECT code FROM promos WHERE UPPER(code) = $1 AND active = true AND valid_until > NOW() LIMIT 1`,
    [PROMO_CODE]
  );
  if (rows.length) {
    console.log(`   ✓ Promo ${PROMO_CODE} already exists`);
    return;
  }

  if (DRY_RUN) {
    console.log(`   [DRY] would create promo ${PROMO_CODE} (20% off any plan, 7 days, 1 use)`);
    return;
  }

  await query(
    `INSERT INTO promos
       (code, name, name_es, description, base_plan_id, discount_type, discount_value,
        target_audience, max_spots, valid_from, valid_until,
        features, features_es, active, hidden, created_by)
     VALUES ($1,$2,$3,$4,'any','percentage',20,'all',1,NOW(),$5,'[]','[]',true,true,$6)`,
    [
      PROMO_CODE,
      'Wallet recovery — COYOTEE1214',
      'Recuperación de cartera — COYOTEE1214',
      `20% off, 1 use. Personal code for user ${USER_ID} (wallet completion recovery).`,
      validUntil,
      'outreach-coyotee1214-wallet',
    ]
  );
  console.log(`   ✓ Created promo ${PROMO_CODE}`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log(' OUTREACH: COYOTEE1214 — wallet completion');
  console.log('══════════════════════════════════════════════');
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');
  else         console.log(' MODE: LIVE\n');

  // 1. Ensure promo exists
  await ensurePromo();

  // 2. In-app DM
  if (DRY_RUN) {
    console.log('\n[DRY] IN-APP DM:');
    console.log(DM_BODY);
  } else {
    try {
      await sendSystemDM(SYSTEM_SENDER, USER_ID, DM_BODY, query);
      console.log('   ✓ In-app DM sent');
    } catch (err) {
      console.warn(`   ✗ DM failed: ${err.message}`);
    }
    await sleep(300);
  }

  // 3. Email
  if (DRY_RUN) {
    console.log('\n[DRY] EMAIL → coyotee143@gmail.com');
    console.log(`Subject: ${EMAIL_SUBJECT}`);
  } else {
    const transporter = nodemailer.createTransport({
      host:   process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
      port:   parseInt(process.env.PNPTV_SMTP_PORT || '587', 10),
      secure: process.env.PNPTV_SMTP_SECURE === 'true',
      auth:   { user: process.env.PNPTV_SMTP_USER, pass: process.env.PNPTV_SMTP_PASS },
    });
    try {
      await transporter.sendMail({
        from:    '"PNPtv! Support" <noreply@pnptv.app>',
        to:      'coyotee143@gmail.com',
        subject: EMAIL_SUBJECT,
        html:    EMAIL_HTML,
      });
      console.log('   ✓ Email sent → coyotee143@gmail.com');
    } catch (err) {
      console.warn(`   ✗ Email failed: ${err.message}`);
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(` ${DRY_RUN ? 'DRY RUN COMPLETE' : 'DONE'}`);
  console.log('══════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
