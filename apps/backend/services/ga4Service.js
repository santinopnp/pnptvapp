'use strict';

const https = require('https');
const { query } = require('../config/postgres');
const logger = require('../utils/logger');

const MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID;
const API_SECRET = process.env.GA4_API_SECRET;
const MP_HOST = 'www.googletagmanager.com';
const MP_PATH = `/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;

function post(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      { hostname: MP_HOST, path: MP_PATH, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); resolve(res.statusCode); }
    );
    req.on('error', (err) => {
      logger.warn('[GA4] Measurement Protocol request failed', { error: err.message });
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

/**
 * Fire a GA4 `purchase` event via Measurement Protocol.
 * Non-fatal — errors are logged but never thrown.
 */
async function trackPurchase({ userId, planId, transactionId, amountUsd, source }) {
  if (!MEASUREMENT_ID || !API_SECRET) return;
  try {
    let value = amountUsd != null ? parseFloat(amountUsd) : null;
    let planName = planId;

    const planRow = await query(
      'SELECT display_name, price FROM plans WHERE id = $1 LIMIT 1',
      [planId]
    ).catch(() => null);

    if (planRow?.rows?.[0]) {
      planName = planRow.rows[0].display_name || planId;
      if (value == null || value === 0) value = parseFloat(planRow.rows[0].price || 0);
    }

    const payload = {
      client_id: String(userId),
      events: [{
        name: 'purchase',
        params: {
          transaction_id: String(transactionId || `${source}_${userId}_${planId}`),
          value: value || 0,
          currency: 'USD',
          affiliation: source || 'pnptv',
          items: [{ item_id: planId, item_name: planName, price: value || 0, quantity: 1 }],
        },
      }],
    };

    const status = await post(payload);
    if (status && status >= 200 && status < 300) {
      logger.info('[GA4] purchase event sent', { userId, planId, value, transactionId, status });
    } else {
      logger.warn('[GA4] purchase event returned unexpected status', { status, userId, planId });
    }
  } catch (err) {
    logger.warn('[GA4] trackPurchase failed (non-fatal)', { userId, planId, error: err.message });
  }
}

module.exports = { trackPurchase };
