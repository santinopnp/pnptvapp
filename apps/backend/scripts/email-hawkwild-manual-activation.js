#!/usr/bin/env node
'use strict';

/**
 * One-shot: email hawkwild@gmail.com asking for his PNPtv username so we
 * can manually activate PRIME (he paid via MercadoPago but there's no
 * matching row in `payments` to auto-fulfill).
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const emailService = require(path.join(BACKEND, 'services/emailservice'));

const TO      = 'hawkwild@gmail.com';
const FROM    = process.env.PNPTV_FROM_EMAIL || '"PNPtv!" <hello@pnptv.app>';
const SUBJECT = 'One quick thing to activate your PNPtv! PRIME';

const HTML = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.55;">
  <p>Hey!</p>
  <p>Thanks for upgrading to PRIME — we received your payment. One small thing we need to finish activating you: reply with your <strong>PNPtv! username</strong> (the one you use inside the app).</p>
  <p>Once you reply, we'll activate PRIME on your account within a few hours.</p>
  <p>Thanks,<br>PNPtv! support</p>

  <hr style="margin:28px 0;border:none;border-top:1px solid #ddd;">

  <p>¡Hola!</p>
  <p>Gracias por hacerte PRIME — recibimos tu pago. Nos falta un dato chico para activarte: respondé a este correo con tu <strong>usuario de PNPtv!</strong> (el que usás dentro de la app).</p>
  <p>Apenas respondas, activamos PRIME en tu cuenta en unas horas.</p>
  <p>Gracias,<br>Soporte PNPtv!</p>
</body></html>`;

const TEXT = `Hey!

Thanks for upgrading to PRIME — we received your payment. One small thing we need to finish activating you: reply with your PNPtv! username (the one you use inside the app).

Once you reply, we'll activate PRIME on your account within a few hours.

Thanks,
PNPtv! support

────────────────────────────────────────────────

¡Hola!

Gracias por hacerte PRIME — recibimos tu pago. Nos falta un dato chico para activarte: respondé a este correo con tu usuario de PNPtv! (el que usás dentro de la app).

Apenas respondas, activamos PRIME en tu cuenta en unas horas.

Gracias,
Soporte PNPtv!`;

async function main() {
  const t = emailService.transporters && emailService.transporters.pnptv;
  if (!t) { console.error('No pnptv transporter configured'); process.exit(1); }

  const info = await t.sendMail({
    from: FROM,
    to: TO,
    replyTo: 'support@pnptv.app',
    subject: SUBJECT,
    html: HTML,
    text: TEXT,
  });

  console.log(`Sent — messageId=${info.messageId}  to=${TO}`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
