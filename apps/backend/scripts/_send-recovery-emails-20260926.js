#!/usr/bin/env node
'use strict';
const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const EmailService = require(path.join(BACKEND, 'services/emailservice'));

const emails = [
  {
    to: 'boyasian1195@gmail.com',
    subject: '🔥 Your $50 PRIME checkout link — ready now',
    html: `<p>Hey,</p>
<p>Santino here. You started the $50/year PRIME checkout today, but the payment link expired before you could complete it.</p>
<p>Here's a fresh link, ready now:<br>
<a href="https://nowpayments.io/payment/?iid=5632513533">👉 Pay now — $50/year PRIME</a></p>
<p>Full PRIME access, no monthly fees.</p>
<p>— Santino @ PNPtv!</p>`,
  },
  {
    to: 'davidcali5959@gmail.com',
    subject: '🖤 Your Founders checkout link — $99.99 lifetime',
    html: `<p>Hey,</p>
<p>Santino here. You started the Founders Lifetime checkout today, but the payment link expired before you could complete it.</p>
<p>Here's a fresh link:<br>
<a href="https://pnptv.app/founders">👉 pnptv.app/founders — $99.99 one-time</a></p>
<p>Lifetime membership + 18 months PRIME included. No subscription, ever.</p>
<p>— Santino @ PNPtv!</p>`,
  },
  {
    to: 'sunnyfie@googlemail.com',
    subject: '🖤 Your Founders checkout link — $99.99 lifetime',
    html: `<p>Hey,</p>
<p>Santino here. You started the Founders Lifetime checkout today, but the payment link expired before you could complete it.</p>
<p>Here's a fresh link:<br>
<a href="https://pnptv.app/founders">👉 pnptv.app/founders — $99.99 one-time</a></p>
<p>Lifetime membership + 18 months PRIME included. No subscription, ever.</p>
<p>— Santino @ PNPtv!</p>`,
  },
];

async function main() {
  for (const e of emails) {
    try {
      await EmailService.send(e);
      console.log(`✓ sent to ${e.to}`);
    } catch (err) {
      console.error(`✗ ${e.to}: ${err.message}`);
    }
  }
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
