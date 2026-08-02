/**
 * One-shot: Telegram DM to the 12 creators (of the 45 extended today) whose
 * only reachable channel is Telegram (no email on file).  Two of the 14 have
 * neither email nor Telegram — they'll be reported as UNREACHABLE.
 *
 * Bilingual EN/ES per user.language. Uses the existing bot instance.
 *
 * Run:
 *   docker exec pnptv-bot node apps/backend/scripts/dm-2257-aug14-no-email-2026-08-02.js
 *   docker exec pnptv-bot node apps/backend/scripts/dm-2257-aug14-no-email-2026-08-02.js --dry-run
 */

const { query } = require('../config/postgres');
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

const DRY_RUN = process.argv.includes('--dry-run');

// 14 creator IDs whose 2257 grace was extended to 2026-08-14 today and who
// had no email address on file.  Frozen from email-script results.
const TARGET_IDS = [
  '15b6d61e-e6cf-46d5-9152-628fa0b30e89','2016884721','2b4cbd26-7582-4755-aaa5-0a6859a7980e',
  '5867063315','5935084902','6044736811','7122345447','7926587506',
  '832f35b0-47b7-4d2d-aa29-5d67c94faede','8041255631','8436373325','8534625138',
  '8678902171','fd25374a-1753-463d-b2f8-b51e1574a8d7',
];

function buildEs(handle) {
  return `Hola ${handle} 👋

Tu período de gracia para verificar tu identidad como creador venció el 1 de agosto. Por ley (18 U.S.C. § 2257) no podemos permitir contenido para adultos sin verificación.

Como cortesía única, extendemos tu plazo hasta el **14 de agosto de 2026**. Después de esa fecha, tu perfil quedará suspendido automáticamente y tu contenido dejará de estar visible.

Verificar (toma 2 min):
👉 https://pnptv.app/creators/apply

Solo necesitas: foto de tu documento + selfie sosteniendo el mismo documento. Revisamos en 24–48 h.

¿Dudas? Escríbenos a support@pnptv.app`;
}

function buildEn(handle) {
  return `Hi ${handle} 👋

Your grace period to verify your identity as a creator expired on August 1. By law (18 U.S.C. § 2257) we cannot allow adult content on the platform without verification.

As a one-time courtesy, we're extending your deadline to **August 14, 2026**. After that, your profile will be auto-suspended and your content will stop being visible.

Verify (takes 2 min):
👉 https://pnptv.app/creators/apply

You need: a photo of your government-issued ID + a selfie holding the same ID. We review within 24–48 h.

Questions? Email support@pnptv.app`;
}

async function main() {
  const rows = (await query(`
    SELECT id, COALESCE(username, first_name, id::text) AS handle, telegram, language
    FROM users
    WHERE id = ANY($1::text[])
    ORDER BY id
  `, [TARGET_IDS])).rows;

  console.log(`[2257-dm] Loaded ${rows.length} creators. DRY_RUN=${DRY_RUN}`);

  let sent = 0, unreachable = 0, blocked = 0, failed = 0;
  const results = [];

  for (const u of rows) {
    const handle = u.handle;
    const tgId = u.telegram;
    const isEs = (u.language || 'en').toLowerCase().startsWith('es');
    const text = isEs ? buildEs(handle) : buildEn(handle);

    if (!tgId) {
      unreachable++;
      results.push({ id: u.id, handle, status: 'no-telegram' });
      continue;
    }

    if (DRY_RUN) {
      sent++;
      results.push({ id: u.id, handle, tgId, lang: isEs ? 'es' : 'en', status: 'dry' });
      continue;
    }

    try {
      await bot.telegram.sendMessage(tgId, text, { parse_mode: 'Markdown' });
      sent++;
      results.push({ id: u.id, handle, tgId, lang: isEs ? 'es' : 'en', status: 'sent' });
      await new Promise(r => setTimeout(r, 500)); // avoid TG rate limit
    } catch (e) {
      const msg = String(e.message || e);
      if (/blocked|kicked|deactivated|not found|forbidden/i.test(msg)) {
        blocked++;
        results.push({ id: u.id, handle, tgId, lang: isEs ? 'es' : 'en', status: 'blocked', error: msg });
      } else {
        failed++;
        results.push({ id: u.id, handle, tgId, lang: isEs ? 'es' : 'en', status: 'error', error: msg });
        console.error(`[2257-dm] SEND FAIL ${handle}: ${msg}`);
      }
    }
  }

  console.log(`\n[2257-dm] Done. sent=${sent} blocked=${blocked} unreachable=${unreachable} failed=${failed}`);
  console.table(results.map(r => ({ id: r.id, handle: r.handle, tgId: r.tgId || '-', lang: r.lang || '-', status: r.status })));
  process.exit(0);
}

main().catch(e => { console.error('[2257-dm] Fatal:', e); process.exit(1); });
