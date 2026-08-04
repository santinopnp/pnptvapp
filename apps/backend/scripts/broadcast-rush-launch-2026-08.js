#!/usr/bin/env node
'use strict';

/**
 * broadcast-rush-launch-2026-08.js
 *
 * Announces the Ru$h 💎 currency launch to all users via:
 *   1. In-app bell notification (deep-linked to /wallet)
 *   2. Web push
 *   3. Email — creator copy to creator/model users, member copy to everyone else
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08.js --skip-email
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08.js --skip-push
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-rush-launch-2026-08.js --skip-inapp
 */

const path = require('path');
const fsSync = require('fs');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query }               = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService  = require(path.join(BACKEND, 'services/pushNotificationService'));
const emailService             = require(path.join(BACKEND, 'services/emailservice'));

const DRY_RUN    = process.argv.includes('--dry-run');
const SKIP_EMAIL = process.argv.includes('--skip-email');
const SKIP_PUSH  = process.argv.includes('--skip-push');
const SKIP_INAPP = process.argv.includes('--skip-inapp');

const ENTITY_ID   = 'rush-launch-2026-08';
const APP_URL     = 'https://pnptv.app';
const WALLET_URL  = `${APP_URL}/wallet`;
const LOG_DIR     = path.join(BACKEND, '../../logs');
const EMAIL_SENT_FILE = path.join(LOG_DIR, 'rush-launch-2026-08-email-sent.log');

function loadSentSet(file) {
  try { return new Set(fsSync.readFileSync(file, 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
}
function markSent(file, id) {
  try { fsSync.appendFileSync(file, `${id}\n`); } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');
const isCreator = (role) => role === 'creator' || role === 'model' || role === 'admin' || role === 'superadmin';

// ── Messages ──────────────────────────────────────────────────────────────────

const NOTIFICATION_MSG = {
  en: `💎 Ru$h is here! PNPtv!'s new in-house currency — one wallet for memberships, tips, calls, and exclusive content.`,
  es: `💎 ¡Llegó Ru$h! La nueva moneda interna de PNPtv! — una billetera para membresías, propinas, llamadas y contenido exclusivo.`,
};

const PUSH = {
  en: { title: '💎 Ru$h has arrived', body: 'One wallet for everything on PNPtv! — bulk bonuses up to +25%. Your old tokens are already Ru$h.' },
  es: { title: '💎 Llegó Ru$h', body: 'Una billetera para todo en PNPtv! — bonos de hasta +25%. Tus tokens ya son Ru$h.' },
};

const EMAIL_SUBJECT = {
  member: { en: 'Meet Ru$h 💎 — your new PNPtv! wallet', es: 'Conoce Ru$h 💎 — tu nueva billetera PNPtv!' },
  creator: { en: 'Creators, meet Ru$h 💎 — spend it, tip with it, or cash it out', es: 'Creadores, conozcan Ru$h 💎 — úsenlo, den propinas, o retírenlo' },
};

function buildMemberEmailHtml(lang, name) {
  const en = lang === 'en';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#121220;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138)"></td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:22px;font-weight:900;color:#fff">PNPtv!</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px">
          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">${en ? `Hi ${name}!` : `¡Hola ${name}!`}</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:900;color:#fff;line-height:1.25">
            💎 ${en ? "Something big just landed at PNPtv!" : "Algo grande acaba de llegar a PNPtv!"}
          </h1>
          <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6">
            ${en
              ? "<strong>Ru$h 💎</strong> — our brand-new in-house currency. One wallet for everything."
              : "<strong>Ru$h 💎</strong> — nuestra nueva moneda interna. Una billetera para todo."}
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden">
            <tr><td style="padding:16px 20px;background:rgba(212,0,122,0.06)">
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#fff">${en ? "Why Ru$h?" : "¿Por qué Ru$h?"}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#d1d5db">💎 ${en ? "<strong>One wallet</strong> — memberships, tips, private calls, exclusive content" : "<strong>Una billetera</strong> — membresías, propinas, llamadas privadas, contenido exclusivo"}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#d1d5db">💎 ${en ? "<strong>Bulk savings</strong> — buy 6,000 Ru$h and get 900 extra free (+15%)" : "<strong>Ahorros por volumen</strong> — compra 6,000 Ru$h y recibe 900 extra gratis (+15%)"}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#d1d5db">💎 ${en ? "<strong>Simple math</strong> — 1 USD = 6 Ru$h 💎. Always." : "<strong>Matemática simple</strong> — 1 USD = 6 Ru$h 💎. Siempre."}</p>
              <p style="margin:0;font-size:13px;color:#d1d5db">💎 ${en ? "<strong>Nothing lost</strong> — your old token balance is already Ru$h 💎 at the same value." : "<strong>Sin pérdidas</strong> — tu saldo de tokens ya es Ru$h 💎 al mismo valor."}</p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${WALLET_URL}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px">
                💎 ${en ? "Open my wallet" : "Abrir mi billetera"}
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center">
            ${en ? "Pay with crypto, Meru card/bank, or an activation code." : "Paga con cripto, tarjeta/banco vía Meru, o código de activación."}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08)">
          <p style="margin:0;font-size:11px;color:#6b7280">
            ${en ? "You received this as a member of PNPtv!." : "Recibiste esto por ser miembro de PNPtv!."}
            🔒 pnptv.app
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildCreatorEmailHtml(lang, name) {
  const en = lang === 'en';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#121220;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
        <tr><td style="height:4px;background:linear-gradient(90deg,#D4007A,#E69138)"></td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:22px;font-weight:900;color:#fff">PNPtv!</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px">
          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af">${en ? `Hi ${name}!` : `¡Hola ${name}!`}</p>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:900;color:#fff;line-height:1.25">
            💎 ${en ? "Introducing Ru$h — your earnings, your control" : "Presentamos Ru$h — tus ganancias, tu control"}
          </h1>
          <p style="margin:0 0 20px;font-size:14px;color:#d1d5db;line-height:1.6">
            ${en
              ? "You already earn from fans on PNPtv!. Now you have more control over what happens to those earnings."
              : "Ya ganas con tus fans en PNPtv!. Ahora tienes más control sobre lo que haces con esas ganancias."}
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden">
            <tr><td style="padding:16px 20px;background:rgba(212,0,122,0.06)">
              <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#fff">${en ? "Your new options as a creator:" : "Tus nuevas opciones como creador/a:"}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#d1d5db">💎 <strong>${en ? "Withdraw to USDT" : "Retirar en USDT"}</strong> — ${en ? "request a payout of $50+ in USDT-TRC20 to your wallet. Admin-reviewed, usually paid within 72 hours." : "solicita un retiro de $50+ en USDT-TRC20. Revisado por admin, usualmente pagado en 72 horas."}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#d1d5db">💎 <strong>${en ? "Convert to spendable Ru$h (NEW)" : "Convertir a Ru$h gastable (NUEVO)"}</strong> — ${en ? "turn earned USD into Ru$h 💎 at 1:1 ($100 = 600 Ru$h) and use it inside PNPtv! on other creators." : "convierte ganancias en USD a Ru$h 💎 al 1:1 ($100 = 600 Ru$h) y úsalo dentro de PNPtv!."}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#9ca3af">${en ? "With Ru$h you can:" : "Con Ru$h puedes:"}</p>
              <p style="margin:0 0 4px;font-size:13px;color:#d1d5db">• ${en ? "Book private calls with other performers" : "Reservar llamadas privadas con otros performers"}</p>
              <p style="margin:0 0 4px;font-size:13px;color:#d1d5db">• ${en ? "Tip creators you love" : "Dar propinas a creadores que amas"}</p>
              <p style="margin:0 0 4px;font-size:13px;color:#d1d5db">• ${en ? "Buy exclusive content from other creators" : "Comprar contenido exclusivo de otros"}</p>
              <p style="margin:0;font-size:13px;color:#d1d5db">• ${en ? "Upgrade your own PRIME membership" : "Renovar tu propia membresía PRIME"}</p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr><td align="center">
              <a href="${APP_URL}/creator/payouts" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#D4007A,#E69138);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px">
                💎 ${en ? "View my earnings" : "Ver mis ganancias"}
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.6;text-align:center">
            ${en ? "Every Ru$h you earn, spend, or receive is logged. Full audit trail, full transparency." : "Cada Ru$h que ganas, gastas o recibes queda registrado. Trazabilidad completa."}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08)">
          <p style="margin:0;font-size:11px;color:#6b7280">
            ${en ? "Questions? Reply to this email." : "¿Preguntas? Responde este correo."}
            🔒 pnptv.app
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Ru$h 💎 Launch Broadcast — 2026-08');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN)    console.log(' MODE: DRY RUN — nothing will be sent\n');
  if (SKIP_INAPP) console.log(' --skip-inapp\n');
  if (SKIP_PUSH)  console.log(' --skip-push\n');
  if (SKIP_EMAIL) console.log(' --skip-email\n');

  const { rows: users } = await query(`
    SELECT u.id, u.first_name, u.username, u.email, u.language, u.role
    FROM users u
    WHERE COALESCE(u.is_deleted, false) = false
      AND u.role NOT IN ('banned')
    ORDER BY u.id
  `);

  // Skip users who already got this notification
  const { rows: alreadyRows } = await query(`
    SELECT target_user_id FROM notifications
    WHERE entity_id = $1 AND entity_type = 'system' AND actor_id IS NULL
  `, [ENTITY_ID]);
  const alreadySent = new Set(alreadyRows.map(r => r.target_user_id));

  const emailAlreadySent = loadSentSet(EMAIL_SENT_FILE);
  const newUsers  = users.filter(u => !alreadySent.has(u.id));
  const withEmail = users.filter(u =>
    u.email &&
    !u.email.includes('@telegram.pnptv.app') &&
    !emailAlreadySent.has(u.id)
  );

  const creatorUsers = withEmail.filter(u => isCreator(u.role));
  const memberUsers  = withEmail.filter(u => !isCreator(u.role));

  console.log(`\n   Total users:      ${users.length}`);
  console.log(`   Already notified: ${alreadySent.size}`);
  console.log(`   New targets:      ${newUsers.length}`);
  console.log(`   Email — members:  ${memberUsers.length}`);
  console.log(`   Email — creators: ${creatorUsers.length}`);

  const stats = { inApp: 0, push: 0, email: 0, emailFailed: 0 };

  // 1. In-app bell notifications
  console.log('\n1/3  In-app notifications...');
  if (SKIP_INAPP) {
    console.log('     [SKIPPED] --skip-inapp');
  } else if (!DRY_RUN) {
    try {
      const enIds = newUsers.filter(u =>  isEn(u.language)).map(u => u.id);
      const esIds = newUsers.filter(u => !isEn(u.language)).map(u => u.id);
      for (const [ids, msg] of [[enIds, NOTIFICATION_MSG.en], [esIds, NOTIFICATION_MSG.es]]) {
        if (!ids.length) continue;
        await query(`
          INSERT INTO notifications
            (type, category, priority, actor_id, target_user_id, entity_type, entity_id, message, metadata)
          SELECT 'announcement', 'system', 'high', NULL,
            t.id, 'system', $2, $3, $4::jsonb
          FROM unnest($1::text[]) AS t(id)
          ON CONFLICT (type, target_user_id, entity_type, entity_id) WHERE actor_id IS NULL
          DO UPDATE SET is_read = FALSE, created_at = NOW(), message = EXCLUDED.message
        `, [ids, ENTITY_ID, msg, JSON.stringify({ url: WALLET_URL })]);
        stats.inApp += ids.length;
      }
      console.log(`     ✓ ${stats.inApp} inserted/upserted`);
    } catch (err) { console.error(`     ✗ ${err.message}`); }
  } else {
    console.log(`     [DRY] Would notify ${newUsers.length} users`);
  }

  // 2. Web push
  console.log(`\n2/3  Web push to ${newUsers.length} users...`);
  if (SKIP_PUSH) {
    console.log('     [SKIPPED] --skip-push');
  } else if (!DRY_RUN) {
    const enIds = newUsers.filter(u =>  isEn(u.language)).map(u => u.id);
    const esIds = newUsers.filter(u => !isEn(u.language)).map(u => u.id);
    try {
      if (enIds.length) await PushNotificationService.sendToUsers(enIds, PUSH.en.title, PUSH.en.body, { url: WALLET_URL });
      if (esIds.length) await PushNotificationService.sendToUsers(esIds, PUSH.es.title, PUSH.es.body, { url: WALLET_URL });
      stats.push = newUsers.length;
      console.log(`     ✓ push dispatched`);
    } catch (err) { console.error(`     ✗ push: ${err.message}`); }
  } else {
    console.log(`     [DRY] Would push to ${newUsers.length} users`);
  }

  // 3. Email — member copy + creator copy
  const EMAIL_DELAY_MS = 350;
  console.log(`\n3/3  Email (${memberUsers.length} members + ${creatorUsers.length} creators)...`);
  if (SKIP_EMAIL) {
    console.log('     [SKIPPED] --skip-email');
  } else if (!DRY_RUN) {
    const allEmailUsers = [
      ...memberUsers.map(u => ({ ...u, copyType: 'member' })),
      ...creatorUsers.map(u => ({ ...u, copyType: 'creator' })),
    ];
    for (let i = 0; i < allEmailUsers.length; i++) {
      const u = allEmailUsers[i];
      const lang = isEn(u.language) ? 'en' : 'es';
      const name = u.first_name || u.username || (lang === 'en' ? 'Member' : 'Miembro');
      try {
        await emailService.send({
          to: u.email,
          subject: EMAIL_SUBJECT[u.copyType][lang],
          html: u.copyType === 'creator'
            ? buildCreatorEmailHtml(lang, name)
            : buildMemberEmailHtml(lang, name),
        });
        stats.email++;
        markSent(EMAIL_SENT_FILE, u.id);
      } catch (err) {
        stats.emailFailed++;
        if (stats.emailFailed <= 5 || stats.emailFailed % 50 === 0) {
          console.warn(`     Email err [${u.email}]: ${err.message}`);
        }
      }
      await sleep(EMAIL_DELAY_MS);
      if ((i + 1) % 50 === 0) console.log(`     Email progress: ${i + 1}/${allEmailUsers.length}`);
    }
    console.log(`     ✓ Email: ${stats.email} sent / ${stats.emailFailed} failed`);
  } else {
    console.log(`     [DRY] Would email ${memberUsers.length} members + ${creatorUsers.length} creators`);
    console.log('\n── Sample member email subject (EN) ──');
    console.log(EMAIL_SUBJECT.member.en);
    console.log('\n── Sample creator email subject (EN) ──');
    console.log(EMAIL_SUBJECT.creator.en);
    console.log('\n── Sample member email HTML (first 300 chars) ──');
    console.log(buildMemberEmailHtml('en', 'Member').slice(0, 300) + '...\n');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` Done. inApp=${stats.inApp} push=${stats.push} email=${stats.email} emailFailed=${stats.emailFailed}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
