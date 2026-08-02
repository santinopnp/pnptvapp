'use strict';

const FLOWS = [
  { n:1, t:"PRIME channel_promo — YOUR view (logged-in PRIME)",
    desc:`Open Santino: <a href="https://pnptv.app/c/@santinofurioso" target="_blank">/c/@santinofurioso</a> then Lex: <a href="https://pnptv.app/c/@lexbottomstop" target="_blank">/c/@lexbottomstop</a>. Scroll each wall for a <b>channel_promo</b> card (video preview + PRIME badge).`,
    items:[
      {c:"1a", p:"CTA reads <b>▶ Watch now</b> (no lock)"},
      {c:"1b", p:"Tap CTA — video plays <b>inline in the card</b> (does not open a new page)"},
      {c:"1c", p:"Video streams smoothly, has scrubber + audio"},
      {c:"1d", p:"Same 3 checks work on Lex's profile too"},
    ]},
  { n:2, t:"PRIME channel_promo — FREE view (Safari Private tab)",
    desc:`Open <b>Safari Private Browsing</b> → Santino URL again. Do NOT log in. Find the same channel_promo.`,
    items:[
      {c:"2a", p:"Video preview is <b>blurred / locked</b> — you cannot see the video"},
      {c:"2b", p:"CTA reads <b>Unlock PRIME</b> or shows a lock icon"},
      {c:"2c", p:"Tap CTA → routes to PRIME subscribe page (not to the video)"},
    ]},
  { n:3, t:"Subscription-tier channel_promo — FREE view",
    desc:`Still in Private tab. Browse Discover, find any <b>non-PRIME creator</b> with a channel_promo on their wall.`,
    items:[
      {c:"3a", p:"CTA reads <b>Subscribe to @{creator} →</b> (not \"Unlock PRIME\")"},
      {c:"3b", p:"Tap CTA → drops into that creator's subscribe wizard"},
    ]},
  { n:4, t:"Home feed — FREE view of PRIME hype",
    desc:`Still in Private tab. Try <a href="https://pnptv.app/home" target="_blank">/home</a> — if a public feed is visible, scroll for a PRIME promo post.`,
    items:[
      {c:"4a", p:"Video area is <b>redacted</b> / no playable video"},
      {c:"4b", p:"Post still shows the headline + creator + PRIME badge"},
    ]},
  { n:5, t:"Home feed — YOUR view of PRIME hype",
    desc:`Back in your normal (logged-in) tab. <a href="https://pnptv.app/home" target="_blank">/home</a>. Scroll for a PRIME promo post.`,
    items:[
      {c:"5a", p:"Video plays inline (no lock, no redaction)"},
      {c:"5b", p:"Post shows headline + PRIME badge just like the free view"},
    ]},
  { n:6, t:"PRIME hangouts auto-joined",
    desc:`Normal tab. <a href="https://pnptv.app/hangouts" target="_blank">/hangouts</a>.`,
    items:[
      {c:"6a", p:"You see <b>Santino's Cult</b> (group 719) listed"},
      {c:"6b", p:"You see <b>Lex's group</b> (group 785) listed"},
      {c:"6c", p:"Tap into either — no join button, no paywall, you're already a member"},
      {c:"6d", p:"Send a test message — it posts"},
    ]},
  { n:7, t:"PRIME hangouts hidden from free users",
    desc:`Safari Private tab. <a href="https://pnptv.app/hangouts" target="_blank">/hangouts</a> discover.`,
    items:[
      {c:"7a", p:"<b>Santino's Cult (719) is NOT visible</b>"},
      {c:"7b", p:"<b>Lex's group (785) is NOT visible</b>"},
      {c:"7c", p:"Other Free / Community groups still show normally"},
    ]},
  { n:8, t:"Mux video playback — free channel",
    desc:`Normal tab. <a href="https://pnptv.app/channels" target="_blank">/channels</a> → any free channel with videos.`,
    items:[
      {c:"8a", p:"Tap a video thumbnail — playback starts within 3 sec"},
      {c:"8b", p:"Scrubber works, audio works"},
      {c:"8c", p:"No black screen, no infinite spinner, no \"cannot load video\" error"},
      {c:"8d", p:"Rotate phone landscape — video fits, controls still work"},
    ]},
  { n:9, t:"Mux video playback — PRIME channel",
    desc:`Normal tab. <a href="https://pnptv.app/channels" target="_blank">/channels</a> → find channel 209 (PNPtv! PRIME).`,
    items:[
      {c:"9a", p:"Videos are visible (not blurred)"},
      {c:"9b", p:"Tap a video — plays inline within 3 sec, scrubber + audio work"},
      {c:"9c", p:"Landscape orientation — fits, controls work"},
    ]},
  { n:10, t:"Crypto onboarding — first-time interstitial",
    desc:`In Safari Settings, clear <span class="mono">pnptv.app</span> website data (Settings → Safari → Advanced → Website Data → search pnptv → Remove). Log back in. Then <a href="https://pnptv.app/subscribe" target="_blank">/subscribe</a> → any paid plan → <b>Pay with crypto</b>.`,
    items:[
      {c:"10a", p:"Full-screen crypto interstitial with <b>Skip</b> and <b>Start Guide</b> buttons"},
      {c:"10b", p:"Tap <b>Skip</b> → drops into the normal crypto payment flow"},
      {c:"10c", p:"Tap <b>Pay with crypto</b> again — interstitial does NOT re-appear"},
    ]},
  { n:11, t:"Crypto Guide wizard — full walkthrough",
    desc:`Open <a href="https://pnptv.app/crypto-guide" target="_blank">/crypto-guide</a> directly.`,
    items:[
      {c:"11a", p:"Wizard opens on step 1 of <b>7 or 8 total steps</b> — step counter visible"},
      {c:"11b", p:"Advance every step via <b>Next</b>. All screens render (no blanks, no broken images)"},
      {c:"11c", p:"<b>Step 5:</b> Trust + MetaMask mockups both highlight the <b>USDT on BSC</b> row (★ USE THIS)"},
      {c:"11d", p:"<b>Step 6:</b> BSC = <b>USE THIS</b> (green), TRON = <b>ALSO ACCEPTED</b>, ETH = <b>Skip / too expensive</b>"},
      {c:"11e", p:"Final step → <b>Complete / Finish</b> button → drops back to home or subscribe"},
    ]},
  { n:12, t:"Crypto Guide inline callout",
    desc:`After step 11, the callout should be GONE. Load Home, Subscribe, Wallet.`,
    items:[
      {c:"12a", p:"No callout visible on Home"},
      {c:"12b", p:"No callout visible on Subscribe"},
      {c:"12c", p:"No callout visible on Wallet"},
    ]},
  { n:13, t:"Subscribe — Which network? deep-link",
    desc:`Normal tab. <a href="https://pnptv.app/subscribe" target="_blank">/subscribe</a> → any plan → <b>Pay with crypto</b> → token picker opens.`,
    items:[
      {c:"13a", p:"Small link <b>Which network? →</b> visible near the token list"},
      {c:"13b", p:"Tap it → opens <span class=\"mono\">/crypto-guide</span> in a <b>new Safari tab</b>"},
    ]},
  { n:14, t:"Wallet — MainStage bonus token badge",
    desc:`<a href="https://pnptv.app/main-stage" target="_blank">/main-stage</a>. Look for the wallet chip / badge.`,
    items:[
      {c:"14a", p:"If a bonus/gift-token amount shows, badge says <b>+X gift tokens</b>"},
      {c:"14b", p:"Long-press or tap — tooltip mentions the pool applies to <b>both co-founder streams</b>"},
    ]},
  { n:15, t:"Wallet — token price math (6 tokens per $1)",
    desc:`Anywhere tokens vs USD appear (creator sub price, call package, buy-tokens page).`,
    items:[
      {c:"15a", p:"Token amount = USD × 6. ($10=60, $50=300, $100=600 base)"},
      {c:"15b", p:"Buy-tokens page bonus tiers may be slightly more (OK) — flag if a base 1-USD line ≠ 6"},
    ]},
  { n:16, t:"Layout — logged-out state",
    desc:`Safari Private tab. <a href="https://pnptv.app" target="_blank">pnptv.app</a>.`,
    items:[
      {c:"16a", p:"Landing page loads without crashing"},
      {c:"16b", p:"<b>No GOD MODE badge</b> anywhere"},
      {c:"16c", p:"<b>No crypto guide callout</b> anywhere"},
      {c:"16d", p:"Header shows <b>Login / Register</b> only"},
    ]},
];

const KEY = "pnptv_chase_test_v1";
const NAMEKEY = "pnptv_chase_test_name";
const state = load();

function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch(e){ return {}; }
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(state));
}
function saveName(v){
  localStorage.setItem(NAMEKEY, v || '');
}
function wipe(){
  if (!confirm("Reset all your marks?")) return;
  localStorage.removeItem(KEY);
  location.reload();
}

function totalItems(){
  return FLOWS.reduce((s,f)=>s+f.items.length,0);
}
function countDone(){
  let n = 0;
  FLOWS.forEach(f=>f.items.forEach(it=>{ if (state[it.c] && state[it.c].mark) n++; }));
  return n;
}
function flowDone(f){
  return f.items.every(it => state[it.c] && state[it.c].mark);
}
function updateProgress(){
  const t = totalItems(), d = countDone();
  const pct = t ? Math.round(d*100/t) : 0;
  document.getElementById("pbar").style.width = pct + "%";
  document.getElementById("pcount").textContent = d + " / " + t;
  document.getElementById("ptext").textContent = pct + "%";
}

function render(){
  const root = document.getElementById("flows");
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
    if (state[`open_${f.n}`]) {
      const el = root.querySelector('.flow[data-n="' + f.n + '"]');
      if (el) el.classList.add('open');
    }
  });
  const savedName = localStorage.getItem(NAMEKEY);
  if (savedName) document.getElementById('tname').value = savedName;
  updateProgress();
  genReport();
}

function toggleFlow(n){
  const el = document.querySelector('.flow[data-n="' + n + '"]');
  if (!el) return;
  el.classList.toggle('open');
  state[`open_${n}`] = el.classList.contains('open');
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
    state[`open_${target.n}`] = true;
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
  const tester = (document.getElementById('tname')?.value || 'Chase').trim();
  const header = 'PNPtv test run — ' + tester + '\n✅ ' + ok + '  ❌ ' + bad + '  ⚠️ ' + warn + '  ⬜ ' + skip + '  (of ' + total + ')\n\n';
  document.getElementById("report").value = header + lines.join('\n\n');
}

async function copyReport(){
  genReport();
  const txt = document.getElementById("report").value;
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copied ✓");
  } catch(e) {
    const ta = document.getElementById("report");
    ta.removeAttribute('readonly');
    ta.select();
    document.execCommand('copy');
    ta.setAttribute('readonly','');
    toast("Copied ✓");
  }
}

async function submitReport(){
  genReport();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Submitting…';
  const tester = (document.getElementById('tname')?.value || 'Chase').trim() || 'Chase';
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
      body:JSON.stringify({ tester: tester, results: results, notes: notes, report_text: report_text }),
    });
    const data = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    toast("Sent to Slack ✓");
    btn.textContent = '✅ Sent — send another';
    setTimeout(function(){ btn.textContent='🚀 Submit to team'; btn.disabled=false; }, 3000);
  } catch(err){
    toast('Send failed: '+err.message, true);
    btn.textContent = '🚀 Retry submit';
    btn.disabled = false;
  }
}

function toast(msg, err){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  setTimeout(function(){ t.className = 'toast'; }, 1800);
}

// ── delegated event wiring (CSP-safe, no inline onclick) ─────────────────────
document.addEventListener('DOMContentLoaded', function(){
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
