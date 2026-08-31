'use strict';

/**
 * zohoBooksService.js
 *
 * Log revenue from Crystal Creator pass activations (self-purchase $100, gift
 * $150) as invoices in Zoho Books. Called from the NowPayments IPN handler
 * and walletCheckoutService fulfillment path once the pass is confirmed.
 *
 * Fire-and-forget: failures are logged, never thrown — a Books outage must
 * NEVER block pass activation or drop the user's receipt.
 *
 * Env (all required for enable):
 *   ZOHO_BOOKS_CLIENT_ID
 *   ZOHO_BOOKS_CLIENT_SECRET
 *   ZOHO_BOOKS_REFRESH_TOKEN
 *   ZOHO_BOOKS_ORG_ID
 *   ZOHO_BOOKS_ENABLED=1     — kill switch; defaults to disabled so no ops
 *                              until Santino confirms the org has the
 *                              PNPtv item + income account configured.
 *
 * Zoho Books setup Santino needs to do ONCE in the org:
 *   1. Items → New → "Crystal Creator Pass — Self ($100)"  → income account "PNPtv Subscriptions"
 *   2. Items → New → "Crystal Creator Pass — Gift ($150)"  → same income account
 *   3. Copy the item IDs into env:
 *      ZOHO_BOOKS_ITEM_CRYSTAL_SELF=<id>
 *      ZOHO_BOOKS_ITEM_CRYSTAL_GIFT=<id>
 */

const axios = require('axios');
const logger = require('../utils/logger');

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
// Zoho Books lives on a separate hostname from CRM (books.zoho.com, not
// zohoapis.com). Region-specific: EU → books.zoho.eu, IN → books.zoho.in, etc.
const API = process.env.ZOHO_BOOKS_API_URL || 'https://www.zohoapis.com/books/v3';

let cachedToken = null;
let cachedExpiry = 0;

function isConfigured() {
  return !!(
    process.env.ZOHO_BOOKS_ENABLED === '1' &&
    process.env.ZOHO_BOOKS_CLIENT_ID &&
    process.env.ZOHO_BOOKS_CLIENT_SECRET &&
    process.env.ZOHO_BOOKS_REFRESH_TOKEN &&
    process.env.ZOHO_BOOKS_ORG_ID
  );
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;
  const resp = await axios.post(`${ACCOUNTS}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_BOOKS_CLIENT_ID,
      client_secret: process.env.ZOHO_BOOKS_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_BOOKS_REFRESH_TOKEN,
    },
    timeout: 15000,
  });
  if (!resp.data?.access_token) throw new Error(`Zoho Books refresh returned no token: ${JSON.stringify(resp.data)}`);
  cachedToken = resp.data.access_token;
  cachedExpiry = Date.now() + (resp.data.expires_in || 3600) * 1000;
  return cachedToken;
}

function _headers(token) {
  return {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
    'X-com-zoho-books-organizationid': process.env.ZOHO_BOOKS_ORG_ID,
  };
}

/**
 * Find (or create) a Books contact for a PNPtv user. Books requires a
 * contact to attach any invoice. Idempotent — searches by reference field
 * (contact_number = PNPtv user id) first.
 *
 * @param {object} user  — { userId, email, firstName, lastName, username }
 * @returns {Promise<string|null>} — Books contact_id, or null on failure
 */
async function _ensureContact({ userId, email, firstName, lastName, username }) {
  const token = await getAccessToken();
  const orgId = process.env.ZOHO_BOOKS_ORG_ID;
  // Use "First (@handle) — PNPtv-<id>" as the unique display name so pre-Books
  // contacts with the same first name don't collide (Books enforces uniqueness
  // on contact_name). PNPtv-<id> is the disambiguator; strip-safe.
  const uniqueSuffix = ` — PNPtv-${String(userId).slice(0, 12)}`;
  const displayName = ((firstName || username || 'PNPtv user') + (username ? ` (@${username})` : '') + uniqueSuffix).slice(0, 200);
  try {
    // 1. Search by contact_number (our natural key)
    const searchByNum = await axios.get(`${API}/contacts`, {
      headers: _headers(token),
      params: { organization_id: orgId, contact_number: String(userId) },
      timeout: 15000,
    });
    const foundByNum = searchByNum.data?.contacts?.[0];
    if (foundByNum?.contact_id) return foundByNum.contact_id;

    // 2. Try to create — most requests hit this path
    try {
      const create = await axios.post(`${API}/contacts`, {
        contact_name: displayName,
        contact_number: String(userId),
        contact_type: 'customer',
        contact_persons: email ? [{
          first_name: firstName || 'PNPtv',
          last_name: lastName || username || 'user',
          email,
          is_primary_contact: true,
        }] : [],
      }, { headers: _headers(token), params: { organization_id: orgId }, timeout: 15000 });
      return create.data?.contact?.contact_id || null;
    } catch (createErr) {
      const code = createErr.response?.data?.code;
      // 3062 = name already exists. Search by name + update contact_number
      // on the existing row so next call short-circuits at step 1.
      if (code !== 3062) throw createErr;
      const searchByName = await axios.get(`${API}/contacts`, {
        headers: _headers(token),
        params: { organization_id: orgId, contact_name_contains: displayName.slice(0, 50) },
        timeout: 15000,
      });
      const matched = (searchByName.data?.contacts || []).find(cn => cn.contact_name === displayName);
      if (!matched?.contact_id) throw createErr;
      // Patch contact_number for future idempotency
      await axios.put(`${API}/contacts/${matched.contact_id}`, {
        contact_number: String(userId),
      }, { headers: _headers(token), params: { organization_id: orgId }, timeout: 15000 }).catch(() => {});
      return matched.contact_id;
    }
  } catch (err) {
    logger.warn('[zohoBooks] contact upsert failed', { userId, error: err.response?.data || err.message });
    return null;
  }
}

/**
 * Log a Crystal Creator pass activation as a paid invoice in Zoho Books.
 * Marks the invoice as paid immediately (money already collected via
 * NowPayments / wallet USDC) so it lands in P&L without manual matching.
 *
 * @param {object} opts
 * @param {string} opts.userId          — pnptv user (the one billed / the gifter)
 * @param {string|null} opts.userEmail
 * @param {string|null} opts.userName
 * @param {string|null} opts.username
 * @param {boolean} opts.isGift
 * @param {number} opts.priceCents
 * @param {string} opts.paymentProvider  — 'nowpayments' | 'wallet_usdc' | 'stripe'
 * @param {string} opts.paymentRef
 * @param {string} opts.targetCreatorId  — for gifts: who received the pass
 */
async function logCrystalPassPayment(opts) {
  if (!isConfigured()) return;
  const {
    userId, userEmail = null, userName = null, username = null,
    isGift, priceCents, paymentProvider, paymentRef, targetCreatorId,
  } = opts;
  try {
    const contactId = await _ensureContact({
      userId, email: userEmail, firstName: userName, lastName: null, username,
    });
    if (!contactId) return;

    const itemId = isGift
      ? process.env.ZOHO_BOOKS_ITEM_CRYSTAL_GIFT
      : process.env.ZOHO_BOOKS_ITEM_CRYSTAL_SELF;
    if (!itemId) {
      logger.warn('[zohoBooks] item id env var missing — invoice skipped', { isGift });
      return;
    }

    const usd = (Number(priceCents) || 0) / 100;
    const token = await getAccessToken();
    const orgId = process.env.ZOHO_BOOKS_ORG_ID;

    // Custom fields are deliberately NOT sent — they'd require pre-created
    // Books custom_fields matching each api_name, and the info fits fine in
    // notes + reference_number. Filing this comment here so future readers
    // don't try to add them back and hit "Uno o más campos personalizados
    // no existen." (error code 120100).
    const invoice = await axios.post(`${API}/invoices`, {
      customer_id: contactId,
      reference_number: paymentRef,
      line_items: [{ item_id: itemId, quantity: 1, rate: usd }],
      notes: isGift
        ? `Crystal Creator gift → target ${targetCreatorId}. Paid via ${paymentProvider}. Ref ${paymentRef}.`
        : `Crystal Creator self-purchase. Paid via ${paymentProvider}. Ref ${paymentRef}.`,
    }, { headers: _headers(token), params: { organization_id: orgId, send: false }, timeout: 20000 });

    const invoiceId = invoice.data?.invoice?.invoice_id;
    if (!invoiceId) {
      logger.warn('[zohoBooks] no invoice_id in response', { paymentRef });
      return;
    }

    // Mark invoice as sent + create matching payment record (paid in full).
    await axios.post(`${API}/invoices/${invoiceId}/status/sent`, {}, {
      headers: _headers(token), params: { organization_id: orgId }, timeout: 15000,
    }).catch(() => { /* non-fatal if already sent */ });

    await axios.post(`${API}/customerpayments`, {
      customer_id: contactId,
      payment_mode: paymentProvider === 'wallet_usdc' ? 'crypto' : paymentProvider,
      amount: usd,
      date: new Date().toISOString().slice(0, 10),
      reference_number: paymentRef,
      invoices: [{ invoice_id: invoiceId, amount_applied: usd }],
    }, { headers: _headers(token), params: { organization_id: orgId }, timeout: 15000 });

    logger.info('[zohoBooks] crystal invoice logged', {
      userId, isGift, priceCents, paymentProvider, paymentRef, invoiceId,
    });
  } catch (err) {
    logger.warn('[zohoBooks] logCrystalPassPayment failed (non-fatal)', {
      paymentRef, error: err.response?.data || err.message,
    });
  }
}

module.exports = { isConfigured, logCrystalPassPayment };
