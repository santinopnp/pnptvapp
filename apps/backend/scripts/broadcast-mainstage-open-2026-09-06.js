#!/usr/bin/env node
'use strict';

/**
 * broadcast-mainstage-open-2026-09-06.js
 *
 * El Main Stage paso de dos ventanas de 60 min al dia a estar abierto las 24
 * horas para el nivel gratuito. Se abrio el 6 de septiembre y en las primeras
 * horas entro nadie: 9.061 usuarios gratuitos no saben que cambio, y los que
 * llegaron durante meses aprendieron que ahi habia una cuenta atras.
 *
 * Publico: solo nivel gratuito, y solo el que ya conoce el producto.
 *   - Telegram: gratuitos con Telegram y actividad en los ultimos 90 dias.
 *   - Push:     gratuitos con suscripcion push, MENOS los que reciben Telegram.
 *
 * Se excluye a proposito a los 2.104 que nunca volvieron: son el grupo mas
 * frio y el mas facil de quemar. Se les escribe, si acaso, cuando esta primera
 * tanda haya dado numeros.
 *
 * Nadie recibe el aviso dos veces: quien entra por Telegram sale de la lista
 * de push.
 *
 * Uso:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-mainstage-open-2026-09-06.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-mainstage-open-2026-09-06.js --live
 *   ... --live --skip-telegram | --skip-push
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY       = !process.argv.includes('--live');
const SKIP_TG   = process.argv.includes('--skip-telegram');
const SKIP_PUSH = process.argv.includes('--skip-push');

const CTA_URL     = 'https://pnptv.app/main-stage';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const LOG_TABLE   = 'broadcast_mainstage_open_2026_09_06';
const TG_CHANNEL  = 'mainstage_open_tg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEs  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('es');

// ── Texto ────────────────────────────────────────────────────────────────────
// Sin promesas sobre quien hay en camara ahora mismo: eso cambia cada minuto y
// una promesa falsa en la primera frase quema la siguiente.

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `<b>El Main Stage ya no cierra</b>\n\n` +
      `Hola${n} — antes abria 2 horas al dia.\n` +
      `Ahora esta abierto las 24 horas, gratis.\n\n` +
      `Entra cuando quieras.`
    );
  }
  return (
    `<b>Main Stage doesn't close anymore</b>\n\n` +
    `Hey${n} — it used to open 2 hours a day.\n` +
    `Now it's open 24/7, free.\n\n` +
    `Drop in whenever.`
  );
}

const PUSH_COPY = {
  es: { title: 'El Main Stage ya no cierra', body: 'Antes 2 horas al dia. Ahora 24 h, gratis.' },
  en: { title: "Main Stage doesn't close anymore", body: 'It was 2 hours a day. Now 24/7, free.' },
};

const PUSH_COMMON = {
  url : '/main-stage',
  icon: '/icon-192.png',
  tag : 'mainstage-open-2026-09-06',
};

// ── Fontaneria ───────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}

async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND status='sent'`,
    [String(userId), channel]
  );
  return rows.length > 0;
}

async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

/** Gratuitos con Telegram que han entrado en los ultimos 90 dias. */
async function loadTelegramTargets() {
  const { rows } = await query(`
    SELECT u.id AS user_id, u.username, u.first_name, u.telegram,
           LOWER(COALESCE(u.language,'en')) AS language
      FROM users u
     WHERE COALESCE(u.tier,'free') = 'free'
       AND COALESCE(u.is_active, true) = true
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) <> ''
       AND u.last_active > NOW() - INTERVAL '90 days'
     ORDER BY u.last_active DESC
  `);
  return rows;
}

/**
 * Gratuitos con push, excluyendo a los que ya reciben Telegram. El mismo aviso
 * por dos vias no informa mas: solo molesta el doble.
 */
async function loadPushTargets(langKey, excluidos) {
  const filtroIdioma = langKey === 'es'
    ? `LOWER(COALESCE(u.language,'en')) LIKE 'es%'`
    : `(u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')`;
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.tier,'free') = 'free'
       AND COALESCE(u.is_active, true) = true
       AND ${filtroIdioma}
  `);
  return rows.map((r) => r.id).filter((id) => !excluidos.has(id));
}

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, caption, btnLabel, btnUrl) {
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] },
  });
}

async function sendPushBatch(langKey, excluidos) {
  const copy = PUSH_COPY[langKey];
  const opts = { ...PUSH_COMMON, title: copy.title, body: copy.body };
  const canal = `mainstage_open_push_${langKey}`;
  const ids = await loadPushTargets(langKey, excluidos);

  console.log(`  [PUSH ${langKey.toUpperCase()}] ${ids.length} destinatarios (ya descontados los de Telegram)`);
  if (DRY) { console.log('    payload:', opts); return { attempted: ids.length, sent: 0 }; }
  if (!ids.length) return { attempted: 0, sent: 0 };

  const sent = await PushNotificationService.sendToUsers(ids, opts);
  console.log(`  [PUSH ${langKey.toUpperCase()}] entregados ${sent}/${ids.length}`);
  for (const uid of ids) { try { await log(uid, canal, 'sent'); } catch {} }
  return { attempted: ids.length, sent };
}

// ── Principal ────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();
  if (!DRY) {
    await PushNotificationService.initialize();
    await ensureLogTable();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNPtv — el Main Stage abre 24 h   2026-09-06');
  console.log(`  MODO: ${DRY ? 'PRUEBA (no envia)' : 'EN VIVO'}    sin-telegram: ${SKIP_TG}   sin-push: ${SKIP_PUSH}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tgTargets = SKIP_TG ? [] : await loadTelegramTargets();
  const excluidos = new Set(tgTargets.map((t) => String(t.user_id)));

  const es = tgTargets.filter((t) => isEs(t.language)).length;
  console.log(`  Telegram: ${tgTargets.length} gratuitos activos en 90 dias  (${es} es / ${tgTargets.length - es} en)`);

  if (DRY) {
    const muestraEs = tgTargets.find((t) => isEs(t.language)) || { first_name: 'Carlos', language: 'es' };
    const muestraEn = tgTargets.find((t) => !isEs(t.language)) || { first_name: 'Alex', language: 'en' };
    console.log('\n  ── Telegram (es) ──');
    console.log(tgCaption(muestraEs.first_name || muestraEs.username || null, 'es'));
    console.log('  [boton] Entrar → ' + CTA_URL);
    console.log('\n  ── Telegram (en) ──');
    console.log(tgCaption(muestraEn.first_name || muestraEn.username || null, 'en'));
    console.log('  [boton] Go in → ' + CTA_URL);
    console.log('\n  ── Push ──');
    if (!SKIP_PUSH) {
      await sendPushBatch('es', excluidos);
      await sendPushBatch('en', excluidos);
    }
    console.log('\n  PRUEBA — no se envio nada. Repetir con --live.\n');
    process.exit(0);
  }

  const stats = { tg: 0, tgSkip: 0, tgFail: 0 };
  for (let i = 0; i < tgTargets.length; i++) {
    const { user_id, username, first_name, telegram, language } = tgTargets[i];
    if ((i + 1) % 200 === 0) {
      console.log(`  progreso: ${i + 1}/${tgTargets.length}  enviados=${stats.tg} fallos=${stats.tgFail}`);
    }
    if (await alreadySent(user_id, TG_CHANNEL)) { stats.tgSkip++; continue; }
    const btn = isEs(language) ? 'Entrar' : 'Go in';
    const r = await tgSend(telegram, tgCaption(first_name || username || null, language), btn, CTA_URL);
    if (r.ok) { stats.tg++; await log(user_id, TG_CHANNEL, 'sent'); }
    else { stats.tgFail++; await log(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500)); }
    await sleep(TG_DELAY_MS);
  }

  let pEs = { attempted: 0, sent: 0 };
  let pEn = { attempted: 0, sent: 0 };
  if (!SKIP_PUSH) {
    console.log('\n  ── PUSH ──');
    pEs = await sendPushBatch('es', excluidos);
    pEn = await sendPushBatch('en', excluidos);
  }

  console.log('\n── Resumen ──────────────────────────────────────────────────────');
  console.log(`   Telegram enviados : ${stats.tg}`);
  console.log(`   Telegram omitidos : ${stats.tgSkip}  (ya avisados antes)`);
  console.log(`   Telegram fallidos : ${stats.tgFail}`);
  console.log(`   Push es           : ${pEs.sent}/${pEs.attempted}`);
  console.log(`   Push en           : ${pEn.sent}/${pEn.attempted}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Fatal:', err); process.exit(1); });
