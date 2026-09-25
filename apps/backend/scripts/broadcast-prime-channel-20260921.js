#!/usr/bin/env node
'use strict';

/**
 * broadcast-prime-channel-20260921.js
 *
 * Mass broadcast announcing PRIME includes full platform access + the exclusive
 * PNPtv! PRIME Channel featuring @SantinoFurioso and @pnplatinoboy content.
 *
 * Audience : all users where tier NOT IN ('prime','banned'), telegram IS NOT NULL
 *            + Santino force-CC'd (8599671840) regardless of tier
 * Channels : in-app DM (from Santino) + push + email where available
 * Hero      : channel-209 cover image (prime channel)
 * Dedup     : broadcast_dedup LIKE 'prime-channel-20260921%'
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
 *     -e EASYBOTS_SMTP_PASS="$(docker exec pnptv-bot printenv EASYBOTS_SMTP_PASS)" \
 *     -v /opt/pnptvapp:/app \
 *     -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-prime-channel-20260921.js --dry-run
 *
 * Live run: remove --dry-run
 */

const path    = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const nodemailer = require('nodemailer');

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const mailer = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 587,
  secure: false,
  auth: { user: 'hello@easybots.store', pass: process.env.EASYBOTS_SMTP_PASS },
});

const DRY_RUN    = process.argv.includes('--dry-run');
const SKIP_PUSH  = process.argv.includes('--skip-push');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const BATCH_ID   = 'prime-channel-20260921';
const SENDER_ID  = '8599671840'; // Santino
const CTA_URL    = 'https://pnptv.app/subscribe';
const IMAGE_URL  = 'https://pnptv.app/uploads/channels/channel-209-1788546353680.webp';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Copy ─────────────────────────────────────────────────────────────────────

function dmText(lang) {
  if (lang === 'es') {
    return `💎 *El Canal PRIME ya tiene contenido — y es exclusivo nuestro*

Hola, soy Santino.

PRIME incluye todo lo que conocés de PNPtv: el feed completo, el Main Stage en vivo, llamadas privadas con creadores.

Pero ahora también incluye el *Canal PRIME* — donde Lex (@pnplatinoboy) y yo (@SantinoFurioso) publicamos contenido que no va a ningún otro lado.

Si no tenés PRIME todavía, este es el momento:

👉 ${CTA_URL}`;
  }
  return `💎 *The PRIME Channel is live — and it's ours exclusively*

Hey, Santino here.

PRIME gives you everything on PNPtv: the full feed, the live Main Stage, private calls with creators.

And now it also includes the *PRIME Channel* — where Lex (@pnplatinoboy) and I (@SantinoFurioso) post content that goes nowhere else.

If you're not on PRIME yet, now's the time:

👉 ${CTA_URL}`;
}

function pushPayload(lang) {
  if (lang === 'es') {
    return {
      title: '💎 El Canal PRIME ya tiene contenido',
      body:  '@SantinoFurioso + @pnplatinoboy — exclusivo para PRIME',
      url:   CTA_URL,
      tag:   BATCH_ID,
      notifType: 'promo',
    };
  }
  return {
    title: '💎 The PRIME Channel is live',
    body:  '@SantinoFurioso + @pnplatinoboy — exclusive for PRIME members',
    url:   CTA_URL,
    tag:   BATCH_ID,
    notifType: 'promo',
  };
}

function emailSubject(lang) {
  return lang === 'es'
    ? '💎 El Canal PRIME ya está disponible — @SantinoFurioso y @pnplatinoboy'
    : '💎 The PRIME Channel is live — @SantinoFurioso & @pnplatinoboy';
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

function emailHtml(lang) {
  const preheader = lang === 'es'
    ? '@SantinoFurioso y @pnplatinoboy — contenido exclusivo en el Canal PRIME'
    : '@SantinoFurioso & @pnplatinoboy — exclusive content in the PRIME Channel';
  const channelImg = `<div style="margin:0 0 24px;border-radius:16px;overflow:hidden"><img src="${IMAGE_URL}" alt="PNPtv! PRIME Channel" width="560" style="width:100%;display:block;border-radius:16px"/></div>`;
  const body = lang === 'es' ? `
    ${channelImg}
    <p style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px">💎 El Canal PRIME ya tiene contenido</p>
    <p>Hola, soy Santino, fundador de PNPtv.</p>
    <p>PRIME incluye <strong>todo lo de la plataforma</strong>: feed completo, Main Stage en vivo y llamadas privadas con creadores. Y ahora suma el <strong>Canal PRIME</strong> — el espacio donde Lex (@pnplatinoboy) y yo (@SantinoFurioso) publicamos contenido que no va a ningún otro lado.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${CTA_URL}" style="display:inline-block;padding:16px 32px;background:linear-gradient(90deg,#d4007a,#ff6600);color:#fff;font-weight:800;font-size:16px;border-radius:12px;text-decoration:none;letter-spacing:0.04em">
        💎 ACTIVAR PRIME
      </a>
    </div>
    <p>— Santino<br><span style="font-size:12px;color:#888">Fundador, PNPtv!</span></p>
  ` : `
    ${channelImg}
    <p style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px">💎 The PRIME Channel is live</p>
    <p>Hey, I'm Santino, founder of PNPtv.</p>
    <p>PRIME gives you <strong>everything on the platform</strong>: the full feed, the live Main Stage, private calls with creators. And now it includes the <strong>PRIME Channel</strong> — where Lex (@pnplatinoboy) and I (@SantinoFurioso) post content that goes nowhere else.</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${CTA_URL}" style="display:inline-block;padding:16px 32px;background:linear-gradient(90deg,#d4007a,#ff6600);color:#fff;font-weight:800;font-size:16px;border-radius:12px;text-decoration:none;letter-spacing:0.04em">
        💎 GET PRIME
      </a>
    </div>
    <p>— Santino<br><span style="font-size:12px;color:#888">Founder, PNPtv!</span></p>
  `;
  return htmlShell(preheader, body);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  // Load audience: all non-prime, non-banned users with Telegram
  const { rows: users } = await query(`
    SELECT id, email,
      CASE WHEN language = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM users
    WHERE LOWER(tier) NOT IN ('prime', 'banned')
      AND telegram IS NOT NULL AND telegram != ''
    ORDER BY created_at ASC
  `);

  // Santino must receive the broadcast too (CC rule)
  const hasS = users.some(u => u.id === SENDER_ID);
  if (!hasS) users.unshift({ id: SENDER_ID, email: null, lang: 'en' });

  // Check how many already sent in a prior run of this campaign
  const { rows: dedupRows } = await query(
    `SELECT COUNT(*) AS cnt FROM broadcast_dedup WHERE batch_id LIKE $1`,
    ['prime-channel-20260921%']
  );
  const alreadySent = parseInt(dedupRows[0].cnt, 10);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — PRIME Channel launch broadcast');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Audience  : ${users.length} users (${alreadySent} already sent)`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    const samples = users.slice(0, 3);
    for (const u of samples) {
      console.log(`── Sample user ${u.id} [${u.lang}] ──`);
      console.log(dmText(u.lang));
      console.log();
    }
    console.log(`... and ${users.length - samples.length} more users`);
    console.log('\n-- DRY RUN complete. Remove --dry-run to send. --\n');
    process.exit(0);
  }

  await PushNotificationService.initialize();

  let dmOk = 0, pushOk = 0, emailOk = 0, skipped = 0, errors = 0;

  for (const u of users) {
    // Dedup: skip if already sent in any run of this campaign
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      ['prime-channel-20260921%', u.id]
    );
    if (already.length > 0) {
      skipped++;
      continue;
    }

    // In-app DM with channel cover image as hero
    try {
      await sendSystemDM(SENDER_ID, u.id, dmText(u.lang), query, {
        mediaUrl:  IMAGE_URL,
        mediaType: 'image',
      });
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      dmOk++;
    } catch (err) {
      console.error(`  ✗ DM ${u.id}: ${err.message}`);
      errors++;
    }

    // Push
    if (!SKIP_PUSH) {
      try {
        await PushNotificationService.sendToUser(u.id, pushPayload(u.lang));
        pushOk++;
      } catch {}
    }

    // Email
    if (!SKIP_EMAIL && u.email) {
      try {
        await mailer.sendMail({
          from:    '"Santino — PNPtv!" <hello@easybots.store>',
          to:      u.email,
          subject: emailSubject(u.lang),
          html:    emailHtml(u.lang),
        });
        emailOk++;
      } catch (err) {
        console.error(`  ✗ email ${u.id}: ${err.message}`);
      }
    }

    if ((dmOk + skipped) % 100 === 0 && dmOk + skipped > 0) {
      console.log(`  → ${dmOk} sent, ${skipped} skipped, ${errors} errors`);
    }

    await sleep(200);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  In-app DMs : ${dmOk}`);
  console.log(`  Push       : ${pushOk}`);
  console.log(`  Emails     : ${emailOk}`);
  console.log(`  Skipped    : ${skipped}`);
  console.log(`  Errors     : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
