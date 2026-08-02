/**
 * One-shot: courtesy-extension compliance email to 45 creators whose 2257 grace
 * expired 2026-08-01 and were bulk-pushed to 2026-08-14 today.
 *
 * Bilingual EN/ES per user.language. Sent from support@pnptv.app (PNPTV SMTP
 * transporter, not EasyBots — this is a PNPtv legal notice, not billing).
 *
 * Run manually inside pnptv-bot container:
 *   docker exec pnptv-bot node apps/backend/scripts/email-2257-aug14-extension-2026-08-02.js
 *   docker exec pnptv-bot node apps/backend/scripts/email-2257-aug14-extension-2026-08-02.js --dry-run
 */

const nodemailer = require('nodemailer');
const { query } = require('../config/postgres');

const DRY_RUN = process.argv.includes('--dry-run');
const DEADLINE_ES = '14 de agosto de 2026';
const DEADLINE_EN = 'August 14, 2026';
const VERIFY_URL = 'https://pnptv.app/creators/apply';

const transporter = nodemailer.createTransport({
  host: process.env.PNPTV_SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.PNPTV_SMTP_PORT || '587'),
  secure: process.env.PNPTV_SMTP_SECURE === 'true',
  auth: {
    user: process.env.PNPTV_SMTP_USER,
    pass: process.env.PNPTV_SMTP_PASS,
  },
});

function buildEs(handle) {
  return {
    subject: 'Acción requerida: verifica tu identidad antes del 14 de agosto',
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#EBEBF5;background:#1C1C1E;border-radius:16px;padding:24px;">
  <p style="font-size:15px;margin:0 0 12px;">Hola <strong>${handle}</strong>,</p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Tu período de gracia para verificar tu identidad como creador venció el
    <strong>1 de agosto de 2026</strong>. Por ley (18 U.S.C. § 2257) no podemos
    permitir contenido de adultos sin verificación.
  </p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Como cortesía única, extendemos tu plazo hasta el <strong>${DEADLINE_ES}</strong>.
    Después de esa fecha, tu perfil quedará suspendido automáticamente y tu contenido
    dejará de estar visible hasta que completes la verificación.
  </p>

  <div style="text-align:center;margin:22px 0;">
    <a href="${VERIFY_URL}" style="display:inline-block;background:linear-gradient(135deg,#D4007A,#7B61FF);color:#fff;font-weight:bold;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Verificar mi identidad →
    </a>
  </div>

  <p style="font-size:13px;line-height:1.6;margin:0 0 12px;">
    Solo toma 2 minutos: sube una foto de tu documento de identidad + una selfie
    sosteniendo el mismo documento. Nuestro equipo revisa en 24–48 h.
  </p>

  <p style="font-size:12px;color:#8E8E93;line-height:1.5;margin:20px 0 0;">
    Si ya enviaste tu documentación y sigue en revisión, ignora este mensaje.<br/>
    ¿Dudas? Responde este correo o escribe a
    <a href="mailto:support@pnptv.app" style="color:#D4007A;">support@pnptv.app</a>
  </p>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0 12px;" />
  <p style="font-size:11px;color:#8E8E93;margin:0;">
    PNPtv! · <a href="https://pnptv.app" style="color:#D4007A;">pnptv.app</a>
  </p>
</div>`,
    text: `Hola ${handle},

Tu periodo de gracia para verificar tu identidad como creador venció el 1 de agosto de 2026. Por ley (18 U.S.C. § 2257) no podemos permitir contenido de adultos sin verificación.

Como cortesía única, extendemos tu plazo hasta el ${DEADLINE_ES}. Después de esa fecha, tu perfil quedará suspendido automáticamente y tu contenido dejará de estar visible hasta que completes la verificación.

Verificar tu identidad: ${VERIFY_URL}

Solo toma 2 minutos: sube una foto de tu documento + una selfie sosteniendo el mismo documento. Revisamos en 24-48 h.

Si ya enviaste tu documentación y sigue en revisión, ignora este mensaje. ¿Dudas? Responde este correo o escribe a support@pnptv.app.

PNPtv! · https://pnptv.app`,
  };
}

function buildEn(handle) {
  return {
    subject: 'Action required: verify your ID by August 14',
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#EBEBF5;background:#1C1C1E;border-radius:16px;padding:24px;">
  <p style="font-size:15px;margin:0 0 12px;">Hi <strong>${handle}</strong>,</p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    Your grace period to verify your identity as a creator expired on
    <strong>August 1, 2026</strong>. By law (18 U.S.C. § 2257) we cannot allow
    adult content on the platform without verification.
  </p>

  <p style="font-size:14px;line-height:1.6;margin:0 0 12px;">
    As a one-time courtesy, we're extending your deadline to <strong>${DEADLINE_EN}</strong>.
    After that date, your profile will be automatically suspended and your content
    will stop being visible until verification is complete.
  </p>

  <div style="text-align:center;margin:22px 0;">
    <a href="${VERIFY_URL}" style="display:inline-block;background:linear-gradient(135deg,#D4007A,#7B61FF);color:#fff;font-weight:bold;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none;">
      Verify my identity →
    </a>
  </div>

  <p style="font-size:13px;line-height:1.6;margin:0 0 12px;">
    Takes 2 minutes: upload a photo of your government-issued ID + a selfie
    holding the same ID. Our team reviews within 24–48 h.
  </p>

  <p style="font-size:12px;color:#8E8E93;line-height:1.5;margin:20px 0 0;">
    If you already submitted your documentation and it's still under review, ignore this message.<br/>
    Questions? Reply to this email or write to
    <a href="mailto:support@pnptv.app" style="color:#D4007A;">support@pnptv.app</a>
  </p>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:20px 0 12px;" />
  <p style="font-size:11px;color:#8E8E93;margin:0;">
    PNPtv! · <a href="https://pnptv.app" style="color:#D4007A;">pnptv.app</a>
  </p>
</div>`,
    text: `Hi ${handle},

Your grace period to verify your identity as a creator expired on August 1, 2026. By law (18 U.S.C. § 2257) we cannot allow adult content on the platform without verification.

As a one-time courtesy, we're extending your deadline to ${DEADLINE_EN}. After that date, your profile will be automatically suspended and your content will stop being visible until verification is complete.

Verify your identity: ${VERIFY_URL}

Takes 2 minutes: upload a photo of your government-issued ID + a selfie holding the same ID. Our team reviews within 24-48h.

If you already submitted your documentation and it's still under review, ignore this message. Questions? Reply to this email or write to support@pnptv.app.

PNPtv! · https://pnptv.app`,
  };
}

// Exact 45 IDs bulk-extended from Aug 1 → Aug 14 on 2026-08-02.
// Hardcoded (not requerying by date) because 5 more creators were already at
// Aug 14 grace pre-update — those should NOT receive the "expired Aug 1"
// message.  Frozen from the UPDATE ... RETURNING output.
const TARGET_IDS = [
  '15b6d61e-e6cf-46d5-9152-628fa0b30e89','93a3f046-a774-479e-b825-3daf2f726716',
  '8039520242','7857923659','7217185437','5272368103',
  'd9ed12e3-e036-4a09-9eb6-b92c8b05eb97','6733801448','8668655116','7915648272',
  '5867063315','7879412085','6775323898','7454293437','7250101394',
  '229547af-11da-4743-8ad7-6fdc56b22f5f','5598791888','8436373325','8269683341',
  '6762852968','0a14cc52-bb71-4fac-9c08-f44929b33c4e','6044736811','7489239467',
  '8678902171','7514983625','6341493008','5374511130',
  'fd25374a-1753-463d-b2f8-b51e1574a8d7','5951629484','8041255631','7122345447',
  '8666563080','8534625138','8296896065','7926587506','2016884721','5917729629',
  '5935084902','1215151270','7581552455',
  '832f35b0-47b7-4d2d-aa29-5d67c94faede','2b4cbd26-7582-4755-aaa5-0a6859a7980e',
  '6385726840','3f4cbfc5-a41d-4cc7-84f1-b88b03bd287c','7282051837',
];

async function main() {
  const rows = (await query(`
    SELECT id, COALESCE(username, first_name, id::text) AS handle, email, language
    FROM users
    WHERE id = ANY($1::text[])
    ORDER BY id
  `, [TARGET_IDS])).rows;

  console.log(`[2257-aug14] Loaded ${rows.length} extended creators.`);
  console.log(`[2257-aug14] DRY_RUN=${DRY_RUN}`);

  // Verify SMTP before sending anything
  try {
    await transporter.verify();
    console.log('[2257-aug14] SMTP transporter verified.');
  } catch (e) {
    console.error('[2257-aug14] SMTP verify FAILED:', e.message);
    process.exit(1);
  }

  let sent = 0, skipped = 0, failed = 0;
  const results = [];

  for (const u of rows) {
    const handle = u.handle;
    const email = (u.email || '').trim();
    const isEs = (u.language || 'en').toLowerCase().startsWith('es');
    const tpl = isEs ? buildEs(handle) : buildEn(handle);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped++;
      results.push({ id: u.id, handle, status: 'no-email' });
      continue;
    }

    if (DRY_RUN) {
      sent++;
      results.push({ id: u.id, handle, email, lang: isEs ? 'es' : 'en', status: 'dry' });
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv! Compliance" <support@pnptv.app>',
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      sent++;
      results.push({ id: u.id, handle, email, lang: isEs ? 'es' : 'en', status: 'sent', messageId: info.messageId });
      // Tiny delay to be polite to SMTP
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      failed++;
      results.push({ id: u.id, handle, email, lang: isEs ? 'es' : 'en', status: 'error', error: e.message });
      console.error(`[2257-aug14] SEND FAIL ${handle} <${email}>: ${e.message}`);
    }
  }

  console.log(`\n[2257-aug14] Done. sent=${sent} skipped=${skipped} failed=${failed}`);
  console.log('\nPer-recipient results:');
  console.table(results.map(r => ({ id: r.id, handle: r.handle, email: r.email || '', lang: r.lang || '-', status: r.status })));

  process.exit(0);
}

main().catch(e => { console.error('[2257-aug14] Fatal:', e); process.exit(1); });
