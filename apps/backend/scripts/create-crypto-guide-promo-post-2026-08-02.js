#!/usr/bin/env node
/**
 * One-shot: create the @pnptv system feed post promoting the upgraded crypto
 * tutorial + first-hour bonus. Prints the created postId so the broadcast
 * script can deep-link into /social/post/<postId>.
 */

require('dotenv').config();

const SocialPostService = require('../services/socialPostService');
const PNPTV_SYSTEM_USER_ID = '8552451957'; // @pnptv (first_name = "PNPtv! News")

const CONTENT = `🔓 Paga en PNPtv con cripto en 2 minutos · Pay in PNPtv with crypto in 2 minutes

Nuevo tutorial paso a paso con videos reales — no más adivinar. Elige tu wallet, cárgala, paga en PNPtv. Todo automático.

🎁 Termínalo: 30 tokens para Santino, gratis.
🚀 Compra en la 1ª hora: +100 tokens extra (también Santino).
💡 ¿No quieres comprar cripto seguido? Compra 250+ tokens de una y páralo todo — tips en Live, membresías, suscripciones a creadores.

—

New step-by-step tutorial with real videos — no more guessing. Pick your wallet, load it, pay in PNPtv. All automatic.

🎁 Finish it: 30 free tokens to spend on Santino.
🚀 Buy in the 1st hour: +100 tokens extra (also for Santino).
💡 Don't want to buy crypto often? Buy 250+ tokens once and use them for everything — Live tips, memberships, creator subs.

👉 pnptv.app/crypto-guide`;

async function main() {
  const post = await SocialPostService.createPost(
    PNPTV_SYSTEM_USER_ID,
    CONTENT,
    null,   // mediaUrl
    null,   // mediaType
    null,   // replyToId
    null,   // repostOfId
    false,  // isWof
    false,  // isExclusive — public
    true,   // isShareable
  );
  console.log(JSON.stringify({ ok: true, postId: post.id, userId: PNPTV_SYSTEM_USER_ID, deepLink: `/social/post/${post.id}` }));

  // Broadcast to connected sockets so it appears live in feeds
  try {
    const socketSingleton = require('../services/socketSingleton');
    const io = socketSingleton.get();
    if (io) io.emit('social:new-post', { post });
  } catch (_) { /* non-fatal */ }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('create-crypto-guide-promo-post failed:', err.message);
  process.exit(1);
});
