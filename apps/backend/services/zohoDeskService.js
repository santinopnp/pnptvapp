'use strict';

/**
 * zohoDeskService.js
 *
 * Zoho Desk integration for Cristina's support tickets. Runs PARALLEL to
 * slackSupportService — Slack stays the humans' UI, Desk is the system-of-record.
 *
 * Env vars (all required, or the service short-circuits to noop):
 *   ZOHO_DESK_CLIENT_ID
 *   ZOHO_DESK_CLIENT_SECRET
 *   ZOHO_DESK_REFRESH_TOKEN
 *   ZOHO_DESK_ORG_ID
 *   ZOHO_DESK_DEPARTMENT_ID
 *
 * All calls are best-effort — never throw, never block user responses.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const ACCOUNTS = process.env.ZOHO_DESK_ACCOUNTS_URL || 'https://accounts.zoho.com';
const API      = process.env.ZOHO_DESK_API_URL || 'https://desk.zoho.com/api/v1';

let _cachedToken = null;
let _cachedExpiry = 0;

function isConfigured() {
  return !!(
    process.env.ZOHO_DESK_CLIENT_ID &&
    process.env.ZOHO_DESK_CLIENT_SECRET &&
    process.env.ZOHO_DESK_REFRESH_TOKEN &&
    process.env.ZOHO_DESK_ORG_ID &&
    process.env.ZOHO_DESK_DEPARTMENT_ID
  );
}

async function getAccessToken() {
  if (_cachedToken && Date.now() < _cachedExpiry) return _cachedToken;
  const r = await axios.post(`${ACCOUNTS}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_DESK_CLIENT_ID,
      client_secret: process.env.ZOHO_DESK_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_DESK_REFRESH_TOKEN,
    },
    timeout: 8000,
  });
  _cachedToken = r.data.access_token;
  _cachedExpiry = Date.now() + (r.data.expires_in - 60) * 1000;
  return _cachedToken;
}

function _headers(token) {
  return {
    Authorization: `Zoho-oauthtoken ${token}`,
    orgId: process.env.ZOHO_DESK_ORG_ID,
    'Content-Type': 'application/json',
  };
}

/**
 * Find or create a Desk contact for the given user. Returns Desk contact id.
 * @param {{email?:string, firstName?:string, lastName?:string, phone?:string, pnptvId:string}} user
 */
async function upsertContact(user) {
  const token = await getAccessToken();
  // Search by email first (only reliable dedup key)
  if (user.email) {
    const s = await axios.get(`${API}/contacts/search`, {
      headers: _headers(token),
      params: { email: user.email },
      timeout: 8000,
    }).catch(() => null);
    if (s?.data?.data?.[0]?.id) return s.data.data[0].id;
  }
  // Create
  const c = await axios.post(`${API}/contacts`, {
    firstName: (user.firstName || '').slice(0, 40) || 'PNPtv',
    lastName:  (user.lastName || user.pnptvId || 'Member').slice(0, 80),
    email:     user.email || undefined,
    phone:     user.phone || undefined,
    cf: { cf_pnptv_id: String(user.pnptvId) },
  }, { headers: _headers(token), timeout: 8000 });
  return c.data.id;
}

/**
 * Create a Desk ticket.
 * @param {object} params
 * @param {string} params.contactId — Desk contact id (from upsertContact)
 * @param {string} params.subject
 * @param {string} params.description — first message body (plain text)
 * @param {'Low'|'Medium'|'High'|'Urgent'} [params.priority='Medium']
 * @param {string} [params.category]
 * @param {string} [params.channel='Web']
 * @param {'es'|'en'} [params.language]
 * @returns {Promise<string>} — Desk ticket id
 */
async function createTicket(params) {
  const token = await getAccessToken();
  const priorityMap = { critical: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
  const body = {
    subject: (params.subject || 'PNPtv support').slice(0, 250),
    description: params.description || '',
    departmentId: process.env.ZOHO_DESK_DEPARTMENT_ID,
    contactId: params.contactId,
    priority: priorityMap[params.priority] || params.priority || 'Medium',
    channel: params.channel || 'Web',
    category: params.category || undefined,
    language: params.language === 'es' ? 'Spanish' : 'English',
    status: 'Open',
  };
  const r = await axios.post(`${API}/tickets`, body, { headers: _headers(token), timeout: 10000 });
  return r.data.id;
}

/**
 * Add a public comment (thread reply) to a Desk ticket.
 * @param {string} deskTicketId
 * @param {string} content — plain text
 * @param {'user'|'agent'} sender
 */
async function addComment(deskTicketId, content, sender = 'agent') {
  const token = await getAccessToken();
  await axios.post(`${API}/tickets/${deskTicketId}/comments`, {
    content: String(content || ''),
    contentType: 'plainText',
    isPublic: true,
  }, { headers: _headers(token), timeout: 8000 });
}

/**
 * Update ticket status. Zoho Desk default statuses: Open, On Hold, Escalated, Closed.
 * @param {string} deskTicketId
 * @param {'open'|'resolved'|'closed'|'on_hold'} status
 */
async function updateStatus(deskTicketId, status) {
  const token = await getAccessToken();
  const map = { open: 'Open', resolved: 'Closed', closed: 'Closed', on_hold: 'On Hold' };
  const deskStatus = map[status] || status;
  await axios.patch(`${API}/tickets/${deskTicketId}`, {
    status: deskStatus,
  }, { headers: _headers(token), timeout: 8000 });
}

module.exports = {
  isConfigured,
  getAccessToken,
  upsertContact,
  createTicket,
  addComment,
  updateStatus,
};
