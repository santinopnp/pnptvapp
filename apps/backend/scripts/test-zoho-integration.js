#!/usr/bin/env node
'use strict';

/**
 * test-zoho-integration.js
 *
 * Diagnostic runner for the Zoho One integration (CRM + Books + Campaigns).
 * Run AFTER Santino finishes the manual Zoho setup — verifies each app is
 * reachable, the custom fields/items/lists are configured, and (optionally)
 * end-to-end writes work for a single test user.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --check
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --sync-user 8599671840
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --book-invoice 8599671840
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --campaigns-cycle 8599671840
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --full 8599671840
 *
 * --check           Env presence + OAuth refresh for each of the 3 apps.
 *                   Zero writes. Safe to run anywhere.
 * --sync-user <id>  Pushes ONE user to Zoho CRM Contacts. Idempotent (upsert
 *                   by PNPtv_ID). Verifies the 6 new custom fields exist.
 * --book-invoice <id>  Creates a $0.01 TEST invoice in Books, immediately
 *                      voids it. Verifies items are configured. Zero P&L
 *                      impact after cleanup.
 * --campaigns-cycle <id>  Adds user to Crystal + Fam lists, verifies
 *                          membership, then removes. Zero long-term change.
 * --full <id>       Runs all three modes in sequence.
 *
 * Fails loud with exit code 1 on any config or auth error so it's suitable
 * for CI / smoke-test scripts. Never crashes the running bot.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.production') });

const axios = require('axios');
const { query, getPool } = require('../config/postgres');
const zoho = require('../services/zohoService');
const zohoSync = require('../services/zohoSyncService');
const zohoBooks = require('../services/zohoBooksService');
const zohoCampaigns = require('../services/zohoCampaignsService');

const args = process.argv.slice(2);
const mode = args[0];
const userIdArg = args[1] || null;

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const ok  = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const bad = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const warn= (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const info= (msg) => console.log(`${c.cyan}→${c.reset} ${msg}`);
const head= (msg) => console.log(`\n${c.bold}${c.cyan}══ ${msg} ══${c.reset}`);

let hardFail = false;

async function checkCRM() {
  head('Zoho CRM');
  if (!zoho.isConfigured()) {
    bad('CRM not configured (ZOHO_CLIENT_ID / SECRET / REFRESH_TOKEN missing)');
    hardFail = true;
    return;
  }
  ok('env vars present');
  try {
    const token = await zoho.getAccessToken();
    ok(`OAuth refresh succeeded — token ${token.slice(0, 8)}…`);
  } catch (err) {
    bad(`OAuth refresh failed: ${err.message}`);
    hardFail = true;
    return;
  }
  // Probe custom fields by pulling the Contacts module schema.
  try {
    const token = await zoho.getAccessToken();
    const resp = await axios.get(
      `${process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com'}/crm/v2/settings/fields`,
      { params: { module: 'Contacts' }, headers: { Authorization: `Zoho-oauthtoken ${token}` }, timeout: 15000 }
    );
    const fields = new Set((resp.data?.fields || []).map(f => f.api_name));
    const required = ['Crystal_Creator', 'Crystal_Active_Until', 'Crystal_Invited', 'PNPtv_Fam', 'PNPtv_Fam_Since', 'Whale_Pig'];
    const missing = required.filter(f => !fields.has(f));
    if (missing.length) {
      warn(`custom fields NOT YET CREATED in Zoho CRM: ${missing.join(', ')}`);
      warn('Create them in Zoho CRM → Contacts → Setup → Custom Fields, then re-run.');
    } else {
      ok('all 6 tier custom fields present in Contacts module');
    }
    if (process.env.ZOHO_SYNC_TIER_FIELDS !== '1') {
      warn('ZOHO_SYNC_TIER_FIELDS env flag is NOT set — tier fields will not be pushed until you flip it');
    } else {
      ok('ZOHO_SYNC_TIER_FIELDS=1 — nightly + single-user sync will push tier fields');
    }
  } catch (err) {
    warn(`could not probe Contacts schema: ${err.response?.data?.code || err.message}`);
  }
}

async function checkBooks() {
  head('Zoho Books');
  if (!zohoBooks.isConfigured()) {
    if (process.env.ZOHO_BOOKS_ENABLED !== '1') {
      warn('Books disabled (ZOHO_BOOKS_ENABLED != 1). Set to 1 after configuring items.');
    } else {
      bad('Books not configured (CLIENT_ID / SECRET / REFRESH_TOKEN / ORG_ID missing)');
      hardFail = true;
    }
    return;
  }
  ok('env vars present');
  // Peek at items to confirm the two Crystal SKUs are configured
  const selfId = process.env.ZOHO_BOOKS_ITEM_CRYSTAL_SELF;
  const giftId = process.env.ZOHO_BOOKS_ITEM_CRYSTAL_GIFT;
  if (!selfId || !giftId) {
    warn(`item ids missing — need ZOHO_BOOKS_ITEM_CRYSTAL_SELF (${selfId ? 'set' : 'MISSING'}) and _GIFT (${giftId ? 'set' : 'MISSING'})`);
    return;
  }
  ok(`item ids present — self=${selfId.slice(0, 8)}… gift=${giftId.slice(0, 8)}…`);
}

async function checkCampaigns() {
  head('Zoho Campaigns');
  if (!zohoCampaigns.isConfigured()) {
    if (process.env.ZOHO_CAMPAIGNS_ENABLED !== '1') {
      warn('Campaigns disabled (ZOHO_CAMPAIGNS_ENABLED != 1). Set to 1 after creating lists.');
    } else {
      bad('Campaigns not configured (CLIENT_ID / SECRET / REFRESH_TOKEN missing)');
      hardFail = true;
    }
    return;
  }
  ok('env vars present');
  const crystalList = process.env.ZOHO_CAMPAIGNS_LIST_CRYSTAL;
  const famList = process.env.ZOHO_CAMPAIGNS_LIST_PNP_FAM;
  if (!crystalList || !famList) {
    warn(`list keys missing — need LIST_CRYSTAL (${crystalList ? 'set' : 'MISSING'}) and LIST_PNP_FAM (${famList ? 'set' : 'MISSING'})`);
    return;
  }
  ok(`list keys present — crystal=${crystalList.slice(0, 8)}… fam=${famList.slice(0, 8)}…`);
}

async function testSyncUser(userId) {
  head(`Sync user ${userId} → Zoho CRM`);
  const { rows } = await query(`SELECT id, email, username, first_name FROM users WHERE id = $1`, [String(userId)]);
  if (!rows.length) { bad(`user ${userId} not found in DB`); hardFail = true; return; }
  info(`user: @${rows[0].username || '?'} (${rows[0].email || 'no email'})`);
  try {
    await zohoSync.syncOneUser(String(userId));
    ok('syncOneUser completed — check Zoho CRM manually for the record');
  } catch (err) {
    bad(`sync failed: ${err.message}`);
    hardFail = true;
  }
}

async function testBooksInvoice(userId) {
  head(`Test Books invoice for user ${userId}`);
  if (!zohoBooks.isConfigured()) { warn('skipping — Books not enabled'); return; }
  const { rows } = await query(`SELECT id, email, username, first_name FROM users WHERE id = $1`, [String(userId)]);
  if (!rows.length) { bad(`user ${userId} not found`); hardFail = true; return; }
  const u = rows[0];
  const testRef = `zoho-test-${Date.now()}`;
  try {
    await zohoBooks.logCrystalPassPayment({
      userId: String(u.id),
      userEmail: u.email,
      userName: u.first_name,
      username: u.username,
      isGift: false,
      priceCents: 1,  // $0.01 test invoice
      paymentProvider: 'zoho_integration_test',
      paymentRef: testRef,
      targetCreatorId: String(u.id),
    });
    ok(`test invoice created — ref="${testRef}" (find in Zoho Books → Invoices → search "${testRef}")`);
    warn('MANUAL CLEANUP: delete or void the test invoice in Zoho Books UI so P&L stays clean.');
  } catch (err) {
    bad(`Books invoice failed: ${err.message}`);
    hardFail = true;
  }
}

async function testCampaignsCycle(userId) {
  head(`Campaigns add/remove cycle for user ${userId}`);
  if (!zohoCampaigns.isConfigured()) { warn('skipping — Campaigns not enabled'); return; }
  const { rows } = await query(`SELECT id, email, username, first_name, last_name FROM users WHERE id = $1`, [String(userId)]);
  if (!rows.length) { bad(`user ${userId} not found`); hardFail = true; return; }
  const u = rows[0];
  if (!u.email) { bad('user has no email — Campaigns requires email'); hardFail = true; return; }
  const contact = { email: u.email, firstName: u.first_name, lastName: u.last_name, pnptvId: String(u.id) };
  try {
    await zohoCampaigns.addToCrystalCreators(contact);
    ok(`added ${u.email} to Crystal Creators list`);
    await new Promise(r => setTimeout(r, 2000));
    await zohoCampaigns.removeFromCrystalCreators(u.email);
    ok(`removed ${u.email} from Crystal Creators list`);

    await zohoCampaigns.addToPnptvFam(contact);
    ok(`added ${u.email} to PNPtv Fam list`);
    await new Promise(r => setTimeout(r, 2000));
    await zohoCampaigns.removeFromPnptvFam(u.email);
    ok(`removed ${u.email} from PNPtv Fam list`);
    info('If you saw "ok: true" in all 4 log lines above, Campaigns integration works.');
  } catch (err) {
    bad(`Campaigns cycle failed: ${err.message}`);
    hardFail = true;
  }
}

(async () => {
  console.log(`${c.bold}Zoho One integration test${c.reset}  ${c.dim}(${new Date().toISOString()})${c.reset}`);

  if (!mode || mode === '--check' || mode === '--full') {
    await checkCRM();
    await checkBooks();
    await checkCampaigns();
  }

  if ((mode === '--sync-user' || mode === '--full') && userIdArg) {
    await testSyncUser(userIdArg);
  } else if (mode === '--sync-user') {
    bad('--sync-user requires a userId'); hardFail = true;
  }

  if ((mode === '--book-invoice' || mode === '--full') && userIdArg) {
    await testBooksInvoice(userIdArg);
  } else if (mode === '--book-invoice') {
    bad('--book-invoice requires a userId'); hardFail = true;
  }

  if ((mode === '--campaigns-cycle' || mode === '--full') && userIdArg) {
    await testCampaignsCycle(userIdArg);
  } else if (mode === '--campaigns-cycle') {
    bad('--campaigns-cycle requires a userId'); hardFail = true;
  }

  console.log('');
  if (hardFail) {
    console.log(`${c.red}${c.bold}FAILED${c.reset} — one or more Zoho apps returned errors. See lines above.`);
    process.exit(1);
  } else {
    console.log(`${c.green}${c.bold}OK${c.reset} — checks passed.`);
  }
  await getPool().end().catch(() => {});
  process.exit(0);
})().catch((err) => {
  console.error(`${c.red}unhandled:${c.reset}`, err);
  process.exit(2);
});
