#!/usr/bin/env node
'use strict';

/**
 * notify-nowp-recovery-yearly50-20260917.js
 *
 * Targeted promo sent from Santino to the 3 users identified via NowPayments
 * API as having attempted (and not completed) a crypto payment in the last 72h.
 *
 * Offer: PRIME Annual — $50/year (plan: yearly50)
 *
 * Users:
 *   5196484815  RAR77BCN / Ben        ES  email: rubenalonsoruiz@hotmail.com
 *   6454583032  EDUARDOGUZMANPEREZ    EN  telegram only
 *   7330183017  K_CHORRO_SLMR         ES  telegram only
 *
 * Channels: in-app DM (Santino) + push + email (Ben only)
 * Dedup   : broadcast_dedup, batch_id 'santino-nowp-recovery-yearly50-20260917'
 *
 * Usage (dry run — default):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     -e POSTGRES_HOST=pg-pnptv -e POSTGRES_PORT=5432 \
 *     -e POSTGRES_DB=pnptvbot -e POSTGRES_USER=pnptvbot \
 *     -e POSTGRES_PASSWORD="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)" \
 *     -e VAPID_PUBLIC_KEY="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)" \
 *     -e VAPID_PRIVATE_KEY="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)" \
 *     -e VAPID_SUBJECT="$(docker exec pnptv-bot printenv VAPID_SUBJECT)" \
 *     -e SMTP_HOST="$(docker exec pnptv-bot printenv SMTP_HOST)" \
 *     -e SMTP_PORT="$(docker exec pnptv-bot printenv SMTP_PORT)" \
 *     -e SMTP_USER="$(docker exec pnptv-bot printenv SMTP_USER)" \
 *     -e SMTP_PASS="$(docker exec pnptv-bot printenv SMTP_PASS)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/notify-nowp-recovery-yearly50-20260917.js --dry-run
 *
 * Live run: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));
const emailService                  = require(path.join(BACKEND, 'services/emailservice'));

const DRY_RUN    = process.argv.includes('--dry-run');
const SKIP_PUSH  = process.argv.includes('--skip-push');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const BATCH_ID   = 'santino-nowp-recovery-yearly50-20260917';
const SENDER_ID  = '8599671840'; // Santino
const CTA_URL    = 'https://pnptv.app/subscribe';

const USERS = [
  { id: '5196484815', name: 'Ben',   lang: 'es', email: 'rubenalonsoruiz@hotmail.com' },
  { id: '6454583032', name: 'Eddie', lang: 'en', email: null },
  { id: '7330183017', name: null,    lang: 'es', email: null },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(name, lang) {
  const hi = name ? (lang === 'es' ? `Hola ${name}` : `Hey ${name}`) : (lang === 'es' ? 'Hola' : 'Hey');
  if (lang === 'es') {
    return `💎 *Un año de PRIME por $50 — solo para ti*

${hi} — soy Santino. Quería escribirte directamente con algo especial.

Por tiempo limitado, podés activar un año completo de PRIME por solo $50 — sin cobros recurrentes, sin sorpresas. Acceso total a todo lo que PNPtv tiene para ofrecerte: contenido exclusivo, Main Stage, llamadas privadas con creadores, y todo lo que seguimos construyendo.

Entrá cuando quieras y aprovechalo:
👉 ${CTA_URL}

— Santino`;
  }
  return `💎 *A full year of PRIME for $50 — just for you*

${hi} — Santino here. Wanted to reach out personally with something special.

For a limited time, you can activate a full year of PRIME for just $50 — no recurring charges, no surprises. Full access to everything PNPtv has to offer: exclusive content, the Main Stage, private calls with creators, and everything we keep building.

Tap in whenever you're ready:
👉 ${CTA_URL}

— Santino`;
}

function pushPayload(name, lang) {
  if (lang === 'es') {
    return {
      title: '💎 Un año de PRIME por $50 — oferta personal',
      body:  'Santino te escribió. Acceso total, sin cobros recurrentes.',
      url:   CTA_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💎 A full year of PRIME for $50 — personal offer',
    body:  'Santino reached out. Full access, no recurring charges.',
    url:   CTA_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
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

function emailHtml(name, lang) {
  const hi = name ? (lang === 'es' ? `Hola ${name}` : `Hey ${name}`) : (lang === 'es' ? 'Hola' : 'Hey');
  const preheader = lang === 'es'
    ? 'Un año de PRIME por $50 — mensaje personal de Santino'
    : 'A full year of PRIME for $50 — personal message from Santino';
  const body = lang === 'es' ? `
    <p style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px">${hi} 👋</p>
    <p>Soy Santino, fundador de PNPtv. Quería escribirte directamente con algo especial.</p>
    <p>Por tiempo limitado, podés activar <strong>un año completo de PRIME por solo $50</strong> — sin cobros recurrentes, sin sorpresas. Acceso total: contenido exclusivo, Main Stage, llamadas privadas con creadores, y todo lo que seguimos construyendo.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${CTA_URL}" style="display:inline-block;padding:16px 32px;background:linear-gradient(90deg,#d4007a,#ff6600);color:#fff;font-weight:800;font-size:16px;border-radius:12px;text-decoration:none;letter-spacing:0.04em">
        💎 VER PLAN ANUAL — $50
      </a>
    </div>
    <p style="font-size:13px;color:#aaa">Entrá cuando quieras. Esta oferta es por tiempo limitado.</p>
    <p>— Santino<br><span style="font-size:12px;color:#888">Fundador, PNPtv!</span></p>
  ` : `
    <p style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px">${hi} 👋</p>
    <p>I'm Santino, founder of PNPtv. Wanted to reach you personally with something special.</p>
    <p>For a limited time, you can activate <strong>a full year of PRIME for just $50</strong> — no recurring charges, no surprises. Full access: exclusive content, the Main Stage, private calls with creators, and everything we keep building.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${CTA_URL}" style="display:inline-block;padding:16px 32px;background:linear-gradient(90deg,#d4007a,#ff6600);color:#fff;font-weight:800;font-size:16px;border-radius:12px;text-decoration:none;letter-spacing:0.04em">
        💎 SEE ANNUAL PLAN — $50
      </a>
    </div>
    <p style="font-size:13px;color:#aaa">Tap in whenever you're ready. This offer is limited time.</p>
    <p>— Santino<br><span style="font-size:12px;color:#888">Founder, PNPtv!</span></p>
  `;
  return htmlShell(preheader, body);
}

function emailSubject(lang) {
  return lang === 'es'
    ? '💎 Un año de PRIME por $50 — mensaje personal'
    : '💎 A full year of PRIME for $50 — personal note';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — NowPayments recovery · $50/year promo from Santino');
  console.log(`  Batch   : ${BATCH_ID}`);
  console.log(`  Users   : ${USERS.length}`);
  console.log(`  Mode    : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    for (const u of USERS) {
      console.log(`── User ${u.id} (${u.name || '?'}) [${u.lang}] ──`);
      console.log(dmText(u.name, u.lang));
      if (u.email) {
        console.log(`\n  → email to ${u.email}`);
        console.log(`  Subject: ${emailSubject(u.lang)}`);
      }
      console.log();
    }
    console.log('-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let dmOk = 0, pushOk = 0, emailOk = 0, errors = 0;

  for (const u of USERS) {
    console.log(`\n→ ${u.id} (${u.name || '?'}) [${u.lang}]`);

    // In-app DM
    try {
      await sendSystemDM(SENDER_ID, u.id, dmText(u.name, u.lang), query);
      await query(
        'INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [BATCH_ID, u.id]
      );
      console.log('  ✓ in-app DM');
      dmOk++;
    } catch (err) {
      console.error(`  ✗ in-app DM: ${err.message}`);
      errors++;
    }

    // Push
    if (!SKIP_PUSH) {
      try {
        const n = await PushNotificationService.sendToUser(u.id, pushPayload(u.name, u.lang));
        console.log(`  ✓ push (${n} delivered)`);
        pushOk++;
      } catch (err) {
        console.error(`  ✗ push: ${err.message}`);
      }
    }

    // Email (only for users with an address)
    if (!SKIP_EMAIL && u.email) {
      try {
        const r = await emailService.send({
          to:      u.email,
          subject: emailSubject(u.lang),
          html:    emailHtml(u.name, u.lang),
        });
        if (r && r.success !== false) {
          console.log(`  ✓ email → ${u.email}`);
          emailOk++;
        } else {
          console.error(`  ✗ email: ${(r && r.error) || '?'}`);
          errors++;
        }
      } catch (err) {
        console.error(`  ✗ email: ${err.message}`);
        errors++;
      }
    }

    await sleep(200);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  In-app DMs : ${dmOk}`);
  console.log(`  Push       : ${pushOk}`);
  console.log(`  Emails     : ${emailOk}`);
  console.log(`  Errors     : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
