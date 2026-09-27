'use strict';

/**
 * Nightly reconciler for DB ↔ Privy wallet address drift.
 *
 * Scans every user with a privy_id, asks Privy for the current linked wallets,
 * and detects one of three states:
 *   - synced:   DB address is in Privy's set → no-op
 *   - drifted:  DB address is missing from Privy's set (Privy rotated the
 *               wallet, our COALESCE write-once bug missed the change) → auto-fix
 *   - orphaned: Privy returns 404 for the privy_id → alert only (no auto-fix,
 *               human must decide whether to unlink or re-provision)
 *
 * Auto-fixes are recorded in wallet_changes with source='reconciler' so we
 * always have an audit trail of who changed what and when.
 */

const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const https = require('https');

const APP_ID = () => process.env.PRIVY_APP_ID;
const APP_SECRET = () => process.env.PRIVY_APP_SECRET;

function _priv(hostname, path) {
  const auth = Buffer.from(`${APP_ID()}:${APP_SECRET()}`).toString('base64');
  return new Promise((resolve) => {
    const req = https.request({
      hostname, path, method: 'GET',
      headers: { Authorization: `Basic ${auth}`, 'privy-app-id': APP_ID(), 'Content-Type': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: null }); } });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.end();
  });
}

function _walletsOf(privyUser) {
  const linked = (privyUser && privyUser.linked_accounts) || [];
  return linked
    .filter(a => a && a.type === 'wallet' && a.address)
    .map(a => String(a.address).toLowerCase());
}

async function _postSlack(text) {
  const channel = process.env.SLACK_OPS_ADMIN_ALERTS_CHANNEL || process.env.SLACK_OPS_ALERTS_CHANNEL;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!channel || !token) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text }),
    });
  } catch { /* non-fatal */ }
}

/**
 * Run one reconciliation pass over every DB user with a privy_id.
 * @returns {Promise<{scanned:number, synced:number, drifted:number, orphaned:number, errors:number}>}
 */
async function reconcile() {
  if (!APP_ID() || !APP_SECRET()) {
    logger.warn('[wallet-reconciler] PRIVY_APP_ID / PRIVY_APP_SECRET not configured — skipping');
    return { scanned: 0, synced: 0, drifted: 0, orphaned: 0, errors: 0 };
  }

  const { rows } = await query(`
    SELECT id, username, privy_id, wallet_address
      FROM users
     WHERE privy_id IS NOT NULL
       AND (is_deleted IS NULL OR is_deleted = false)
  `);

  const stats = { scanned: 0, synced: 0, drifted: 0, orphaned: 0, errors: 0 };
  const drifted = [];
  const orphaned = [];

  for (const u of rows) {
    stats.scanned++;
    const { status, body } = await _priv('auth.privy.io', `/api/v1/users/${encodeURIComponent(u.privy_id)}`);
    await new Promise(r => setTimeout(r, 120));

    if (status === 404 || (status === 200 && !body)) {
      stats.orphaned++;
      orphaned.push(u);
      continue;
    }
    if (status !== 200 || !body) {
      stats.errors++;
      continue;
    }

    const privyWallets = _walletsOf(body);
    const dbAddr = (u.wallet_address || '').toLowerCase();

    if (!dbAddr && privyWallets.length > 0) {
      const newAddr = privyWallets[0];
      await query(
        `UPDATE users SET wallet_address = $1, wallet_linked_at = COALESCE(wallet_linked_at, NOW()) WHERE id = $2`,
        [newAddr, u.id],
      );
      await query(
        `INSERT INTO wallet_changes (user_id, old_wallet_address, new_wallet_address, old_privy_id, new_privy_id, source)
         VALUES ($1, NULL, $2, $3, $3, 'reconciler')`,
        [String(u.id), newAddr, u.privy_id],
      );
      stats.drifted++;
      drifted.push({ u, oldAddr: null, newAddr });
      continue;
    }

    if (privyWallets.length === 0) {
      // DB has an address, Privy has none — do NOT overwrite; log for review
      if (dbAddr) {
        stats.errors++;
        logger.warn('[wallet-reconciler] DB has wallet, Privy has none', { userId: u.id, privyId: u.privy_id, dbAddr });
      }
      continue;
    }

    if (!privyWallets.includes(dbAddr)) {
      // Real drift — Privy rotated to a wallet we're not tracking
      const newAddr = privyWallets[0];
      await query(
        `UPDATE users
            SET wallet_address = $1,
                previous_wallet_address = $2,
                wallet_linked_at = NOW()
          WHERE id = $3`,
        [newAddr, dbAddr, u.id],
      );
      await query(
        `INSERT INTO wallet_changes (user_id, old_wallet_address, new_wallet_address, old_privy_id, new_privy_id, source)
         VALUES ($1, $2, $3, $4, $4, 'reconciler')`,
        [String(u.id), dbAddr, newAddr, u.privy_id],
      );
      stats.drifted++;
      drifted.push({ u, oldAddr: dbAddr, newAddr });
    } else {
      stats.synced++;
    }
  }

  if (drifted.length > 0 || orphaned.length > 0) {
    const lines = [`🔁 *Wallet reconciler* — ${stats.scanned} scanned, ${stats.synced} synced, ${stats.drifted} drifted, ${stats.orphaned} orphaned`];
    for (const d of drifted.slice(0, 20)) {
      lines.push(`  • drift @${d.u.username || d.u.id}: \`${d.oldAddr || '—'}\` → \`${d.newAddr}\``);
    }
    for (const o of orphaned.slice(0, 20)) {
      lines.push(`  • orphan @${o.username || o.id}: privy_id \`${o.privy_id}\` returns 404`);
    }
    await _postSlack(lines.join('\n'));
  }

  logger.info('[wallet-reconciler] done', stats);
  return stats;
}

module.exports = { reconcile };
