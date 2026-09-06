'use strict';

// Testing-team checklist runner. Scope + tester come from the URL:
//   ?scope=live|member|admin&tester=<display>&pnptv=<pnptv_username>
// If missing, defaults to live/anonymous.

const SCENARIOS = {
  live: {
    label: 'Live Performers',
    lead: 'Cloud Computa · Chase · Ladzoo · jjtlv',
    intro: 'Verify the full live-stream lifecycle on production. Golden path + edge cases. Mobile required.',
    flows: [
      { n:1, t:'Go-live from browser Studio',
        desc:'Open <a href="https://pnptv.app/live" target="_blank">/live</a>, hit Start Stream from the browser.',
        items:[
          {c:'1a', p:'Stream starts within 15s — no permission errors'},
          {c:'1b', p:'Within 30s you appear on the Hub with a LIVE dot'},
        ]},
      { n:2, t:'Go-live from OBS / RTMP',
        desc:'Pull your RTMP URL + key from the Studio settings, push from OBS.',
        items:[
          {c:'2a', p:'OBS shows green connection, bitrate stable'},
          {c:'2b', p:'You appear on Hub the same way as browser go-live'},
        ]},
      { n:3, t:'RTMP key rotation',
        desc:'Rotate your stream key in Studio settings.',
        items:[
          {c:'3a', p:'Old key is rejected within seconds (OBS drops)'},
          {c:'3b', p:'New key connects cleanly'},
        ]},
      { n:4, t:'Stream card on Hub',
        desc:'Load Hub in another tab while live.',
        items:[
          {c:'4a', p:'Your title + thumbnail + viewer count all update in near real-time'},
        ]},
      { n:5, t:'Tips — Ru$h 💎',
        desc:'Have another account tip you in Ru$h during the stream. (Ru$h shipped 2026-08-03.)',
        items:[
          {c:'5a', p:'On-screen toast fires with the tip amount'},
          {c:'5b', p:'Your balance reflects the tip within 5s'},
        ]},
      { n:6, t:'Tips — tokens',
        desc:'Same setup — have someone send a token tip.',
        items:[
          {c:'6a', p:'Ledger entry appears in PayoutsTab (creator dashboard)'},
        ]},
      { n:7, t:'Chat moderation',
        desc:'From your Studio, use moderation controls on a chatter.',
        items:[
          {c:'7a', p:'Mute a viewer — their messages disappear + stay muted on refresh'},
          {c:'7b', p:'Delete a specific message — it disappears for all viewers'},
        ]},
      { n:8, t:'End stream + VOD',
        desc:'End the stream from Studio.',
        items:[
          {c:'8a', p:'VOD auto-saves and appears on your PNP Channel within 60s'},
          {c:'8b', p:'VOD is playable from your profile'},
        ]},
      { n:9, t:'Mobile viewer',
        desc:'Open your stream on a phone (iOS Safari + Android Chrome).',
        items:[
          {c:'9a', p:'Playback starts within 3s, controls responsive'},
          {c:'9b', p:'Tip button works from the mobile viewer'},
        ]},
      { n:10, t:'Private-call slot-lock during live',
        desc:'While live, book a private call slot ~5 min from now (via a second account).',
        items:[
          {c:'10a', p:'Slot-lock holds through NowPayments crypto confirmation delay — do NOT expect instant confirm'},
          {c:'10b', p:'Once confirmed, call room opens on schedule'},
        ]},
    ],
  },
  member: {
    label: 'Connect · Hangouts · Profile · Member-facing',
    lead: 'Jeff',
    intro: 'Everything a non-creator, non-admin logged-in user touches on pnptv.app. Use a second account (or Safari Private tab) to test social flows.',
    flows: [
      { n:1, t:'Nearby users',
        desc:'Open <a href="https://pnptv.app/connect" target="_blank">/connect</a> → Nearby.',
        items:[
          {c:'1a', p:'Distance sort looks sane (closest first)'},
          {c:'1b', p:'Only <b>online</b> users show — not live/available-for-call sub-states'},
        ]},
      { n:2, t:'Presence dots',
        desc:'Log another account in on a second device, then log out.',
        items:[
          {c:'2a', p:'Green online dot appears within ~10s on your view'},
          {c:'2b', p:'Dot goes away within ~10s of that account logging out'},
        ]},
      { n:3, t:'Follow / Unfollow',
        desc:'Open another user\'s profile.',
        items:[
          {c:'3a', p:'Follow — they appear in your Following list immediately'},
          {c:'3b', p:'Unfollow — they disappear immediately'},
        ]},
      { n:4, t:'DMs — sales tone check',
        desc:'Open DM inbox. Send a test message to a creator.',
        items:[
          {c:'4a', p:'Inbox loads + message sends'},
          {c:'4b', p:'⚠️ FLAG if you see any refund/billing conversations happening in DMs (DMs are sales-only)'},
        ]},
      { n:5, t:'Join public hangout',
        desc:'From <a href="https://pnptv.app/hangouts" target="_blank">/hangouts</a>, join a public hangout.',
        items:[
          {c:'5a', p:'You can post + hear/see other participants'},
        ]},
      { n:6, t:'Join private hangout — WITH entitlement',
        desc:'Join a private hangout you have access to.',
        items:[
          {c:'6a', p:'Successful join, no paywall'},
        ]},
      { n:7, t:'Join private hangout — WITHOUT entitlement',
        desc:'Try to join a private hangout you do NOT have access to.',
        items:[
          {c:'7a', p:'Clean paywall / access-denied UI'},
          {c:'7b', p:'No crash, no silent failure'},
        ]},
      { n:8, t:'PRIME-gated hangouts 719 + 785',
        desc:'Try Santino\'s Cult (719) and Lex\'s group (785). Both should behave identically since 2026-07-30 co-founder joint.',
        items:[
          {c:'8a', p:'WITH active PRIME → auto-join both'},
          {c:'8b', p:'WITHOUT PRIME → blocked on both, clear upgrade CTA'},
        ]},
      { n:9, t:'Edit profile',
        desc:'Open your own profile → edit.',
        items:[
          {c:'9a', p:'Change avatar, bio, location prefs — persist through reload'},
          {c:'9b', p:'Your new avatar shows on your profile card + in Nearby list'},
        ]},
      { n:10, t:'Member profile page',
        desc:'Open another user\'s public profile.',
        items:[
          {c:'10a', p:'Their avatar shows an online dot (UserAvatar component) if they\'re online'},
          {c:'10b', p:'Stats + follow-button state match reality'},
        ]},
      { n:11, t:'Mobile',
        desc:'Repeat flows 1, 5, and 9 on iOS Safari + Android Chrome.',
        items:[
          {c:'11a', p:'All three work cleanly on mobile'},
        ]},
    ],
  },
  admin: {
    label: 'Admin + Creator Panels',
    lead: 'Santino · Lex',
    intro: 'Operator-side surfaces. High blast radius — please be thorough. You need admin access (Santino) and creator access (Lex).',
    flows: [
      { n:1, t:'User detail — tier grants',
        desc:'<a href="https://pnptv.app/admin/users" target="_blank">/admin/users</a> → pick a user → grant a tier.',
        items:[
          {c:'1a', p:'user_entitlements row appears (source of truth — NOT users.tier)'},
        ]},
      { n:2, t:'PaymentHealth dashboard',
        desc:'<a href="https://pnptv.app/admin/payment-health" target="_blank">/admin/payment-health</a>.',
        items:[
          {c:'2a', p:'NowPayments status green'},
          {c:'2b', p:'Recent invoices load + reconciler heartbeat green'},
        ]},
      { n:3, t:'2257 verification queue',
        desc:'59 users currently in grace expiring 2026-08-14. Approve one, reject one with a reason.',
        items:[
          {c:'3a', p:'Status updates + grace-expiry date recomputes correctly'},
        ]},
      { n:4, t:'Entitlement editor',
        desc:'Grant/revoke a per-resource entitlement (channel or hangout).',
        items:[
          {c:'4a', p:'hasResourceAccess resolves correctly on the user side (My Access page or log in as them)'},
        ]},
      { n:5, t:'PNP Channels admin — channel 209',
        desc:'PNPtv! PRIME (channel 209, is_system=true).',
        items:[
          {c:'5a', p:'Demotion is blocked in the UI'},
          {c:'5b', p:'Admin ops still work (feature toggle, video add/remove)'},
        ]},
      { n:6, t:'Duplicate accounts',
        desc:'<a href="https://pnptv.app/admin/duplicate-accounts" target="_blank">/admin/duplicate-accounts</a> → run merge on a test pair.',
        items:[
          {c:'6a', p:'accountMergeService succeeds + no data loss'},
        ]},
      { n:7, t:'PayoutsTab thresholds',
        desc:'Creator dashboard → Payouts.',
        items:[
          {c:'7a', p:'Weekly batch min shows $100, cashout min shows $50'},
          {c:'7b', p:'Gifted tokens do NOT accrue into payout balance (tokenLedgerService guard)'},
        ]},
      { n:8, t:'CreatorChannelsHub',
        desc:'Creator dashboard → Channels.',
        items:[
          {c:'8a', p:'Create a Free channel + a Paid channel'},
          {c:'8b', p:'PRIME lock present (no promote-to-PRIME option)'},
          {c:'8c', p:'Add a video via the upload wizard end-to-end'},
        ]},
      { n:9, t:'UserCreatorSection (admin > user detail)',
        desc:'Assign creator role to a test member.',
        items:[
          {c:'9a', p:'They auto-get lifetime pnp-member entitlement'},
        ]},
      { n:10, t:'DM broadcast',
        desc:'Send a creator broadcast DM.',
        items:[
          {c:'10a', p:'Message body is unique per creator (UI should reject reuse/copy)'},
        ]},
      { n:11, t:'Cal.com availability',
        desc:'Set availability in Cal.com.',
        items:[
          {c:'11a', p:'Reflects in creator availability endpoint + private-call booking calendar'},
        ]},
      { n:12, t:'Channel-video upload wizard',
        desc:'End-to-end: upload a short clip.',
        items:[
          {c:'12a', p:'Grok description generates'},
          {c:'12b', p:'ffmpeg GIF thumbnail generates'},
          {c:'12c', p:'Smart promo post drops on your channel'},
        ]},
      { n:13, t:'Creator subscription checkout',
        desc:'As a test member, subscribe to a creator monthly plan.',
        items:[
          {c:'13a', p:'Hits <span class="mono">/usdc/prepare</span> (NOT <span class="mono">/usdc/subscribe</span>)'},
          {c:'13b', p:'Does not 400'},
        ]},
    ],
  },
};

// ── URL params ──────────────────────────────────────────────────────────────
const params  = new URLSearchParams(location.search);
const scopeIn = String(params.get('scope') || 'live').toLowerCase();
const SCOPE   = SCENARIOS[scopeIn] ? scopeIn : 'live';
const CFG     = SCENARIOS[SCOPE];
const FLOWS   = CFG.flows;
const TESTER_URL = params.get('tester') || '';
const PNPTV_URL  = params.get('pnptv')  || '';

const KEY     = 'pnptv_test_' + SCOPE;
const NAMEKEY = 'pnptv_test_name_' + SCOPE;
const PNPKEY  = 'pnptv_test_pnpuser_' + SCOPE;
const state   = load();

function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch(e){ return {}; }
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(state));
}
function saveName(v){ localStorage.setItem(NAMEKEY, v || ''); }
function savePnp(v){  localStorage.setItem(PNPKEY,  v || ''); }
function wipe(){
  if (!confirm('Reset all your marks for this scope?')) return;
  localStorage.removeItem(KEY);
  location.reload();
}

function totalItems(){ return FLOWS.reduce((s,f)=>s+f.items.length,0); }
function countDone(){
  let n = 0;
  FLOWS.forEach(f=>f.items.forEach(it=>{ if (state[it.c] && state[it.c].mark) n++; }));
  return n;
}
function flowDone(f){ return f.items.every(it => state[it.c] && state[it.c].mark); }
function updateProgress(){
  const t = totalItems(), d = countDone();
  const pct = t ? Math.round(d*100/t) : 0;
  document.getElementById('pbar').style.width = pct + '%';
  document.getElementById('pcount').textContent = d + ' / ' + t;
  document.getElementById('ptext').textContent = pct + '%';
}

function render(){
  const root = document.getElementById('flows');
  root.innerHTML = FLOWS.map(f => {
    const done = flowDone(f);
    const doneCount = f.items.filter(it => state[it.c] && state[it.c].mark).length;
    return `
      <section class="flow${done?' done':''}" data-n="${f.n}">
        <header data-toggle="${f.n}">
          <span class="n">${f.n}</span>
          <span class="t">${escapeHtml(f.t)}</span>
          <span class="c">${doneCount}/${f.items.length}</span>
          <span class="chev">▶</span>
        </header>
        <div class="body">
          <p class="desc">${f.desc}</p>
          ${f.items.map(it => {
            const s = state[it.c] || {};
            return `
              <div class="item${(s.mark && s.mark !== 'ok') ? ' has-note' : ''}" data-c="${it.c}">
                <p class="prompt"><span class="code">${it.c}</span>${it.p}</p>
                <div class="btns">
                  <button class="btn ${s.mark==='ok'?'on-ok':''}"   data-mark="${it.c}:ok">✅ Works</button>
                  <button class="btn ${s.mark==='bad'?'on-bad':''}" data-mark="${it.c}:bad">❌ Broken</button>
                  <button class="btn ${s.mark==='warn'?'on-warn':''}" data-mark="${it.c}:warn">⚠️ Weird</button>
                </div>
                <textarea placeholder="What did you see?" data-note="${it.c}">${escapeHtml(s.note||'')}</textarea>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');
  FLOWS.forEach(f => {
    if (state['open_' + f.n]) {
      const el = root.querySelector('.flow[data-n="' + f.n + '"]');
      if (el) el.classList.add('open');
    }
  });
  const savedName = TESTER_URL || localStorage.getItem(NAMEKEY) || '';
  const savedPnp  = PNPTV_URL  || localStorage.getItem(PNPKEY)  || '';
  const nameEl = document.getElementById('tname');
  const pnpEl  = document.getElementById('pnpuser');
  if (nameEl && savedName) nameEl.value = savedName;
  if (pnpEl  && savedPnp)  pnpEl.value  = savedPnp;

  // Header + intro rewrite for scope
  const brandH1 = document.querySelector('.brand h1');
  if (brandH1) brandH1.textContent = 'PNPtv! Testing — ' + CFG.label;
  const whoEl = document.getElementById('who');
  if (whoEl) whoEl.textContent = 'Lead: ' + CFG.lead;
  const introTxt = document.getElementById('introTxt');
  if (introTxt) introTxt.textContent = CFG.intro;
  const submitHint = document.getElementById('submitHint');
  if (submitHint) submitHint.textContent = 'On submit: your report + Grok triage post to #testing-team. If your PNPtv username matches, $30 (180 Ru$h) auto-credits to your wallet.';

  updateProgress();
  genReport();
}

function toggleFlow(n){
  const el = document.querySelector('.flow[data-n="' + n + '"]');
  if (!el) return;
  el.classList.toggle('open');
  state['open_' + n] = el.classList.contains('open');
  save();
}

function startFirstFlow(){
  let target = null;
  for (const f of FLOWS) {
    if (!f.items.every(it => (state[it.c] || {}).mark)) { target = f; break; }
  }
  if (!target) target = FLOWS[0];
  const el = document.querySelector('.flow[data-n="' + target.n + '"]');
  if (!el) { toast('flow not found — reload page'); return; }
  if (!el.classList.contains('open')) {
    el.classList.add('open');
    state['open_' + target.n] = true;
    save();
  }
  toast('Opened flow ' + target.n + ' ✓');
  const y = el.getBoundingClientRect().top + window.pageYOffset - 90;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

function mark(code, val){
  state[code] = state[code] || {};
  state[code].mark = (state[code].mark === val) ? null : val;
  save();
  render();
}
function note(code, val){
  state[code] = state[code] || {};
  state[code].note = val;
  save();
  genReport();
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

function genReport(){
  const lines = [];
  let ok=0, bad=0, warn=0, skip=0;
  FLOWS.forEach(f => {
    const rows = f.items.map(it => {
      const s = state[it.c] || {};
      let sym = '⬜';
      if (s.mark === 'ok') { sym='✅'; ok++; }
      else if (s.mark === 'bad') { sym='❌'; bad++; }
      else if (s.mark === 'warn') { sym='⚠️'; warn++; }
      else { skip++; }
      let line = '  ' + sym + ' ' + it.c;
      if (s.note && (s.mark==='bad'||s.mark==='warn')) {
        line += ' — ' + s.note.trim().replace(/\n+/g,' ');
      }
      return line;
    }).join('\n');
    lines.push('*' + f.n + '. ' + f.t + '*\n' + rows);
  });
  const total = ok+bad+warn+skip;
  const tester = (document.getElementById('tname')?.value || 'anonymous').trim();
  const header = '[' + CFG.label + '] PNPtv test run — ' + tester +
                 '\n✅ ' + ok + '  ❌ ' + bad + '  ⚠️ ' + warn + '  ⬜ ' + skip + '  (of ' + total + ')\n\n';
  document.getElementById('report').value = header + lines.join('\n\n');
}

async function copyReport(){
  genReport();
  const txt = document.getElementById('report').value;
  try { await navigator.clipboard.writeText(txt); toast('Copied ✓'); }
  catch(e) {
    const ta = document.getElementById('report');
    ta.removeAttribute('readonly');
    ta.select();
    document.execCommand('copy');
    ta.setAttribute('readonly','');
    toast('Copied ✓');
  }
}

async function submitReport(){
  genReport();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Submitting…';
  const tester = (document.getElementById('tname')?.value || 'anonymous').trim() || 'anonymous';
  const pnpuser = (document.getElementById('pnpuser')?.value || '').trim();
  const results = {}, notes = {};
  FLOWS.forEach(f => f.items.forEach(it => {
    const s = state[it.c] || {};
    if (s.mark) results[it.c] = s.mark;
    if (s.note && s.mark && s.mark !== 'ok') notes[it.c] = s.note;
  }));
  const report_text = document.getElementById('report').value;
  try {
    const res = await fetch('/api/webhooks/tester-report', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        tester: tester, pnptv_username: pnpuser, scope: SCOPE,
        results: results, notes: notes, report_text: report_text,
      }),
    });
    const data = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    toast('Sent to Slack ✓');
    btn.textContent = '✅ Sent — send another';
    setTimeout(function(){ btn.textContent='🚀 Submit to team'; btn.disabled=false; }, 3000);
  } catch(err){
    toast('Send failed: ' + err.message, true);
    btn.textContent = '🚀 Retry submit';
    btn.disabled = false;
  }
}

function toast(msg, err){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  setTimeout(function(){ t.className = 'toast'; }, 1800);
}

// ── delegated event wiring (CSP-safe) ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  document.title = 'PNPtv! Testing — ' + CFG.label;
  render();

  document.addEventListener('click', function(ev){
    const t = ev.target.closest('[data-action], [data-toggle], [data-mark]');
    if (!t) return;
    if (t.dataset.action) {
      ev.preventDefault();
      const fn = window['__actions__'][t.dataset.action];
      if (typeof fn === 'function') fn(ev);
    } else if (t.dataset.toggle) {
      ev.preventDefault();
      toggleFlow(Number(t.dataset.toggle));
    } else if (t.dataset.mark) {
      ev.preventDefault();
      const [code, val] = t.dataset.mark.split(':');
      mark(code, val);
    }
  });

  document.addEventListener('input', function(ev){
    const t = ev.target;
    if (t.dataset && t.dataset.note) {
      note(t.dataset.note, t.value);
    } else if (t.id === 'tname') {
      saveName(t.value);
    } else if (t.id === 'pnpuser') {
      savePnp(t.value);
    }
  });
});

window.__actions__ = {
  start:  startFirstFlow,
  wipe:   wipe,
  submit: submitReport,
  copy:   copyReport,
  refresh: genReport,
};
