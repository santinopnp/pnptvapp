/**
 * Zoho CRM API client.
 *
 * Handles access-token refresh (in-memory cache) and CRM record upserts keyed
 * by our internal PNPtv_ID custom field. Used by identityVerificationService to
 * push 2257 approval status into the corresponding Contact.
 *
 * Env:
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REFRESH_TOKEN
 *   ZOHO_ACCOUNTS_URL     (optional, default https://accounts.zoho.com)
 *   ZOHO_API_DOMAIN       (optional, default https://www.zohoapis.com)
 */

const axios = require('axios');
const logger = require('../utils/logger');

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const API = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';

let cachedToken = null;
let cachedExpiry = 0;

function isConfigured() {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error('Zoho not configured');
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;

  const resp = await axios.post(
    `${ACCOUNTS}/oauth/v2/token`,
    null,
    {
      params: {
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      },
      timeout: 15000,
    }
  );

  if (!resp.data?.access_token) {
    throw new Error(`Zoho refresh returned no access_token: ${JSON.stringify(resp.data)}`);
  }
  cachedToken = resp.data.access_token;
  cachedExpiry = Date.now() + (resp.data.expires_in || 3600) * 1000;
  return cachedToken;
}

/**
 * Search a module for a record matching a criteria expression.
 * Returns the first match or null.
 *
 * @param {string} module   - e.g. 'Contacts'
 * @param {string} criteria - e.g. "(PNPtv_ID:equals:abc-123)"
 */
async function searchOne(module, criteria) {
  const token = await getAccessToken();
  try {
    const resp = await axios.get(`${API}/crm/v2/${module}/search`, {
      params: { criteria },
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      timeout: 15000,
    });
    return resp.data?.data?.[0] || null;
  } catch (err) {
    if (err.response?.status === 204) return null;
    throw err;
  }
}

/**
 * Create or update a Contact keyed by PNPtv_ID.
 *
 * @param {string} pnptvId
 * @param {Record<string, any>} fields - Zoho api_name → value
 * @returns {Promise<{action: 'created'|'updated', id: string} | null>}
 */
async function upsertContactByPnptvId(pnptvId, fields) {
  if (!isConfigured()) {
    logger.warn('Zoho sync skipped — not configured', { pnptvId });
    return null;
  }
  if (!pnptvId) throw new Error('pnptvId required');

  const token = await getAccessToken();
  const body = { data: [{ PNPtv_ID: pnptvId, ...fields }] };

  const existing = await searchOne('Contacts', `(PNPtv_ID:equals:${pnptvId})`);

  if (existing?.id) {
    const resp = await axios.put(
      `${API}/crm/v2/Contacts/${existing.id}`,
      body,
      { headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const status = resp.data?.data?.[0]?.status;
    if (status !== 'success') {
      throw new Error(`Zoho Contact update failed: ${JSON.stringify(resp.data)}`);
    }
    logger.info('Zoho: Contact updated', { pnptvId, contactId: existing.id, fields: Object.keys(fields) });
    return { action: 'updated', id: existing.id };
  }

  // No existing contact — nothing to update yet. We do NOT create Contacts from
  // 2257 approval alone; Contact creation is handled by the seed-creators sync.
  logger.info('Zoho: no Contact for PNPtv_ID — skipping (seed sync will create)', { pnptvId });
  return null;
}

/**
 * Bulk upsert into a module using Zoho's native upsert endpoint.
 * Keyed by duplicate_check_fields (defaults to PNPtv_ID).
 *
 * Zoho hard-limit: 100 records per call. Caller is responsible for batching.
 *
 * @param {string} module      - e.g. 'Contacts'
 * @param {Array<object>} records
 * @param {string[]} duplicateCheckFields
 * @returns {Promise<Array<{status: string, code?: string, action?: string, details?: any}>>}
 */
async function bulkUpsert(module, records, duplicateCheckFields = ['PNPtv_ID']) {
  if (!isConfigured()) throw new Error('Zoho not configured');
  if (!Array.isArray(records) || records.length === 0) return [];
  if (records.length > 100) throw new Error(`Zoho upsert max 100 records; got ${records.length}`);

  const token = await getAccessToken();
  const body = { data: records, duplicate_check_fields: duplicateCheckFields };

  const resp = await axios.post(
    `${API}/crm/v2/${module}/upsert`,
    body,
    { headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  return resp.data?.data || [];
}

module.exports = { isConfigured, getAccessToken, searchOne, upsertContactByPnptvId, bulkUpsert };
