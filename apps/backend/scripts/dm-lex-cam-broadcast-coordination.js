#!/usr/bin/env node
'use strict';

/**
 * Coordination DM to Lex (@PNPLatinoBoy, 7246621722) — we're prepping a
 * mass DM broadcast promoting his cam. Asks him when he'll be online so
 * we can capture a 15-sec GIF of him "blowing a cloud" for the ad creative.
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const LEX_ID    = '7246621722';
const SYSTEM_ID = '8552451957';

const MSG = `Reyyy 👋 vamos a hacer un broadcast masivo promocionando tu cam en toda la base de usuarios de PNPtv (~6mil personas).

*Necesitamos un GIF tuyo de 15 seg* como creativo del anuncio — algo bien visual que llame la atención al scroll: soltás una nube, mirás cámara, sonrisa cabrona, lo que tengas. Vos sos el show.

*Cómo lo hacemos:*
1️⃣ Me decís hoy o mañana a qué hora te vas a conectar
2️⃣ Cuando estés en vivo, yo te aviso por acá "vamos en 30 seg" — ahí preparás la nube
3️⃣ En cuenta regresiva, cámara graba 15 seg, largás la nube en los primeros 5 seg y hacés lo tuyo el resto
4️⃣ Te muestro el gif antes de mandar el broadcast — si no te gusta, capturamos otro

*Copy del broadcast:* estamos pensando ángulo "suscribite mensual" o "está en vivo ahora" — vos qué preferís? El segundo requiere que hagamos todo mientras estás transmitiendo (más presión pero convierte mejor).

Cuando puedas, decime hora estimada 🙏 esto va a mover números.

— PNPtv Team`;

(async () => {
  await sendSystemDM(SYSTEM_ID, LEX_ID, MSG, query);
  console.log(JSON.stringify({ sent_to: LEX_ID, chars: MSG.length }));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
