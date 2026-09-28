#!/usr/bin/env node
'use strict';

/**
 * broadcast-sunday-spun-days.js
 *
 * Weekly Sunday $15 → 1 month PRIME promo.
 *
 * Channels : Telegram DM (sendPhoto + CTA button)  +  in-app platform DM
 *            (NO email, NO push — this campaign is DM-only per product spec).
 * Audience : non-banned, non-deleted, non-creator, NOT currently PRIME,
 *            active in last 60d, has telegram OR platform DM path.
 * Dedup    : campaign-namespaced LIKE key  ssd:YYYY-Www:<userId>  in Redis.
 * Metrics  : one row per fire in sunday_spun_days_campaigns.
 * Slack    : #ops-admin-alerts on start + on finish.
 * Landing  : https://pnptv.app/redeem/ssd  (hidden — not linked elsewhere).
 *
 * CLI:
 *   --dry-run           audience count + sample copy, no sends, no dedup writes
 *   --skip-tg           skip Telegram (in-app DM only)
 *   --skip-dm           skip in-app DM (Telegram only)
 *   --week=YYYY-Www     override ISO week for dedup (default: current)
 *
 * Run in isolated docker container (see feedback_broadcast_isolated_container.md):
 *
 *   docker run --rm --network pnptvapp_pnptvapp_net \
 *     --env-file <(docker exec pnptv-bot printenv | grep -v '^HOME=\|^PATH=\|^HOSTNAME=') \
 *     -v /opt/pnptvapp/apps/backend/scripts/broadcast-sunday-spun-days.js:/app/apps/backend/scripts/broadcast-sunday-spun-days.js:ro \
 *     pnptv-bot:latest \
 *     node apps/backend/scripts/broadcast-sunday-spun-days.js
 */

const path  = require('path');
const https = require('https');
const fs    = require('fs');

const BACKEND = fs.existsSync(path.join(__dirname, '../config/postgres.js'))
  ? path.resolve(__dirname, '..')
  : '/app/apps/backend';
const NM_ROOT = fs.existsSync(path.join(BACKEND, 'node_modules/ioredis'))
  ? path.join(BACKEND, 'node_modules')
  : path.join(BACKEND, '../../node_modules');
const nm = (pkg) => require(path.join(NM_ROOT, pkg));

try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { nm('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query, initializePostgres } = require(path.join(BACKEND, 'config/postgres'));
const sendSystemDM                  = require(path.join(BACKEND, 'services/sendSystemDM'));

process.on('uncaughtException', (err) => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) return;
  console.error('Uncaught:', err.message); process.exit(1);
});

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_TG = process.argv.includes('--skip-tg');
const SKIP_DM = process.argv.includes('--skip-dm');
const WEEK_OVERRIDE = (process.argv.find(a => a.startsWith('--week=')) || '').replace('--week=', '') || null;

// ISO week (UTC) — matches Postgres ISOYEAR/IW so metrics queries line up.
function isoWeekUTC(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;                     // Mon=0 … Sun=6
  t.setUTCDate(t.getUTCDate() - dayNum + 3);                  // Thursday of that week
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const CAMPAIGN_ID  = 'sunday_spun_days';
const WEEK_ISO     = WEEK_OVERRIDE || isoWeekUTC();
const DEDUP_KEY    = `pnpapp:broadcast:dedup:ssd:${WEEK_ISO}`;
const SYSTEM_SENDER = '8552451957';
const SANTINO_ID    = '8599671840';

// Owned hero (Santino) — Telegram sendPhoto tested pattern.
const HERO_URL     = 'https://pnptv.app/uploads/creator-media/8599671840-1783409405497.webp';
const REDEEM_URL   = 'https://pnptv.app/redeem/ssd';

const BOT_TOKEN    = process.env.BOT_TOKEN;
const TG_DELAY_MS  = 150;
const DM_DELAY_MS  = 80;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isEs  = (lang) => lang && /^es/i.test(String(lang));

function pickName(u) {
  const raw = String(u.first_name || '').trim().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (raw && raw.length >= 2 && !/^\d+$/.test(raw)) return raw.split(/[\s:,]/)[0];
  return u.username || (isEs(u.language) ? 'papi' : 'friend');
}

// ─── COPY ─────────────────────────────────────────────────────────────────────

function dmText(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return `☀️ Sunday Spun Days${n}

Un mes entero de PRIME por solo $15. Solo domingos, solo por invitación.

🖤 Acceso completo a shows, hangouts, streams y toda la comunidad.

Reclamá acá 👉 ${REDEEM_URL}`;
  }
  return `☀️ Sunday Spun Days${n}

A full month of PRIME for just $15. Sundays only, invite-only.

🖤 Full access to shows, hangouts, streams, and the whole community.

Claim it here 👉 ${REDEEM_URL}`;
}

function tgCaption(name, lang) {
  const n = name ? ` ${name}` : '';
  if (isEs(lang)) {
    return (
      `☀️ <b>Sunday Spun Days</b> — solo hoy\n\n` +
      `Hola${n} — un mes completo de <b>PRIME por $15</b>.\n\n` +
      `🖤 Shows exclusivos, hangouts, streams, comunidad.\n` +
      `⏳ Ventana cierra el <b>lunes 23:59</b>.\n\n` +
      `Pagás desde tu wallet en un tap.`
    );
  }
  return (
    `☀️ <b>Sunday Spun Days</b> — today only\n\n` +
    `Hey${n} — a full month of <b>PRIME for $15</b>.\n\n` +
    `🖤 Exclusive shows, hangouts, streams, community.\n` +
    `⏳ Window closes <b>Monday 23:59</b>.\n\n` +
    `One tap from your wallet.`
  );
}

// ─── TELEGRAM HELPERS ─────────────────────────────────────────────────────────

function _tgApi(method, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function tgSend(chatId, caption, btnLabel, btnUrl) {
  const kb = { inline_keyboard: [[{ text: btnLabel, url: btnUrl }]] };
  const photoRes = await _tgApi('sendPhoto', {
    chat_id: chatId,
    photo: HERO_URL,
    caption: caption.slice(0, 1024),
    parse_mode: 'HTML',
    reply_markup: kb,
  });
  if (photoRes.ok) return photoRes;
  return _tgApi('sendMessage', {
    chat_id: chatId,
    text: caption,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: kb,
  });
}

// ─── SLACK OPS ────────────────────────────────────────────────────────────────

async function slackNotify(text) {
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN;
  const channel = process.env.SLACK_OPS_ADMIN_CHANNEL;
  if (!token || !channel) return;
  const body = JSON.stringify({ channel, text });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    }, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body); req.end();
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  await initializePostgres();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` SUNDAY SPUN DAYS — ${WEEK_ISO}`);
  console.log(`  DM: ${!SKIP_DM} · TG: ${!SKIP_TG}   MODE: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('══════════════════════════════════════════════════════\n');

  const IORedis = nm('ioredis');
  const redisUrl = process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PNPTV_PASSWORD}@redis-pnptv:6379/0`;
  const redis = DRY_RUN ? null : new IORedis(redisUrl, { lazyConnect: true });
  if (redis) {
    try { await redis.connect(); } catch {}
    redis.on('error', () => {});
  }

  // Audience: non-PRIME, non-banned, non-deleted, non-creator, active in last 60d,
  // has telegram OR is reachable via in-app DM. PRIME check goes through
  // user_entitlements (not users.tier) to catch drift (per memory
  // feedback_tier_drift_reconcile_gaps.md).
  const { rows: targets } = await query(`
    SELECT u.id, u.username, u.first_name, u.telegram, u.language
      FROM users u
     WHERE u.deleted_at IS NULL
       AND COALESCE(u.is_active, true) = true
       AND COALESCE(u.tier, 'free') <> 'banned'
       AND (u.username IS NULL OR u.username NOT LIKE 'deleted_%')
       AND COALESCE(u.creator_status, 'none') = 'none'
       AND u.id NOT IN ('${SYSTEM_SENDER}', 'fafa6786-de29-4216-b788-4f11d703df4f')
       AND COALESCE(u.last_active, u.created_at) > NOW() - INTERVAL '60 days'
       AND NOT EXISTS (
         SELECT 1 FROM user_entitlements ue
          WHERE ue.user_id = u.id
            AND ue.add_on_id IN ('prime')
            AND (ue.is_lifetime = true OR ue.expires_at > NOW())
       )
     ORDER BY COALESCE(u.last_active, u.created_at) DESC
  `);

  // Force-include Santino for verification (per feedback_broadcast_cc_santino.md)
  const hasSantino = targets.some(u => String(u.id) === SANTINO_ID);
  if (!hasSantino) {
    const { rows: s } = await query(
      `SELECT id, username, first_name, telegram, language FROM users WHERE id::text=$1`,
      [SANTINO_ID]
    );
    if (s.length) targets.unshift(s[0]);
  }

  const withTg = targets.filter(t => t.telegram);
  console.log(`  Targets total  : ${targets.length}`);
  console.log(`  With Telegram  : ${withTg.length}\n`);

  if (DRY_RUN) {
    console.log('  Sample DM (en):'); console.log(dmText('papi', 'en'));
    console.log('\n  Sample DM (es):'); console.log(dmText('papi', 'es'));
    console.log('\n  Sample TG caption (en):'); console.log(tgCaption('papi', 'en'));
    console.log(`\n  DRY RUN — would process ${targets.length} users.\n`);
    process.exit(0);
  }

  // Insert campaign row (or fetch existing if we're re-running same week).
  const { rows: campaignRows } = await query(`
    INSERT INTO sunday_spun_days_campaigns (week_iso, audience_size, redeem_url, notes)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (week_iso) DO UPDATE SET audience_size = EXCLUDED.audience_size
    RETURNING id
  `, [WEEK_ISO, targets.length, REDEEM_URL, `Kicked off ${new Date().toISOString()}`]);
  const campaignId = campaignRows[0]?.id;

  await slackNotify(
    `☀️ *Sunday Spun Days — ${WEEK_ISO}* firing to ${targets.length} users (TG: ${withTg.length}). Redemption window closes Monday 23:59 Bogota. Landing: ${REDEEM_URL}`
  );

  const stats = { dm: 0, tg: 0, tgBlocked: 0, dmF: 0, tgF: 0, skip: 0 };

  for (let i = 0; i < targets.length; i++) {
    const u    = targets[i];
    const lang = isEs(u.language) ? 'es' : 'en';
    const name = pickName(u);

    if (i > 0 && i % 500 === 0) {
      console.log(`  progress ${i}/${targets.length}  dm=${stats.dm} tg=${stats.tg} skip=${stats.skip}`);
    }

    const deduped = await redis.sismember(DEDUP_KEY, String(u.id));
    if (deduped) { stats.skip++; continue; }
    await redis.sadd(DEDUP_KEY, String(u.id));

    // 1. Platform in-app DM (hero image + CTA text)
    if (!SKIP_DM) {
      try {
        await sendSystemDM(SYSTEM_SENDER, u.id, dmText(name, lang), query, {
          mediaUrl: HERO_URL, mediaType: 'image',
        });
        stats.dm++;
      } catch { stats.dmF++; }
      await sleep(DM_DELAY_MS);
    }

    // 2. Telegram DM (sendPhoto + button)
    if (!SKIP_TG && u.telegram) {
      const btnLabel = isEs(u.language) ? 'Reclamar mi mes 💎' : 'Claim my month 💎';
      const r = await tgSend(u.telegram, tgCaption(name, lang), btnLabel, REDEEM_URL);
      if (r.ok) {
        stats.tg++;
      } else if (r.error_code === 403 || (r.description || '').match(/blocked|deactivated/i)) {
        stats.tgBlocked++;
      } else {
        stats.tgF++;
      }
      await sleep(TG_DELAY_MS);
    }
  }

  // Redis dedup TTL: 8 days so the same audience can be re-invited next Sunday
  // WITHOUT the current week's dedup blocking them.
  if (redis) await redis.expire(DEDUP_KEY, 8 * 86400);

  // Finalize campaign row.
  if (campaignId) {
    await query(`
      UPDATE sunday_spun_days_campaigns
         SET tg_sent = $2, tg_failed = $3, tg_blocked = $4,
             dm_sent = $5, dm_failed = $6,
             redemption_deadline = $7,
             notes = COALESCE(notes,'') || $8
       WHERE id = $1
    `, [
      campaignId,
      stats.tg, stats.tgF, stats.tgBlocked,
      stats.dm, stats.dmF,
      // Redemption window: next Tuesday 05:00 UTC (~= Mon 23:59 Bogota).
      // For weekly cron this covers the natural Sun→Mon burn window.
      new Date(Date.now() + 30 * 3600 * 1000),
      `\nFinished ${new Date().toISOString()}. TG=${stats.tg}/${stats.tgF}f/${stats.tgBlocked}b, DM=${stats.dm}/${stats.dmF}f, skip=${stats.skip}.`,
    ]);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` DONE — Sunday Spun Days ${WEEK_ISO}`);
  console.log('══════════════════════════════════════════════════════');
  console.log(` In-app DMs : ${stats.dm} sent / ${stats.dmF} failed`);
  console.log(` Telegram   : ${stats.tg} sent / ${stats.tgF} failed / ${stats.tgBlocked} blocked`);
  console.log(` Skipped    : ${stats.skip} (already sent)`);
  console.log('══════════════════════════════════════════════════════\n');

  await slackNotify(
    `✅ *Sunday Spun Days — ${WEEK_ISO}* fired.\n` +
    `• Audience: ${targets.length}\n` +
    `• Telegram: ${stats.tg} sent, ${stats.tgF} failed, ${stats.tgBlocked} blocked\n` +
    `• In-app DM: ${stats.dm} sent, ${stats.dmF} failed\n` +
    `• Skipped (already sent this week): ${stats.skip}\n` +
    `Monday recap will follow with conversion + revenue.`
  );

  process.exit(0);
}

// Only run if invoked directly (`node <this file>`). Prevents the campaign
// from auto-firing when the file is `require()`d for introspection —
// see feedback_broadcast_scripts_auto_run_main.md.
if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}

module.exports = { main, isoWeekUTC, CAMPAIGN_ID };
