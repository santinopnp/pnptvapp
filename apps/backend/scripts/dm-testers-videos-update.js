#!/usr/bin/env node
'use strict';

/**
 * One-shot: notify the two active testers about the new "up to 4 videos
 * per post as carousel" feature that just shipped. English → Chase,
 * Spanish → CloudComputa.
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const SYSTEM_ID          = '8552451957';
const CHASE_ID           = '8162853364';        // CHASETHECLOUDS — English, iPhone Safari
const CLOUDCOMPUTA_ID    = '5643392748';        // FerBearCDMX — Spanish, Windows

const MSG_EN = `Quick update — we just shipped a new feature. Please add this to your testing list on iPhone Safari:

🎬 *New: Up to 4 videos per post as carousel*

1. Open PostComposer (the "What's on your mind?" box at the top of the feed)
2. Tap the *Video* button
3. Try selecting 2, 3, or 4 videos at once from your camera roll
   • Does the picker allow multi-select?
   • Does the button show a counter (e.g. "2/4", "3/4")?
4. Preview shows a grid of thumbnails with a small play icon on each
   • Try the X button on one to remove it
5. Post it
6. In the feed, does the post render as a swipeable carousel?
   • Each slide = video with native controls (play, seek, fullscreen)
   • Dots + counter (1/4, 2/4…) visible
   • Tap play on one — plays only that one
   • Swipe to next slide — does it pause the previous one? (⚠️ known possible limitation, please report either way)

Report in the Slack thread same as before (✅/❌/⚠️). Thanks!

— PNPtv`;

const MSG_ES = `Update rápido — acabamos de shippear una feature nueva. Agregala a tu lista de tests en Windows (Chrome o Edge):

🎬 *Nuevo: Hasta 4 videos por post en formato carrusel*

1. Abrí el PostComposer (la caja "¿En qué pensás?" arriba del feed)
2. Click en el botón *Video*
3. En el diálogo de archivos, seleccioná 2, 3 o 4 videos a la vez (Ctrl+click)
   • ¿Te deja seleccionar múltiples?
   • ¿El botón muestra un contador (ej. "2/4", "3/4")?
4. En el preview: grid de thumbnails con ícono de play en cada uno
   • Probá el botón X para remover uno
5. Publicalo
6. En el feed, ¿el post se renderiza como carrusel horizontal?
   • Cada slide = video con controls nativos (play, seek, fullscreen)
   • Dots + contador (1/4, 2/4…) visibles
   • En desktop: al pasar el mouse por encima ¿aparecen flechas ← → para navegar?
   • Play en uno → ¿pausa el anterior al cambiar de slide? (⚠️ posible limitación conocida, reportar igual)

Reportá en el mismo hilo de Slack (✅/❌/⚠️). Gracias!

— Equipo PNPtv`;

(async () => {
  await sendSystemDM(SYSTEM_ID, CHASE_ID,        MSG_EN, query);
  await sendSystemDM(SYSTEM_ID, CLOUDCOMPUTA_ID, MSG_ES, query);
  console.log(JSON.stringify({
    en_to: CHASE_ID,
    en_chars: MSG_EN.length,
    es_to: CLOUDCOMPUTA_ID,
    es_chars: MSG_ES.length,
  }, null, 2));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
