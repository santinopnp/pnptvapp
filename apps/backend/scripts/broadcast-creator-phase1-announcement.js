#!/usr/bin/env node
/**
 * broadcast-creator-phase1-announcement.js
 *
 * One-shot announcement to all active creators:
 * - Thank you for the pilot phase
 * - Phase 1 rollout: Colombia first, then by region
 * - New age policy: minimum 25 years old
 * - Professional counseling for borderline cases
 * - Moving to professional tools (Slack)
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-creator-phase1-announcement.js --dry-run
 *   docker exec pnptv-bot node apps/backend/scripts/broadcast-creator-phase1-announcement.js
 */

'use strict';

const path = require('path');
const backendPath = path.join(__dirname, '..');

try { require('dotenv').config({ path: path.join(backendPath, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(backendPath, '../../.env.production'), override: true }); } catch {}

const { getPool, initializePostgres } = require(path.join(backendPath, 'config/postgres'));
const { Telegram } = require('telegraf');

const DRY_RUN = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MESSAGE_ES = `Hola {name} 👋

Queremos tomarnos un momento para agradecerte por haber sido parte de esta primera etapa de PNPtv!

Estos meses han sido muy valiosos para nosotros. Hemos tenido resultados que nos llenan de orgullo: comunidad activa, contenido auténtico, y sobre todo, una base de creadores que comparten nuestra visión de construir un espacio seguro y profesional para la comunidad queer PNP.

📊 <b>Lo que aprendimos</b>
Este piloto nos ayudó a identificar qué funciona, qué mejorar, y cómo crecer de forma responsable. Hemos estado trabajando en mejoras profundas de procesos, herramientas y estructura para que la siguiente etapa sea más sólida.

🚀 <b>Fase 1: Formación por regiones</b>
Luego de este periodo de prueba, iniciamos la <b>Fase 1 oficial</b>. Comenzaremos con los creadores de <b>Colombia</b>, quienes serán los primeros en pasar por el proceso de formación estructurada.

Los creadores de otras regiones están <b>pre-aprobados</b> y en stand-by. Los iremos incorporando por zonas geográficas en las próximas semanas. Tu lugar está reservado.

🎓 <b>Programa de consejería comunitaria</b>
Hemos contado con el apoyo de profesionales de la comunidad que se han ofrecido como voluntarios para acompañar este proyecto. Serán parte del proceso de formación de nuevos creadores y estarán disponibles para orientación en áreas como salud, bienestar, y desarrollo profesional.

📋 <b>Nueva política de edad mínima</b>
Luego de analizar detenidamente múltiples variables, hemos decidido que <b>no admitiremos nuevos creadores menores de 25 años</b>. Quienes ya están inscritos (como tú) están completamente exentos de este cambio. Esta decisión busca proteger a nuestra comunidad y garantizar la madurez necesaria para este tipo de trabajo.

🛠️ <b>Nuevas herramientas</b>
Estamos migrando a herramientas más profesionales para la comunicación y operación del programa. Pronto recibirás una invitación a nuestro espacio en <b>Slack</b>, donde tendrás tu propio canal privado para recibir notificaciones, actualizaciones y comunicarte directamente con el equipo.

Las fechas exactas de cada etapa están por definirse, pero puedes estar seguro/a de que ya hemos tomado medidas para que las próximas etapas no se retrasen.

Gracias por confiar en este proyecto. Lo estamos construyendo juntos. 🏳️‍🌈

— El equipo de PNPtv!`;

const MESSAGE_EN = `Hi {name} 👋

We want to take a moment to thank you for being part of this first phase of PNPtv!

These months have been incredibly valuable. We've seen results we're proud of — an active community, authentic content, and most importantly, a creator base that shares our vision of building a safe, professional space for the queer PNP community.

📊 <b>What we learned</b>
This pilot helped us identify what's working, what to improve, and how to grow responsibly. We've been making deep improvements to our processes, tools, and structure so the next phase is stronger.

🚀 <b>Phase 1: Regional rollout</b>
After this pilot period, we're officially launching <b>Phase 1</b>. We'll start with creators from <b>Colombia</b>, who will be the first to go through the structured onboarding program.

Creators from other regions are <b>pre-approved</b> and on standby. We'll be onboarding by geographic region over the coming weeks. Your spot is reserved.

🎓 <b>Community counseling program</b>
We have the support of community professionals who have volunteered to be part of this project. They'll be involved in new creator onboarding and will be available for guidance in areas like health, wellness, and professional development.

📋 <b>New minimum age policy</b>
After carefully analyzing many variables, we've decided that <b>we will no longer be accepting new creators under 25 years old</b>. Those already enrolled (like you) are fully exempt from this change. This decision is aimed at protecting our community and ensuring the maturity needed for this type of work.

🛠️ <b>New tools</b>
We're moving to more professional tools for communication and program operations. You'll soon receive an invitation to our <b>Slack</b> workspace, where you'll have your own private channel to receive notifications, updates, and communicate directly with the team.

Exact dates for each stage are still being finalized, but rest assured we've already taken corrective measures to ensure the next phases don't fall behind.

Thank you for trusting in this project. We're building it together. 🏳️‍🌈

— The PNPtv! team`;

async function run() {
  if (!process.env.BOT_TOKEN) {
    console.error('[ERROR] BOT_TOKEN not set. Aborting.');
    process.exit(1);
  }

  await initializePostgres();
  const pool = getPool();
  const telegram = new Telegram(process.env.BOT_TOKEN);

  const { rows: creators } = await pool.query(`
    SELECT id, username, first_name, telegram, language
      FROM users
     WHERE creator_status = 'active'
       AND username NOT LIKE 'deleted_%'
       AND telegram IS NOT NULL
       AND telegram != ''
     ORDER BY username
  `);

  console.log(`\n=== Creator Phase 1 Announcement ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===`);
  console.log(`Sending to ${creators.length} creators with Telegram\n`);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < creators.length; i++) {
    const c = creators[i];
    const name = c.first_name || c.username;
    const isSpanish = !c.language || c.language === 'es' || c.language.startsWith('es');
    const text = (isSpanish ? MESSAGE_ES : MESSAGE_EN).replace('{name}', name);
    const prefix = `[${i + 1}/${creators.length}] @${c.username}`;

    if (DRY_RUN) {
      console.log(`${prefix} — [DRY] ${isSpanish ? 'ES' : 'EN'} → ${c.telegram}`);
      sent++;
      continue;
    }

    try {
      await telegram.sendMessage(c.telegram, text, { parse_mode: 'HTML' });
      console.log(`${prefix} — sent (${isSpanish ? 'ES' : 'EN'})`);
      sent++;
    } catch (err) {
      console.error(`${prefix} — FAILED: ${err.message}`);
      failed++;
    }

    await sleep(350);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Sent:    ${sent}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  No Telegram (skipped): ${93 - creators.length}`);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
