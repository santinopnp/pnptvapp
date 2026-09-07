'use strict';

/**
 * zohoCampaignsService.js
 *
 * Manages Zoho Campaigns list membership for the Crystal Creator and PNPtv
 * Fam segments. Called from creator activation / cancel / toggle hooks so
 * drips + broadcasts reach the right people automatically.
 *
 * "Whale Pig" is NOT a Campaigns segment — even though Zoho is staff-only,
 * sending emails to Whale Pigs isn't a use-case (they're an audience, not a
 * recipient list). Only Crystal Creators + PNPtv Fam get lists.
 *
 * Fire-and-forget: failures are logged, never thrown. Campaign outages must
 * NEVER block activation or DB writes.
 *
 * Env (all required for enable):
 *   ZOHO_CAMPAIGNS_CLIENT_ID
 *   ZOHO_CAMPAIGNS_CLIENT_SECRET
 *   ZOHO_CAMPAIGNS_REFRESH_TOKEN
 *   ZOHO_CAMPAIGNS_ENABLED=1        — kill switch; defaults to disabled
 *   ZOHO_CAMPAIGNS_LIST_CRYSTAL     — listkey for the Crystal Creators list
 *   ZOHO_CAMPAIGNS_LIST_PNP_FAM     — listkey for the PNPtv Fam list
 *   ZOHO_CAMPAIGNS_LIST_APPLICANTS  — listkey for the Creator Applicants list (added 2026-09-01)
 *   ZOHO_CAMPAIGNS_LIST_REJECTED    — listkey for the Rejected Applicants nurture list (added 2026-09-01)
 *
 * Zoho Campaigns setup Santino needs to do ONCE:
 *   1. Contacts → Manage Lists → New List:
 *      - "Crystal Creators" (active-tier drip audience)
 *      - "PNPtv Fam" (inner-circle drip audience)
 *      - "Creator Applicants" (in-flight application nurture)
 *      - "Rejected Applicants" (post-rejection warm follow-up)
 *   2. Copy each list's listkey (Campaigns → List detail → API section) into env.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
// Correct Zoho Campaigns OAuth endpoint host (2022+ standard). The older
// campaigns.zoho.com/api/... returns HTML/401 with the modern refresh_token
// grant — must use www.zohoapis.com/campaigns/v1.1 (v2.1 also works).
const API = process.env.ZOHO_CAMPAIGNS_API_URL || 'https://www.zohoapis.com/campaigns/v1.1';

let cachedToken = null;
let cachedExpiry = 0;

function isConfigured() {
  return !!(
    process.env.ZOHO_CAMPAIGNS_ENABLED === '1' &&
    process.env.ZOHO_CAMPAIGNS_CLIENT_ID &&
    process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET &&
    process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN
  );
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;
  const resp = await axios.post(`${ACCOUNTS}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_CAMPAIGNS_CLIENT_ID,
      client_secret: process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN,
    },
    timeout: 15000,
  });
  if (!resp.data?.access_token) throw new Error(`Zoho Campaigns refresh returned no token: ${JSON.stringify(resp.data)}`);
  cachedToken = resp.data.access_token;
  cachedExpiry = Date.now() + (resp.data.expires_in || 3600) * 1000;
  return cachedToken;
}

/**
 * Add a subscriber to a list.
 * Zoho Campaigns "listsubscribe" is idempotent — safe to re-call.
 *
 * @param {string} listKey
 * @param {object} contact  — { email, firstName, lastName, pnptvId }
 */
async function _addToList(listKey, contact) {
  const { email, firstName = 'PNPtv', lastName = '', pnptvId } = contact;
  if (!email) return { ok: false, reason: 'no_email' };
  const token = await getAccessToken();
  // Zoho Campaigns wants contactinfo as a JSON string in the form body.
  const contactinfo = JSON.stringify({
    'First Name': firstName,
    'Last Name': lastName || firstName,
    'Contact Email': email,
    'PNPtv_ID': pnptvId,
  });
  try {
    const resp = await axios.post(`${API}/json/listsubscribe`, null, {
      params: {
        resfmt: 'JSON',
        listkey: listKey,
        contactinfo,
        source: 'PNPtv_backend',
      },
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      timeout: 15000,
    });
    // Zoho Campaigns returns:
    //   - JSON { status: 'success' } when the list is Single Opt-In
    //   - HTML confirmation fragment when the list is Double Opt-In (still
    //     200 OK — a confirmation email was sent to the subscriber). Both
    //     are success from our POV (the subscriber will eventually land in
    //     the list). Log ok:true and let ops decide if they want to switch
    //     lists to single opt-in via the Campaigns dashboard.
    const jsonSuccess = resp.data?.status === 'success';
    const htmlOk = typeof resp.data === 'string' && resp.data.includes('campaigns/static');
    return { ok: jsonSuccess || htmlOk, body: resp.data, pendingConfirmation: htmlOk && !jsonSuccess };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

/**
 * Remove a subscriber from a list. Zoho "listunsubscribe" is idempotent.
 */
async function _removeFromList(listKey, email) {
  if (!email) return { ok: false, reason: 'no_email' };
  const token = await getAccessToken();
  try {
    const resp = await axios.post(`${API}/json/listunsubscribe`, null, {
      params: { resfmt: 'JSON', listkey: listKey, contactinfo: JSON.stringify({ 'Contact Email': email }) },
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      timeout: 15000,
    });
    const jsonSuccess = resp.data?.status === 'success';
    const htmlOk = typeof resp.data === 'string' && resp.data.includes('campaigns/static');
    return { ok: jsonSuccess || htmlOk, body: resp.data };
  } catch (err) {
    return { ok: false, error: err.response?.data || err.message };
  }
}

async function addToCrystalCreators(contact) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_CRYSTAL;
  if (!listKey) { logger.warn('[zohoCampaigns] LIST_CRYSTAL env missing'); return; }
  const r = await _addToList(listKey, contact);
  logger.info('[zohoCampaigns] add → Crystal', { email: contact.email, ok: r.ok });
}

async function removeFromCrystalCreators(email) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_CRYSTAL;
  if (!listKey) return;
  const r = await _removeFromList(listKey, email);
  logger.info('[zohoCampaigns] remove ← Crystal', { email, ok: r.ok });
}

async function addToPnptvFam(contact) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_PNP_FAM;
  if (!listKey) { logger.warn('[zohoCampaigns] LIST_PNP_FAM env missing'); return; }
  const r = await _addToList(listKey, contact);
  logger.info('[zohoCampaigns] add → PNPtv Fam', { email: contact.email, ok: r.ok });
}

async function removeFromPnptvFam(email) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_PNP_FAM;
  if (!listKey) return;
  const r = await _removeFromList(listKey, email);
  logger.info('[zohoCampaigns] remove ← PNPtv Fam', { email, ok: r.ok });
}

// ── Creator Applicants (added 2026-09-01) ────────────────────────────────
// Auto-added on Apply.tsx submit + submitEnrollment; auto-removed on
// approve/reject. Feeds a warm nurture drip during the review window.

async function addToCreatorApplicants(contact) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_APPLICANTS;
  if (!listKey) { logger.warn('[zohoCampaigns] LIST_APPLICANTS env missing'); return; }
  const r = await _addToList(listKey, contact);
  logger.info('[zohoCampaigns] add → Creator Applicants', { email: contact.email, ok: r.ok });
}

async function removeFromCreatorApplicants(email) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_APPLICANTS;
  if (!listKey) return;
  const r = await _removeFromList(listKey, email);
  logger.info('[zohoCampaigns] remove ← Creator Applicants', { email, ok: r.ok });
}

// ── Rejected Applicants nurture (added 2026-09-01) ───────────────────────
// Auto-added on rejection so we can send a warm follow-up sequence later
// (never a "you failed" tone — see feedback_never_approach_creators_hostile_tone).

async function addToRejectedApplicants(contact) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_REJECTED;
  if (!listKey) { logger.warn('[zohoCampaigns] LIST_REJECTED env missing'); return; }
  const r = await _addToList(listKey, contact);
  logger.info('[zohoCampaigns] add → Rejected Applicants', { email: contact.email, ok: r.ok });
}

async function removeFromRejectedApplicants(email) {
  if (!isConfigured()) return;
  const listKey = process.env.ZOHO_CAMPAIGNS_LIST_REJECTED;
  if (!listKey) return;
  const r = await _removeFromList(listKey, email);
  logger.info('[zohoCampaigns] remove ← Rejected Applicants', { email, ok: r.ok });
}

module.exports = {
  isConfigured,
  addToCrystalCreators, removeFromCrystalCreators,
  addToPnptvFam, removeFromPnptvFam,
  addToCreatorApplicants, removeFromCreatorApplicants,
  addToRejectedApplicants, removeFromRejectedApplicants,
};
