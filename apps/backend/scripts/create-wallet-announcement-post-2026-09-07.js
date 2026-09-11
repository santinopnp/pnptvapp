#!/usr/bin/env node
'use strict';

/**
 * create-wallet-announcement-post-2026-09-07.js
 *
 * One-shot: creates a bilingual pinned feed post from @pnptv (PNPtv! News,
 * id 8552451957) announcing the PNPtv! Wallet as the safest way to pay for
 * adult content online, with a promoted link to Santino's blog post.
 *
 * Usage:
 *   docker run --rm --env-file /opt/pnptvapp/.env \
 *     --env-file /opt/pnptvapp/.env.production \
 *     -v /opt/pnptvapp:/app -w /app \
 *     $(docker inspect pnptv-bot --format='{{.Config.Image}}') \
 *     node apps/backend/scripts/create-wallet-announcement-post-2026-09-07.js
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const SocialPostService = require(path.join(BACKEND, 'services/socialPostService'));

const PNPTV_ID = '8552451957';

const CONTENT = `🔥 PNP content is fire — but paying for it safely has been a nightmare.

Sketchy platforms, unreliable payments, Telegram/X flooded with scams. Performers don't get paid. Fans get ripped off.

That's over. PNPtv! is the safest way to pay for adult content online — period.

With the 💎 Crystal Diamond Widget:

→ Subscribe to the content you actually want
→ Book private calls with Santino, Lex, or any of the guys
→ Tip your favorites with your debit or credit card
→ Every purchase is verified, protected, and guaranteed by PNPtv!

No more chasing sketchy links. No more getting scammed. No more lost money.

Santino broke it all down in a new blog post 👇

—

🔥 El contenido PNP es fuego — pero pagarlo de forma segura ha sido una pesadilla.

Plataformas turbias, pagos que no llegan, Telegram/X llenos de estafas. Los performers no cobran. Los fans pierden su dinero.

Eso se acabó. PNPtv! es la forma más segura de pagar contenido adulto online — punto.

Con el Widget 💎 Crystal Diamond:

→ Suscríbete al contenido que realmente quieres
→ Reserva llamadas privadas con Santino, Lex o cualquiera de los chicos
→ Consiente a tus favoritos con tu tarjeta de débito o crédito
→ Cada compra está verificada, protegida y garantizada por PNPtv!

No más links turbios. No más estafas. No más dinero perdido.

Santino lo explica todo en su nuevo blog post 👇`;

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

  await query(`
    UPDATE social_posts
       SET pinned_at        = NOW(),
           is_promoted      = true,
           promoted_link    = $2,
           promoted_link_label = $3
     WHERE id = $1
  `, [
    post.id,
    'https://pnptv.app/blog/pnptv-crypto-wallet-is-here',
    '📖 Read Santino\'s post',
  ]);

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
  console.error('create-wallet-announcement-post failed:', err.message);
  process.exit(1);
});
