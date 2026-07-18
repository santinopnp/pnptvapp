#!/usr/bin/env node
/**
 * One-shot script: send token migration notification emails to users who had purchased tokens.
 * Run ONCE after the 6-tokens-per-$1 migration.
 *
 * Usage: docker exec pnptv-bot node /app/scripts/send-token-migration-emails.js
 */

require('dotenv').config({ path: '/app/.env' });
require('dotenv').config({ path: '/app/.env.production', override: true });

const { query } = require('/app/config/postgres');
const emailService = require('/app/services/emailservice');
const logger = require('/app/utils/logger');

const MIGRATION_USERS = [
  { id: '8334404397',                           username: 'IXYOP',            email: 'nogrod@duck.com',                    old_balance: 150000, new_balance: 9000 },
  { id: '5899228122',                           username: 'BBSLAM505',        email: '94jpm75@gmail.com',                  old_balance: 100000, new_balance: 6000 },
  { id: '7ea341de-3d00-496e-b97a-4260c2130320', username: 'THEJURONGOTTER',   email: 'jurott@icloud.com',                  old_balance:  50000, new_balance: 3000 },
  { id: '5272278844',                           username: 'mikehuntwastaken', email: 'chemistwhorehouse@gmail.com',        old_balance:  30000, new_balance: 1800 },
  { id: '7857923659',                           username: 'CHILL_PARTY_BTTM', email: 'chill.party.6700@gmail.com',         old_balance:  10000, new_balance:  600 },
  { id: '1966945732',                           username: 'Elevenminutos',    email: 'mjbs.serafica@gmail.com',            old_balance:   2700, new_balance:  162 },
  { id: '1071160931',                           username: 'SUIRODEF',         email: 'koelndream@gmail.com',               old_balance:    500, new_balance:   30 },
  { id: '8312901004',                           username: 'sfo2u',            email: 'patternmakersf@gmail.com',           old_balance:    300, new_balance:   18 },
  { id: '8874289080',                           username: 'A1ASSUK1',         email: 'naughtyemailaddress1@gmail.com',     old_balance:    100, new_balance:    6 },
];

async function buildHtml({ username, old_balance, new_balance }) {
  const oldUsd = (old_balance / 100).toFixed(2);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  .hdr{background:#1C1C1E;padding:24px 30px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:26px}.hdr span{color:#D4007A}
  .body{padding:30px}
  .box{background:#f8f9fa;border-left:4px solid #008DE4;padding:16px 20px;border-radius:4px;margin:20px 0}
  .box p{margin:6px 0}
  .info{background:#eaf4fd;border-radius:6px;padding:14px 18px;margin:16px 0;font-size:13px;color:#444;line-height:1.6}
  .btn{display:inline-block;margin:20px 0;padding:12px 28px;background:#D4007A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold}
  .ftr{text-align:center;padding:20px;color:#888;font-size:12px;border-top:1px solid #eee}
  .highlight{font-size:22px;font-weight:bold;color:#D4007A}
  .new-balance{font-size:28px;font-weight:bold;color:#008DE4}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>PNPtv<span>!</span></h1></div>
  <div class="body">
    <p>Hola <strong>${username}</strong>,</p>
    <p>Hemos actualizado el sistema de tokens de PNPtv para hacerlo más claro y transparente.</p>

    <div class="box">
      <p><strong>Tu saldo antes:</strong> ${old_balance.toLocaleString()} tokens (valor: ~$${oldUsd} USD)</p>
      <p><strong>Tu saldo ahora:</strong> <span class="new-balance">${new_balance.toLocaleString()} tokens</span></p>
      <p style="font-size:12px;color:#888;margin-top:8px">Tu valor en dólares se preservó. El número de tokens cambió porque cambiamos la tasa.</p>
    </div>

    <div class="info">
      <strong>¿Qué cambió?</strong><br><br>
      <strong>Nueva tasa:</strong> <span class="highlight">6 tokens = $1 USD</span> (antes era 100 tokens = $1)<br><br>
      <strong>¿Cómo usar tus tokens?</strong><br>
      • Necesitas mínimo <strong>60 tokens</strong> para ver un show en vivo<br>
      • Puedes enviar propinas a tus modelos favoritos en tiempo real<br>
      • El modelo recibe 4 de cada 6 tokens que gastas<br><br>
      <strong>¿Dónde ver tu saldo?</strong><br>
      Ve a <strong>Ajustes → Pagos</strong> en <a href="https://pnptv.app">pnptv.app</a> — siempre verás tu saldo en tokens.
    </div>

    <p>Si tienes preguntas sobre esta actualización, escríbenos a <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
    <a class="btn" href="https://pnptv.app/live">Ver shows en vivo →</a>
  </div>
  <div class="ftr">
    <p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p>
    <p style="font-size:10px;color:#aaa">Your ${old_balance.toLocaleString()} tokens have been converted to ${new_balance.toLocaleString()} tokens at the new rate of 6 tokens = $1 USD (preserving your ~$${oldUsd} USD value).</p>
  </div>
</div>
</body></html>`;
}

async function main() {
  console.log(`Sending migration emails to ${MIGRATION_USERS.length} users...`);

  for (const user of MIGRATION_USERS) {
    try {
      const html = await buildHtml(user);
      const result = await emailService.transporters.pnptv.sendMail({
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv" <support@pnptv.app>',
        to: user.email,
        subject: 'Actualización del sistema de tokens — PNPtv',
        html,
      });
      console.log(`✓ Sent to ${user.username} (${user.email}) — messageId: ${result.messageId}`);
    } catch (err) {
      console.error(`✗ Failed for ${user.username} (${user.email}):`, err.message);
    }

    // small delay to respect rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
