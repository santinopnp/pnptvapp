#!/usr/bin/env node
'use strict';

/**
 * post-santino-creators-call-2026-09-13.js
 *
 * Posts Santino's bilingual call-to-action into the PNPtv Creators hangout (118)
 * and the main PNPtv Community hangout (26). Pins the message in both rooms and
 * sends a push notification to all 80 members of the Creators hangout.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/post-santino-creators-call-2026-09-13.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/post-santino-creators-call-2026-09-13.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY_RUN = process.argv.includes('--dry-run');

const SANTINO_USER_ID = '8599671840';
const SANTINO_USERNAME = 'SantinoFurioso';
const SANTINO_FIRST_NAME = 'Santino';
const SANTINO_PHOTO = '/uploads/avatars/8599671840-1782620624815.webp';

const CREATORS_GROUP_ID = 118;
const MAIN_GROUP_ID = 26;

const CONTENT = `🚨 Meth Daddy necesita tu apoyo / Meth Daddy needs your help 🚨

━━━━━━━━━━━━━━━━━━━━━
🇪🇸 ESPAÑOL
━━━━━━━━━━━━━━━━━━━━━

¡Hola a todos! Su Meth Daddy necesita una pequeña ayuda por aquí. Sé que he estado un poco desconectado últimamente, pero he estado trabajando duro tras bambalinas... ¡y está dando resultados! PNPtv acaba de alcanzar los 10,000 usuarios activos.

Sé que los errores y fallas de la aplicación han sido frustrantes. Como estoy gestionando el desarrollo con un presupuesto limitado, me ha tomado algo de tiempo, pero ya he corregido los problemas más críticos.

🛠 Cómo me pueden ayudar ahora mismo:

1. Probar la app: Úsenla de forma habitual y compartan aquí en el chat capturas de pantalla de cualquier error o fallo que encuentren. Así los demás podrán confirmar si les pasa lo mismo.

2. Integración y contenido: Me encantaría empezar a reunirme con ustedes esta semana para coordinar la incorporación del equipo, fortalecer nuestra red de creadores y empezar a preparar contenido para monetizar juntos.

Si logramos solucionar estos últimos detalles, podríamos comenzar con la integración y monetización la próxima semana, y lanzar nuestro festival virtual oficial de PNP en 4 semanas o menos.

¡Aprecio mucho el apoyo de todos!

— Santino

━━━━━━━━━━━━━━━━━━━━━
🇺🇸 ENGLISH
━━━━━━━━━━━━━━━━━━━━━

Hey everyone, your Meth Daddy needs a quick hand! I know I've been a bit quiet lately, but I've been grinding behind the scenes—and it's paying off. PNPtv officially hit 10,000 active users!

I know the app bugs have been frustrating. Since I'm managing development on a tight budget, it's taken some time, but I've patched up the most critical issues.

🛠 How you can help right now:

1. Test the app: Go explore it naturally and drop screenshots of any bugs or weird behavior right here in this chat. That way, others can chime in if they experience the same thing.

2. Onboarding & Content: I'd love to start jumping on calls with you guys this week to get onboarding set up, build out our creator network, and start prepping content.

If we clean up these last few bugs, we can start onboarding and monetizing next week, and launch our official PNP virtual festival in 4 weeks or less.

Appreciate all of you!

— Santino`;

async function postToRoom(groupId, content) {
  const room = `hangout:${groupId}`;
  const { rows } = await query(
    `INSERT INTO chat_messages
       (room, user_id, username, first_name, photo_url, content, message_type, is_pinned, pinned_by, pinned_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'text', TRUE, $2, now())
     RETURNING id, room, user_id, username, first_name, photo_url, content, message_type, created_at, is_pinned, pinned_at`,
    [room, SANTINO_USER_ID, SANTINO_USERNAME, SANTINO_FIRST_NAME, SANTINO_PHOTO, content]
  );
  const msg = rows[0];
  console.log(`[post] inserted message id=${msg.id} room=${room}`);

  await query(
    `INSERT INTO hangout_pinned_messages (group_id, matrix_event_id, message_body, pinned_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (group_id, matrix_event_id) DO NOTHING`,
    [groupId, String(msg.id), content.slice(0, 500), SANTINO_USER_ID]
  );
  console.log(`[post] pin record written for group ${groupId}`);

  try {
    const socketSingleton = require(path.join(BACKEND, 'services/socketSingleton'));
    const io = socketSingleton.get();
    if (io) {
      io.to(room).emit('chat:message', msg);
      console.log(`[post] live broadcast emitted to ${room}`);
    } else {
      console.warn(`[post] socket.io not available for ${room}; message saved, will appear on next load`);
    }
  } catch (err) {
    console.warn(`[post] socket broadcast failed for ${room}:`, err.message);
  }

  return msg;
}

async function pushToCreatorsMembers() {
  const { rows } = await query(
    `SELECT hgm.user_id FROM hangout_group_members hgm WHERE hgm.group_id = $1`,
    [CREATORS_GROUP_ID]
  );
  console.log(`[push] found ${rows.length} members in creators hangout`);

  let sent = 0;
  let failed = 0;

  try {
    const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
    for (const { user_id } of rows) {
      try {
        await PushNotificationService.sendToUser(String(user_id), {
          title: '📣 Mensaje de Santino / Message from Santino',
          body: '¡PNPtv llegó a 10,000 usuarios! Santino necesita tu ayuda — toca para ver el mensaje. / PNPtv hit 10K users! Santino needs your help — tap to read.',
          url: `/hangout/${CREATORS_GROUP_ID}`,
        });
        sent++;
      } catch {
        failed++;
      }
    }
    console.log(`[push] sent=${sent} failed=${failed}`);
  } catch (err) {
    console.warn('[push] PushNotificationService unavailable:', err.message);
  }
}

async function main() {
  console.log(`[santino-call] DRY_RUN=${DRY_RUN}`);
  console.log(`[santino-call] targets: creators hangout (${CREATORS_GROUP_ID}), main community (${MAIN_GROUP_ID})`);
  console.log(`[santino-call] content_len=${CONTENT.length}`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — would post to hangout:118 + hangout:26, pin both, push to 80 members ---\n');
    console.log(CONTENT);
    process.exit(0);
  }

  await postToRoom(CREATORS_GROUP_ID, CONTENT);
  await postToRoom(MAIN_GROUP_ID, CONTENT);
  await pushToCreatorsMembers();

  console.log('[santino-call] done.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
