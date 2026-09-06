#!/usr/bin/env node
'use strict';

/**
 * broadcast-pay-with-card-2026-09-06.js
 *
 * Solo 163 de 5.267 usuarios activos tienen billetera enlazada: un 3%. El resto
 * ve "wallet" y "USDC" y da por hecho que hay que saber de cripto, asi que no
 * paga. El caso que lo destapo: un PRIME enlazo su billetera, no la fondeo, y
 * lleva dias reabriendo el modal de reserva sin poder pagar una llamada.
 *
 * La recarga con tarjeta ya existe dentro del propio boton de pago: abre los
 * proveedores regulados y deposita USDC en Base, con el gas pagado por
 * nosotros. Nadie la usa porque nadie sabe que esta ahi.
 *
 * El cuerpo del mensaje NO lleva marcas ni mecanica de pago — eso vive en la
 * pagina de destino, /crypto-guide, que ya las nombra y responde las dudas.
 * Es una preferencia ya registrada en campanas anteriores.
 *
 * Publico: todo el que sea alcanzable y este activo en 90 dias, de cualquier
 * nivel. Con --solo-nuevos se excluye a quien ya recibio el aviso del Main
 * Stage de hoy, para no mandarle dos cosas el mismo dia.
 *
 * Uso:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-pay-with-card-2026-09-06.js
 *   ... --live | --solo-nuevos | --skip-telegram | --skip-push
 */

const path    = require('path');
const https   = require('https');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService       = require(path.join(BACKEND, 'services/pushNotificationService'));

const DRY         = !process.argv.includes('--live');
const SKIP_TG     = process.argv.includes('--skip-telegram');
const SKIP_PUSH   = process.argv.includes('--skip-push');
const SOLO_NUEVOS = process.argv.includes('--solo-nuevos');

const CTA_URL     = 'https://pnptv.app/crypto-guide';
const BOT_TOKEN   = process.env.BOT_TOKEN;
const TG_DELAY_MS = 100;
const LOG_TABLE   = 'broadcast_pay_with_card_2026_09_06';
const TG_CHANNEL  = 'pay_with_card_tg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Texto ────────────────────────────────────────────────────────────────────
// El mensaje disuelve la objecion real ("esto es cripto, no lo entiendo") y
// deja la mecanica para la guia. Sin marcas de pago, sin cifras de comision,
// sin promesas de rapidez que no controlamos.

const COPY = {
  es:     { t: 'Puedes pagar con tarjeta',            l1: 'Hola{n} — ya tienes una billetera aquí; se creó al registrarte.',                     l2: 'La cargas una vez con tarjeta y todo lo de pago va con un toque: llamadas, propinas, PRIME, canales.',                l3: 'Un minuto. Nada que instalar, nada que aprender.',              btn: 'Cómo se hace' },
  en:     { t: 'You can pay with your card',          l1: 'Hey{n} — you already have a wallet here; it was created when you signed up.',         l2: 'Load it once with your card and everything paid works with one tap: calls, tips, PRIME, channels.',                   l3: 'About a minute. Nothing to install, nothing to learn.',         btn: 'How it works' },
  pt:     { t: 'Você pode pagar com cartão',          l1: 'Olá{n} — você já tem uma carteira aqui; foi criada quando se cadastrou.',             l2: 'Carregue uma vez com o cartão e tudo que é pago funciona com um toque: chamadas, gorjetas, PRIME, canais.',            l3: 'Cerca de um minuto. Nada para instalar, nada para aprender.',   btn: 'Como funciona' },
  fr:     { t: 'Tu peux payer par carte',             l1: 'Salut{n} — tu as déjà un portefeuille ici ; il a été créé à ton inscription.',        l2: 'Recharge-le une fois par carte et tout ce qui est payant se fait en un geste : appels, pourboires, PRIME, salons.',   l3: 'Une minute environ. Rien à installer, rien à apprendre.',       btn: 'Comment ça marche' },
  de:     { t: 'Du kannst mit Karte zahlen',          l1: 'Hey{n} — du hast hier schon eine Wallet; sie wurde bei deiner Anmeldung erstellt.',   l2: 'Einmal per Karte aufladen, und alles Kostenpflichtige geht mit einem Tipp: Anrufe, Tips, PRIME, Kanäle.',             l3: 'Etwa eine Minute. Nichts installieren, nichts lernen.',         btn: "So geht's" },
  it:     { t: 'Puoi pagare con la carta',            l1: 'Ciao{n} — hai già un portafoglio qui; è stato creato quando ti sei iscritto.',        l2: 'Ricaricalo una volta con la carta e tutto ciò che è a pagamento va con un tocco: chiamate, mance, PRIME, canali.',    l3: 'Circa un minuto. Niente da installare, niente da imparare.',    btn: 'Come funziona' },
  nl:     { t: 'Je kunt met je kaart betalen',        l1: 'Hoi{n} — je hebt hier al een wallet; die is gemaakt toen je je aanmeldde.',           l2: 'Laad hem één keer op met je kaart en alles wat betaald is gaat met één tik: gesprekken, fooien, PRIME, kanalen.',      l3: 'Ongeveer een minuut. Niets installeren, niets leren.',          btn: 'Zo werkt het' },
  ru:     { t: 'Можно платить картой',                l1: 'Привет{n} — у тебя уже есть кошелёк здесь, он создан при регистрации.',               l2: 'Пополни его картой один раз — и всё платное работает в одно касание: звонки, чаевые, PRIME, каналы.',                 l3: 'Примерно минута. Ничего не нужно устанавливать и изучать.',     btn: 'Как это работает' },
  uk:     { t: 'Можна платити карткою',               l1: 'Привіт{n} — у тебе вже є гаманець тут, він створений при реєстрації.',                l2: 'Поповни його карткою один раз — і все платне працює в один дотик: дзвінки, чайові, PRIME, канали.',                   l3: 'Близько хвилини. Нічого не треба встановлювати чи вивчати.',    btn: 'Як це працює' },
  pl:     { t: 'Możesz zapłacić kartą',               l1: 'Cześć{n} — masz tu już portfel; powstał przy rejestracji.',                           l2: 'Doładuj go raz kartą, a wszystko płatne działa jednym dotknięciem: rozmowy, napiwki, PRIME, kanały.',                 l3: 'Około minuty. Nic do instalowania, niczego się nie trzeba uczyć.', btn: 'Jak to działa' },
  ro:     { t: 'Poți plăti cu cardul',                l1: 'Salut{n} — ai deja un portofel aici; a fost creat la înregistrare.',                  l2: 'Încarcă-l o dată cu cardul și tot ce e cu plată merge dintr-o atingere: apeluri, bacșișuri, PRIME, canale.',           l3: 'Cam un minut. Nimic de instalat, nimic de învățat.',            btn: 'Cum funcționează' },
  el:     { t: 'Μπορείς να πληρώσεις με κάρτα',       l1: 'Γεια σου{n} — έχεις ήδη πορτοφόλι εδώ· δημιουργήθηκε όταν γράφτηκες.',                l2: 'Γέμισέ το μία φορά με κάρτα και ό,τι είναι επί πληρωμή γίνεται με ένα άγγιγμα: κλήσεις, φιλοδωρήματα, PRIME, κανάλια.', l3: 'Περίπου ένα λεπτό. Τίποτα να εγκαταστήσεις, τίποτα να μάθεις.', btn: 'Πώς γίνεται' },
  tr:     { t: 'Kartınla ödeyebilirsin',              l1: 'Selam{n} — burada zaten bir cüzdanın var; kayıt olurken oluşturuldu.',                l2: 'Bir kez kartla yükle, ücretli her şey tek dokunuşla olsun: aramalar, bahşişler, PRIME, kanallar.',                    l3: 'Yaklaşık bir dakika. Kurulacak bir şey yok, öğrenilecek bir şey yok.', btn: 'Nasıl yapılır' },
  ar:     { t: 'يمكنك الدفع ببطاقتك',                  l1: 'مرحبًا{n} — لديك محفظة هنا بالفعل، أُنشئت عند تسجيلك.',                                l2: 'اشحنها مرة واحدة ببطاقتك ويصبح كل شيء مدفوع بلمسة واحدة: المكالمات، الإكراميات، PRIME، القنوات.',                        l3: 'حوالي دقيقة. لا شيء تثبّته ولا شيء تتعلّمه.',                      btn: 'كيف تعمل' },
  he:     { t: 'אפשר לשלם בכרטיס',                    l1: 'היי{n} — כבר יש לך ארנק כאן; הוא נוצר כשנרשמת.',                                        l2: 'תטען אותו פעם אחת בכרטיס וכל מה שבתשלום עובד בלחיצה: שיחות, טיפים, PRIME, ערוצים.',                                     l3: 'בערך דקה. אין מה להתקין ואין מה ללמוד.',                          btn: 'איך זה עובד' },
  fa:     { t: 'می‌توانی با کارت پرداخت کنی',           l1: 'سلام{n} — همین‌جا کیف پول داری؛ موقع ثبت‌نام ساخته شد.',                                l2: 'یک بار با کارت شارژش کن تا هر چیز پولی با یک لمس انجام شود: تماس‌ها، انعام، PRIME، کانال‌ها.',                            l3: 'حدود یک دقیقه. چیزی برای نصب یا یادگیری نیست.',                  btn: 'چطور کار می‌کند' },
  th:     { t: 'จ่ายด้วยบัตรได้',                        l1: 'สวัสดี{n} — คุณมีกระเป๋าเงินที่นี่แล้ว สร้างตอนสมัคร',                                   l2: 'เติมด้วยบัตรครั้งเดียว แล้วทุกอย่างที่ต้องจ่ายก็แตะครั้งเดียว: สายวิดีโอ ทิป PRIME ช่อง',                                    l3: 'ราวหนึ่งนาที ไม่ต้องติดตั้งอะไร ไม่ต้องเรียนรู้อะไร',                    btn: 'ทำยังไง' },
  vi:     { t: 'Bạn có thể trả bằng thẻ',             l1: 'Chào{n} — bạn đã có ví ở đây rồi; nó được tạo khi bạn đăng ký.',                      l2: 'Nạp một lần bằng thẻ, mọi thứ trả phí chỉ cần một chạm: cuộc gọi, tiền tip, PRIME, kênh.',                            l3: 'Khoảng một phút. Không cần cài gì, không cần học gì.',          btn: 'Cách làm' },
  id:     { t: 'Bisa bayar pakai kartu',              l1: 'Hai{n} — kamu sudah punya dompet di sini; dibuat saat kamu daftar.',                  l2: 'Isi sekali pakai kartu, lalu semua yang berbayar cukup satu ketuk: panggilan, tip, PRIME, kanal.',                    l3: 'Sekitar satu menit. Tidak ada yang perlu dipasang atau dipelajari.', btn: 'Caranya' },
  ms:     { t: 'Boleh bayar guna kad',                l1: 'Hai{n} — anda sudah ada dompet di sini; ia dibuat semasa anda mendaftar.',            l2: 'Tambah nilai sekali dengan kad, dan semua yang berbayar cuma satu sentuhan: panggilan, tip, PRIME, saluran.',          l3: 'Kira-kira seminit. Tiada apa perlu dipasang atau dipelajari.',  btn: 'Caranya' },
  ja:     { t: 'カードで支払えます',                     l1: '{n}ここにはすでにウォレットがあります。登録時に作成されました。',                                l2: '一度カードでチャージすれば、通話・チップ・PRIME・チャンネルなど有料のものはすべてワンタップです。',                              l3: '一分ほど。インストールも学習も不要です。',                          btn: 'やり方を見る' },
  ko:     { t: '카드로 결제할 수 있어요',                 l1: '{n}이미 여기에 지갑이 있습니다. 가입할 때 만들어졌어요.',                                    l2: '카드로 한 번 충전하면 통화, 팁, PRIME, 채널 등 유료 항목이 한 번의 터치로 끝납니다.',                                        l3: '1분 정도. 설치할 것도, 배울 것도 없습니다.',                        btn: '방법 보기' },
  zhHans: { t: '可以用银行卡付款',                       l1: '{n}你在这里已经有一个钱包，注册时就创建好了。',                                            l2: '用卡充值一次，之后通话、打赏、PRIME、频道等付费内容都只需一次点击。',                                                      l3: '大约一分钟。无需安装，也不用学习。',                                btn: '怎么操作' },
  zhHant: { t: '可以用信用卡付款',                       l1: '{n}你在這裡已經有一個錢包，註冊時就建立好了。',                                            l2: '用卡儲值一次，之後通話、打賞、PRIME、頻道等付費內容都只需點一下。',                                                        l3: '大約一分鐘。不用安裝，也不用學習。',                                btn: '怎麼操作' },
  da:     { t: 'Du kan betale med dit kort',          l1: 'Hej{n} — du har allerede en wallet her; den blev oprettet, da du meldte dig til.',    l2: 'Fyld den op med kort én gang, så klares alt betalt med ét tryk: opkald, tips, PRIME, kanaler.',                       l3: 'Cirka et minut. Intet at installere, intet at lære.',           btn: 'Sådan gør du' },
  sv:     { t: 'Du kan betala med kort',              l1: 'Hej{n} — du har redan en plånbok här; den skapades när du registrerade dig.',         l2: 'Fyll på den med kort en gång, sedan går allt betalt med en tryckning: samtal, dricks, PRIME, kanaler.',               l3: 'Ungefär en minut. Inget att installera, inget att lära sig.',   btn: 'Så gör du' },
  nb:     { t: 'Du kan betale med kort',              l1: 'Hei{n} — du har allerede en lommebok her; den ble laget da du registrerte deg.',      l2: 'Fyll den opp med kort én gang, så går alt betalt med ett trykk: samtaler, tips, PRIME, kanaler.',                     l3: 'Omtrent ett minutt. Ingenting å installere, ingenting å lære.', btn: 'Slik gjør du' },
  hr:     { t: 'Možeš platiti karticom',              l1: 'Bok{n} — ovdje već imaš novčanik; napravljen je kad si se registrirao.',              l2: 'Napuni ga jednom karticom i sve što se plaća ide jednim dodirom: pozivi, napojnice, PRIME, kanali.',                  l3: 'Otprilike minuta. Nema se što instalirati ni učiti.',           btn: 'Kako se radi' },
  et:     { t: 'Saad maksta kaardiga',                l1: 'Tere{n} — sul on siin juba rahakott; see loodi registreerumisel.',                    l2: 'Lae see korra kaardiga ja kõik tasuline käib ühe puutega: kõned, jootraha, PRIME, kanalid.',                          l3: 'Umbes minut. Midagi pole vaja paigaldada ega õppida.',          btn: 'Kuidas käib' },
  uz:     { t: "Karta bilan to'lash mumkin",          l1: "Salom{n} — bu yerda hamyoningiz bor, ro'yxatdan o'tganingizda yaratilgan.",            l2: "Bir marta karta bilan to'ldiring va pullik narsalar bir teginishda: qo'ng'iroqlar, chaqimlar, PRIME, kanallar.",       l3: "Taxminan bir daqiqa. O'rnatadigan ham, o'rganadigan ham narsa yo'q.", btn: 'Qanday qilinadi' },
};

// En japones, coreano y chino el nombre no va detras de un saludo sino delante,
// con su propio tratamiento.
const NAME_JOIN = {
  ja:     (n) => `${n}さん — `,
  ko:     (n) => `${n}님 — `,
  zhHans: (n) => `${n}，`,
  zhHant: (n) => `${n}，`,
};
const NAME_JOIN_DEFAULT = (n) => ` ${n}`;

function resolveLang(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'en';
  if (v.startsWith('es')) return 'es';
  if (v.startsWith('pt')) return 'pt';
  if (v === 'zh-hant' || v === 'zhtw' || v === 'zh-tw' || v === 'zh-hk') return 'zhHant';
  if (v.startsWith('zh')) return 'zhHans';
  if (v.startsWith('nb') || v.startsWith('nn') || v === 'no') return 'nb';
  const base = v.split(/[-_]/)[0];
  return COPY[base] ? base : 'en';
}

/** El mensaje va con parse_mode HTML: un nombre con < o & lo tumbaria entero. */
const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tgCaption(nombre, langKey) {
  const c = COPY[langKey] || COPY.en;
  const limpio = nombre ? escapeHtml(String(nombre).trim()).slice(0, 64) : '';
  const join = NAME_JOIN[langKey] || NAME_JOIN_DEFAULT;
  const n = limpio ? join(limpio) : '';
  return `<b>${c.t}</b>\n\n${c.l1.replace('{n}', n)}\n\n${c.l2}\n\n${c.l3}`;
}

function pushPayload(langKey) {
  const c = COPY[langKey] || COPY.en;
  return { url: '/crypto-guide', icon: '/icon-192.png', tag: 'pay-with-card-2026-09-06', title: c.t, body: c.l3 };
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
    [String(userId), channel]);
  return rows.length > 0;
}

async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]);
}

const FILTRO_RECIENTE = `
  AND NOT EXISTS (
    SELECT 1 FROM broadcast_mainstage_open_2026_09_06 b
     WHERE b.user_id = u.id::text AND b.status = 'sent'
  )`;

async function loadTelegramTargets() {
  const { rows } = await query(`
    SELECT u.id AS user_id, u.username, u.first_name, u.telegram, u.language, u.tier
      FROM users u
     WHERE COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier,'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND u.telegram IS NOT NULL AND TRIM(u.telegram::text) <> ''
       AND u.last_active > NOW() - INTERVAL '90 days'
       ${SOLO_NUEVOS ? FILTRO_RECIENTE : ''}
     ORDER BY u.last_active DESC`);
  return rows;
}

async function loadPushTargets(excluidos) {
  const { rows } = await query(`
    SELECT DISTINCT u.id::text AS id, u.language
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier,'free') <> 'banned'
       ${SOLO_NUEVOS ? FILTRO_RECIENTE : ''}`);
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
    for (const uid of ids) { try { await log(uid, `pay_with_card_push_${langKey}`, 'sent'); } catch {} }
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
  console.log('  PNPtv — pagar con tarjeta   2026-09-06');
  console.log(`  MODO: ${DRY ? 'PRUEBA (no envía)' : 'EN VIVO'}   solo-nuevos: ${SOLO_NUEVOS}   sin-telegram: ${SKIP_TG}   sin-push: ${SKIP_PUSH}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tgTargets = SKIP_TG ? [] : await loadTelegramTargets();
  const excluidos = new Set(tgTargets.map((t) => String(t.user_id)));

  const porNivel = new Map();
  const reparto = new Map();
  for (const t of tgTargets) {
    const k = resolveLang(t.language);
    reparto.set(k, (reparto.get(k) || 0) + 1);
    const n = t.tier || 'free';
    porNivel.set(n, (porNivel.get(n) || 0) + 1);
  }
  const ordenado = [...reparto.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`  Telegram: ${tgTargets.length} personas, ${reparto.size} idiomas`);
  console.log('  por nivel: ' + [...porNivel.entries()].map(([k, v]) => `${k}:${v}`).join('  '));
  console.log('  idiomas:   ' + ordenado.map(([k, n]) => `${k}:${n}`).join('  ') + '\n');

  if (DRY) {
    for (const [langKey] of ordenado.slice(0, 6)) {
      const ej = tgTargets.find((t) => resolveLang(t.language) === langKey);
      console.log(`  ── ${langKey} (${reparto.get(langKey)}) ──`);
      console.log(tgCaption(ej ? (ej.first_name || ej.username) : null, langKey).replace(/<\/?b>/g, ''));
      console.log(`  [botón] ${(COPY[langKey] || COPY.en).btn} → ${CTA_URL}\n`);
    }
    if (ordenado.length > 6) console.log(`  (y ${ordenado.length - 6} idiomas más)\n`);
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
    if ((i + 1) % 250 === 0) {
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
  console.log(`   Telegram omitidos : ${stats.tgSkip}`);
  console.log(`   Telegram fallidos : ${stats.tgFail}`);
  console.log(`   Push              : ${push.sent}/${push.attempted}`);
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Fatal:', err); process.exit(1); });
