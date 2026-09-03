'use strict';

/**
 * Main Stage Host Bot — "Cristina" posts nudges + wellness msgs into
 * the Main Stage chat on a jittered cadence to test if it lifts tips /
 * bookings / session length.
 *
 * Experiment 2026-08-09 → 2026-08-12. A/B split by user_id hash.
 *
 * Kill switch:  redis SET pnpapp:mainstage:host_bot:enabled 1
 * A/B split %:  redis SET pnpapp:mainstage:host_bot:ab_split 50  (0-100)
 *
 * Room fan-out:
 *   - Sockets in bucket A join `mainstage:hostbot` (in socketHandlers.js)
 *   - Auto msgs emit ONLY to that room; bucket B never sees them
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { getRedis } = require('../config/redis');
const { query } = require('../config/postgres');

const CRISTINA_USER_ID = '8552451957';
const CRISTINA_DISPLAY_NAME = 'Cristina';

// ioredis auto-prefixes with REDIS_KEY_PREFIX ('pnpapp:'), so keys here are
// UN-prefixed. Operator SETs from redis-cli must include the raw 'pnpapp:' prefix.
const ENABLED_KEY  = 'mainstage:host_bot:enabled';
const SPLIT_KEY    = 'mainstage:host_bot:ab_split';
const FORCE_KEY    = 'mainstage:host_bot:force_next_tick';
const HUMAN_MSG_ZSET = 'mainstage:humanmsg:60s';

const TICK_BASE_MS   = 5 * 60_000;  // 5 min
const TICK_JITTER_MS = 60_000;      // ± 60 s
const MIN_VIEWERS    = 3;
const MAX_HUMAN_MSGS_60S = 5;

const WEIGHTS = { tip: 0.70, booking: 0.15, wellness: 0.15 };

// ─── Message pools ──────────────────────────────────────────────────────────

const WELLNESS_POOL = [
  { es: '💧 Recordatorio: hidrátate. Un sorbito ya cuenta.', en: '💧 Reminder: hydrate. Even one sip counts.' },
  { es: '💜 Estás haciendo bien la noche. Solo por estar aquí.', en: '💜 You are doing great tonight. Just for being here.' },
  { es: '🧡 Respira profundo 4 seg, suelta 6 seg. Repite 3 veces.', en: '🧡 Breathe in 4s, out 6s. Repeat 3 times.' },
  { es: '✨ Consent > todo. Pregunta antes, siempre.', en: '✨ Consent > everything. Always ask first.' },
  { es: '🍊 ¿Cuándo comiste último? Un snack nunca sobra.', en: '🍊 When did you last eat? A snack is never a bad idea.' },
  { es: '🌙 Chill vibes only. Nadie compite aquí.', en: '🌙 Chill vibes only. No one is competing here.' },
  { es: '💧 Un vaso de agua entre trago y trago cambia la noche.', en: '💧 A glass of water between drinks changes the whole night.' },
  { es: '💊 Sabes tu dosis. No mezcles sin saber. Cuídate.', en: '💊 Know your dose. Don\'t mix without checking. Take care of you.' },
  { es: '💗 Este espacio es tuyo. Ocupa el lugar que quieras.', en: '💗 This space is yours. Take up as much room as you want.' },
  { es: '🎧 ¿Cómo va tu noche? Escríbelo en el chat, alguien te lee.', en: '🎧 How\'s your night going? Drop it in chat, someone is listening.' },
  { es: '🫶 Recordatorio: no tienes que dar explicaciones a nadie.', en: '🫶 Reminder: you owe no explanations to anyone.' },
  { es: '🌈 Aquí puedes ser tú sin filtros. Bienvenido.', en: '🌈 You can be yourself here, no filters. Welcome.' },
  { es: '💧 Tres respiraciones antes de responder algo intenso.', en: '💧 Three breaths before you reply to anything heavy.' },
  { es: '🕯️ Si algo se siente raro, sal. Volvemos cuando quieras.', en: '🕯️ If something feels off, step out. Come back when ready.' },
  { es: '💜 No estás solo/a en esto. Somos comunidad.', en: '💜 You are not alone in this. We are community.' },
  { es: '🍇 Comer algo antes de spinnear ayuda un montón.', en: '🍇 Eating something before you spin helps a lot.' },
  { es: '☀️ Mañana también existe. Cuida el ritmo hoy.', en: '☀️ Tomorrow exists too. Pace yourself tonight.' },
  { es: '🎈 Un cumplido genuino cambia el mood de alguien. Suéltalo.', en: '🎈 A real compliment shifts someone\'s mood. Drop one.' },
  { es: '💧 Recordatorio silencioso: tomar agua no es cringe.', en: '💧 Silent reminder: drinking water is not cringe.' },
  { es: '🧊 Si suda mucho, mineral+agua. Electrolitos > energéticas.', en: '🧊 If you are sweating a lot, salt+water. Electrolytes > energy drinks.' },
  { es: '💗 Los límites son sexys. Ponerlos también.', en: '💗 Boundaries are hot. Setting them is too.' },
  { es: '🎶 ¿Qué canción te tiene hoy? Compártela.', en: '🎶 What song has you tonight? Drop it.' },
  { es: '🌿 Pausa 60 seg. Mira algo lejos. Vuelve.', en: '🌿 60-second pause. Look at something far away. Come back.' },
  { es: '💜 Ser vulnerable es fuerza. Aquí no juzgamos.', en: '💜 Being vulnerable is strength. No judgment here.' },
  { es: '🫁 Recordatorio de aire. Inhala. Exhala. Otra.', en: '🫁 Breath check. Inhale. Exhale. One more.' },
  { es: '⏰ Si llevas 3+ h despierto sin agua, ahí está tu señal.', en: '⏰ 3+ h up with no water? That\'s your sign.' },
  { es: '🎁 Regalar un tip anima a que sigan streaming. Poquito hace mucho.', en: '🎁 A tiny tip keeps a stream alive. Small = huge.' },
  { es: '🧠 Nadie te va a juzgar por lo que sientes. Escríbelo o guárdalo, tu call.', en: '🧠 No one will judge what you feel. Post it or keep it — your call.' },
  { es: '💫 Que la noche sea lenta, larga y bonita.', en: '💫 May your night be slow, long and beautiful.' },
  { es: '🤝 Si necesitas hablar con alguien, escribe a soporte. Siempre hay alguien.', en: '🤝 If you need to talk, message support. Someone is always there.' },
];

const TIP_TEMPLATES = [
  { es: '💎 {name} está poniéndolo bien — mándale unos tokens', en: '💎 {name} is putting on a show — throw some tokens their way' },
  { es: '🔥 Muestra amor por {name} con un tip', en: '🔥 Show love for {name} with a tip' },
  { es: '💸 Un tip a {name} = más tiempo en cámara. Ayúdalos a quedarse.', en: '💸 A tip for {name} = more time on cam. Help them stay.' },
  { es: '🌟 {name} merece un chispazo. ¿Te animas?', en: '🌟 {name} deserves a spark. Wanna send one?' },
  { es: '💜 Si te está gustando lo de {name}, díselo con tokens.', en: '💜 If you\'re into what {name} is doing, tell them with tokens.' },
];

const TIP_TEMPLATES_CINEMA = [
  { es: '💎 ¿Buen video? Mándale unos tokens a Santino, es el host.', en: '💎 Enjoying the show? Tip Santino, he\'s the host.' },
  { es: '🍿 Cinema mode — deja unos tokens si te está gustando.', en: '🍿 Cinema mode — drop some tokens if you\'re into it.' },
  { es: '🎬 Un tip mantiene la programación viva. Aporta si puedes.', en: '🎬 Tips keep the schedule alive. Help out if you can.' },
];

const BOOKING_TEMPLATES = [
  { es: '📞 ¿Quieres privado con {name}? Reserva 15 min →', en: '📞 Wanna go private with {name}? Book 15 min →' },
  { es: '🔒 {name} está aceptando llamadas. Agenda ahora.', en: '🔒 {name} is accepting calls right now. Book one.' },
  { es: '🎯 Una llamada 1-a-1 con {name} — reserva tu slot', en: '🎯 A 1-on-1 with {name} — grab your slot' },
  { es: '💗 Momento privado con {name}? 15 min es un buen inicio.', en: '💗 Private time with {name}? 15 min is a great start.' },
];

// ─── State ──────────────────────────────────────────────────────────────────

let _io = null;
let _timer = null;
let _stopping = false;

function setIo(io) { _io = io; }

// ─── Bucket helpers (also used by socketHandlers + analysis script) ────────

function bucketOf(userId, split) {
  const h = crypto.createHash('sha1').update(String(userId)).digest();
  const n = h.readUInt32BE(0) % 100;
  return n < split ? 'A' : 'B';
}

async function getSplit() {
  try {
    const v = await getRedis().get(SPLIT_KEY);
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  } catch (_) {}
  return 50;
}

async function isEnabled() {
  try {
    const v = await getRedis().get(ENABLED_KEY);
    return v === '1' || v === 'true';
  } catch (_) {
    return false;
  }
}

async function trackHumanMessage() {
  try {
    const r = getRedis();
    const now = Date.now();
    const cutoff = now - 60_000;
    await r.zadd(HUMAN_MSG_ZSET, now, `${now}-${Math.random()}`);
    await r.zremrangebyscore(HUMAN_MSG_ZSET, 0, cutoff);
    await r.expire(HUMAN_MSG_ZSET, 120);
  } catch (_) {}
}

async function humanMsgs60s() {
  try {
    const r = getRedis();
    const cutoff = Date.now() - 60_000;
    await r.zremrangebyscore(HUMAN_MSG_ZSET, 0, cutoff);
    return await r.zcard(HUMAN_MSG_ZSET);
  } catch (_) {
    return 0;
  }
}

function viewerCount() {
  if (!_io) return 0;
  const room = _io.sockets.adapter.rooms.get('mainstage');
  return room ? room.size : 0;
}

// ─── Msg composers ─────────────────────────────────────────────────────────

async function getCurrentCammerName() {
  try {
    const cammer = await getRedis().get('mainstage:spotlight:cammer');
    if (!cammer) return null;
    const r = await query('SELECT id::text AS id, first_name, username FROM users WHERE id = $1 OR telegram = $1 LIMIT 1', [String(cammer)]);
    const row = r.rows && r.rows[0];
    if (!row) return null;
    const name = row.first_name || row.username || null;
    if (!name) return null;
    // Return an object so composeTipMsg can attach the recipientUserId to the
    // CTA. Callers only reading `.name` still work; back-compat via toString.
    return { name, userId: row.id ? String(row.id) : null };
  } catch (_) {
    return null;
  }
}

async function pickBookableCreator() {
  try {
    const r = await query(
      `SELECT u.first_name, u.username
         FROM performers p
         JOIN users u ON u.id = p.user_id
        WHERE p.status = 'active'
          AND COALESCE(p.is_available, true) = true
          AND u.username IS NOT NULL
        ORDER BY random()
        LIMIT 1`,
    );
    const row = r.rows && r.rows[0];
    if (!row) return null;
    return { name: row.first_name || row.username, username: row.username };
  } catch (_) {
    return null;
  }
}

function pickWeighted() {
  const n = Math.random();
  if (n < WEIGHTS.tip) return 'tip';
  if (n < WEIGHTS.tip + WEIGHTS.booking) return 'booking';
  return 'wellness';
}

function pickLangPair(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function bilingual(pair) {
  return `${pair.es}  ·  ${pair.en}`;
}

async function composeTipMsg() {
  const cammer = await getCurrentCammerName();
  if (cammer && cammer.name) {
    const t = pickLangPair(TIP_TEMPLATES);
    const cta = { label: 'Send tip · Enviar tip', action: 'open-tip' };
    // Only forward recipientUserId when we resolved the current cammer to a
    // real user id. Generic "tip anyone on stage" prompts (cinema fallback)
    // leave the field out so the client falls back to its own picker.
    if (cammer.userId) cta.recipientUserId = String(cammer.userId);
    return {
      text: bilingual({
        es: t.es.replace('{name}', cammer.name),
        en: t.en.replace('{name}', cammer.name),
      }),
      cta,
    };
  }
  const t = pickLangPair(TIP_TEMPLATES_CINEMA);
  return {
    text: bilingual(t),
    cta: { label: 'Send tip · Enviar tip', action: 'open-tip' },
  };
}

async function composeBookingMsg() {
  const creator = await pickBookableCreator();
  if (!creator) return null;
  const t = pickLangPair(BOOKING_TEMPLATES);
  return {
    text: bilingual({
      es: t.es.replace('{name}', creator.name),
      en: t.en.replace('{name}', creator.name),
    }),
    cta: {
      label: 'Book · Reservar',
      href: `/c/${creator.username}?action=book&duration=15&utm_source=mainstage_hostbot`,
    },
  };
}

function composeWellnessMsg() {
  const t = pickLangPair(WELLNESS_POOL);
  return { text: bilingual(t) };
}

// ─── Tick ──────────────────────────────────────────────────────────────────

function nextDelay() {
  return TICK_BASE_MS - TICK_JITTER_MS + Math.floor(Math.random() * 2 * TICK_JITTER_MS);
}

async function tick(opts = {}) {
  const forced = !!opts.forced;
  try {
    if (!_io) { logger.info('[HostBot] skip — no io yet'); return; }
    if (!forced && !(await isEnabled())) { logger.info('[HostBot] skip — disabled'); return; }

    const viewers = viewerCount();
    if (!forced && viewers < MIN_VIEWERS) {
      logger.info('[HostBot] skip — few viewers', { viewers });
      return;
    }

    const humans = await humanMsgs60s();
    if (!forced && humans >= MAX_HUMAN_MSGS_60S) {
      logger.info('[HostBot] skip — chat is active', { humans });
      return;
    }

    const kind = pickWeighted();
    let payload;
    if (kind === 'tip')      payload = await composeTipMsg();
    else if (kind === 'booking') payload = await composeBookingMsg();
    else                     payload = composeWellnessMsg();

    if (!payload) {
      logger.debug('[HostBot] skip — no payload composed', { kind });
      return;
    }

    const msg = {
      id: crypto.randomUUID(),
      userId: CRISTINA_USER_ID,
      displayName: CRISTINA_DISPLAY_NAME,
      text: payload.text,
      timestamp: Date.now(),
      kind: 'auto',
      cta: payload.cta || null,
    };

    _io.to('mainstage:hostbot').emit('mainstage:chat-message', msg);
    logger.info('[HostBot] emitted', { kind, viewers, humans, hasCta: !!msg.cta });
  } catch (err) {
    logger.error('[HostBot] tick error', { error: err.message });
  } finally {
    if (!_stopping) {
      _timer = setTimeout(tick, nextDelay());
    }
  }
}

let _forcePoll = null;

function start() {
  if (_timer) return;
  _stopping = false;
  const initialDelay = 15_000 + Math.floor(Math.random() * 45_000);
  _timer = setTimeout(tick, initialDelay);
  // Force-fire poll: operator can `SET pnpapp:mainstage:host_bot:force_next_tick 1`
  // to trigger a tick within ~5s, ignoring viewer/human-msg guards. Auto-clears.
  _forcePoll = setInterval(async () => {
    try {
      const v = await getRedis().get(FORCE_KEY);
      if (v === '1' || v === 'true') {
        await getRedis().del(FORCE_KEY);
        logger.info('[HostBot] force-fire triggered');
        tick({ forced: true }).catch(() => {});
      }
    } catch (_) {}
  }, 5_000);
  logger.info('[HostBot] scheduler armed', { firstTickMs: initialDelay });
}

function stop() {
  _stopping = true;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  if (_forcePoll) { clearInterval(_forcePoll); _forcePoll = null; }
}

module.exports = {
  setIo,
  start,
  stop,
  bucketOf,
  getSplit,
  trackHumanMessage,
  CRISTINA_USER_ID,
};
