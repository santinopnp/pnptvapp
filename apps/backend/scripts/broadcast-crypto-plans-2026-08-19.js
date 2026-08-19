#!/usr/bin/env node
'use strict';

/**
 * Mass broadcast — Lifetime $100 + Yearly $50 PRIME plans, crypto-only.
 * Buttons 302 through /api/pay/np-go (signed HMAC per user+plan+currency+exp)
 * straight to a NowPayments hosted invoice — no intermediate PNPtv page.
 *
 * Channels:
 *   • Telegram DM — inline_keyboard 2 rows × 3 URL buttons (only users with u.telegram)
 *   • In-app DM   — text with 6 tappable links (all non-lifetime users)
 *
 * Manual one-shot only — NEVER schedule in cron.
 *
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-plans-2026-08-19.js --dry-run
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-plans-2026-08-19.js
 *   docker exec pnptv-bot node /app/apps/backend/scripts/broadcast-crypto-plans-2026-08-19.js --only-user=<uid>
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const https = require('https');
const crypto = require('crypto');
const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM = require(path.join(BACKEND, 'services/sendSystemDM'));

const DRY = process.argv.includes('--dry-run');
const ONLY_USER = (process.argv.find(a => a.startsWith('--only-user=')) || '').split('=')[1] || null;
const BOT_TOKEN = process.env.BOT_TOKEN;
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://pnptv.app';
const SYSTEM_SENDER_ID = '8552451957'; // Cristina / system

// Link expiry — 14 days from generation. Users who tap after that get a clean 410.
const EXP_SECONDS = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;

const PLANS = [
  { id: 'lifetime80', priceUsd: 100, label: { en: 'Lifetime PRIME — $100 (one-time)', es: 'PRIME de por vida — $100 (pago único)' } },
  { id: 'yearly50',   priceUsd: 50,  label: { en: '1 Year PRIME — $50',                es: '1 año PRIME — $50' } },
];
const CURRENCIES = [
  { code: 'usdcbase', label: 'USDC' },
  { code: 'eth',      label: 'ETH'  },
  { code: 'btc',      label: 'BTC'  },
];

if (!SESSION_SECRET) { console.error('FATAL: SESSION_SECRET missing.'); process.exit(1); }
if (!BOT_TOKEN)      { console.error('FATAL: BOT_TOKEN missing.');      process.exit(1); }

function signUrl(planId, payCode, userId) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET)
    .update(`${planId}|${payCode}|${userId}|${EXP_SECONDS}`)
    .digest('hex');
  return `${WEBAPP_URL}/api/pay/np-go?plan=${encodeURIComponent(planId)}&pay=${encodeURIComponent(payCode)}&u=${encodeURIComponent(userId)}&exp=${EXP_SECONDS}&sig=${sig}`;
}

// ── COPY ────────────────────────────────────────────────────────────────────

function buildCopy(lang, userId) {
  const isEs = lang === 'es';
  const links = {};
  for (const plan of PLANS) {
    links[plan.id] = {};
    for (const cur of CURRENCIES) {
      links[plan.id][cur.code] = signUrl(plan.id, cur.code, userId);
    }
  }

  const tgIntro = isEs
    ? `💎 Desbloquea todo PNPtv! con cripto — instantáneo, sin tarjetas.

Elige tu plan y tu moneda. El botón te lleva directo al pago:

• Lifetime $100 — PRIME para siempre
• 1 año $50 — PRIME por 365 días

Paga con USDC (ERC-20), ETH o BTC.`
    : `💎 Unlock all of PNPtv! with crypto — instant, no cards.

Pick your plan and your coin. The button takes you straight to checkout:

• Lifetime $100 — PRIME forever
• 1 year $50 — PRIME for 365 days

Pay with USDC (ERC-20), ETH or BTC.`;

  const dmText = isEs
    ? `💎 Desbloquea todo PNPtv! con cripto — instantáneo, sin tarjetas.

Toca la moneda que prefieres, te llevamos directo al checkout de NowPayments:

━━━━━━━━━━━━━━━━━━━━
🔥 Lifetime $100 — PRIME para siempre
• USDC → ${links.lifetime80.usdcbase}
• ETH  → ${links.lifetime80.eth}
• BTC  → ${links.lifetime80.btc}

━━━━━━━━━━━━━━━━━━━━
📅 1 año $50 — PRIME por 365 días
• USDC → ${links.yearly50.usdcbase}
• ETH  → ${links.yearly50.eth}
• BTC  → ${links.yearly50.btc}

Los enlaces caducan en 14 días.

— PNPtv! 🏳️‍🌈`
    : `💎 Unlock all of PNPtv! with crypto — instant, no cards.

Tap the coin you prefer, we send you straight to NowPayments checkout:

━━━━━━━━━━━━━━━━━━━━
🔥 Lifetime $100 — PRIME forever
• USDC → ${links.lifetime80.usdcbase}
• ETH  → ${links.lifetime80.eth}
• BTC  → ${links.lifetime80.btc}

━━━━━━━━━━━━━━━━━━━━
📅 1 year $50 — PRIME for 365 days
• USDC → ${links.yearly50.usdcbase}
• ETH  → ${links.yearly50.eth}
• BTC  → ${links.yearly50.btc}

Links expire in 14 days.

— PNPtv! 🏳️‍🌈`;

  const tgKeyboard = {
    inline_keyboard: [
      [
        { text: isEs ? '🔥 Lifetime — USDC' : '🔥 Lifetime — USDC', url: links.lifetime80.usdcbase },
        { text: isEs ? 'ETH'  : 'ETH',  url: links.lifetime80.eth },
        { text: isEs ? 'BTC'  : 'BTC',  url: links.lifetime80.btc },
      ],
      [
        { text: isEs ? '📅 1 año — USDC' : '📅 1 year — USDC', url: links.yearly50.usdcbase },
        { text: isEs ? 'ETH'  : 'ETH',  url: links.yearly50.eth },
        { text: isEs ? 'BTC'  : 'BTC',  url: links.yearly50.btc },
      ],
    ],
  };

  return { tgText: tgIntro, tgKeyboard, dmText };
}

// ── TG HTTP ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tgSend(chatId, text, replyMarkup) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload); req.end();
  });
}

// ── LOG TABLE ──────────────────────────────────────────────────────────────

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcast_crypto_plans_2026_08_19 (
      user_id text NOT NULL,
      channel text NOT NULL,
      status  text NOT NULL,
      error   text,
      sent_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel)
    )
  `);
}
// Skip anything we've already recorded — 'sent' means delivered, 'failed'
// means Telegram permanently rejected (user hasn't /start'd, blocked, etc.).
// Retrying failed rows just spends API budget for the same result.
async function alreadySent(userId, channel) {
  const { rows } = await query(
    `SELECT 1 FROM broadcast_crypto_plans_2026_08_19 WHERE user_id=$1 AND channel=$2 AND status IN ('sent','failed')`,
    [String(userId), channel]
  );
  return rows.length > 0;
}
async function log(userId, channel, status, error) {
  await query(
    `INSERT INTO broadcast_crypto_plans_2026_08_19 (user_id, channel, status, error)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, channel) DO UPDATE
       SET status=EXCLUDED.status, error=EXCLUDED.error, sent_at=NOW()`,
    [String(userId), channel, status, error || null]
  );
}

// ── AUDIENCE ───────────────────────────────────────────────────────────────
// Everyone active, not banned, not deleted, WITHOUT an active lifetime-PRIME
// entitlement (they can't benefit from these plans anyway).

async function fetchAudience() {
  const extraFilter = ONLY_USER ? ' AND u.id::text = $1' : '';
  const params = ONLY_USER ? [String(ONLY_USER)] : [];
  const { rows } = await query(`
    SELECT u.id::text        AS id,
           u.telegram        AS telegram,
           LOWER(COALESCE(u.language,'en')) AS lang
      FROM users u
      LEFT JOIN user_entitlements ue
        ON ue.user_id = u.id
       AND ue.add_on_id = 'prime'
       AND ue.is_lifetime = true
       AND ue.is_consumed = false
     WHERE u.is_deleted IS NOT TRUE
       AND (u.tier IS NULL OR u.tier <> 'banned')
       AND ue.user_id IS NULL
       ${extraFilter}
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `, params);
  return rows;
}

// ── SENDERS ────────────────────────────────────────────────────────────────

async function sendTelegramDMs(audience) {
  const tgUsers = audience.filter(u => u.telegram && u.telegram.trim() !== '');
  console.log(`  [TG] ${tgUsers.length} users with telegram id`);
  let sent = 0, fail = 0, skip = 0, dryPreview = 0;

  for (const u of tgUsers) {
    if (await alreadySent(u.id, 'tg')) { skip++; continue; }
    const isEs = u.lang.startsWith('es');
    const { tgText, tgKeyboard } = buildCopy(isEs ? 'es' : 'en', u.id);

    if (DRY) {
      if (dryPreview < 2) {
        console.log(`\n  ── DRY TG sample #${dryPreview + 1} → user ${u.id} (${isEs ? 'ES' : 'EN'}) chat ${u.telegram} ──`);
        console.log(tgText);
        console.log('  keyboard:', JSON.stringify(tgKeyboard, null, 2));
        dryPreview++;
      }
      sent++;
      continue;
    }

    const r = await tgSend(u.telegram, tgText, tgKeyboard);
    if (r.ok) { sent++; await log(u.id, 'tg', 'sent'); }
    else {
      fail++;
      await log(u.id, 'tg', 'failed', (r.description || r.error || 'unknown').slice(0, 500));
    }

    await sleep(40);
    if ((sent + fail) % 200 === 0) {
      await sleep(1000);
      console.log(`  [TG] progress: sent=${sent} failed=${fail} skip=${skip} / ${tgUsers.length}`);
    }
  }

  console.log(`  [TG] final: sent=${sent} failed=${fail} skipped=${skip} total=${tgUsers.length}`);
  return { sent, fail, skip, total: tgUsers.length };
}

async function sendInAppDMs(audience) {
  console.log(`  [DM] ${audience.length} users`);
  let sent = 0, fail = 0, skip = 0, dryPreview = 0;

  for (const u of audience) {
    if (await alreadySent(u.id, 'dm')) { skip++; continue; }
    const isEs = u.lang.startsWith('es');
    const { dmText } = buildCopy(isEs ? 'es' : 'en', u.id);

    if (DRY) {
      if (dryPreview < 2) {
        console.log(`\n  ── DRY DM sample #${dryPreview + 1} → user ${u.id} (${isEs ? 'ES' : 'EN'}) ──`);
        console.log(dmText);
        dryPreview++;
      }
      sent++;
      continue;
    }

    try {
      await sendSystemDM(SYSTEM_SENDER_ID, u.id, dmText, query);
      sent++;
      await log(u.id, 'dm', 'sent');
    } catch (err) {
      fail++;
      await log(u.id, 'dm', 'failed', String(err.message || err).slice(0, 500));
    }

    if ((sent + fail) % 200 === 0) {
      console.log(`  [DM] progress: sent=${sent} failed=${fail} skip=${skip} / ${audience.length}`);
      await sleep(300);
    } else {
      await sleep(20);
    }
  }

  console.log(`  [DM] final: sent=${sent} failed=${fail} skipped=${skip} total=${audience.length}`);
  return { sent, fail, skip, total: audience.length };
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Crypto plans broadcast 2026-08-19 ${DRY ? '(DRY-RUN)' : ''} ${ONLY_USER ? `[ONLY ${ONLY_USER}]` : ''} ===`);
  console.log(`Links expire at ${new Date(EXP_SECONDS * 1000).toISOString()} (${EXP_SECONDS})`);
  await initializePostgres();
  await ensureLogTable();

  const audience = await fetchAudience();
  console.log(`Audience: ${audience.length} users (non-lifetime, non-banned, non-deleted)`);
  if (audience.length === 0) { console.log('Nothing to send.'); process.exit(0); }

  console.log('\n── TELEGRAM DM ──');
  const tg = await sendTelegramDMs(audience);

  console.log('\n── IN-APP DM ──');
  const dm = await sendInAppDMs(audience);

  console.log(`\n=== FINAL ===`);
  console.log(`  tg:  sent=${tg.sent}  failed=${tg.fail}  skipped=${tg.skip}  total=${tg.total}`);
  console.log(`  dm:  sent=${dm.sent}  failed=${dm.fail}  skipped=${dm.skip}  total=${dm.total}`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
