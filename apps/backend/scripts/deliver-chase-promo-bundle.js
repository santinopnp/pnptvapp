'use strict';

const { query } = require('../config/postgres');
const sendSystemDM = require('../services/sendSystemDM');

const SENDER_ID = '8552451957'; // @pnptv / PNPtv! News
const CHASE_ID = '8162853364';
const ACTIVE_INVOICE_URL = 'https://nowpayments.io/payment?iid=4906018769';
const CANCELLED_DSO_ID = 64516; // the older duplicate

const MESSAGE = `Hey Chase — special offer just for you.

Pay **$40 in Bitcoin** → get **$50 worth of tokens** dropped in your wallet the moment the payment confirms. That's a free +25% on top of the base rate, and it stacks with anything you already have.

Pay here:
${ACTIVE_INVOICE_URL}

Any BTC wallet works. Send exactly what NowPayments shows on the page and your wallet credits automatically. Reply if you hit any snag.`;

(async () => {
  try {
    console.log('[deliver-chase] Cancelling duplicate DSO', CANCELLED_DSO_ID);
    const cancel = await query(
      `UPDATE dash_subscription_orders
         SET status = 'invalid',
             notes = COALESCE(notes || E'\n', '') || 'Duplicate — superseded by DSO 64518 (invoice 4906018769). Marked invalid 2026-08-01 by deliver-chase-promo-bundle script.'
       WHERE id = $1 AND status = 'pending'
       RETURNING id, status`,
      [CANCELLED_DSO_ID]
    );
    console.log('[deliver-chase] cancelled:', cancel.rows[0] || 'no-op (already non-pending)');

    console.log('[deliver-chase] Sending DM to', CHASE_ID);
    await sendSystemDM(SENDER_ID, CHASE_ID, MESSAGE, query);
    console.log('[deliver-chase] DM sent ✔');

    process.exit(0);
  } catch (err) {
    console.error('[deliver-chase] FAILED', err);
    process.exit(1);
  }
})();
