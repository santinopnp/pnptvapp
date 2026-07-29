#!/usr/bin/env node
'use strict';

/**
 * broadcast-pnptv-story-manual-2026-07.js
 *
 * Personal letter from Lex (@pnplatinoboy) and Santino (@santinofurioso)
 * introducing PNPtv!'s pillars/values/mission and sharing the community
 * manual (ES + EN). Sends to every user via:
 *   1. Web push (webapp "DM" equivalent) — PushNotificationService.sendToAll
 *   2. Telegram DM — one bilingual-aware message per bot user
 *   3. A pinned post in the "PNPtv! Main" community group, tagging Lex & Santino
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-pnptv-story-manual-2026-07.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-pnptv-story-manual-2026-07.js
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-pnptv-story-manual-2026-07.js --skip-telegram
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-pnptv-story-manual-2026-07.js --skip-push
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-pnptv-story-manual-2026-07.js --skip-group
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-pnptv-story-manual-2026-07.js --pin
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
const { Telegram } = require('telegraf');

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_TELEGRAM = process.argv.includes('--skip-telegram');
const SKIP_PUSH     = process.argv.includes('--skip-push');
const SKIP_GROUP    = process.argv.includes('--skip-group');
const DO_PIN        = process.argv.includes('--pin');
const TG_DELAY_MS   = 80;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEn  = (lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('en');
const getLang = (user) => isEn(user.language) ? 'en' : 'es';

// Same target the daily migration nudge uses — the real "PNPtv! Main" supergroup.
// MIGRATION_NUDGE_CHAT_ID env var overrides if this is stale.
const COMMUNITY_GROUP_ID = process.env.MIGRATION_NUDGE_CHAT_ID || '-1003760638625';

const MANUAL_URL_ES = 'https://app.pnptv.app/uploads/manual-2026/manual-es.html';
const MANUAL_URL_EN = 'https://app.pnptv.app/uploads/manual-2026/manual-en.html';
const APP_URL = 'https://app.pnptv.app';

function getBotToken() {
  return process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
}

// ── Letter content ──────────────────────────────────────────────────────────

const LETTER_ES = `No hemos hablado mucho sobre nosotros. Bueno, sí lo hicimos, pero en canales de Telegram que ya no existen, y tampoco hemos hablado de qué es PNPtv! y cómo nació a nuestros nuevos miembros.

Vamos a tomarnos un tiempo para crear un canal con otro enfoque, en el cual les hablemos sobre los pilares, valores, misión y visión de PNPtv!, y descubramos juntos que esto no es un medio para hacer apología al consumo de ninguna sustancia, ni tampoco un outlet de porno sin curaduría ni límites — sino una comunidad donde abordamos de manera honesta los retos de todas las personas que consumimos sustancias, que nos gusta el chemsex, y/o que trabajamos en el sexo.

Este proyecto, muy extrañamente, nació de aprender a amar: amar a nuestro esposo y compañero de vida en ambientes poco tradicionales —los que habitamos ya casi naturalmente— y amarnos a nosotros mismos a pesar de los desafíos que nuestras decisiones y contexto nos presentaban, aunque no siempre fueran las mejores.

De la vivencia honesta de este proceso nació el documento que queremos compartir con ustedes, con énfasis y foco en creadores, pero de lectura abierta para toda la comunidad —que es, en primera instancia, lo que queremos lograr con PNPtv!—.

Aunque aún estamos bastante lejos de lograrlo, trabajamos dos personas en pos de conseguirlo y de marcar un hito en el trabajo sexual: la adaptación de la teoría de administración del recurso humano —incluyendo riesgos profesionales— en un esfuerzo independiente por profesionalizar a los colegas (y a nosotros mismos) a través del trabajo cooperativo, soberano y autónomo, con un enfoque holístico centrado en el amor propio.

A quienes se tomen el tiempo de leerlo: el feedback es bienvenido, porque este es un proceso que apenas empieza y que, al final, será de todos. Nosotros solo ponemos los primeros ladrillos.

Con cariño,
El equipo de PNPtv!`;

const LETTER_EN = `We haven't talked much about ourselves. Well, we did — but in Telegram channels that no longer exist, and we also haven't told our new members what PNPtv! is and how it started.

We're going to take some time to create a channel with a different focus, where we can talk to you about PNPtv!'s pillars, values, mission, and vision, and discover together that this isn't a platform for glorifying substance use, nor an outlet for porn without curation or limits — but rather a community where we honestly address the challenges faced by everyone who uses substances, who enjoys chemsex, and/or who works in sex work.

This project, strangely enough, was born out of learning to love: loving our husband and life partner in non-traditional settings — the ones we now inhabit almost naturally — and loving ourselves despite the challenges our choices and circumstances presented us with, even when they weren't always the best ones.

From the honest experience of this process came the document we want to share with you, with an emphasis and focus on creators, but open for the whole community to read — which is, first and foremost, what we want to achieve with PNPtv!

Although we're still quite far from achieving it, the two of us are working toward that goal and toward marking a milestone in sex work: adapting human resource management theory — including occupational risk — in an independent effort to professionalize our colleagues (and ourselves) through cooperative, sovereign, and autonomous work, with a holistic approach centered on self-love.

To those who take the time to read it: feedback is welcome, because this is a process that's just beginning and that, in the end, will belong to everyone. We're just laying the first bricks.

With love,
The PNPtv! Team`;

function htmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TG_DM = {
  es: `💌 <b>Una carta del equipo de PNPtv!</b>

${htmlEscape(LETTER_ES)}

📘 Manual completo (Español): <a href="${MANUAL_URL_ES}">leer aquí</a>
📘 Full Manual (English): <a href="${MANUAL_URL_EN}">read here</a>

👉 <a href="${APP_URL}">app.pnptv.app</a>`,

  en: `💌 <b>A letter from the PNPtv! Team</b>

${htmlEscape(LETTER_EN)}

📘 Full Manual (English): <a href="${MANUAL_URL_EN}">read here</a>
📘 Manual completo (Español): <a href="${MANUAL_URL_ES}">leer aquí</a>

👉 <a href="${APP_URL}">app.pnptv.app</a>`,
};

const PUSH = {
  es: {
    title: '💌 Una carta del equipo de PNPtv!',
    body:  'Hablemos de quiénes somos, cómo nació PNPtv!, y compartimos nuestro manual completo. Toca para leer.',
  },
  en: {
    title: '💌 A letter from the PNPtv! Team',
    body:  "Let's talk about who we are, how PNPtv! started, and our full community manual. Tap to read.",
  },
};

const GROUP_POST_HTML = `💌 <b>Una carta del equipo de PNPtv!</b>
💌 <b>A letter from the PNPtv! Team</b>

${htmlEscape(LETTER_ES)}

—

${htmlEscape(LETTER_EN)}

📘 ES: <a href="${MANUAL_URL_ES}">leer el manual</a>
📘 EN: <a href="${MANUAL_URL_EN}">read the manual</a>

👉 <a href="${APP_URL}">app.pnptv.app</a>`;

// ── Telegram helper (raw fetch, matches sendMigrationNudge.js pattern) ──────

async function tgRequest(method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${getBotToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) return { ok: false, error: json.description, retryAfter: json.parameters?.retry_after };
    return { ok: true, result: json.result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function postAndMaybePinGroupLetter() {
  if (SKIP_GROUP) { console.log('[group] skipped'); return; }

  const payload = {
    chat_id: COMMUNITY_GROUP_ID,
    text: GROUP_POST_HTML,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (DRY_RUN) {
    console.log('[group] DRY RUN — would post to', COMMUNITY_GROUP_ID);
    console.log(GROUP_POST_HTML);
    return;
  }

  const sendResult = await tgRequest('sendMessage', payload);
  if (!sendResult.ok) {
    console.error('[group] post failed:', sendResult.error);
    return;
  }
  console.log('[group] posted, message_id=', sendResult.result?.message_id);

  if (DO_PIN && sendResult.result?.message_id) {
    const pinResult = await tgRequest('pinChatMessage', {
      chat_id: COMMUNITY_GROUP_ID,
      message_id: sendResult.result.message_id,
      disable_notification: false,
    });
    if (!pinResult.ok) console.warn('[group] pin failed:', pinResult.error);
    else console.log('[group] pinned.');
  }
}

async function main() {
  console.log(`[broadcast-pnptv-story-manual] DRY_RUN=${DRY_RUN} SKIP_TELEGRAM=${SKIP_TELEGRAM} SKIP_PUSH=${SKIP_PUSH} SKIP_GROUP=${SKIP_GROUP} PIN=${DO_PIN}`);
  console.log(`[broadcast-pnptv-story-manual] community group target: ${COMMUNITY_GROUP_ID}`);

  // ── 1. Web push (webapp) ────────────────────────────────────────────────
  if (SKIP_PUSH) { console.log('[push] skipped'); }
  if (!SKIP_PUSH) PushNotificationService.initialize();
  if (!SKIP_PUSH) {
    try {
      const pushSent = await PushNotificationService.sendToAll({
        title: PUSH.es.title,
        body:  PUSH.es.body,
        url:   APP_URL,
        dryRun: DRY_RUN,
      });
      console.log(`[push] sent=${pushSent}`);
    } catch (err) {
      console.error('[push] error:', err.message);
    }
  }

  // ── 2. Telegram DMs to every bot user ───────────────────────────────────
  if (!SKIP_TELEGRAM) {
    const tg = new Telegram(getBotToken());
    const { rows } = await query(
      `SELECT id, telegram AS telegram_id, language
         FROM users
        WHERE telegram IS NOT NULL
          AND telegram ~ '^[0-9]+$'
        ORDER BY id`
    );
    console.log(`[telegram] targeting ${rows.length} users`);

    let tgSent = 0, tgFailed = 0;
    for (const user of rows) {
      const lang = getLang(user);
      const msg  = TG_DM[lang];
      if (DRY_RUN) { tgSent++; continue; }
      try {
        await tg.sendMessage(user.telegram_id, msg, { parse_mode: 'HTML' });
        tgSent++;
      } catch (err) {
        tgFailed++;
        if (tgFailed <= 3) console.warn(`[telegram] failed uid=${user.id}: ${err.message}`);
      }
      await sleep(TG_DELAY_MS);
    }
    console.log(`[telegram] sent=${tgSent} failed=${tgFailed}`);
  } else {
    console.log('[telegram] skipped');
  }

  // ── 3. Pinned letter in the main community group ───────────────────────
  await postAndMaybePinGroupLetter();

  console.log('[broadcast-pnptv-story-manual] done.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
