#!/usr/bin/env node
'use strict';

/**
 * broadcast-recovery-founders-all-20260926.js
 *
 * Follow-up to broadcast-recovery-founders-20260926.js (platform DM already sent).
 * Adds: direct Telegram bot message + email where available.
 *
 * Targets: users with pending lifetime-pass orders from today.
 * Dedup: broadcast_dedup, batch_id 'recovery-founders-all-20260926'
 *
 * Usage (dry run):
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file /tmp/bot-env.txt \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-recovery-founders-all-20260926.js --dry-run
 *
 * Live:
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file /tmp/bot-env.txt \
 *     -v /opt/pnptvapp:/app -w /app node:24-alpine \
 *     node apps/backend/scripts/broadcast-recovery-founders-all-20260926.js
 */

const path = require('path');
const fs   = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/telegraf'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const { Telegram }  = nm('telegraf');
const nodemailer    = nm('nodemailer');

const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_TG      = process.argv.includes('--skip-telegram');
const SKIP_EMAIL   = process.argv.includes('--skip-email');
const BATCH_ID     = 'recovery-founders-all-20260926';
const SENDER_ID    = '8599671840';
const CTA_URL      = 'https://pnptv.app/founders';

const tg    = new Telegram(process.env.BOT_TOKEN);
const mailer = nodemailer.createTransport({
  host: process.env.EASYBOTS_SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.EASYBOTS_SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.EASYBOTS_SMTP_USER || 'hello@easybots.store', pass: process.env.EASYBOTS_SMTP_PASS },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEs  = lang => lang && /^es/i.test(String(lang));

const TG_TEXT = {
  en: `🖤 <b>Founders Lifetime — your checkout link is ready</b>

Santino here. You started the Founders checkout today — link expired before you could pay.

Fresh link, no signup needed:
👉 <a href="${CTA_URL}">${CTA_URL}</a>

<b>$99.99 · one-time · no subscription.</b>
Lifetime membership + 18 months full PRIME access.

— Santino`,
  es: `🖤 <b>Founders Lifetime — tu link está listo</b>

Santino aquí. Empezaste el checkout de Founders hoy — el link venció antes de que pudieras pagar.

Link fresco, sin pasos extra:
👉 <a href="${CTA_URL}">${CTA_URL}</a>

<b>$99.99 · pago único · sin suscripción.</b>
Membresía de por vida + 18 meses de PRIME completo.

— Santino`,
};

function emailHtml(lang) {
  const es = isEs(lang);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:0}
    .wrap{max-width:480px;margin:0 auto;padding:32px 20px}
    .badge{background:rgba(230,145,56,0.15);color:#E69138;border:1px solid rgba(230,145,56,0.35);border-radius:99px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;display:inline-block;margin-bottom:20px}
    h1{font-size:26px;font-weight:900;line-height:1.2;margin:0 0 14px;color:#fff}
    p{font-size:15px;line-height:1.6;color:rgba(255,255,255,0.7);margin:0 0 16px}
    .price{font-size:36px;font-weight:900;color:#fff;margin:0 0 4px}
    .price-note{font-size:13px;color:rgba(255,255,255,0.45)}
    .cta{display:inline-block;margin:20px 0;padding:14px 28px;background:linear-gradient(135deg,#E69138,#c97a1e);color:#000;font-weight:800;font-size:15px;border-radius:12px;text-decoration:none}
    .footer{font-size:11px;color:rgba(255,255,255,0.3);margin-top:32px;text-align:center}
    .footer a{color:rgba(255,255,255,0.3)}
  </style></head><body><div class="wrap">
    <div class="badge">${es ? 'Edición Founders' : 'Founders Edition'}</div>
    <h1>${es ? 'Tu link expiró — aquí está de nuevo 🖤' : 'Your checkout link expired — here it is again 🖤'}</h1>
    <p>${es
      ? 'Empezaste el checkout para la Membresía Founders hoy, pero el link venció. Aquí está fresco:'
      : 'You started the Founders Lifetime checkout today, but the payment link expired. Here it is fresh:'}</p>
    <div class="price">$99.99</div>
    <div class="price-note">${es ? 'pago único · sin renovaciones' : 'one-time · no renewals'}</div>
    <br>
    <a href="${CTA_URL}" class="cta">${es ? 'Completar membresía Founders' : 'Complete Founders Membership'}</a>
    <p style="font-size:13px">${es
      ? '🖤 Membresía de por vida + 18 meses PRIME incluidos.'
      : '🖤 Lifetime membership + 18 months of PRIME included.'}</p>
    <div class="footer">
      PNPtv! &nbsp;·&nbsp; <a href="https://pnptv.app/unsubscribe">Unsubscribe</a>
    </div>
  </div></body></html>`;
}

async function main() {
  await initializePostgres();

  const { rows: targets } = await query(`
    SELECT DISTINCT ON (u.id)
      u.id, u.telegram, u.username, u.email,
      CASE WHEN LOWER(u.language) = 'es' THEN 'es' ELSE 'en' END AS lang
    FROM dash_subscription_orders dso
    JOIN users u ON u.id = dso.user_id
    WHERE dso.plan_id = 'lifetime-pass'
      AND dso.status = 'pending'
      AND dso.created_at > NOW() - INTERVAL '24 hours'
      AND (u.email IS NULL OR u.email != 'support@pnptv.app')
      AND COALESCE(u.tier,'free') != 'banned'
    ORDER BY u.id
  `);

  if (!targets.some(u => u.id === SENDER_ID)) {
    targets.unshift({ id: SENDER_ID, telegram: String(SENDER_ID), username: 'pnptv', email: null, lang: 'en' });
  }

  const tgCount    = targets.filter(u => u.telegram).length;
  const emailCount = targets.filter(u => u.email && !u.email.includes('pnptv.app')).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Founders recovery — Telegram + email');
  console.log(`  Batch     : ${BATCH_ID}`);
  console.log(`  Targets   : ${targets.length} users  |  TG: ${tgCount}  |  email: ${emailCount}`);
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN' : '🚀 LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    targets.forEach(u => console.log(`  ${u.id} @${u.username} [${u.lang}] TG:${u.telegram||'—'} email:${u.email||'—'}`));
    console.log('\n── TG EN sample ──\n', TG_TEXT.en);
    console.log('\n-- DRY RUN complete --\n');
    process.exit(0);
  }

  let tgSent = 0, emailSent = 0, skipped = 0, errors = 0;

  for (const u of targets) {
    const { rows: already } = await query(
      `SELECT 1 FROM broadcast_dedup WHERE batch_id LIKE $1 AND user_id = $2`,
      [`${BATCH_ID}%`, u.id]
    );
    if (already.length > 0) { console.log(`  skip ${u.id}`); skipped++; continue; }

    const lang = u.lang;
    let channelsSent = [];

    // ── Telegram direct ──────────────────────────────────────────────────────
    if (!SKIP_TG && u.telegram) {
      try {
        await tg.sendMessage(u.telegram, TG_TEXT[lang] || TG_TEXT.en, {
          parse_mode: 'HTML', disable_web_page_preview: true,
        });
        tgSent++;
        channelsSent.push('TG');
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('blocked') || msg.includes('not found') || msg.includes('deactivated')) {
          console.log(`  [TG] ${u.id}: user unavailable — ${msg.slice(0,60)}`);
        } else {
          console.error(`  [TG] ${u.id}: ${msg.slice(0,80)}`);
          errors++;
        }
      }
      await sleep(150);
    }

    // ── Email ────────────────────────────────────────────────────────────────
    if (!SKIP_EMAIL && u.email && !u.email.includes('pnptv.app')) {
      try {
        await mailer.sendMail({
          from: '"Santino @ PNPtv" <hello@easybots.store>',
          to: u.email,
          subject: isEs(lang) ? '🖤 Tu checkout de Founders — link listo' : '🖤 Your Founders checkout — link ready',
          html: emailHtml(lang),
        });
        emailSent++;
        channelsSent.push('email');
      } catch (err) {
        console.error(`  [email] ${u.id} (${u.email}): ${err.message.slice(0,80)}`);
        errors++;
      }
      await sleep(200);
    }

    if (channelsSent.length > 0) {
      await query(
        `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [BATCH_ID, u.id]
      );
      console.log(`  ✓ ${u.id} @${u.username} [${channelsSent.join('+')}]`);
    }
    await sleep(200);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  TG sent   : ${tgSent}`);
  console.log(`  Email sent: ${emailSent}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Errors    : ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
