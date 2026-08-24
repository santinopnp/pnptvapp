#!/usr/bin/env node
'use strict';

/**
 * create-weekend-unlock-post-2026-08-24.js
 *
 * Pinned feed post: PRIME Monthly at $15 (40% off) via monthly-pass-promo-15
 * plan. Ends Monday. Bilingual, both payment links attached.
 *
 * Unpin manually or run: UPDATE social_posts SET pinned_at=NULL, is_promoted=false WHERE id=X;
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const SocialPostService = require(path.join(BACKEND, 'services/socialPostService'));

const PNPTV_ID = '8552451957';

const CONTENT = `⚡ Weekend Unlock — PRIME Monthly at $15 (40% off) through Monday

Every PNP Channel · every live room · every creator · every exclusive drop.
Same PRIME your friends brag about, priced like one drink.

Card, Apple Pay, or crypto — activated instantly.
Colombian pesos? Mercado Pago works here too.

—

⚡ Weekend Unlock — PRIME Mensual a $15 (40% OFF) hasta el lunes

Cada PNP Channel · cada sala en vivo · cada creador · cada drop exclusivo.
El mismo PRIME del que hablan tus amigos, al precio de un trago.

Tarjeta, Apple Pay o cripto — activo al instante.
¿Pesos colombianos? Mercado Pago también funciona acá.

👉 pnptv.app/subscribe`;

async function main() {
  await initializePostgres();

  const post = await SocialPostService.createPost(
    PNPTV_ID,
    CONTENT,
    null, null, null, null,
    false,  // isWof
    false,  // isExclusive
    true,   // isShareable
  );

  await query(`
    UPDATE social_posts
       SET pinned_at = NOW(),
           is_promoted = true,
           promoted_link = $2,
           promoted_link_label = $3
     WHERE id = $1
  `, [
    post.id,
    'https://pnptv.app/subscribe?plan=monthly-pass-promo-15',
    '⚡ Grab $15 PRIME →',
  ]);

  try {
    const socketSingleton = require(path.join(BACKEND, 'services/socketSingleton'));
    const io = socketSingleton.get();
    if (io) io.emit('social:new-post', { post });
  } catch (_) {}

  console.log(JSON.stringify({
    ok: true,
    postId: post.id,
    userId: PNPTV_ID,
    deepLink: `/social/post/${post.id}`,
    unpinCommand: `UPDATE social_posts SET pinned_at=NULL, is_promoted=false WHERE id=${post.id};`,
  }, null, 2));
}

main().then(() => process.exit(0)).catch(err => { console.error('Fatal:', err.message); process.exit(1); });
