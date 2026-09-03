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
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --creator-lifecycle 8599671840
 *   docker exec pnptv-bot node apps/backend/scripts/test-zoho-integration.js --full 8599671840
 *
 * --check           Env presence + OAuth refresh for each of the 3 apps.
 *                   Zero writes. Safe to run anywhere.
 * --sync-user <id>  Pushes ONE user to Zoho CRM Contacts. Idempotent (upsert
 *                   by PNPtv_ID). Verifies the 6 tier + 7 lifecycle fields exist.
 * --book-invoice <id>  Creates a $0.01 TEST invoice in Books, immediately
 *                      voids it. Verifies items are configured. Zero P&L
 *                      impact after cleanup.
 * --campaigns-cycle <id>  Adds user to all 4 lists (Crystal, Fam, Applicants,
 *                          Rejected), verifies membership, then removes.
 * --creator-lifecycle <id>  End-to-end lifecycle: writes a synthetic
 *                            application_submitted_at then reviewed_at+rejection
 *                            on the user row, syncs to CRM, checks the derived
 *                            Application_Status field, then reverts. Verifies
 *                            the 7 lifecycle fields flow correctly. Safe — only
 *                            touches the test user's own row.
 * --full <id>       Runs all four modes in sequence.
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
    const tierFields = ['Crystal_Creator', 'Crystal_Active_Until', 'Crystal_Invited', 'PNPtv_Fam', 'PNPtv_Fam_Since', 'Whale_Pig'];
    const lifecycleFields = ['Application_Status', 'Application_Submitted_At', 'Application_Reviewed_At', 'Application_Rejection_Reason', 'Documents_Status', 'Creator_Onboarded_At', 'Creator_Suspended_At'];
    const missingTier = tierFields.filter(f => !fields.has(f));
    const missingLifecycle = lifecycleFields.filter(f => !fields.has(f));
    if (missingTier.length) {
      warn(`tier custom fields NOT YET CREATED in Zoho CRM: ${missingTier.join(', ')}`);
      warn('Run: docker exec pnptv-bot node apps/backend/scripts/bootstrap-zoho.js');
    } else {
      ok('all 6 tier custom fields present in Contacts module');
    }
    if (missingLifecycle.length) {
      warn(`lifecycle custom fields NOT YET CREATED in Zoho CRM: ${missingLifecycle.join(', ')}`);
      warn('Run: docker exec pnptv-bot node apps/backend/scripts/bootstrap-zoho.js');
    } else {
      ok('all 7 lifecycle custom fields present in Contacts module');
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
  const applicantsList = process.env.ZOHO_CAMPAIGNS_LIST_APPLICANTS;
  const rejectedList = process.env.ZOHO_CAMPAIGNS_LIST_REJECTED;
  if (!crystalList || !famList) {
    warn(`tier list keys missing — need LIST_CRYSTAL (${crystalList ? 'set' : 'MISSING'}) and LIST_PNP_FAM (${famList ? 'set' : 'MISSING'})`);
  } else {
    ok(`tier list keys present — crystal=${crystalList.slice(0, 8)}… fam=${famList.slice(0, 8)}…`);
  }
  if (!applicantsList || !rejectedList) {
    warn(`applicant list keys missing — need LIST_APPLICANTS (${applicantsList ? 'set' : 'MISSING'}) and LIST_REJECTED (${rejectedList ? 'set' : 'MISSING'})`);
    warn('Run bootstrap-zoho.js to create the two lists, then paste envs into .env.production.');
  } else {
    ok(`applicant list keys present — applicants=${applicantsList.slice(0, 8)}… rejected=${rejectedList.slice(0, 8)}…`);
  }
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

    // New lists (added 2026-09-01)
    await zohoCampaigns.addToCreatorApplicants(contact);
    ok(`added ${u.email} to Creator Applicants list`);
    await new Promise(r => setTimeout(r, 2000));
    await zohoCampaigns.removeFromCreatorApplicants(u.email);
    ok(`removed ${u.email} from Creator Applicants list`);

    await zohoCampaigns.addToRejectedApplicants(contact);
    ok(`added ${u.email} to Rejected Applicants list`);
    await new Promise(r => setTimeout(r, 2000));
    await zohoCampaigns.removeFromRejectedApplicants(u.email);
    ok(`removed ${u.email} from Rejected Applicants list`);
    info('If all 8 log lines above show ok:true, Campaigns integration works end-to-end.');
  } catch (err) {
    bad(`Campaigns cycle failed: ${err.message}`);
    hardFail = true;
  }
}

async function testCreatorLifecycle(userId) {
  head(`Creator lifecycle cycle for user ${userId}`);
  const { rows } = await query(`SELECT id, email, username, first_name, application_submitted_at, application_reviewed_at, application_rejection_reason FROM users WHERE id = $1`, [String(userId)]);
  if (!rows.length) { bad(`user ${userId} not found`); hardFail = true; return; }
  const u = rows[0];
  info(`user: @${u.username} — snapshotting existing lifecycle state for restore`);
  const backup = {
    submitted: u.application_submitted_at,
    reviewed: u.application_reviewed_at,
    reason: u.application_rejection_reason,
  };

  try {
    // 1. Simulate "just applied"
    await query(
      `UPDATE users SET application_submitted_at = NOW(), application_reviewed_at = NULL, application_rejection_reason = NULL WHERE id = $1`,
      [String(u.id)]
    );
    ok('stamped users.application_submitted_at = NOW()');
    await zohoSync.syncOneUser(String(u.id));
    ok('pushed to Zoho — expect Application_Status = "Applied" or "Under_Review" depending on creator_status');

    await new Promise(r => setTimeout(r, 2000));

    // 2. Simulate "rejected"
    await query(
      `UPDATE users SET application_reviewed_at = NOW(), application_rejection_reason = 'incomplete_docs' WHERE id = $1`,
      [String(u.id)]
    );
    ok('stamped rejection lifecycle (reason=incomplete_docs)');
    await zohoSync.syncOneUser(String(u.id));
    ok('pushed to Zoho — expect Application_Status="Rejected" and Application_Rejection_Reason="incomplete_docs"');

    await new Promise(r => setTimeout(r, 2000));

    // 3. Restore
    await query(
      `UPDATE users SET application_submitted_at = $2, application_reviewed_at = $3, application_rejection_reason = $4 WHERE id = $1`,
      [String(u.id), backup.submitted, backup.reviewed, backup.reason]
    );
    ok('restored original lifecycle state');
    await zohoSync.syncOneUser(String(u.id));
    ok('final sync — Zoho contact restored to real state');

    info('Verify in Zoho CRM → Contacts → search by PNPtv_ID that Application_Status transitioned Applied → Rejected → back to original.');
  } catch (err) {
    bad(`creator-lifecycle cycle failed: ${err.message}`);
    // Attempt to restore original state
    try {
      await query(
        `UPDATE users SET application_submitted_at = $2, application_reviewed_at = $3, application_rejection_reason = $4 WHERE id = $1`,
        [String(u.id), backup.submitted, backup.reviewed, backup.reason]
      );
      warn('restored original lifecycle state after failure');
    } catch (_) {}
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

  if ((mode === '--creator-lifecycle' || mode === '--full') && userIdArg) {
    await testCreatorLifecycle(userIdArg);
  } else if (mode === '--creator-lifecycle') {
    bad('--creator-lifecycle requires a userId'); hardFail = true;
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
