#!/usr/bin/env node
'use strict';

/**
 * post-pnptv-letter-hangout-main.js
 *
 * Posts (and pins) the "letter from the PNPtv! Team" into the in-app
 * Hangouts "Main" room (hangout_groups.id = 26, is_main = TRUE), following
 * the same pattern as postHangoutSystemMessage() in weeklyRankScheduler.js:
 * insert into chat_messages, broadcast live via socket.io, then record the
 * pin in both is_pinned columns and hangout_pinned_messages.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/post-pnptv-letter-hangout-main.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/post-pnptv-letter-hangout-main.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN = process.argv.includes('--dry-run');
const HANGOUT_GROUP_ID = 26;
const ROOM = `hangout:${HANGOUT_GROUP_ID}`;
const SYSTEM_USER_ID = '8552451957'; // Same synthetic "PNPtv!" poster used by weeklyRankScheduler.js
const MANUAL_URL_ES = 'https://app.pnptv.app/uploads/manual-2026/manual-es.html';
const MANUAL_URL_EN = 'https://app.pnptv.app/uploads/manual-2026/manual-en.html';

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

const CONTENT = `💌 Una carta del equipo de PNPtv!

${LETTER_ES}

—

💌 A letter from the PNPtv! Team

${LETTER_EN}

📘 ES: ${MANUAL_URL_ES}
📘 EN: ${MANUAL_URL_EN}`;

async function main() {
  console.log(`[hangout-letter] DRY_RUN=${DRY_RUN} room=${ROOM} content_len=${CONTENT.length}`);

  if (DRY_RUN) {
    console.log('--- would insert into chat_messages, room =', ROOM, '---');
    console.log(CONTENT);
    process.exit(0);
  }

  const { rows } = await query(
    `INSERT INTO chat_messages
       (room, user_id, username, first_name, content, message_type, is_pinned, pinned_by, pinned_at)
     VALUES ($1, $2, 'PNPtv!', 'PNPtv!', $3, 'system', TRUE, $2, now())
     RETURNING id, room, user_id, username, first_name, content, message_type, created_at, is_pinned, pinned_at`,
    [ROOM, SYSTEM_USER_ID, CONTENT]
  );
  const msg = rows[0];
  console.log('[hangout-letter] inserted message id=', msg.id);

  await query(
    `INSERT INTO hangout_pinned_messages (group_id, matrix_event_id, message_body, pinned_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (group_id, matrix_event_id) DO NOTHING`,
    [HANGOUT_GROUP_ID, String(msg.id), CONTENT.slice(0, 500), SYSTEM_USER_ID]
  );
  console.log('[hangout-letter] pin record written.');

  try {
    const socketSingleton = require(path.join(BACKEND, 'services/socketSingleton'));
    const io = socketSingleton.get();
    if (io) {
      io.to(ROOM).emit('chat:message', msg);
      console.log('[hangout-letter] live broadcast emitted to room', ROOM);
    } else {
      console.warn('[hangout-letter] socket.io instance not available; message saved but not live-broadcast (will appear on next load)');
    }
  } catch (err) {
    console.warn('[hangout-letter] socket broadcast failed:', err.message);
  }

  console.log('[hangout-letter] done.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
