#!/usr/bin/env node
'use strict';

/**
 * Telegram-DM broadcast: "pay for PRIME with your card in COP via
 * Mercado Pago, we activate manually in 2–6h."
 *
 * Runs every 12 hours (via /etc/cron.d/pnptv-mp-cop-trickle). Each user
 * sees this at most once (dedup via `broadcast_mp_cop_trickle_sent` log
 * table), so subsequent runs only pick up new signups + previously
 * unreachable users. Audience naturally exhausts over ~1 week.
 *
 * Bilingual: EN or ES depending on users.language.
 *
 * Usage:
 *   docker run ... node broadcast-mp-cop-trickle.js [--dry-run] [--limit=N]
 */

const path = require('path');
const https = require('https');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;
const BOT_TOKEN = process.env.BOT_TOKEN;
const LOG_TABLE = 'broadcast_mp_cop_trickle_sent';
const TG_DELAY_MS = 100;

const SANTINO_CHAT = '8599671840'; // force-send once per cycle so Carlos sees what users see

const COPY = {
  en: `<b>💳 Pay for PRIME with your card in Colombian pesos</b>

Pay via Mercado Pago, we activate your account manually in 2–6 hours.

🗓 <b>Week</b> — COP $50,000 (~$12 USD)
https://mpago.li/2SbKo8i

📅 <b>Monthly</b> — COP $85,000 (~$20 USD)
https://mpago.li/1Av4AAQ

🔥 <b>Yearly</b> — COP $330,000 (~$80 USD)
https://mpago.li/1WoLUZ4

♾️ <b>Lifetime</b> — COP $825,000 (~$200 USD)
https://mpago.li/2jx7YH4

After paying, reply here with the receipt + your PNPtv! username. We'll activate shortly.

— PNPtv!`,

  es: `<b>💳 Pagá PRIME con tarjeta en pesos colombianos</b>

Pagás con Mercado Pago, te activamos manualmente en 2–6 horas.

🗓 <b>Semana</b> — COP $50.000
https://mpago.li/2SbKo8i

📅 <b>Mensual</b> — COP $85.000
https://mpago.li/1Av4AAQ

🔥 <b>Anual</b> — COP $330.000
https://mpago.li/1WoLUZ4

♾️ <b>Lifetime</b> — COP $825.000
https://mpago.li/2jx7YH4

Después de pagar, respondé acá con el comprobante y tu usuario de PNPtv!. Activamos pronto.

— PNPtv!`,
};

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, text) {
  return tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL PRIMARY KEY,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
}

async function logSend(userId, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, status, error) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), status, error || null]
  );
}

async function main() {
  if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

  console.log(`\n═ MP COP trickle broadcast — ${new Date().toISOString()} ═`);
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');

  await ensureLogTable();

  const { rows: targets } = await query(`
    SELECT u.id::text AS user_id, u.username, u.first_name, u.telegram, u.language
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND u.role != 'banned'
       AND u.telegram IS NOT NULL
       AND TRIM(u.telegram::text) <> ''
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND NOT EXISTS (
         SELECT 1 FROM user_entitlements ue
          WHERE ue.user_id = u.id
            AND ue.add_on_id = 'prime'
            AND ue.expires_at > NOW()
       )
       AND NOT EXISTS (
         SELECT 1 FROM ${LOG_TABLE} s
          WHERE s.user_id = u.id::text AND s.status = 'sent'
       )
     ORDER BY u.last_active DESC NULLS LAST
     ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `);

  const byLang = targets.reduce((acc, t) => {
    const l = resolveLang(t.language);
    acc[l] = (acc[l] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n   Eligible this run: ${targets.length}`);
  console.log(`     EN: ${byLang.en || 0} · ES: ${byLang.es || 0}`);

  if (DRY_RUN) {
    console.log('\n── sample EN ──\n' + COPY.en);
    console.log('\n── sample ES ──\n' + COPY.es);
    console.log('\n(dry run)\n');
    process.exit(0);
  }

  if (!targets.length) {
    console.log('   nothing to send this cycle\n');
    process.exit(0);
  }

  // Send Santino his copy first so he sees what users see on each cycle
  const { rows: santinoLog } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id = $1 AND status = 'sent'`,
    [SANTINO_CHAT]
  );
  if (!santinoLog.length) {
    const res = await tgSend(SANTINO_CHAT, '[QA copy] ' + COPY.es);
    if (res.ok) await logSend(SANTINO_CHAT, 'sent');
    else console.error('   ✗ Santino QA copy failed:', res.description || res.error);
    await sleep(TG_DELAY_MS);
  }

  let sent = 0, failed = 0;
  for (const t of targets) {
    const lang = resolveLang(t.language);
    const text = COPY[lang];
    const res = await tgSend(t.telegram, text);
    if (res.ok) {
      await logSend(t.user_id, 'sent');
      sent++;
    } else {
      const err = res.description || res.error || JSON.stringify(res);
      await logSend(t.user_id, 'failed', err);
      failed++;
    }
    if ((sent + failed) % 100 === 0) {
      console.log(`   ${sent + failed}/${targets.length}  (sent ${sent} · failed ${failed})`);
    }
    await sleep(TG_DELAY_MS);
  }

  console.log(`\n═ done — sent ${sent} · failed ${failed} ═\n`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
