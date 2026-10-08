'use strict';
const https = require('https');
const { Pool } = require('/app/node_modules/pg');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CAMPAIGN  = 'creator-calls-setup-20261008';
const DELAY_MS  = 1200;
const REQ_TIMEOUT = 15000;

if (!BOT_TOKEN) { console.error('BOT_TOKEN missing'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

function tgPost(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + BOT_TOKEN + '/' + method,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: REQ_TIMEOUT,
    }, res => {
      let b = ''; res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ ok: false }); } });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('req_timeout')); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

const MESSAGE = `\u{1F3AC} <b>You’re set up for private video calls on PNPtv!</b>

Your call rate is now <b>$80/hr</b>. A few things to know:

1. <b>To receive calls, be online on the Main Stage.</b> Members can only book you when you’re live there.
2. <b>Earnings are paid out 24 hours after each call</b> — this window lets us confirm the session was completed to everyone’s satisfaction.

Questions? Reply here or reach us at support@pnptv.app
— PNPtv! Team`;

async function main() {
  const me = await tgPost('getMe', {});
  if (!me.ok) { console.error('Bad token:', me.description); process.exit(1); }
  console.log('Bot:', me.result.username);

  const { rows } = await pool.query(`
    SELECT u.id, u.telegram, u.username
    FROM performers p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'active'
      AND u.telegram IS NOT NULL
      AND u.deleted_at IS NULL
    ORDER BY u.username
  `);
  console.log('Eligible creators:', rows.length);

  // Load already-sent from dedup
  const { rows: deduped } = await pool.query(
    `SELECT user_id FROM broadcast_dedup WHERE batch_id = $1`,
    [CAMPAIGN]
  );
  const alreadySent = new Set(deduped.map(r => r.user_id));
  console.log('Already sent (skip):', alreadySent.size);

  let sent = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    if (alreadySent.has(row.id)) { skipped++; continue; }

    try {
      const r = await tgPost('sendMessage', {
        chat_id: row.telegram,
        text: MESSAGE,
        parse_mode: 'HTML',
      });

      if (r.ok) {
        sent++;
        await pool.query(
          `INSERT INTO broadcast_dedup (batch_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [CAMPAIGN, row.id]
        );
        console.log('OK  @' + (row.username || row.telegram));
      } else {
        failed++;
        console.log('ERR @' + (row.username || row.telegram) + ' — ' + (r.description || 'unknown'));
      }
    } catch (e) {
      failed++;
      console.log('EXC @' + (row.username || row.telegram) + ' — ' + e.message);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\nDONE  sent=' + sent + '  skipped=' + skipped + '  failed=' + failed + '  total=' + rows.length);
  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
