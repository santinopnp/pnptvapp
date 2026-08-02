#!/usr/bin/env node
'use strict';

/**
 * One-shot DM to FerBearCDMX / CloudComputa.online (id 5643392748) with
 * Slack invite + manual testing instructions in Spanish (Windows Chrome/Edge focus).
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const USER_ID   = '5643392748';
const SYSTEM_ID = '8552451957';
const SLACK_URL = 'https://join.slack.com/share/enQtMTE3MjM5MTM0ODU2MjEtNTg2YjIzMWRjMWI1YzY1Mjc3OGM0NjZiNjNlMjlhNGQyNzg3YTdlOTA4NTRlMDJmODRhMDU5MTAxZmEyMzdlMg';

const MSG = `Hola — los fundadores de PNPtv (Lex + Santino) quieren tu ayuda para probar features nuevas antes de abrirlas a todos.

*Cómo entrar a Slack*
Aceptá el invite acá: ${SLACK_URL}

Cuando entres, en el panel izquierdo buscá el canal *#testing-cloud-computer* — ese es tu canal dedicado. Todo el feedback lo dejás ahí en un hilo (thread) del mensaje que Carlos va a fijar arriba. Si no podés entrar a Slack, respondé directo a ESTE mensaje con la misma info.

*Qué probar (en Chrome o Edge en Windows, no Firefox)*
Abrí https://pnptv.app y logueate. Después seguí este orden:

🖥 *A. Feed*
  • Scroll infinito ¿trae más posts sin trabarse?
  • Post con varias fotos: al pasar el mouse por encima ¿aparecen flechas ← → para navegar? ¿Funcionan?
  • Click en una foto: ¿abre en pantalla completa (lightbox)?
  • En el lightbox: ¿ESC cierra? ¿Flechas del teclado navegan entre slides?

🖥 *B. Anuncio Founders Live*
  Abrí: https://pnptv.app/social/post/10442
  • ¿Ves el carrusel de 7 slides SIN tener que tocar "Ver más"?
  • ¿Hay botón "Ver evento" magenta+naranja?
  • Click → ¿abre la página del evento?

🖥 *C. Página del evento (share URL)*
  Abrí: https://pnptv.app/events/b3bdc8b4-7bf8-470e-a695-a59e1dde4a7c
  • ¿Carga sin pedirte login?
  • ¿Se ve cover + fecha (Lun 3 ago 10 AM COL)?
  • "Open hangout" ¿te mete al chat de PNPtv Community?

🖥 *D. Compartir un hangout*
  Entrá a cualquier hangout. Mirá la esquina superior derecha del chat.
  • ¿Ves un ícono de "compartir" (flecha saliendo de una caja)?
  • Click → ¿copia el link al clipboard? ¿Muestra check verde "Link copied" por 2 segundos?

🖥 *E. GOD MODE (solo si sos admin)*
  Fijate en la esquina superior derecha del sidebar izquierdo.
  • ¿Ves un rayo (⚡) chico al lado del botón de logout?
  • Click activa GOD MODE (se expande a badge magenta con animación pulse)
  • Click otra vez lo apaga

🖥 *F. Perfil de creador con galería*
  Buscá cualquier creator activo con sección "Fotos" o "Videos".
  • ¿Los thumbnails se ven bien?
  • Click en una foto → ¿abre lightbox?
  • En el lightbox ¿podés navegar con las flechas del teclado?

🖥 *G. Wallet (sin comprar nada, solo mirar)*
  Abrí Wallet. ¿Ves tu balance de tokens?
  Buscá el precio de una suscripción de creator o llamada — debe ser precio_usd × 6.
  (Ej: $10 USD = 60 tokens)

*Cómo reportar en Slack*
Para cada punto (A a G) respondé en el hilo con:
  ✅ funciona
  ❌ falla + descripción corta (o screenshot con Windows+Shift+S)
  ⚠️ raro + qué viste

Podés agrupar todo en un solo mensaje.

Gracias! Después Carlos y yo revisamos lo que salga rojo.

— Equipo PNPtv`;

(async () => {
  await sendSystemDM(SYSTEM_ID, USER_ID, MSG, query);
  console.log(JSON.stringify({ sent_to: USER_ID, chars: MSG.length }));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
