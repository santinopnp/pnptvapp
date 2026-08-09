#!/usr/bin/env node
'use strict';

/**
 * Preview the Main Stage broadcast to @pnptvoficial (chat 8370209084):
 *  1. Sends the 5s clip via sendVideo (multipart)
 *  2. Sends the exact copy proposal + audience counts + approval instructions
 *
 * Does NOT broadcast to users. Waits for Santino to reply OK.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));

const BOT_TOKEN = process.env.BOT_TOKEN;
const PREVIEW_CHAT = Number(process.env.PREVIEW_CHAT || 8370209084); // @pnptvoficial
const CLIP = process.env.CLIP || '/tmp/santino-clip-2026-08-09.mp4';
const CTA = 'https://pnptv.app/main-stage';

const COPY = {
  es: {
    push_title: '🔥 AHORA EN VIVO — Main Stage prendida',
    push_body:  'Santino y los chicos reventándola 🥵 entra y reserva tu privado',
    tg: `💊🔥 AHORA en Main Stage — Santino y los chicos prendidos hasta las 4 AM Colombia 🥵

Cárgate y reserva tu llamada privada.

👉 ${CTA}

— PNPtv!`,
  },
  en: {
    push_title: '🔥 LIVE NOW — Main Stage on fire',
    push_body:  'Santino & the boys going hard 🥵 come in & book your private',
    tg: `💊🔥 LIVE NOW on Main Stage — Santino & the boys going until 4 AM Colombia (UTC-5) 🥵

Get loaded & book your private call.

👉 ${CTA}

— PNPtv!`,
  },
};

function tgRequest(method, contentType, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': contentType, 'Content-Length': bodyBuffer.length },
      timeout: 60000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok:false, raw:d }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(bodyBuffer); req.end();
  });
}

function buildMultipart(fields, fileField, filePath, mime) {
  const boundary = '----pnp' + crypto.randomBytes(8).toString('hex');
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  const fileBuf = fs.readFileSync(filePath);
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${path.basename(filePath)}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  ));
  parts.push(fileBuf);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function getCounts() {
  const push = await query(`
    SELECT
      COUNT(*) FILTER (WHERE LOWER(COALESCE(u.language,'en')) LIKE 'es%')                 AS push_es,
      COUNT(*) FILTER (WHERE u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')      AS push_en
    FROM users u
    JOIN push_subscriptions ps ON ps.user_id = u.id
    WHERE u.is_deleted IS NOT TRUE
      AND (u.tier IS NULL OR u.tier <> 'banned')
  `);
  const tg = await query(`
    SELECT
      COUNT(*) FILTER (WHERE LOWER(COALESCE(u.language,'en')) LIKE 'es%')                 AS tg_es,
      COUNT(*) FILTER (WHERE u.language IS NULL OR LOWER(u.language) NOT LIKE 'es%')      AS tg_en
    FROM users u
    WHERE u.is_deleted IS NOT TRUE
      AND (u.tier IS NULL OR u.tier <> 'banned')
      AND u.telegram IS NOT NULL AND u.telegram <> ''
  `);
  return {
    push_es: Number(push.rows[0].push_es),
    push_en: Number(push.rows[0].push_en),
    tg_es:   Number(tg.rows[0].tg_es),
    tg_en:   Number(tg.rows[0].tg_en),
  };
}

async function main() {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
  if (!fs.existsSync(CLIP)) throw new Error(`Clip not found: ${CLIP}`);

  await initializePostgres();
  const c = await getCounts();
  const totalPush = c.push_es + c.push_en;
  const totalTg   = c.tg_es + c.tg_en;
  console.log('counts:', c, 'push_total=', totalPush, 'tg_total=', totalTg);

  // 1) Send clip
  const clipMsg = buildMultipart({
    chat_id: String(PREVIEW_CHAT),
    caption: '🎥 PREVIEW · Main Stage promo clip (5s, video de tu cámara).\n\nCopy y conteos del broadcast en el siguiente mensaje.',
    supports_streaming: 'true',
  }, 'video', CLIP, 'video/mp4');
  const vidRes = await tgRequest('sendVideo', clipMsg.contentType, clipMsg.body);
  console.log('sendVideo:', vidRes.ok ? 'OK' : vidRes);

  // 2) Send copy proposal + approval instructions
  const proposal = `📢 BROADCAST PREVIEW — Main Stage (2026-08-09)

Destinatarios (usuarios activos, no baneados):
• Push web: ${totalPush.toLocaleString()} (ES ${c.push_es} · EN ${c.push_en})
• Telegram DM: ${totalTg.toLocaleString()} (ES ${c.tg_es} · EN ${c.tg_en})
• Email: NO (regla feedback_no_going_live_email)

Cast live ahora: Santino, Gabo, Tae, Cu Seeme, Wan. Hasta las 4 AM Colombia.

━━━━━━━━━━━━━━━━━━━━━━
🇪🇸 PUSH (ES)
Título: ${COPY.es.push_title}
Cuerpo: ${COPY.es.push_body}

🇪🇸 TELEGRAM (ES)
${COPY.es.tg}

━━━━━━━━━━━━━━━━━━━━━━
🇬🇧 PUSH (EN)
Title: ${COPY.en.push_title}
Body: ${COPY.en.push_body}

🇬🇧 TELEGRAM (EN)
${COPY.en.tg}

━━━━━━━━━━━━━━━━━━━━━━
Responde:
✅  "OK" o "aprobado" → lanzo broadcast ya
✏️  cambios de copy → mándame el nuevo texto
❌  "cancelar" → no envío nada`;

  const textBody = Buffer.from(JSON.stringify({
    chat_id: PREVIEW_CHAT,
    text: proposal,
    disable_web_page_preview: true,
  }));
  const txtRes = await tgRequest('sendMessage', 'application/json', textBody);
  console.log('sendMessage:', txtRes.ok ? 'OK' : txtRes);

  process.exit(vidRes.ok && txtRes.ok ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
