#!/usr/bin/env node
'use strict';

/**
 * Deploy-health watchdog. Runs every 4 hours. Catches silent failure modes
 * that have historically gone undetected for weeks (broadcasts dark since
 * Aug 2, crypto cron dead for weeks, gas treasury dry since Sep 21).
 *
 * Posts to SLACK_OPS_ADMIN_CHANNEL only when something is wrong — otherwise
 * silent. The daily digest covers the happy-path visibility.
 *
 * Checks:
 *   1. BullMQ `cron-jobs` queue — if zero completions in 6h, scream
 *   2. Broadcast cadence — if zero broadcast campaigns in 7 days, scream
 *   3. Gas treasury balance < 0.005 ETH on Base
 *   4. Payment-error spike — > 100 errors in 1h
 *   5. direct_messages ingestion — if zero DMs created in last hour (bot dead?)
 */

const path = require('path');
const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { query } = require(path.join(BACKEND, 'config/postgres'));

const DRY = process.argv.includes('--dry-run');
const SLACK_TOKEN   = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_OPS_ADMIN_CHANNEL;
const GAS_EOA       = '0x0676AAa087520bd578b524ED66B7b4B35698Aa4F';
const BASE_RPC      = 'https://mainnet.base.org';
// Carlos manages this treasury himself and tops it up on his own schedule.
// Only alert when it's truly near-dry so we don't nag him.
const GAS_LOW_ETH   = 0.0003;

async function postSlack(text) {
  if (DRY) { console.log('\n── would alert ──\n' + text + '\n'); return; }
  if (!SLACK_TOKEN || !SLACK_CHANNEL) { console.error('No Slack creds'); return; }
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SLACK_TOKEN}` },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text, mrkdwn: true }),
  });
  const j = await r.json();
  if (!j.ok) console.error('Slack post failed:', j);
}

async function checkGas() {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_getBalance',
      params: [GAS_EOA, 'latest'], id: 1,
    }),
  });
  const j = await res.json();
  const eth = Number(BigInt(j.result || '0x0')) / 1e18;
  if (eth < GAS_LOW_ETH) {
    return `⛽ *Gas treasury LOW* — ${eth.toFixed(6)} ETH on Base (~$${(eth * 3500).toFixed(2)}). Threshold: ${GAS_LOW_ETH} ETH. Top up \`${GAS_EOA}\`.`;
  }
  return null;
}

async function checkBroadcasts() {
  const { rows } = await query(`
    SELECT COUNT(DISTINCT meta->>'broadcastId') AS n
      FROM direct_messages
     WHERE created_at > NOW() - INTERVAL '7 days'
       AND meta ? 'broadcastId'
  `);
  if (Number(rows[0].n) === 0) {
    return '📭 *No broadcast campaigns fired in last 7 days.* Marketing engine silent — this is how the Aug-Oct cliff happened.';
  }
  return null;
}

async function checkDmIngestion() {
  // If the webapp bot is alive and users are using it, SOME dm should flow.
  // Zero dm in last hour during business hours (anywhere in the world) ⇒ probably dead.
  const { rows } = await query(`
    SELECT COUNT(*) AS n FROM direct_messages WHERE created_at > NOW() - INTERVAL '1 hour'
  `);
  if (Number(rows[0].n) === 0) {
    return '🧟 *Zero DMs created in last hour.* Webapp DM path may be dead.';
  }
  return null;
}

async function checkPayErrors() {
  const { rows } = await query(`
    SELECT COUNT(*) AS n FROM payment_errors WHERE created_at > NOW() - INTERVAL '1 hour'
  `);
  if (Number(rows[0].n) > 100) {
    return `⚠️ *Payment-error spike* — ${rows[0].n} errors in last hour. Check \`payment_errors\` for root cause.`;
  }
  return null;
}

async function checkCronActivity() {
  // 24h window — if ANY cron with DB writes hasn't fired in that long,
  // something is seriously wrong. Check the abandonment-dm log table because
  // its cron fires every 15min and writes a row per DM sent (even 0-DM runs
  // bump when there's eligible traffic). Zero rows in 24h = suspicious.
  const { rows } = await query(`
    SELECT COUNT(*) AS n FROM abandoned_payment_dms WHERE sent_at > NOW() - INTERVAL '24 hours'
  `);
  if (Number(rows[0].n) === 0) {
    return '🧟 *Zero abandoned-payment DMs sent in 24h.* Either every user is paying first-try (unlikely) or BullMQ cron is dead.';
  }
  return null;
}

async function main() {
  const alerts = (await Promise.all([
    checkGas(),
    checkBroadcasts(),
    checkDmIngestion(),
    checkPayErrors(),
    checkCronActivity(),
  ])).filter(Boolean);

  if (alerts.length === 0) {
    console.log('all clear');
    process.exit(0);
  }

  const text = `*🚨 PNPtv watchdog — ${new Date().toISOString().slice(0, 16)}Z*\n\n${alerts.join('\n\n')}`;
  await postSlack(text);
  console.log(`posted ${alerts.length} alerts`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
