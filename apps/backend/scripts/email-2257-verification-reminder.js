/**
 * Send 2257 identity verification reminder to creators who are blocked from going live.
 * Grace period extended to 2026-08-18. Run manually:
 *   node apps/backend/scripts/email-2257-verification-reminder.js
 */

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EASYBOTS_SMTP_HOST || "smtp.hostinger.com",
  port: parseInt(process.env.EASYBOTS_SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EASYBOTS_SMTP_USER || "hello@easybots.store",
    pass: process.env.EASYBOTS_SMTP_PASS,
  },
});

const recipients = [
  { name: "CHROBS",            email: "carlosrobert650@gmail.com" },
  { name: "Dacior",            email: "malaga.f66@icloud.com" },
  { name: "FRANKBOXREAL_X",    email: "dasilvafrankbox@gmail.com" },
  { name: "NYCCO_65",          email: "jeffreyelder021@gmail.com" },
  { name: "ashka_lgbt",        email: "andytaylorgayboy3@gmail.com" },
  { name: "ramirezhummberto",  email: "ramirezhummberto@gmail.com" },
  { name: "theDUKEofLANDOVER", email: "ralphwilliams2@gmail.com" },
];

const fllbetasub = {
  name: "Fllbetasub",
  email: "chitownmh@yahoo.com",
  rejected: true,
};

function buildHtml(name, rejected = false) {
  const rejectionNote = rejected
    ? `<div style="background:rgba(212,0,122,0.12);border:1px solid rgba(212,0,122,0.3);border-radius:10px;padding:12px 16px;margin:12px 0;">
        <p style="font-size:13px;font-weight:bold;color:#D4007A;margin:0 0 4px;">Tu verificación anterior fue rechazada</p>
        <p style="font-size:12px;color:#EBEBF5;margin:0;">Por favor adjunta una <strong>foto tuya sosteniendo tu documento de identidad</strong> — una selfie con la cédula visible en la misma imagen.</p>
      </div>`
    : "";

  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#EBEBF5;background:#1C1C1E;border-radius:16px;padding:24px;">
  <p style="font-size:15px;margin:0 0 12px;">Hola <strong>${name}</strong> 👋</p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Para poder hacer streams en PNPtv! necesitamos verificar tu identidad. Es un requisito legal
    que debemos cumplir para proteger a todos en la plataforma.
  </p>

  ${rejectionNote}

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Tienes hasta el <strong>18 de agosto de 2026</strong> para completar el proceso.
    Solo toma unos minutos.
  </p>

  <div style="text-align:center;margin:20px 0;">
    <a href="https://pnptv.app/creators/apply"
       style="display:inline-block;background:linear-gradient(135deg,#D4007A,#7B61FF);color:#fff;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:12px;text-decoration:none;">
      Verificar mi identidad →
    </a>
  </div>

  <p style="font-size:12px;color:#8E8E93;line-height:1.5;margin:16px 0 0;">
    Si ya enviaste tu documentación recientemente, ignora este mensaje.<br/>
    ¿Dudas? Escríbenos a <a href="mailto:support@pnptv.app" style="color:#D4007A;">support@pnptv.app</a>
  </p>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:16px 0;" />
  <p style="font-size:11px;color:#8E8E93;margin:0;">
    PNPtv! · <a href="https://pnptv.app" style="color:#D4007A;">pnptv.app</a>
  </p>
</div>`;
}

async function main() {
  let ok = 0;
  let fail = 0;

  const all = [...recipients, fllbetasub];

  for (const r of all) {
    try {
      await transporter.sendMail({
        from: '"PNPtv! 🎬" <hello@easybots.store>',
        to: r.email,
        subject: "⚠️ Verifica tu identidad para seguir haciendo streams — PNPtv!",
        html: buildHtml(r.name, r.rejected || false),
      });
      console.log(`✅ ${r.name} <${r.email}>`);
      ok++;
    } catch (err) {
      console.error(`❌ ${r.name} <${r.email}>:`, err.message);
      fail++;
    }
    await new Promise((res) => setTimeout(res, 600));
  }

  console.log(`\nDone: ${ok} sent, ${fail} failed.`);
}

main().catch(console.error);
