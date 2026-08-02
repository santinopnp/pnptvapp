#!/usr/bin/env node
'use strict';

/**
 * One-shot: credit $100 worth of creator gift tokens (600 tok each at 6 tok/USD)
 * to DUKEOFDENSITY (user 8706669302) split across Lex and Santino.
 *
 * These tokens land in user_token_wallets.creator_gifts JSONB, scoped per creator.
 * They can only be spent on the named creator's streams/tips.
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../../.env.production'), override: true }); } catch {}

const { query } = require('../config/postgres');
const { creditCreatorGiftTokens } = require('../services/tokenService');

const RECIPIENT      = '8706669302';   // DUKEOFDENSITY (Jeff)
const LEX_USER_ID    = '7246621722';
const SANTINO_USER_ID = '8599671840';
const AMOUNT_PER_CREATOR = 600;        // $100 * 6 tok/USD

(async () => {
  console.log(`Before:`);
  const before = await query(
    `SELECT balance_tokens, gifted_balance, creator_gifts FROM user_token_wallets WHERE user_id = $1`,
    [RECIPIENT]
  );
  console.log(JSON.stringify(before.rows[0] || {}, null, 2));

  const lexOk     = await creditCreatorGiftTokens(RECIPIENT, LEX_USER_ID, AMOUNT_PER_CREATOR);
  const santinoOk = await creditCreatorGiftTokens(RECIPIENT, SANTINO_USER_ID, AMOUNT_PER_CREATOR);

  const after = await query(
    `SELECT balance_tokens, gifted_balance, creator_gifts FROM user_token_wallets WHERE user_id = $1`,
    [RECIPIENT]
  );
  console.log(`\nAfter:`);
  console.log(JSON.stringify(after.rows[0] || {}, null, 2));

  console.log(JSON.stringify({
    recipient: RECIPIENT,
    lex:       { creatorId: LEX_USER_ID,     amount: AMOUNT_PER_CREATOR, ok: lexOk },
    santino:   { creatorId: SANTINO_USER_ID, amount: AMOUNT_PER_CREATOR, ok: santinoOk },
    totalGifted: AMOUNT_PER_CREATOR * 2,
    usdEquivalent: '$100 Lex + $100 Santino',
  }, null, 2));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
