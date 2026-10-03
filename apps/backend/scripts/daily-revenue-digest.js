#!/usr/bin/env node
'use strict';

/**
 * Daily revenue + health digest. Fires at 08:00 UTC every day via BullMQ cron
 * (or standalone cron via `/etc/cron.d/pnptv-daily-digest`). Posts a Slack
 * message to SLACK_OPS_ADMIN_CHANNEL summarizing yesterday vs 7-day avg
 * so cliffs are caught in 24h instead of 60 days.
 *
 * Covers:
 *   - New signups + consent completion
 *   - PRIME activations / renewals / expiries / new trials
 *   - Revenue by rail (PRIME, lifetime, tips, calls, token packs)
 *   - DAU / WAU
 *   - Broadcast count in last 24h
 *   - Gas-topup treasury balance
 *   - BullMQ cron-jobs queue completion count (watchdog)
 *   - Payment errors last 24h
 *
 * Env requirements: DATABASE_URL + SLACK_BOT_TOKEN + SLACK_OPS_ADMIN_CHANNEL.
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

const fmtUsd = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const pct    = (now, avg) => {
  if (!avg) return avg === now ? '—' : '+∞';
  const d = ((now - avg) / avg) * 100;
  const s = d >= 0 ? '+' : '';
  return `${s}${d.toFixed(0)}%`;
};
const arrow  = (now, avg) => (now > avg * 1.1 ? '📈' : now < avg * 0.9 ? '📉' : '➡️');

async function one(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows[0] || {};
}

async function gasBalance() {
  try {
    const res = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_getBalance',
        params: [GAS_EOA, 'latest'], id: 1,
      }),
    });
    const json = await res.json();
    const wei = BigInt(json.result || '0x0');
    const eth = Number(wei) / 1e18;
    return { eth, usd: eth * 3500, low: eth < 0.005 };
  } catch (err) {
    return { eth: 0, usd: 0, low: true, error: err.message };
  }
}


async function main() {
  const now = new Date();
  console.log(`\n═ daily digest — ${now.toISOString()} ═`);

  // Yesterday = full 24h window ending ~1h ago (so late-night data lands)
  const stats = await one(`
    WITH yd AS (SELECT NOW() - INTERVAL '1 day' AS start, NOW() AS fin),
         pd AS (SELECT NOW() - INTERVAL '8 days' AS start, NOW() - INTERVAL '1 day' AS fin)
    SELECT
      -- Signups
      (SELECT COUNT(*) FROM users
        WHERE created_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)
          AND role != 'banned') AS signups_yd,
      (SELECT COUNT(*) / 7.0 FROM users
        WHERE created_at BETWEEN (SELECT start FROM pd) AND (SELECT fin FROM pd)
          AND role != 'banned') AS signups_7d_avg,
      -- Consent completion of yesterday's signups
      (SELECT COUNT(*) FROM users
        WHERE created_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)
          AND role != 'banned' AND age_verified AND terms_accepted) AS consent_yd,
      -- PRIME activations (new paid, not trial)
      (SELECT COUNT(*) FROM user_entitlements
        WHERE add_on_id='prime'
          AND granted_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)
          AND grant_source != 'trial') AS prime_paid_yd,
      (SELECT COUNT(*) / 7.0 FROM user_entitlements
        WHERE add_on_id='prime'
          AND granted_at BETWEEN (SELECT start FROM pd) AND (SELECT fin FROM pd)
          AND grant_source != 'trial') AS prime_paid_7d_avg,
      -- PRIME trials granted
      (SELECT COUNT(*) FROM user_entitlements
        WHERE add_on_id='prime'
          AND granted_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)
          AND grant_source = 'trial') AS prime_trial_yd,
      -- PRIME expiries
      (SELECT COUNT(*) FROM user_entitlements
        WHERE add_on_id='prime'
          AND expires_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)
          AND NOT is_lifetime) AS prime_expired_yd,
      -- Revenue (payments table, status=completed)
      (SELECT COALESCE(SUM(amount), 0) FROM payments
        WHERE status='completed'
          AND completed_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)) AS revenue_yd,
      (SELECT COALESCE(SUM(amount), 0) / 7.0 FROM payments
        WHERE status='completed'
          AND completed_at BETWEEN (SELECT start FROM pd) AND (SELECT fin FROM pd)) AS revenue_7d_avg,
      -- DAU
      (SELECT COUNT(*) FROM users
        WHERE last_active > NOW() - INTERVAL '24 hours'
          AND role != 'banned') AS dau,
      -- WAU
      (SELECT COUNT(*) FROM users
        WHERE last_active > NOW() - INTERVAL '7 days'
          AND role != 'banned') AS wau,
      -- Broadcasts sent (direct_messages FROM sender_id=8552451957 OR 8599671840 with meta.broadcastId)
      (SELECT COUNT(DISTINCT meta->>'broadcastId') FROM direct_messages
        WHERE created_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)
          AND meta ? 'broadcastId') AS broadcasts_yd,
      -- Payment errors
      (SELECT COUNT(*) FROM payment_errors
        WHERE created_at BETWEEN (SELECT start FROM yd) AND (SELECT fin FROM yd)) AS pay_errors_yd
  `);

  const gas = await gasBalance();

  // Revenue by rail (yesterday)
  const rail = await query(`
    SELECT COALESCE(provider, 'unknown') AS rail,
           COUNT(*) AS tx,
           COALESCE(SUM(amount), 0) AS usd
      FROM payments
     WHERE status='completed'
       AND completed_at > NOW() - INTERVAL '1 day'
     GROUP BY 1 ORDER BY 3 DESC
  `);

  const revArrow = arrow(Number(stats.revenue_yd), Number(stats.revenue_7d_avg));
  const sigArrow = arrow(Number(stats.signups_yd), Number(stats.signups_7d_avg));
  const primeArrow = arrow(Number(stats.prime_paid_yd), Number(stats.prime_paid_7d_avg));

  const consentPct = stats.signups_yd > 0
    ? Math.round(100 * Number(stats.consent_yd) / Number(stats.signups_yd))
    : 0;

  const railLines = rail.rows.length
    ? rail.rows.map(r => `   ${r.rail}: ${r.tx} tx · ${fmtUsd(r.usd)}`).join('\n')
    : '   (none)';

  const flags = [];
  if (Number(stats.revenue_yd) === 0) flags.push('🚨 Zero revenue yesterday');
  if (Number(stats.signups_yd) === 0) flags.push('🚨 Zero signups yesterday');
  if (gas.low) flags.push(`⛽ Gas treasury LOW: ${gas.eth.toFixed(6)} ETH (~${fmtUsd(gas.usd)})`);
  if (Number(stats.broadcasts_yd) === 0) flags.push('📭 No broadcasts fired yesterday');
  if (Number(stats.pay_errors_yd) > 50) flags.push(`⚠️ ${stats.pay_errors_yd} payment errors in 24h`);

  const flagsBlock = flags.length ? '\n*ALERTS*\n' + flags.map(f => `• ${f}`).join('\n') : '';

  const text = `*📊 PNPtv Daily Digest — ${now.toISOString().slice(0, 10)}*
_Yesterday vs 7-day average_
${flagsBlock}

*💰 Revenue* ${revArrow}
   Yesterday: ${fmtUsd(stats.revenue_yd)}  (7d avg ${fmtUsd(stats.revenue_7d_avg)}, ${pct(stats.revenue_yd, stats.revenue_7d_avg)})
_By rail:_
${railLines}

*👤 Signups* ${sigArrow}
   Yesterday: ${fmtInt(stats.signups_yd)}  (7d avg ${Number(stats.signups_7d_avg).toFixed(1)}, ${pct(stats.signups_yd, stats.signups_7d_avg)})
   Consent completion: ${consentPct}%  (${fmtInt(stats.consent_yd)}/${fmtInt(stats.signups_yd)})

*💎 PRIME* ${primeArrow}
   New paid: ${fmtInt(stats.prime_paid_yd)}  (7d avg ${Number(stats.prime_paid_7d_avg).toFixed(1)})
   New trials: ${fmtInt(stats.prime_trial_yd)}
   Expired: ${fmtInt(stats.prime_expired_yd)}

*👥 Activity*
   DAU: ${fmtInt(stats.dau)} · WAU: ${fmtInt(stats.wau)}

*📬 Marketing*
   Broadcast campaigns sent yesterday: ${fmtInt(stats.broadcasts_yd)}

*🔧 Health*
   Gas treasury: ${gas.eth.toFixed(6)} ETH (~${fmtUsd(gas.usd)}) ${gas.low ? '⛽ LOW' : '✅'}
   Payment errors (24h): ${fmtInt(stats.pay_errors_yd)}`;

  if (DRY) {
    console.log('\n── would post to Slack ──\n');
    console.log(text);
    console.log('\n═ dry run end ═\n');
    process.exit(0);
  }

  if (!SLACK_TOKEN || !SLACK_CHANNEL) {
    console.error('Missing SLACK_BOT_TOKEN or SLACK_OPS_ADMIN_CHANNEL — skipping post');
    process.exit(1);
  }

  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SLACK_TOKEN}` },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text, mrkdwn: true }),
  });
  const body = await resp.json();
  if (!body.ok) {
    console.error('Slack post failed:', body);
    process.exit(1);
  }
  console.log(`Posted — ts=${body.ts}`);
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
