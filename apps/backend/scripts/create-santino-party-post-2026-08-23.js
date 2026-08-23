#!/usr/bin/env node
'use strict';

/**
 * create-santino-party-post-2026-08-23.js
 *
 * One-shot: creates a bilingual feed post from @pnptv (PNPtv! News, id
 * 8552451957) announcing Santino's private spun video call next Saturday,
 * attaches BOTH payment rails as promoted links, and pins the post to
 * the top of the feed via `pinned_at = NOW()`.
 *
 * Feed sort already respects pinned_at first (socialPostService.js:277).
 * Un-pin manually or run tools that set pinned_at = NULL after 2026-08-30.
 *
 * Broadcasts `social:new-post` so live feed viewers see it immediately.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/create-santino-party-post-2026-08-23.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const SocialPostService = require(path.join(BACKEND, 'services/socialPostService'));

const PNPTV_ID = '8552451957';

const CONTENT = `🔥 Santino's birthday was the 14th…

We're celebrating next Saturday with a private spun video call 🐷💨

VIPs / real pigs only.
Send a gift → get a personal DM from Santino + Lex with all the filthy details.

Don't miss the cult party. Links below 👇 🔥🍆🐽

—

🔥 El cumple de Santino fue el 14…

Estamos celebrando el próximo sábado con una videollamada privada bien tinada 🐷💨

Solo VIPs / cerdos de verdad.
Regala un gift → recibes un DM personal de Santino + Lex con todos los detalles cochinos.

No te pierdas la fiesta de culto. Links abajo 👇 🔥🍆🐽`;

async function main() {
  await initializePostgres();

  const post = await SocialPostService.createPost(
    PNPTV_ID,
    CONTENT,
    null,   // mediaUrl
    null,   // mediaType
    null,   // replyToId
    null,   // repostOfId
    false,  // isWof
    false,  // isExclusive — public
    true,   // isShareable
  );

  // Attach both payment rails as clickable promoted links + pin to top.
  await query(`
    UPDATE social_posts
       SET pinned_at = NOW(),
           is_promoted = true,
           promoted_link = $2,
           promoted_link_label = $3,
           promoted_link2 = $4,
           promoted_link2_label = $5
     WHERE id = $1
  `, [
    post.id,
    'https://nowpayments.io/donation/Pnptv',
    '💎 Gift Crypto',
    'https://link.mercadopago.com.co/pnplatinotv',
    '💳 Gift with Card (COP)',
  ]);

  // Push to live feeds.
  try {
    const socketSingleton = require(path.join(BACKEND, 'services/socketSingleton'));
    const io = socketSingleton.get();
    if (io) io.emit('social:new-post', { post });
  } catch (_) { /* non-fatal */ }

  console.log(JSON.stringify({
    ok: true,
    postId: post.id,
    userId: PNPTV_ID,
    pinnedAt: 'NOW()',
    deepLink: `/social/post/${post.id}`,
    unpinCommand: `UPDATE social_posts SET pinned_at = NULL, is_promoted = false WHERE id = ${post.id};`,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('create-santino-party-post failed:', err.message);
  process.exit(1);
});
