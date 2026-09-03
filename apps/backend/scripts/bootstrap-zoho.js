#!/usr/bin/env node
'use strict';

/**
 * bootstrap-zoho.js
 *
 * Idempotently creates ALL the Zoho pieces required by the crystal / fam /
 * whale-pig sync (feat/zoho commit 093b821b):
 *
 *   Zoho CRM      → 6 custom fields on Contacts + "crystal_creator" picklist option
 *   Zoho Books    → 2 items (Crystal Creator Pass — Self / Gift)
 *   Zoho Campaigns → 2 lists (Crystal Creators / PNPtv Fam)
 *
 * Prints the resulting IDs so they can be pasted into .env.production. If a
 * given piece already exists (matched by name / api_name), skips it and
 * reports the existing ID.
 *
 * Runs against production credentials — safe because all operations are
 * additive and re-runs are no-ops. Never DROPs anything.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/bootstrap-zoho.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.production') });

const axios = require('axios');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const ok   = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const bad  = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}→${c.reset} ${msg}`);
const head = (msg) => console.log(`\n${c.bold}${c.cyan}══ ${msg} ══${c.reset}`);

const CRM_ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const CRM_API = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
const BOOKS_API = process.env.ZOHO_BOOKS_API_URL || 'https://www.zohoapis.com/books/v3';
const CAMPAIGNS_API = process.env.ZOHO_CAMPAIGNS_API_URL || 'https://campaigns.zoho.com/api/v1.1';

async function refreshToken({ clientId, clientSecret, refreshToken }) {
  const resp = await axios.post(`${CRM_ACCOUNTS}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
    timeout: 15000,
  });
  if (!resp.data?.access_token) throw new Error(`OAuth refresh: ${JSON.stringify(resp.data)}`);
  return resp.data.access_token;
}

// ── CRM: create custom fields on Contacts ──────────────────────────────────
async function bootstrapCRM() {
  head('Zoho CRM — Contacts custom fields');
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    bad('CRM env vars missing');
    return { ok: false };
  }
  let token;
  try {
    token = await refreshToken({
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN,
    });
    ok(`OAuth refreshed`);
  } catch (err) {
    bad(`OAuth failed: ${err.response?.data?.error || err.message}`);
    return { ok: false };
  }

  // Fetch existing fields to know which ones to skip
  let existing;
  try {
    const resp = await axios.get(`${CRM_API}/crm/v2/settings/fields`, {
      params: { module: 'Contacts' },
      headers: { Authorization: `Zoho-oauthtoken ${token}` }, timeout: 15000,
    });
    existing = new Set((resp.data?.fields || []).map(f => f.api_name));
    info(`existing Contacts fields: ${existing.size}`);
  } catch (err) {
    bad(`could not list existing fields: ${err.response?.data?.code || err.message}`);
    return { ok: false };
  }

  const targets = [
    { field_label: 'Crystal Creator',      api_name: 'Crystal_Creator',      data_type: 'boolean' },
    { field_label: 'Crystal Active Until', api_name: 'Crystal_Active_Until', data_type: 'date' },
    { field_label: 'Crystal Invited',      api_name: 'Crystal_Invited',      data_type: 'boolean' },
    { field_label: 'PNPtv Fam',            api_name: 'PNPtv_Fam',            data_type: 'boolean' },
    { field_label: 'PNPtv Fam Since',      api_name: 'PNPtv_Fam_Since',      data_type: 'datetime' },
    { field_label: 'Whale Pig',            api_name: 'Whale_Pig',            data_type: 'boolean' },
    // Creator application lifecycle (added 2026-09-01) — 7 fields.
    { field_label: 'Application Status',           api_name: 'Application_Status',           data_type: 'picklist',
      pick_list_values: [
        { display_value: 'Not_Applied',   actual_value: 'Not_Applied' },
        { display_value: 'Applied',       actual_value: 'Applied' },
        { display_value: 'Under_Review',  actual_value: 'Under_Review' },
        { display_value: 'Approved',      actual_value: 'Approved' },
        { display_value: 'Rejected',      actual_value: 'Rejected' },
        { display_value: 'Suspended',     actual_value: 'Suspended' },
      ] },
    { field_label: 'Application Submitted At', api_name: 'Application_Submitted_At', data_type: 'datetime' },
    { field_label: 'Application Reviewed At',  api_name: 'Application_Reviewed_At',  data_type: 'datetime' },
    { field_label: 'Application Rejection Reason', api_name: 'Application_Rejection_Reason', data_type: 'picklist',
      pick_list_values: [
        { display_value: 'identity_issue',            actual_value: 'identity_issue' },
        { display_value: 'underage_docs',             actual_value: 'underage_docs' },
        { display_value: 'duplicate_account',         actual_value: 'duplicate_account' },
        { display_value: 'off_platform_solicitation', actual_value: 'off_platform_solicitation' },
        { display_value: 'incomplete_docs',           actual_value: 'incomplete_docs' },
        { display_value: 'other',                     actual_value: 'other' },
      ] },
    { field_label: 'Documents Status', api_name: 'Documents_Status', data_type: 'picklist',
      pick_list_values: [
        { display_value: 'Missing',  actual_value: 'Missing' },
        { display_value: 'Pending',  actual_value: 'Pending' },
        { display_value: 'Approved', actual_value: 'Approved' },
        { display_value: 'Rejected', actual_value: 'Rejected' },
      ] },
    { field_label: 'Creator Onboarded At', api_name: 'Creator_Onboarded_At', data_type: 'datetime' },
    { field_label: 'Creator Suspended At', api_name: 'Creator_Suspended_At', data_type: 'datetime' },
  ];

  let created = 0, skipped = 0, failed = 0;
  for (const f of targets) {
    if (existing.has(f.api_name)) {
      info(`${f.api_name} already exists — skipping`);
      skipped++;
      continue;
    }
    try {
      // Zoho v5 supports POST /settings/fields; v2 requires the "layouts" API.
      // Try v5 first; fall back if not enabled.
      const fieldPayload = {
        api_name: f.api_name,
        field_label: f.field_label,
        data_type: f.data_type,
      };
      if (f.pick_list_values) fieldPayload.pick_list_values = f.pick_list_values;
      const body = { fields: [fieldPayload] };
      const resp = await axios.post(
        `${CRM_API}/crm/v5/settings/fields`,
        body,
        {
          params: { module: 'Contacts' },
          headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          timeout: 20000,
        }
      );
      const status = resp.data?.fields?.[0]?.status;
      if (status === 'success') {
        ok(`created ${f.api_name}`);
        created++;
      } else {
        bad(`${f.api_name}: ${JSON.stringify(resp.data?.fields?.[0] || resp.data).slice(0, 200)}`);
        failed++;
      }
    } catch (err) {
      const body = err.response?.data;
      // Detect "insufficient scope" or "no permission" — likely means the
      // OAuth token wasn't authorized with ZohoCRM.settings.fields.CREATE.
      const errCode = body?.code || body?.error || err.message;
      if (errCode === 'INVALID_TOKEN' || errCode === 'NO_PERMISSION' || errCode === 'OAUTH_SCOPE_MISMATCH') {
        bad(`${f.api_name}: SCOPE ISSUE — ${errCode}`);
        warn('Your OAuth token lacks ZohoCRM.settings.fields.CREATE scope.');
        warn('Fix: regenerate the token via Zoho API Console with fields.CREATE + fields.READ + Modules.ALL added.');
        failed++;
      } else {
        bad(`${f.api_name}: ${JSON.stringify(body).slice(0, 200)}`);
        failed++;
      }
    }
  }
  console.log(`  ${c.dim}created ${created}, skipped ${skipped}, failed ${failed}${c.reset}`);
  return { ok: failed === 0, created, skipped, failed };
}

// ── Books: create 2 items ──────────────────────────────────────────────────
async function bootstrapBooks() {
  head('Zoho Books — items');
  if (!process.env.ZOHO_BOOKS_CLIENT_ID || !process.env.ZOHO_BOOKS_REFRESH_TOKEN || !process.env.ZOHO_BOOKS_ORG_ID) {
    bad('Books env vars missing');
    return { ok: false };
  }
  let token;
  try {
    token = await refreshToken({
      clientId: process.env.ZOHO_BOOKS_CLIENT_ID,
      clientSecret: process.env.ZOHO_BOOKS_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_BOOKS_REFRESH_TOKEN,
    });
    ok(`OAuth refreshed`);
  } catch (err) {
    bad(`OAuth failed: ${err.response?.data?.error || err.message}`);
    return { ok: false };
  }
  const orgId = process.env.ZOHO_BOOKS_ORG_ID;
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
    'X-com-zoho-books-organizationid': orgId,
  };

  const targets = [
    { name: 'Crystal Creator Pass — Self', rate: 100, envKey: 'ZOHO_BOOKS_ITEM_CRYSTAL_SELF' },
    { name: 'Crystal Creator Pass — Gift', rate: 150, envKey: 'ZOHO_BOOKS_ITEM_CRYSTAL_GIFT' },
  ];

  const results = {};
  for (const t of targets) {
    // Search first (idempotency)
    try {
      const search = await axios.get(`${BOOKS_API}/items`, {
        headers, params: { organization_id: orgId, name: t.name }, timeout: 15000,
      });
      const found = (search.data?.items || []).find(i => i.name === t.name);
      if (found) {
        info(`"${t.name}" exists → id=${found.item_id}`);
        results[t.envKey] = found.item_id;
        continue;
      }
    } catch (err) {
      warn(`search "${t.name}" failed (will still try create): ${err.response?.data?.message || err.message}`);
    }
    // Create
    try {
      const resp = await axios.post(`${BOOKS_API}/items`, {
        name: t.name,
        rate: t.rate,
        product_type: 'service',
        description: `Crystal Creator Pass (${t.name.includes('Self') ? 'self-purchase' : 'gift'}) — 30 days.`,
      }, { headers, params: { organization_id: orgId }, timeout: 20000 });
      const item = resp.data?.item;
      if (item?.item_id) {
        ok(`created "${t.name}" → id=${item.item_id}`);
        results[t.envKey] = item.item_id;
      } else {
        bad(`"${t.name}" — no item_id in response: ${JSON.stringify(resp.data).slice(0, 200)}`);
      }
    } catch (err) {
      bad(`"${t.name}" create failed: ${JSON.stringify(err.response?.data).slice(0, 200)}`);
    }
  }
  return { ok: Object.keys(results).length === targets.length, results };
}

// ── Campaigns: create 2 lists ──────────────────────────────────────────────
async function bootstrapCampaigns() {
  head('Zoho Campaigns — lists');
  if (!process.env.ZOHO_CAMPAIGNS_CLIENT_ID || !process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN) {
    bad('Campaigns env vars missing');
    return { ok: false };
  }
  let token;
  try {
    token = await refreshToken({
      clientId: process.env.ZOHO_CAMPAIGNS_CLIENT_ID,
      clientSecret: process.env.ZOHO_CAMPAIGNS_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_CAMPAIGNS_REFRESH_TOKEN,
    });
    ok(`OAuth refreshed`);
  } catch (err) {
    bad(`OAuth failed: ${err.response?.data?.error || err.message}`);
    return { ok: false };
  }

  const targets = [
    { listname: 'Crystal Creators',     envKey: 'ZOHO_CAMPAIGNS_LIST_CRYSTAL' },
    { listname: 'PNPtv Fam',            envKey: 'ZOHO_CAMPAIGNS_LIST_PNP_FAM' },
    // Creator application funnel lists (added 2026-09-01)
    { listname: 'Creator Applicants',   envKey: 'ZOHO_CAMPAIGNS_LIST_APPLICANTS' },
    { listname: 'Rejected Applicants',  envKey: 'ZOHO_CAMPAIGNS_LIST_REJECTED' },
  ];

  // Fetch existing lists first (getmailinglists returns all)
  let existing = new Map();
  try {
    const resp = await axios.get(`${CAMPAIGNS_API}/getmailinglists`, {
      params: { resfmt: 'JSON', range: 200 },
      headers: { Authorization: `Zoho-oauthtoken ${token}` }, timeout: 15000,
    });
    const lists = resp.data?.list_of_details || resp.data?.mailinglist || [];
    for (const l of lists) {
      const name = l.listname || l.mailinglist_name;
      const key = l.listkey || l.mailinglistkey;
      if (name && key) existing.set(name, key);
    }
    info(`existing lists: ${existing.size}`);
  } catch (err) {
    warn(`could not list existing lists: ${err.response?.data?.message || err.message}`);
  }

  const results = {};
  for (const t of targets) {
    if (existing.has(t.listname)) {
      info(`"${t.listname}" exists → listkey=${existing.get(t.listname)}`);
      results[t.envKey] = existing.get(t.listname);
      continue;
    }
    // Create — Zoho Campaigns has POST /addlistandcontacts but simpler is /createmailinglist
    try {
      const resp = await axios.post(`${CAMPAIGNS_API}/createmailinglist`, null, {
        params: {
          resfmt: 'JSON',
          listname: t.listname,
          signupform: 'private',
          mode: 'newlist',
        },
        headers: { Authorization: `Zoho-oauthtoken ${token}` }, timeout: 20000,
      });
      const listkey = resp.data?.listkey || resp.data?.list_key || resp.data?.mailinglistkey;
      if (listkey) {
        ok(`created "${t.listname}" → listkey=${listkey}`);
        results[t.envKey] = listkey;
      } else {
        bad(`"${t.listname}" — no listkey in response: ${JSON.stringify(resp.data).slice(0, 200)}`);
      }
    } catch (err) {
      bad(`"${t.listname}" create failed: ${JSON.stringify(err.response?.data).slice(0, 200)}`);
    }
  }
  return { ok: Object.keys(results).length === targets.length, results };
}

(async () => {
  console.log(`${c.bold}Zoho One bootstrap${c.reset}  ${c.dim}(${new Date().toISOString()})${c.reset}`);
  const crmRes = await bootstrapCRM();
  const booksRes = await bootstrapBooks();
  const campaignsRes = await bootstrapCampaigns();

  head('Env vars to paste into .env.production');
  const envLines = [];
  // 6 tier fields + 7 lifecycle fields = 13 total on Contacts.
  if (crmRes.ok || (crmRes.skipped + crmRes.created) === 13) envLines.push('ZOHO_SYNC_TIER_FIELDS=1');
  if (booksRes.ok) {
    envLines.push('ZOHO_BOOKS_ENABLED=1');
    Object.entries(booksRes.results || {}).forEach(([k, v]) => envLines.push(`${k}=${v}`));
  }
  if (campaignsRes.ok) {
    envLines.push('ZOHO_CAMPAIGNS_ENABLED=1');
    Object.entries(campaignsRes.results || {}).forEach(([k, v]) => envLines.push(`${k}=${v}`));
  }
  if (envLines.length === 0) {
    warn('nothing to add — either everything failed or nothing was created');
  } else {
    envLines.forEach(l => console.log(`  ${l}`));
  }

  const hardFail = !crmRes.ok || !booksRes.ok || !campaignsRes.ok;
  process.exit(hardFail ? 1 : 0);
})().catch((err) => {
  console.error(`${c.red}unhandled:${c.reset}`, err);
  process.exit(2);
});
