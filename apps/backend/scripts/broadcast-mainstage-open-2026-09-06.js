#!/usr/bin/env node
'use strict';

/**
 * broadcast-mainstage-open-2026-09-06.js
 *
 * El Main Stage paso de dos ventanas de 60 min al dia a estar abierto las 24
 * horas para el nivel gratuito. Se abrio el 6 de septiembre y en las primeras
 * horas no entro nadie: 9.061 usuarios gratuitos no saben que cambio, y los
 * que llegaron durante meses aprendieron que ahi habia una cuenta atras.
 *
 * Publico: solo nivel gratuito, y solo el que ya conoce el producto.
 *   - Telegram: gratuitos con Telegram y actividad en los ultimos 90 dias.
 *   - Push:     gratuitos con suscripcion push, MENOS los que reciben Telegram.
 *
 * Quedan fuera a proposito los 2.104 que nunca volvieron: son el grupo mas
 * frio y el mas facil de quemar. Se les escribe, si acaso, cuando esta primera
 * tanda haya dado numeros.
 *
 * Idiomas: 30 variantes. La base declara 34 codigos distintos y 259 personas
 * no hablan ni ingles ni espanol; mandarles ingles por defecto era tratar como
 * resto a una de cada catorce. Un idioma que no este en el mapa cae a ingles:
 * una traduccion dudosa se lee peor que un ingles correcto.
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

// ── Texto ────────────────────────────────────────────────────────────────────
// t = titulo, l1 = saludo con el nombre, l2 = el cambio, l3 = invitacion.
// No se promete quien hay en camara ahora mismo: eso cambia cada minuto y una
// promesa falsa en la primera linea quema la segunda.

const COPY = {
  es:     { t: 'El Main Stage ya no cierra',         l1: 'Hola{n} — antes abría 2 horas al día.',            l2: 'Ahora está abierto las 24 horas, gratis.',        l3: 'Entra cuando quieras.',        btn: 'Entrar' },
  en:     { t: "Main Stage doesn't close anymore",   l1: 'Hey{n} — it used to open 2 hours a day.',          l2: "Now it's open 24/7, free.",                       l3: 'Drop in whenever.',            btn: 'Go in' },
  pt:     { t: 'O Main Stage não fecha mais',        l1: 'Olá{n} — antes abria 2 horas por dia.',            l2: 'Agora está aberto 24 horas, grátis.',             l3: 'Entre quando quiser.',         btn: 'Entrar' },
  fr:     { t: 'Le Main Stage ne ferme plus',        l1: 'Salut{n} — avant, il ouvrait 2 heures par jour.',  l2: 'Maintenant il est ouvert 24h/24, gratuitement.',  l3: 'Passe quand tu veux.',         btn: 'Entrer' },
  de:     { t: 'Die Main Stage schließt nicht mehr', l1: 'Hey{n} — früher war sie 2 Stunden am Tag offen.',  l2: 'Jetzt ist sie rund um die Uhr offen, kostenlos.', l3: 'Komm vorbei, wann du willst.', btn: 'Rein' },
  it:     { t: 'Il Main Stage non chiude più',       l1: 'Ciao{n} — prima apriva 2 ore al giorno.',          l2: 'Ora è aperto 24 ore su 24, gratis.',              l3: 'Entra quando vuoi.',           btn: 'Entra' },
  nl:     { t: 'De Main Stage sluit niet meer',      l1: 'Hoi{n} — vroeger was hij 2 uur per dag open.',     l2: 'Nu is hij 24/7 open, gratis.',                    l3: 'Kom langs wanneer je wilt.',   btn: 'Naar binnen' },
  ru:     { t: 'Main Stage больше не закрывается',   l1: 'Привет{n} — раньше он работал 2 часа в день.',     l2: 'Теперь открыт круглосуточно и бесплатно.',        l3: 'Заходи когда захочешь.',       btn: 'Войти' },
  uk:     { t: 'Main Stage більше не зачиняється',   l1: 'Привіт{n} — раніше він працював 2 години на день.', l2: 'Тепер відкритий цілодобово і безкоштовно.',      l3: 'Заходь коли завгодно.',        btn: 'Увійти' },
  pl:     { t: 'Main Stage już się nie zamyka',      l1: 'Cześć{n} — kiedyś był otwarty 2 godziny dziennie.', l2: 'Teraz jest otwarty całą dobę, za darmo.',        l3: 'Wpadaj kiedy chcesz.',         btn: 'Wejdź' },
  ro:     { t: 'Main Stage nu se mai închide',       l1: 'Salut{n} — înainte era deschis 2 ore pe zi.',      l2: 'Acum e deschis 24 de ore, gratuit.',              l3: 'Intră când vrei.',             btn: 'Intră' },
  el:     { t: 'Το Main Stage δεν κλείνει πια',      l1: 'Γεια σου{n} — παλιά άνοιγε 2 ώρες τη μέρα.',       l2: 'Τώρα είναι ανοιχτό 24 ώρες, δωρεάν.',             l3: 'Πέρνα όποτε θες.',             btn: 'Είσοδος' },
  tr:     { t: 'Main Stage artık kapanmıyor',        l1: 'Selam{n} — eskiden günde 2 saat açıktı.',          l2: 'Şimdi 7/24 açık ve ücretsiz.',                    l3: 'İstediğin zaman uğra.',        btn: 'Gir' },
  ar:     { t: 'المسرح الرئيسي لم يعد يغلق',          l1: 'مرحبًا{n} — كان يفتح ساعتين في اليوم.',            l2: 'الآن مفتوح ٢٤ ساعة، مجانًا.',                      l3: 'ادخل وقتما تشاء.',             btn: 'ادخل' },
  he:     { t: "המיין סטייג' כבר לא נסגר",           l1: 'היי{n} — פעם הוא נפתח שעתיים ביום.',               l2: 'עכשיו הוא פתוח 24/7, בחינם.',                     l3: 'תיכנס מתי שבא לך.',            btn: 'כניסה' },
  fa:     { t: 'Main Stage دیگر بسته نمی‌شود',        l1: 'سلام{n} — قبلاً روزی ۲ ساعت باز بود.',             l2: 'حالا ۲۴ ساعته باز است، رایگان.',                  l3: 'هر وقت خواستی بیا.',           btn: 'ورود' },
  th:     { t: 'Main Stage ไม่ปิดอีกต่อไป',           l1: 'สวัสดี{n} — เมื่อก่อนเปิดวันละ 2 ชั่วโมง',           l2: 'ตอนนี้เปิด 24 ชั่วโมง ฟรี',                        l3: 'แวะมาได้ทุกเมื่อ',              btn: 'เข้าชม' },
  vi:     { t: 'Main Stage không còn đóng cửa nữa',  l1: 'Chào{n} — trước đây chỉ mở 2 tiếng mỗi ngày.',     l2: 'Giờ mở 24/7, miễn phí.',                          l3: 'Ghé bất cứ lúc nào.',          btn: 'Vào xem' },
  id:     { t: 'Main Stage tidak tutup lagi',        l1: 'Hai{n} — dulu hanya buka 2 jam sehari.',           l2: 'Sekarang buka 24 jam, gratis.',                   l3: 'Mampir kapan saja.',           btn: 'Masuk' },
  ms:     { t: 'Main Stage tidak tutup lagi',        l1: 'Hai{n} — dulu hanya buka 2 jam sehari.',           l2: 'Sekarang buka 24 jam, percuma.',                  l3: 'Singgah bila-bila masa.',      btn: 'Masuk' },
  ja:     { t: 'Main Stage はもう閉まりません',        l1: '{n}これまでは1日2時間だけでした。',                  l2: '今は24時間、無料で開いています。',                  l3: 'いつでもどうぞ。',               btn: '入る' },
  ko:     { t: 'Main Stage는 이제 닫지 않습니다',      l1: '{n}예전에는 하루 2시간만 열렸어요.',                 l2: '이제 24시간 무료로 열려 있습니다.',                l3: '언제든지 들러주세요.',           btn: '입장' },
  zhHans: { t: 'Main Stage 不再关闭',                 l1: '{n}以前每天只开 2 小时。',                          l2: '现在 24 小时开放，免费。',                          l3: '随时进来看看。',                 btn: '进入' },
  zhHant: { t: 'Main Stage 不再關閉',                 l1: '{n}以前每天只開 2 小時。',                          l2: '現在 24 小時開放，免費。',                          l3: '隨時進來看看。',                 btn: '進入' },
  da:     { t: 'Main Stage lukker ikke længere',     l1: 'Hej{n} — før var der kun åbent 2 timer om dagen.', l2: 'Nu er der åbent døgnet rundt, gratis.',           l3: 'Kig forbi når du vil.',        btn: 'Gå ind' },
  sv:     { t: 'Main Stage stänger inte längre',     l1: 'Hej{n} — förut var det öppet 2 timmar om dagen.',  l2: 'Nu är det öppet dygnet runt, gratis.',            l3: 'Kom förbi när du vill.',       btn: 'Gå in' },
  nb:     { t: 'Main Stage stenger ikke lenger',     l1: 'Hei{n} — før var det åpent 2 timer om dagen.',     l2: 'Nå er det åpent døgnet rundt, gratis.',           l3: 'Stikk innom når du vil.',      btn: 'Gå inn' },
  hr:     { t: 'Main Stage se više ne zatvara',      l1: 'Bok{n} — prije je bio otvoren 2 sata dnevno.',     l2: 'Sada je otvoren 24 sata, besplatno.',             l3: 'Svrati kad god želiš.',        btn: 'Uđi' },
  et:     { t: 'Main Stage ei sulge enam',           l1: 'Tere{n} — varem oli avatud 2 tundi päevas.',       l2: 'Nüüd on avatud ööpäev läbi, tasuta.',             l3: 'Astu läbi millal tahes.',      btn: 'Sisene' },
  uz:     { t: 'Main Stage endi yopilmaydi',         l1: 'Salom{n} — ilgari kuniga 2 soat ochiq edi.',       l2: 'Endi 24 soat ochiq, bepul.',                      l3: 'Xohlagan vaqtingizda kiring.', btn: 'Kirish' },
};

// Como se engancha el nombre al saludo. En japones, coreano y chino no va
// detras de un "Hola" sino delante, con su propio tratamiento.
const NAME_JOIN = {
  ja:     (nombre) => `${nombre}さん — `,
  ko:     (nombre) => `${nombre}님 — `,
  zhHans: (nombre) => `${nombre}，`,
  zhHant: (nombre) => `${nombre}，`,
};
const NAME_JOIN_DEFAULT = (nombre) => ` ${nombre}`;

/**
 * El codigo de idioma llega en muchas formas ('pt-br', 'zhtw', 'zh-hant'...).
 * Se reduce a la clave del texto; lo que no este cae a ingles.
 */
function resolveLang(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'en';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('pt')) return 'pt';
  // Chino: hay que separar tradicional de simplificado. 'zh' a secas es
  // simplificado en la practica.
  if (v === 'zh-hant' || v === 'zhtw' || v === 'zh-tw' || v === 'zh-hk') return 'zhHant';
  if (v.startsWith('zh')) return 'zhHans';
  if (v.startsWith('nb') || v.startsWith('nn') || v === 'no') return 'nb';
  const base = v.split(/[-_]/)[0];
  return COPY[base] ? base : 'en';
}

/**
 * El mensaje va con parse_mode HTML, asi que un nombre con < o & rompe el
 * envio entero con un 400. Es el mismo fallo que arrastraban los broadcast
 * anteriores.
 */
const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tgCaption(nombre, langKey) {
  const c = COPY[langKey] || COPY.en;
  const limpio = nombre ? escapeHtml(String(nombre).trim()).slice(0, 64) : '';
  const join = NAME_JOIN[langKey] || NAME_JOIN_DEFAULT;
  const n = limpio ? join(limpio) : '';
  return `<b>${c.t}</b>\n\n${c.l1.replace('{n}', n)}\n${c.l2}\n\n${c.l3}`;
}

function pushPayload(langKey) {
  const c = COPY[langKey] || COPY.en;
  return { url: '/main-stage', icon: '/icon-192.png', tag: 'mainstage-open-2026-09-06', title: c.t, body: c.l2 };
}

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
    SELECT u.id AS user_id, u.username, u.first_name, u.telegram, u.language
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
 * Gratuitos con push, excluyendo a los que ya reciben Telegram: el mismo aviso
 * por dos vias no informa mas, solo molesta el doble.
 */
async function loadPushTargets(excluidos) {
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id, u.language
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.tier,'free') = 'free'
       AND COALESCE(u.is_active, true) = true
  `);
  return rows.filter((r) => !excluidos.has(r.id));
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

/** Un envio de push por idioma, no uno global en ingles. */
async function sendPushByLang(destinatarios) {
  const porIdioma = new Map();
  for (const r of destinatarios) {
    const k = resolveLang(r.language);
    if (!porIdioma.has(k)) porIdioma.set(k, []);
    porIdioma.get(k).push(r.id);
  }
  const orden = [...porIdioma.entries()].sort((a, b) => b[1].length - a[1].length);
  let total = 0; let enviados = 0;

  for (const [langKey, ids] of orden) {
    const opts = pushPayload(langKey);
    total += ids.length;
    console.log(`  [PUSH ${langKey}] ${ids.length}`);
    if (DRY) { console.log(`      ${opts.title} · ${opts.body}`); continue; }
    const n = await PushNotificationService.sendToUsers(ids, opts);
    enviados += n;
    console.log(`  [PUSH ${langKey}] entregados ${n}/${ids.length}`);
    for (const uid of ids) { try { await log(uid, `mainstage_open_push_${langKey}`, 'sent'); } catch {} }
  }
  return { attempted: total, sent: enviados };
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

  const reparto = new Map();
  for (const t of tgTargets) {
    const k = resolveLang(t.language);
    reparto.set(k, (reparto.get(k) || 0) + 1);
  }
  const ordenado = [...reparto.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`  Telegram: ${tgTargets.length} gratuitos activos en 90 días, en ${reparto.size} idiomas`);
  console.log('  ' + ordenado.map(([k, n]) => `${k}:${n}`).join('  ') + '\n');

  if (DRY) {
    for (const [langKey] of ordenado) {
      const ejemplo = tgTargets.find((t) => resolveLang(t.language) === langKey);
      const nombre = ejemplo ? (ejemplo.first_name || ejemplo.username) : null;
      console.log(`  ── ${langKey} (${reparto.get(langKey)}) ──`);
      console.log(tgCaption(nombre, langKey).replace(/<\/?b>/g, ''));
      console.log(`  [botón] ${(COPY[langKey] || COPY.en).btn} → ${CTA_URL}\n`);
    }
    if (!SKIP_PUSH) {
      console.log('  ── PUSH ──');
      await sendPushByLang(await loadPushTargets(excluidos));
    }
    console.log('\n  PRUEBA — no se envió nada. Repetir con --live.\n');
    process.exit(0);
  }

  const stats = { tg: 0, tgSkip: 0, tgFail: 0 };
  for (let i = 0; i < tgTargets.length; i++) {
    const { user_id, username, first_name, telegram, language } = tgTargets[i];
    if ((i + 1) % 200 === 0) {
      console.log(`  progreso: ${i + 1}/${tgTargets.length}  enviados=${stats.tg} fallos=${stats.tgFail}`);
    }
    if (await alreadySent(user_id, TG_CHANNEL)) { stats.tgSkip++; continue; }
    const langKey = resolveLang(language);
    const c = COPY[langKey] || COPY.en;
    const r = await tgSend(telegram, tgCaption(first_name || username || null, langKey), c.btn, CTA_URL);
    if (r.ok) { stats.tg++; await log(user_id, TG_CHANNEL, 'sent'); }
    else { stats.tgFail++; await log(user_id, TG_CHANNEL, 'failed', (r.description || r.error || '?').slice(0, 500)); }
    await sleep(TG_DELAY_MS);
  }

  let push = { attempted: 0, sent: 0 };
  if (!SKIP_PUSH) {
    console.log('\n  ── PUSH ──');
    push = await sendPushByLang(await loadPushTargets(excluidos));
  }

  console.log('\n── Resumen ──────────────────────────────────────────────────────');
  console.log(`   Telegram enviados : ${stats.tg}`);
  console.log(`   Telegram omitidos : ${stats.tgSkip}  (ya avisados antes)`);
  console.log(`   Telegram fallidos : ${stats.tgFail}`);
  console.log(`   Push              : ${push.sent}/${push.attempted}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Fatal:', err); process.exit(1); });
