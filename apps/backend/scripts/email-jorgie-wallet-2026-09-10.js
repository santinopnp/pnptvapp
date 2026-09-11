#!/usr/bin/env node
'use strict';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const emailService = require(path.join(BACKEND, 'services/emailservice'));

const TO      = 'j0rg132026@yahoo.com';
const WALLET  = 'https://pnptv.app/wallet';
const SUBJECT = 'Jorgie, you have $23 waiting in your PNPtv! wallet 💎';

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#eee">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;background:#0a0a14;line-height:1.6">
  <div style="text-align:center;margin-bottom:28px">
    <img src="https://pnptv.app/logo-final.png" alt="PNPtv!" width="80" height="80" style="border-radius:16px"/>
  </div>

  <p>Hey Jorgie 👋</p>

  <p>You have <strong>$23.46 USDC</strong> sitting in your PNPtv! wallet on Base — funded and ready to spend.</p>

  <div style="background:#1a0d1f;border:1px solid #D4007A44;border-radius:12px;padding:24px;margin:24px 0">
    <div style="font-size:20px;font-weight:800;color:#FF69B4;margin-bottom:12px">💎 Here's what $23 unlocks</div>
    <ul style="color:#ccc;padding-left:20px;line-height:2;margin:0">
      <li><strong>PRIME membership</strong> — full access to exclusive content, live streams &amp; private calls</li>
      <li><strong>Ru$h 💎</strong> to tip your favorite creator live on Main Stage</li>
      <li><strong>A private call</strong> with any available creator</li>
    </ul>
  </div>

  <p>Your USDC is already in the wallet — no need to add a card or anything. Just open it and tap what you want.</p>

  <p style="text-align:center;margin:32px 0">
    <a href="${WALLET}" style="display:inline-block;background:linear-gradient(90deg,#D4007A,#E69138);color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">💎 Open my wallet</a>
  </p>

  <p style="color:#888;font-size:12px;margin-top:32px">— The PNPtv! team</p>
</div>
</body></html>`;

async function main() {
  const DRY = !process.argv.includes('--live');
  if (DRY) {
    console.log(`DRY RUN — would send to ${TO}`);
    console.log(`Subject: ${SUBJECT}`);
    console.log('Pass --live to send.');
    process.exit(0);
  }
  console.log(`Sending to ${TO}...`);
  const r = await emailService.send({ to: TO, subject: SUBJECT, html });
  if (r && r.success !== false) {
    console.log('✓ sent', r.messageId || '');
  } else {
    console.error('✗ failed', r);
  }
  process.exit(0);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
