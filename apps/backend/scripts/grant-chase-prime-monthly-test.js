#!/usr/bin/env node
'use strict';

/**
 * One-shot admin grant: give CHASETHECLOUDS (id 8162853364) a qualifying
 * PRIME monthly entitlement so he can execute the 2-hour test plan that
 * exercises free ↔ PRIME rendering + auto-join to hangouts 719 + 785.
 *
 * No sourcePaymentId → PRIME revenue split (Santino/Lex creator_earnings) is
 * skipped. No invoice email fires (sendPostActivationEmails is separate).
 * Chase will receive the normal in-app entitlement-grant notification.
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const PaymentService = require('../services/paymentService');

const USER_ID = '8162853364';
const PLAN_ID = 'monthly-pass';
const SOURCE  = 'admin_test_chase_2026-08-01';

(async () => {
  const result = await PaymentService.grantEntitlementsForPlan(USER_ID, PLAN_ID, SOURCE);
  const ents = await query(
    `SELECT id, add_on_id, is_lifetime, granted_at, expires_at, grant_source
       FROM user_entitlements WHERE user_id = $1 ORDER BY granted_at DESC`,
    [USER_ID]
  );
  const groups = await query(
    `SELECT group_id, role, joined_at FROM hangout_group_members
      WHERE user_id = $1 AND group_id IN (719, 785)`,
    [USER_ID]
  );
  console.log(JSON.stringify({
    grantResult: result,
    entitlements: ents.rows,
    hangoutMemberships: groups.rows,
  }, null, 2));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
