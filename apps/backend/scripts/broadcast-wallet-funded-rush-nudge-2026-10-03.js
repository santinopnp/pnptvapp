#!/usr/bin/env node
'use strict';

/**
 * Personalized nudge DM from @pnptv (8552451957) to every user with a
 * linked Privy wallet holding ≥ $1 USDC across Base + Ethereum + Polygon
 * + Arbitrum. Encourages converting idle USDC → Ru$h 💎 in-app.
 *
 * Each DM is unique (balance injected into copy), so this script loops
 * one-at-a-time instead of batching via unnest. Audience is small (<30)
 * so cost is negligible.
 *
 * Idempotent via meta.broadcastId. Bilingual (ES for language='es*', EN else).
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const { createPublicClient, http } = require('viem');
const viemChains = require('viem/chains');

const DRY_RUN      = process.argv.includes('--dry-run');
const MIN_USDC     = 1;
const SENDER_ID    = '8552451957';
const BROADCAST_ID = 'wallet-funded-rush-nudge-2026-10-03';

const HERO = {
  en: {
    media_url:       'https://pnptv.app/videos/subscribe-pnptv-vertical-en.jpg',
    media_thumb_url: 'https://pnptv.app/videos/subscribe-pnptv-vertical-en.jpg',
  },
  es: {
    media_url:       'https://pnptv.app/videos/subscribe-pnptv-vertical-es.jpg',
    media_thumb_url: 'https://pnptv.app/videos/subscribe-pnptv-vertical-es.jpg',
  },
};

const copyFor = (lang, usd) => {
  const amt = `$${usd.toFixed(2)}`;
  if (lang === 'es') {
    return `Hola — tu wallet tiene ${amt} en USDC esperando.

Convertilo a Ru$h 💎 y usalo en propinas en vivo, contenido exclusivo, llamadas privadas — para lo que viniste.

Instantáneo, sin cargos extra. Tocá el ícono 💎 para recargar.

— PNPtv!`;
  }
  return `Hey — your wallet has ${amt} in USDC sitting there.

Turn it into Ru$h 💎 and use it on live tips, exclusive content, private calls — the stuff you came here for.

Instant swap, no extra fees. Tap the 💎 icon to top up.

— PNPtv!`;
};

const USDC_BALANCE_ABI = [{
  inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
}];

const USDC_CHAINS = [
  { name: 'base',     chain: viemChains.base,     rpcHost: 'base-mainnet.g.alchemy.com',     fallback: 'https://mainnet.base.org',     address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  { name: 'mainnet',  chain: viemChains.mainnet,  rpcHost: 'eth-mainnet.g.alchemy.com',      fallback: 'https://cloudflare-eth.com', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { name: 'polygon',  chain: viemChains.polygon,  rpcHost: 'polygon-mainnet.g.alchemy.com',  fallback: 'https://polygon-rpc.com',    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
  { name: 'arbitrum', chain: viemChains.arbitrum, rpcHost: 'arb-mainnet.g.alchemy.com',      fallback: 'https://arb1.arbitrum.io/rpc', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
];

async function usdcBalance(address) {
  const key = process.env.ALCHEMY_API_KEY;
  const results = await Promise.allSettled(USDC_CHAINS.map(async (c) => {
    const rpc = key ? `https://${c.rpcHost}/v2/${key}` : c.fallback;
    const client = createPublicClient({ chain: c.chain, transport: http(rpc) });
    const raw = await client.readContract({
      address: c.address, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [address],
    });
    return Number(raw) / 1_000_000;
  }));
  return results.reduce((t, r) => t + (r.status === 'fulfilled' ? r.value : 0), 0);
}

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');

async function main() {
  console.log(`\n═ wallet-funded Ru$h nudge — ${BROADCAST_ID} ═`);
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');

  const { rows: wallets } = await query(`
    SELECT id, username, COALESCE(language,'en') AS language, wallet_address
      FROM users
     WHERE wallet_address IS NOT NULL
       AND is_active = true
       AND role != 'banned'
       AND id != $1
     ORDER BY id
  `, [SENDER_ID]);

  console.log(`Scanning ${wallets.length} wallets for USDC ≥ $${MIN_USDC}...`);

  const funded = [];
  for (const w of wallets) {
    try {
      const total = await usdcBalance(w.wallet_address);
      if (total >= MIN_USDC) funded.push({ ...w, usd: total });
    } catch (err) {
      console.error(`  ✗ scan failed ${w.id}: ${err.message}`);
    }
  }

  const { rows: alreadyRows } = await query(`
    SELECT recipient_id FROM direct_messages
     WHERE sender_id = $1 AND meta->>'broadcastId' = $2
  `, [SENDER_ID, BROADCAST_ID]);
  const alreadySent = new Set(alreadyRows.map((r) => r.recipient_id));

  const targets = funded.filter((f) => !alreadySent.has(f.id));
  const byLang = { en: 0, es: 0 };
  for (const t of targets) byLang[resolveLang(t.language)]++;

  console.log(`\nFunded: ${funded.length} · already sent: ${alreadySent.size} · new: ${targets.length}`);
  console.log(`  EN: ${byLang.en} · ES: ${byLang.es}`);
  console.log(`  Total idle USDC: $${targets.reduce((s, t) => s + t.usd, 0).toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n── sample EN ──\n' + copyFor('en', 25.01));
    console.log('\n── sample ES ──\n' + copyFor('es', 17.23));
    console.log('\n── targets ──');
    for (const t of targets) console.log(`  ${t.id}  $${t.usd.toFixed(2)}  @${t.username}  (${resolveLang(t.language)})`);
    console.log('\n(dry run)\n');
    process.exit(0);
  }

  if (!targets.length) { console.log('nothing to send'); process.exit(0); }

  const meta = JSON.stringify({ broadcastId: BROADCAST_ID });
  let sent = 0, failed = 0;

  for (const t of targets) {
    const lang = resolveLang(t.language);
    const content = copyFor(lang, t.usd);
    const { media_url, media_thumb_url } = HERO[lang];

    try {
      const { rows: ins } = await query(`
        INSERT INTO direct_messages
          (sender_id, recipient_id, content, media_url, media_type, media_thumb_url, meta)
        VALUES ($1, $2, $3, $4, 'image', $5, $6::jsonb)
        RETURNING id
      `, [SENDER_ID, t.id, content, media_url, media_thumb_url, meta]);
      const dmId = ins[0].id;

      await query(`
        INSERT INTO dm_threads (user_a, user_b, last_message, last_message_at,
                                 unread_for_a, unread_for_b, last_message_id)
        VALUES (LEAST($1, $2), GREATEST($1, $2), LEFT($3, 100), NOW(),
                CASE WHEN LEAST($1, $2) = $1 THEN 0 ELSE 1 END,
                CASE WHEN LEAST($1, $2) = $1 THEN 1 ELSE 0 END,
                $4)
        ON CONFLICT (user_a, user_b) DO UPDATE SET
          last_message    = EXCLUDED.last_message,
          last_message_at = NOW(),
          last_message_id = EXCLUDED.last_message_id,
          unread_for_a    = dm_threads.unread_for_a + CASE WHEN dm_threads.user_a = $1 THEN 0 ELSE 1 END,
          unread_for_b    = dm_threads.unread_for_b + CASE WHEN dm_threads.user_a = $1 THEN 1 ELSE 0 END
      `, [SENDER_ID, t.id, content, dmId]);

      sent++;
      console.log(`  ✓ ${t.id}  $${t.usd.toFixed(2)}  @${t.username}  (${lang})`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${t.id}: ${err.message}`);
    }
  }

  console.log(`\n═ done — sent ${sent} · failed ${failed} ═\n`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
