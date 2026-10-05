#!/usr/bin/env node
'use strict';

/**
 * Personalized nudge DM from @pnptv to every user with a linked Privy
 * wallet holding ≥ $1 of native ETH across Base + Ethereum + Polygon
 * + Arbitrum (Polygon's native is MATIC — included for completeness but
 * these users are overwhelmingly on Base/Eth). Encourages converting idle
 * ETH → Ru$h 💎 in-app.
 *
 * Dedup: skips any user who already received the USDC nudge campaign today
 * (wallet-funded-rush-nudge-2026-10-03) to avoid double-DMing holders of
 * both assets.
 *
 * Each DM personalized (ETH amount + USD equivalent injected). Bilingual.
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));
const { createPublicClient, http } = require('viem');
const viemChains = require('viem/chains');

const DRY_RUN      = process.argv.includes('--dry-run');
const MIN_USD      = 1;
const ETH_PRICE    = Number(process.env.ETH_PRICE_USD || 3500); // override via env for a fresher quote
const SENDER_ID    = '8552451957';
const BROADCAST_ID = 'wallet-funded-eth-nudge-2026-10-03';
const SKIP_CAMPAIGNS = ['wallet-funded-rush-nudge-2026-10-03']; // users already DM'd this round

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

const copyFor = (lang, eth, usd) => {
  const ethStr = eth.toFixed(eth < 0.01 ? 6 : 4);
  const usdStr = `$${usd.toFixed(2)}`;
  if (lang === 'es') {
    return `Hola — tu wallet tiene ${ethStr} ETH (~${usdStr}) esperando.

Convertilo a Ru$h 💎 y usalo en propinas en vivo, contenido exclusivo, llamadas privadas — para lo que viniste.

Instantáneo, sin cargos extra. Tocá el ícono 💎 para recargar.

— PNPtv!`;
  }
  return `Hey — your wallet has ${ethStr} ETH (~${usdStr}) sitting there.

Turn it into Ru$h 💎 and use it on live tips, exclusive content, private calls — the stuff you came here for.

Instant swap, no extra fees. Tap the 💎 icon to top up.

— PNPtv!`;
};

const ETH_CHAINS = [
  { name: 'base',     chain: viemChains.base,     rpcHost: 'base-mainnet.g.alchemy.com',     fallback: 'https://mainnet.base.org' },
  { name: 'mainnet',  chain: viemChains.mainnet,  rpcHost: 'eth-mainnet.g.alchemy.com',      fallback: 'https://cloudflare-eth.com' },
  { name: 'arbitrum', chain: viemChains.arbitrum, rpcHost: 'arb-mainnet.g.alchemy.com',      fallback: 'https://arb1.arbitrum.io/rpc' },
];

async function ethBalance(address) {
  const key = process.env.ALCHEMY_API_KEY;
  const results = await Promise.allSettled(ETH_CHAINS.map(async (c) => {
    const rpc = key ? `https://${c.rpcHost}/v2/${key}` : c.fallback;
    const client = createPublicClient({ chain: c.chain, transport: http(rpc) });
    const wei = await client.getBalance({ address });
    return Number(wei) / 1e18;
  }));
  return results.reduce((t, r) => t + (r.status === 'fulfilled' ? r.value : 0), 0);
}

const resolveLang = (raw) => (String(raw || '').toLowerCase().startsWith('es') ? 'es' : 'en');

async function main() {
  console.log(`\n═ wallet-funded ETH Ru$h nudge — ${BROADCAST_ID} ═`);
  console.log(` ETH price assumed: $${ETH_PRICE} (override via ETH_PRICE_USD env)`);
  if (DRY_RUN) console.log(' MODE: DRY RUN\n');

  // Exclude users already DM'd by the USDC campaign today
  const { rows: skipRows } = await query(`
    SELECT DISTINCT recipient_id FROM direct_messages
     WHERE sender_id = $1 AND meta->>'broadcastId' = ANY($2::text[])
  `, [SENDER_ID, SKIP_CAMPAIGNS]);
  const skipSet = new Set(skipRows.map(r => r.recipient_id));

  const { rows: wallets } = await query(`
    SELECT id, username, COALESCE(language,'en') AS language, wallet_address
      FROM users
     WHERE wallet_address IS NOT NULL
       AND is_active = true
       AND role != 'banned'
       AND id != $1
     ORDER BY id
  `, [SENDER_ID]);

  const eligible = wallets.filter(w => !skipSet.has(w.id));
  console.log(`Scanning ${eligible.length} wallets for ETH ≥ $${MIN_USD} (skipping ${skipSet.size} already DM'd via USDC campaign)...`);

  const funded = [];
  for (const w of eligible) {
    try {
      const eth = await ethBalance(w.wallet_address);
      const usd = eth * ETH_PRICE;
      if (usd >= MIN_USD) funded.push({ ...w, eth, usd });
    } catch (err) {
      console.error(`  ✗ scan failed ${w.id}: ${err.message}`);
    }
  }

  const { rows: alreadyRows } = await query(`
    SELECT recipient_id FROM direct_messages
     WHERE sender_id = $1 AND meta->>'broadcastId' = $2
  `, [SENDER_ID, BROADCAST_ID]);
  const alreadySent = new Set(alreadyRows.map(r => r.recipient_id));

  const targets = funded.filter(f => !alreadySent.has(f.id));
  const byLang = { en: 0, es: 0 };
  for (const t of targets) byLang[resolveLang(t.language)]++;
  const totalUsd = targets.reduce((s, t) => s + t.usd, 0);

  console.log(`\nFunded (≥$${MIN_USD}): ${funded.length} · already sent: ${alreadySent.size} · new: ${targets.length}`);
  console.log(`  EN: ${byLang.en} · ES: ${byLang.es}`);
  console.log(`  Total idle ETH value: $${totalUsd.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n── sample EN ──\n' + copyFor('en', 0.0023, 8.05));
    console.log('\n── sample ES ──\n' + copyFor('es', 0.0047, 16.45));
    console.log('\n── targets ──');
    for (const t of targets.sort((a,b) => b.usd - a.usd)) {
      console.log(`  ${t.id}  ${t.eth.toFixed(6)} ETH ($${t.usd.toFixed(2)})  @${t.username}  (${resolveLang(t.language)})`);
    }
    console.log('\n(dry run)\n');
    process.exit(0);
  }

  if (!targets.length) { console.log('nothing to send'); process.exit(0); }

  const meta = JSON.stringify({ broadcastId: BROADCAST_ID });
  let sent = 0, failed = 0;

  for (const t of targets) {
    const lang = resolveLang(t.language);
    const content = copyFor(lang, t.eth, t.usd);
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
      console.log(`  ✓ ${t.id}  ${t.eth.toFixed(6)} ETH ($${t.usd.toFixed(2)})  @${t.username}  (${lang})`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${t.id}: ${err.message}`);
    }
  }

  console.log(`\n═ done — sent ${sent} · failed ${failed} ═\n`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
