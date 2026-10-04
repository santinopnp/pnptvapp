#!/usr/bin/env node
'use strict';

/**
 * broadcast-prime-5-drops-2026-10-04.js
 *
 * Announces 5 new videos just published on PNPtv! PRIME channel across 3
 * channels: Telegram DM, Web Push, In-App Notification. Tier-based copy.
 *
 * Audience:
 *   non-PRIME (free + member) → "Become PRIME and watch them"
 *   PRIME subscribers         → "Go watch them now!"
 *
 * Flags:
 *   --preview       Only sends to Santino (both variants) for approval.
 *   --live          Actually send; otherwise dry-run.
 *   --skip-tg       Skip Telegram DM.
 *   --skip-push     Skip web push.
 *   --skip-inapp    Skip in-app notification.
 *
 * Isolated run (NEVER `docker exec pnptv-bot` — parallel restarts kill it):
 *   docker run --rm \
 *     $(docker exec pnptv-bot printenv | grep -E '^(BOT_TOKEN|DATABASE_URL|REDIS|SMTP|PNPTV|WEBAPP|NODE_ENV|SESSION|VAPID)' | sed 's/^/-e /') \
 *     --network pnptvapp_pnptvapp_net \
 *     pnptv-bot:latest \
 *     node /app/apps/backend/scripts/broadcast-prime-5-drops-2026-10-04.js --preview --live
 */

const path  = require('path');
const https = require('https');

const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const PushNotificationService = require(path.join(BACKEND, 'services/pushNotificationService'));
const NotificationEmitter    = require(path.join(BACKEND, 'services/notificationEmitter'));

const PREVIEW    = process.argv.includes('--preview');
const DRY        = !process.argv.includes('--live');
const SKIP_TG    = process.argv.includes('--skip-tg');
const SKIP_PUSH  = process.argv.includes('--skip-push');
const SKIP_INAPP = process.argv.includes('--skip-inapp');

const SANTINO_ID = '8599671840';
const LOG_TABLE  = 'broadcast_prime_5_drops_20261004';
const BOT_TOKEN  = process.env.BOT_TOKEN;
const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://pnptv.app').replace(/\/$/, '');
const TG_DELAY_MS = 100;

// Hero image: CLOUDS AND ROPE Mux thumbnail (video 488), large for TG preview
const HERO_URL = 'https://image.mux.com/sajUqYK8DM01XotyMsvwbMHcSeEJ02zkNGB6Mkxl2aYog/thumbnail.jpg?width=1200&height=675&fit_mode=smartcrop';

const COPY = {
  nonPrime: {
    tgCaption: '5 new videos just dropped on PNPtv! PRIME channel. Become PRIME and watch them.',
    tgButtons: [[
      { text: '▶ Subscribe · $24.99/mo', url: `${WEBAPP_URL}/subscribe` },
      { text: '💎 Lifetime · $99.99',    url: `${WEBAPP_URL}/lifetime100` },
    ]],
    pushTitle: '🔥 5 new PRIME drops just went live',
    pushBody:  '5 new videos on PNPtv! PRIME. Become PRIME and watch.',
    pushUrl:   `${WEBAPP_URL}/subscribe`,
    inappMsg:  '5 new videos just dropped on PNPtv! PRIME channel. Become PRIME and watch them.',
    inappUrl:  '/subscribe',
  },
  prime: {
    tgCaption: '5 new videos just dropped on PNPtv! PRIME channel. Go watch them now!',
    tgButtons: [[
      { text: '▶ Watch now', url: `${WEBAPP_URL}/channels/pnptv-prime` },
    ]],
    pushTitle: '🔥 5 new PRIME drops just went live',
    pushBody:  'Go watch them now.',
    pushUrl:   `${WEBAPP_URL}/channels/pnptv-prime`,
    inappMsg:  '5 new videos just dropped on PNPtv! PRIME channel. Go watch them now!',
    inappUrl:  '/channels/pnptv-prime',
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tgSendPhoto(chatId, photoUrl, caption, buttons) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: chatId,
      photo:   photoUrl,
      caption,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); } });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function ensureLogTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      variant TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel, variant)
    )
  `);
}
async function alreadySent(userId, channel, variant) {
  const { rows } = await query(
    `SELECT 1 FROM ${LOG_TABLE} WHERE user_id=$1 AND channel=$2 AND variant=$3`,
    [String(userId), channel, variant]
  );
  return rows.length > 0;
}
async function markSent(userId, channel, variant) {
  await query(
    `INSERT INTO ${LOG_TABLE} (user_id, channel, variant) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [String(userId), channel, variant]
  );
}

function variantFor(tier) {
  return (tier && tier.toLowerCase() === 'prime') ? 'prime' : 'nonPrime';
}

async function sendToUser(user, variantOverride) {
  const variant = variantOverride || variantFor(user.tier);
  const copy = COPY[variant];
  const label = variant === 'prime' ? 'PRIME' : 'non-PRIME';
  const tag = `uid=${user.id} tier=${user.tier || 'free'} as=${label}`;

  // 1. Telegram DM (sendPhoto with caption + buttons)
  if (!SKIP_TG && user.telegram) {
    if (DRY) { console.log(`  [dry] TG → ${tag}`); }
    else if (await alreadySent(user.id, 'tg_' + variant, variant)) { console.log(`  [skip] TG dedup → ${tag}`); }
    else {
      const res = await tgSendPhoto(user.telegram, HERO_URL, copy.tgCaption, copy.tgButtons);
      if (res.ok) { await markSent(user.id, 'tg_' + variant, variant); console.log(`  [ok]  TG → ${tag}`); }
      else {
        const code = res.error_code;
        if (code === 403 || code === 400) await markSent(user.id, 'tg_' + variant, variant); // unreachable
        console.log(`  [err] TG → ${tag} :: ${code || res.error || 'unknown'}`);
      }
      await sleep(TG_DELAY_MS);
    }
  }

  // 2. Web Push
  if (!SKIP_PUSH) {
    if (DRY) { console.log(`  [dry] PUSH → ${tag}`); }
    else if (await alreadySent(user.id, 'push_' + variant, variant)) { console.log(`  [skip] PUSH dedup → ${tag}`); }
    else {
      try {
        await PushNotificationService.sendToUser(user.id, {
          title: copy.pushTitle, body: copy.pushBody, url: copy.pushUrl,
        });
        await markSent(user.id, 'push_' + variant, variant);
        console.log(`  [ok]  PUSH → ${tag}`);
      } catch (e) {
        console.log(`  [err] PUSH → ${tag} :: ${e.message}`);
      }
    }
  }

  // 3. In-app notification (bell + socket)
  if (!SKIP_INAPP) {
    if (DRY) { console.log(`  [dry] INAPP → ${tag}`); }
    else if (await alreadySent(user.id, 'inapp_' + variant, variant)) { console.log(`  [skip] INAPP dedup → ${tag}`); }
    else {
      try {
        await NotificationEmitter.emit({
          type: 'content_drop',
          category: 'content',
          priority: 'normal',
          targetUserId: String(user.id),
          entityType: 'channel',
          entityId: '209',
          message: copy.inappMsg,
          metadata: { url: copy.inappUrl, pushTitle: copy.pushTitle, pushBody: copy.pushBody },
        });
        await markSent(user.id, 'inapp_' + variant, variant);
        console.log(`  [ok]  INAPP → ${tag}`);
      } catch (e) {
        console.log(`  [err] INAPP → ${tag} :: ${e.message}`);
      }
    }
  }
}

async function main() {
  console.log(`[prime-5-drops] ${DRY ? 'DRY RUN' : 'LIVE'} :: ${PREVIEW ? 'PREVIEW (Santino only)' : 'FULL AUDIENCE'}`);

  await initializePostgres();
  if (!DRY) await ensureLogTable();
  if (!SKIP_PUSH) PushNotificationService.initialize();

  if (PREVIEW) {
    const { rows } = await query(`SELECT id, username, telegram, tier FROM users WHERE id=$1`, [SANTINO_ID]);
    if (!rows.length) { console.error('Santino row not found'); process.exit(1); }
    const u = rows[0];
    console.log(`\n--- PRIME variant (what paid subscribers see) ---`);
    await sendToUser(u, 'prime');
    console.log(`\n--- non-PRIME variant (what free + member tier see) ---`);
    await sendToUser(u, 'nonPrime');
    console.log('\n[prime-5-drops] preview done. Review the 3 channels then run WITHOUT --preview for full audience.');
    process.exit(0);
  }

  // Full audience, skip Santino (already got preview)
  const { rows: users } = await query(`
    SELECT id, username, telegram, tier
      FROM users
     WHERE COALESCE(is_deleted,false) = false
       AND id != $1
     ORDER BY (tier='PRIME') DESC, id
  `, [SANTINO_ID]);
  console.log(`[prime-5-drops] ${users.length} candidate users`);
  let i = 0;
  for (const u of users) {
    i++;
    await sendToUser(u);
    if (i % 100 === 0) console.log(`[prime-5-drops] progress: ${i}/${users.length}`);
  }
  console.log('[prime-5-drops] full campaign done.');
  process.exit(0);
}

main().catch((e) => { console.error('[prime-5-drops] fatal:', e); process.exit(1); });
