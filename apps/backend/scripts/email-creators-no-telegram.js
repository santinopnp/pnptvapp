/**
 * Send broadcast message to creators who have no Telegram ID (email-only).
 * These were skipped during the Telegram DM blast earlier today.
 * Run: node apps/backend/scripts/email-creators-no-telegram.js
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
  { name: "Frankbox",    email: "dasilvafrankbox@gmail.com" },
  { name: "Alejotwink",  email: "valderramalaiderker6@gmail.com" },
  { name: "A1ASSUK",     email: "naughtyemailaddress1@gmail.com" },
  { name: "Martin",      email: "christopherrobinsito@gmail.com" },
  { name: "Juansito",    email: "juanpablomalpica31@hotmail.com" },
  { name: "Pnpbogcol",   email: "pnpcolbogota@gmail.com" },
  { name: "ashka_lgbt",  email: "andytaylorgayboy3@gmail.com" },
  { name: "lalitegrant", email: "lalitegran3@gmail.com" },
  { name: "Humberto",    email: "ramirezhummberto@gmail.com" },
  { name: "Rico",        email: "zeprico4@gmail.com" },
];

function buildHtml(name) {
  return `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#EBEBF5;background:#1C1C1E;border-radius:16px;padding:24px;">
  <p style="font-size:15px;margin:0 0 12px;">Hola ${name} 👋</p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Queremos recordarte que <strong>@pnolatinoboy</strong> estará monitoreando los streams hoy
    y brindándoles apoyo técnico y de promoción en redes sociales.
  </p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Si estás interesado/a, responde a este correo con un 📷 para que él pueda contactarte
    con los detalles. Esto estará activo hasta el <strong>lunes al mediodía</strong>.
  </p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    También les estaremos enviando unas <strong>herramientas nuevas</strong> que creamos
    para ayudarles. ¡Gracias por su paciencia y apoyo!
  </p>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:16px 0;" />

  <p style="font-size:12px;color:#8E8E93;margin:0;">
    PNPtv! · <a href="https://pnptv.app" style="color:#D4007A;">pnptv.app</a>
  </p>
</div>`;
}

async function main() {
  let ok = 0;
  let fail = 0;

  for (const r of recipients) {
    try {
      await transporter.sendMail({
        from: '"PNPtv! 🎬" <hello@easybots.store>',
        to: r.email,
        subject: "📷 @pnolatinoboy monitorea streams hoy — PNPtv!",
        html: buildHtml(r.name),
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
