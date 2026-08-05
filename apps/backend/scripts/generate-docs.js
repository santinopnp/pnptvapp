'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = '/opt/pnptvapp/apps/web/public/docs';
fs.mkdirSync(OUT, { recursive: true });

const C = {
  bg: '#121212', surface: '#1E1E1E', accent: '#D4007A',
  amber: '#E69138', purple: '#7B61FF', text: '#FFFFFF',
  muted: '#A1A1A3', border: '#2A2A2A',
  ltext: '#111111', lmuted: '#555555', lsurface: '#F4F4F6', lborder: '#DEDEDE',
};

// A4: 210×297mm. With 12mm side + 10mm top/bottom padding per .page,
// content box = 186mm × 277mm ≈ 703px × 1047px at 96dpi.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Montserrat:wght@700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',system-ui,sans-serif;background:#fff;color:${C.ltext};font-size:10px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;}

/* ── Cover: full A4 sheet, dark bleed ── */
.cover{
  width:210mm;height:297mm;
  background:${C.bg};
  display:flex;flex-direction:column;justify-content:space-between;
  padding:14mm 16mm 12mm;
  page-break-after:always;
  position:relative;overflow:hidden;
}
.cover-bar{width:44px;height:3px;background:${C.accent};margin-bottom:36px;}
.cover-brand{font-family:'Montserrat',sans-serif;font-weight:900;font-size:42px;color:${C.accent};letter-spacing:-1px;line-height:1;}
.cover-brand span{color:${C.amber};}
.cover-tag{font-size:9px;color:${C.muted};letter-spacing:3px;text-transform:uppercase;margin-top:8px;}
.cover-title{font-family:'Montserrat',sans-serif;font-weight:800;font-size:28px;color:${C.text};margin-top:auto;line-height:1.18;max-width:380px;}
.cover-sub{font-size:10px;color:${C.muted};margin-top:10px;line-height:1.6;max-width:340px;}
.cover-meta{display:flex;justify-content:space-between;align-items:flex-end;margin-top:36px;}
.cover-date{font-size:9px;color:${C.muted};letter-spacing:1px;}
.cover-badge{background:${C.accent};color:#fff;font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:4px 10px;}
.cover-line{position:absolute;right:0;top:0;width:5px;height:100%;background:${C.accent};}
.cover-dec{position:absolute;right:60px;top:50%;transform:translateY(-50%);width:180px;height:180px;border:1px solid ${C.border};border-radius:50%;opacity:0.25;}
.cover-dec2{position:absolute;right:96px;top:50%;transform:translateY(-50%);width:100px;height:100px;border:1px solid ${C.accent};border-radius:50%;opacity:0.18;}

/* ── Content page: fixed A4 size, overflow hidden so nothing bleeds ── */
.page{
  width:210mm;min-height:297mm;
  padding:10mm 12mm 10mm;
  page-break-after:always;
  position:relative;
  overflow:hidden;
}
.page:last-child{page-break-after:avoid;}

/* ── Page header ── */
.ph{display:flex;justify-content:space-between;align-items:center;padding-bottom:7px;border-bottom:2px solid ${C.accent};margin-bottom:14px;}
.ph-brand{font-family:'Montserrat',sans-serif;font-weight:900;font-size:12px;color:${C.accent};}
.ph-title{font-size:8px;color:${C.lmuted};letter-spacing:1.5px;text-transform:uppercase;}

/* ── Typography ── */
.lbl{font-size:7.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.accent};margin-bottom:3px;}
h2{font-family:'Montserrat',sans-serif;font-weight:800;font-size:16px;color:${C.ltext};margin-bottom:10px;line-height:1.2;}
h3{font-size:11px;font-weight:700;color:${C.ltext};margin:10px 0 5px;border-left:3px solid ${C.accent};padding-left:7px;}
p{margin-bottom:7px;font-size:10px;line-height:1.55;}
.lead{font-size:11px;font-weight:500;line-height:1.6;margin-bottom:12px;}
ul{margin:4px 0 8px 14px;}
li{margin-bottom:3px;font-size:9.5px;}

/* ── Tables ── */
table{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:9.5px;table-layout:fixed;word-wrap:break-word;}
thead tr{background:${C.bg};}
thead th{color:#fff;font-weight:600;text-align:left;padding:5px 8px;font-size:9px;letter-spacing:0.3px;}
tbody tr:nth-child(even){background:${C.lsurface};}
tbody tr:nth-child(odd){background:#fff;}
tbody td{padding:5px 8px;border-bottom:1px solid ${C.lborder};vertical-align:top;word-wrap:break-word;}
.ca{color:${C.accent};font-weight:600;}

/* ── Callout ── */
.callout{background:${C.lsurface};border-left:3px solid ${C.accent};padding:8px 10px;margin:8px 0;border-radius:0 4px 4px 0;}
.callout-t{font-weight:700;font-size:8.5px;color:${C.accent};margin-bottom:3px;text-transform:uppercase;letter-spacing:1px;}
.callout p{margin:0;font-size:9.5px;}

/* ── Pillars 2-col ── */
.pillars{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;}
.pillar{background:${C.lsurface};padding:10px;border-top:3px solid ${C.accent};}
.pillar:nth-child(even){border-top-color:${C.purple};}
.pillar-n{font-family:'Montserrat',sans-serif;font-weight:900;font-size:20px;color:${C.lborder};line-height:1;}
.pillar-t{font-weight:700;font-size:10px;color:${C.ltext};margin:2px 0;}
.pillar p{font-size:9px;color:${C.lmuted};margin:0;line-height:1.4;}

/* ── Org ── */
.org{margin:10px 0;}
.org-top{display:flex;gap:6px;margin-bottom:8px;align-items:center;}
.org-box{display:inline-block;background:${C.bg};color:#fff;padding:5px 10px;font-size:9px;font-weight:600;white-space:nowrap;}
.org-box.a{background:${C.accent};}
.org-box.p{background:${C.purple};}
.arrow{font-size:10px;color:#999;}
.org-row{display:flex;justify-content:center;gap:6px;flex-wrap:nowrap;}
.org-dept{border:1px solid ${C.lborder};padding:8px;flex:1;}
.org-dept-t{font-weight:700;font-size:9px;color:${C.accent};margin-bottom:4px;border-bottom:1px solid ${C.lborder};padding-bottom:3px;}
.org-dept-r{font-size:8.5px;color:${C.lmuted};line-height:1.6;}

/* ── Stages (compact) ── */
.stages{display:flex;flex-direction:column;gap:6px;margin:8px 0;}
.stage{display:flex;gap:10px;align-items:flex-start;background:${C.lsurface};padding:7px 10px;}
.stage.hi{border-left:3px solid ${C.accent};}
.stage-n{font-family:'Montserrat',sans-serif;font-weight:900;font-size:18px;color:${C.accent};min-width:26px;line-height:1.1;flex-shrink:0;}
.stage-t{font-weight:700;font-size:10px;color:${C.ltext};margin-bottom:2px;}
.stage-d{font-size:9px;color:${C.lmuted};line-height:1.45;}

/* ── Month cards 2-col (business plan only) ── */
.months{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;}
.mc{border:1px solid ${C.lborder};padding:9px 10px;page-break-inside:avoid;}
.mc-n{font-size:7.5px;font-weight:700;color:${C.accent};letter-spacing:1px;text-transform:uppercase;}
.mc-f{font-weight:700;font-size:10.5px;color:${C.ltext};margin:2px 0 6px;}
.mc-i{font-size:9px;color:${C.lmuted};line-height:1.5;}
.mc-h{display:inline-block;background:${C.accent};color:#fff;font-size:7.5px;font-weight:700;padding:2px 6px;margin-top:5px;}

/* ── Roadmap Timeline ── */
.tl{display:flex;flex-direction:column;margin:6px 0;}
.tl-row{display:flex;gap:0;position:relative;margin-bottom:5px;page-break-inside:avoid;}
.tl-row:not(:last-child)::after{content:'';position:absolute;left:28px;top:48px;height:calc(100% - 38px);width:2px;background:${C.lborder};z-index:0;}
.tl-left{width:56px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;}
.tl-dot{width:38px;height:38px;background:${C.accent};display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;z-index:1;flex-shrink:0;}
.tl-dot.q2{background:${C.purple};}
.tl-dot.q3{background:${C.amber};}
.tl-dot.q4{background:${C.bg};}
.tl-dot-lbl{font-size:6px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;line-height:1;margin-bottom:1px;}
.tl-dot-num{font-family:'Montserrat',sans-serif;font-size:13px;color:#fff;font-weight:900;line-height:1.1;}
.tl-body{flex:1;background:${C.lsurface};padding:7px 10px;margin-left:8px;border-left:2px solid transparent;}
.tl-body.q2{border-left-color:${C.purple};}
.tl-body.q3{border-left-color:${C.amber};}
.tl-body.q4{border-left-color:${C.bg};}
.tl-title{font-weight:700;font-size:10.5px;color:${C.ltext};margin-bottom:4px;}
.tl-items{font-size:8.5px;color:${C.lmuted};line-height:1.6;}
.tl-hire{display:inline-block;background:${C.accent};color:#fff;font-size:7px;font-weight:700;padding:2px 8px;margin-top:5px;letter-spacing:0.5px;text-transform:uppercase;}

/* ── Phase header ── */
.phase-hdr{display:flex;align-items:stretch;gap:0;margin-bottom:12px;border-bottom:2px solid ${C.lborder};padding-bottom:10px;}
.phase-q{background:${C.accent};color:#fff;font-family:'Montserrat',sans-serif;font-weight:900;font-size:20px;padding:6px 14px;letter-spacing:-1px;display:flex;align-items:center;}
.phase-q.q2{background:${C.purple};}
.phase-q.q3{background:${C.amber};}
.phase-q.q4{background:${C.bg};}
.phase-info{padding:0 12px;display:flex;flex-direction:column;justify-content:center;}
.phase-name{font-family:'Montserrat',sans-serif;font-weight:800;font-size:14px;color:${C.ltext};line-height:1.2;}
.phase-sub{font-size:8px;color:${C.lmuted};letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;}

/* ── Milestone check ── */
.ms-check{background:#fff;border:1px solid ${C.lborder};border-top:3px solid ${C.purple};padding:9px 12px;margin-top:10px;}
.ms-check-t{font-weight:700;font-size:9px;color:${C.purple};margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;}
.ms-check-list{display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;}
.ms-check-item{font-size:8.5px;color:${C.lmuted};line-height:1.5;}

/* ── Values 2-col ── */
.values{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;}
.vc{background:${C.lsurface};padding:10px;}
.vc-t{font-weight:700;font-size:10px;color:${C.accent};margin-bottom:3px;}
.vc-d{font-size:9px;color:${C.lmuted};line-height:1.45;}

/* ── Footer ── */
.footer{position:absolute;bottom:7mm;left:12mm;right:12mm;display:flex;justify-content:space-between;align-items:center;border-top:1px solid ${C.lborder};padding-top:4px;}
.footer span{font-size:8px;color:${C.lmuted};}
.footer .dot{width:6px;height:6px;background:${C.accent};border-radius:50%;}

@page{size:A4;margin:0;}
@media print{
  .cover,.page{page-break-after:always;}
  .page:last-child{page-break-after:avoid;}
  .mc,.stage,.pillar{page-break-inside:avoid;}
}
`;

function ph(brand, doc) {
  return `<div class="ph"><span class="ph-brand">${brand}</span><span class="ph-title">${doc}</span></div>`;
}
function footer(brand) {
  return `<div class="footer"><span>${brand} — Confidential</span><div class="dot"></div><span>August 2026</span></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC 1 — BUSINESS PLAN (EN)
// ─────────────────────────────────────────────────────────────────────────────
function doc1en() {
  const B = 'PNPtv!', D = 'Business Development Plan';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<!-- COVER -->
<div class="cover">
  <div><div class="cover-bar"></div>
    <div class="cover-brand">PNP<span>tv!</span></div>
    <div class="cover-tag">The Platform — Internal Document</div></div>
  <div>
    <div class="cover-title">Business<br>Development<br>Plan</div>
    <div class="cover-sub">Company identity, organizational structure, creator welfare framework, revenue model, and competitive strategy.</div></div>
  <div class="cover-meta"><span class="cover-date">August 2026 — Confidential</span><span class="cover-badge">Phase 2</span></div>
  <div class="cover-line"></div><div class="cover-dec"></div><div class="cover-dec2"></div>
</div>

<!-- PAGE 1: COMPANY IDENTITY -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">01 — Company Identity</div>
  <h2>Who We Are &amp; Why We Exist</h2>
  <p class="lead">Queer adults living outside the mainstream deserve a platform that doesn't apologize for who they are. We exist to give the PNP community a space where creators build real income, members find real connection, and nobody has to hide.</p>
  <h3>Mission</h3>
  <p>We run the safest, most creator-first adult platform for queer communities — where welfare, autonomy, and dignity are non-negotiable operating principles, not marketing copy.</p>
  <h3>Vision</h3>
  <p>The global reference point for ethical, community-driven adult content — where the industry looks to us when they want to know what responsible creator economy looks like.</p>
  <h3>North Star Metric</h3>
  <div class="callout"><div class="callout-t">Active Creator Earnings</div><p>Total monthly income generated by creators on the platform. When creators earn more, everything follows: better content, more members, more trust.</p></div>
  <h3>Values</h3>
  <div class="values">
    <div class="vc"><div class="vc-t">Radical Honesty</div><div class="vc-d">We tell creators our commission. We publish our safety stats. We don't hide behind policies.</div></div>
    <div class="vc"><div class="vc-t">Built From Your Feedback</div><div class="vc-d">Every feature exists because a creator asked for it. We don't build what we think you need — we listen, then build. The platform is yours to shape.</div></div>
    <div class="vc"><div class="vc-t">Protect First</div><div class="vc-d">Any decision that trades user safety for revenue gets vetoed. Every time, without exception.</div></div>
    <div class="vc"><div class="vc-t">Creator-Led</div><div class="vc-d">Major product decisions go through a creator advisory panel before shipping.</div></div>
    <div class="vc"><div class="vc-t">No Performance</div><div class="vc-d">No corporate theater. No unnecessary meetings. No performative values.</div></div>
    <div class="vc"><div class="vc-t">Community First</div><div class="vc-d">Business decisions serve the community, not the reverse.</div></div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 2: ORG STRUCTURE -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">02 — Organizational Structure</div>
  <h2>10-Person Company — Phase 2</h2>
  <div class="org">
    <div class="org-top">
      <div class="org-box a">CEO / CCO — Santino</div>
      <span class="arrow">→</span>
      <div class="org-box p">CTO / CPO — Carlos</div>
    </div>
    <div class="org-row">
      <div class="org-dept"><div class="org-dept-t">Technology</div><div class="org-dept-r">Carlos (CTO)<br>Full-Stack Eng.<br>DevOps / SRE</div></div>
      <div class="org-dept"><div class="org-dept-t">Creator Welfare</div><div class="org-dept-r">Success Manager<br>Welfare Officer</div></div>
      <div class="org-dept"><div class="org-dept-t">Marketing</div><div class="org-dept-r">Community Mgr<br>Growth Marketer</div></div>
      <div class="org-dept"><div class="org-dept-t">Ops &amp; Finance</div><div class="org-dept-r">Ops Manager</div></div>
      <div class="org-dept"><div class="org-dept-t">Customer Exp.</div><div class="org-dept-r">CX Lead</div></div>
    </div>
  </div>
  <h3>Department Mandates</h3>
  <table><thead><tr><th style="width:20%">Dept</th><th style="width:45%">Core Mandate</th><th style="width:35%">Owns</th></tr></thead><tbody>
    <tr><td class="ca">Technology</td><td>Platform online, fast, secure. Ship on time.</td><td>Architecture, deploys, infra</td></tr>
    <tr><td class="ca">Creator Welfare</td><td>Every active creator is here by free, informed choice. Confirm at intake; protect ongoing.</td><td>ATS, training, check-ins, distress protocol</td></tr>
    <tr><td class="ca">Marketing</td><td>Grow member base and creator roster without compromising brand or community values.</td><td>Zoho Campaigns, social, referrals</td></tr>
    <tr><td class="ca">Ops &amp; Finance</td><td>Taxes filed, creators paid on time, 2257 current, contracts signed.</td><td>Zoho Books, 2257 calendar, contracts</td></tr>
    <tr><td class="ca">Customer Exp.</td><td>Human responses within 24h for all escalations.</td><td>Support escalations, member relations</td></tr>
  </tbody></table>
  <h3>Hiring Timeline</h3>
  <table><thead><tr><th style="width:5%">#</th><th style="width:30%">Role</th><th style="width:22%">Department</th><th style="width:13%">Month</th><th style="width:30%">Est. Monthly Cost</th></tr></thead><tbody>
    <tr><td>1</td><td>Operations Manager</td><td>Ops &amp; Finance</td><td>Month 1</td><td>$1,200–2,000</td></tr>
    <tr><td>2</td><td>Creator Success Manager</td><td>Creator Welfare</td><td>Month 2</td><td>$1,000–1,800</td></tr>
    <tr><td>3</td><td>Welfare &amp; Safety Officer</td><td>Creator Welfare</td><td>Month 3</td><td>$1,200–2,000</td></tr>
    <tr><td>4</td><td>Content / Community Mgr</td><td>Marketing</td><td>Month 4</td><td>$800–1,500</td></tr>
    <tr><td>5</td><td>Growth Marketer</td><td>Marketing</td><td>Month 5</td><td>$1,200–2,000</td></tr>
    <tr><td>6</td><td>DevOps / SRE</td><td>Technology</td><td>Month 6</td><td>$1,500–2,500</td></tr>
    <tr><td>7</td><td>CX Lead</td><td>Customer Experience</td><td>Month 7</td><td>$800–1,400</td></tr>
  </tbody></table>
  <p style="font-size:8.5px;color:${C.lmuted};margin-top:4px;">* Latin America-based remote hires. Each hire gated on MRR covering cost with 3 months runway margin.</p>
  ${footer(B)}
</div>

<!-- PAGE 3: ATS stages 1-5 -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">03 — Creator Welfare &amp; ATS</div>
  <h2>Welfare-First Creator Intake Pipeline</h2>
  <div class="callout"><div class="callout-t">Core Principle</div><p>This is NOT a talent acquisition funnel. It is a welfare-first intake process that happens to result in creator onboarding. Every stage is designed to detect coercion, financial desperation without alternatives, isolation, and third-party control. <strong>Tool:</strong> Zoho Recruit (included in Zoho One).</p></div>
  <div class="stages">
    <div class="stage"><div class="stage-n">01</div><div><div class="stage-t">Discovery</div><div class="stage-d">Track source: organic, referral (which creator?), social, Telegram. Referral by a known creator = highest quality signal. Referral by an unknown "agent" = red flag.</div></div></div>
    <div class="stage"><div class="stage-n">02</div><div><div class="stage-t">Expression of Interest</div><div class="stage-d">Lightweight form: age, location, content type, Telegram handle. Hard gate: must be 18+. No photos or content required yet.</div></div></div>
    <div class="stage"><div class="stage-n">03</div><div><div class="stage-t">Full Application</div><div class="stage-d">Legal name, ID document, social presence (identity only), why they want to create, what content they plan to make, whether anyone helped them apply (red flag if yes and can't name who), emergency contact.</div></div></div>
    <div class="stage"><div class="stage-n">04</div><div><div class="stage-t">Document Verification</div><div class="stage-d">2257-compliant ID verified. Age confirmed. Identity cross-referenced. Zoho Sign: 2257 acknowledgment signed electronically. Disqualify: fake ID, under 18, name mismatch without explanation.</div></div></div>
    <div class="stage hi"><div class="stage-n">05</div><div><div class="stage-t">Welfare Interview — Most Important Stage</div><div class="stage-d">30-min video call. Conversational, NOT interrogative. Tone: "we want to get to know you." Assesses: voluntary participation, financial context (desperation vs opportunity?), support network, substance use (non-judgmental — PNP-specific), understanding of content permanence, third-party involvement. Hard disqualifiers: signs of third-party control, capacity-impairing dependence, uninformed about permanence after explanation.</div></div></div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 4: ATS stages 6-9 + Revenue -->
<div class="page">
  ${ph(B,D)}
  <div class="stages" style="margin-bottom:14px;">
    <div class="stage"><div class="stage-n">06</div><div><div class="stage-t">30-Day Trial Onboarding</div><div class="stage-d">Full platform access. Weekly check-in from Creator Success Manager. Week 2: content review (welfare focus — is content consistent with stated intent?). Week 4: trial review call — move to Active, extend trial, or dignified exit.</div></div></div>
    <div class="stage"><div class="stage-n">07</div><div><div class="stage-t">Active Creator</div><div class="stage-d">Full status. Monthly welfare check-in. Quarterly earnings review. Annual 2257 renewal reminder via n8n automation.</div></div></div>
    <div class="stage"><div class="stage-n">08</div><div><div class="stage-t">Distress Flag Protocol</div><div class="stage-d">Triggers: 14+ days silent, 80%+ earnings drop, member abuse report, distress message. Creator Success Manager reaches out personally. Welfare Officer looped in. Options: extended break, harm reduction referral, full exit.</div></div></div>
    <div class="stage"><div class="stage-n">09</div><div><div class="stage-t">Offboarding</div><div class="stage-d">Voluntary: content pause explained, deletion process clarified, exit interview offered. Involuntary: reason in writing, appeal process available, 30-day archive before deletion.</div></div></div>
  </div>
  <div class="lbl">04 — Revenue Model</div>
  <h2>Revenue Streams</h2>
  <table><thead><tr><th style="width:28%">Stream</th><th style="width:48%">Description</th><th style="width:24%">Commission</th></tr></thead><tbody>
    <tr><td class="ca">PRIME Subscriptions</td><td>Monthly platform membership — primary revenue driver</td><td>100% platform</td></tr>
    <tr><td class="ca">Channel Subscriptions</td><td>30-day passes to paid creator channels</td><td>30% / 70% creator</td></tr>
    <tr><td class="ca">Private Calls</td><td>Booking fee + session commission</td><td>30% / 70% creator</td></tr>
    <tr><td class="ca">Ru$h Tokens</td><td>Tips during live streams and hangouts</td><td>30% / 70% creator</td></tr>
    <tr><td class="ca">Ticketed Shows</td><td>One-time paid events on Main Stage</td><td>Month 8</td></tr>
    <tr><td class="ca">Training Certification</td><td>Non-creators pay for Creator Academy access</td><td>Month 8</td></tr>
    <tr><td class="ca">Profile Boosts</td><td>Pay Ru$h tokens for 24hr discovery boost (CPM)</td><td>Month 8</td></tr>
    <tr><td class="ca">B2B Licensing</td><td>License welfare-first ATS to other platforms</td><td>Year 2–3</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

<!-- PAGE 5: MARKET POSITIONING -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">05 — Market Positioning</div>
  <h2>Competitive Moat &amp; Positioning</h2>
  <p><strong>We are NOT:</strong> a generalist adult platform (OnlyFans, Fansly) · a hookup app (Grindr, Scruff) · a generic porn site.</p>
  <p><strong>We ARE:</strong> The only adult platform built explicitly for the PNP-adjacent queer community, with harm reduction and creator welfare as non-negotiable operating principles.</p>
  <h3>Competitive Moat</h3>
  <table><thead><tr><th style="width:30%">Moat</th><th style="width:70%">Why It's Defensible</th></tr></thead><tbody>
    <tr><td class="ca">Community Specificity</td><td>PNP + queer niche = deep loyalty, low substitution. Members cannot find this anywhere else.</td></tr>
    <tr><td class="ca">Creator Welfare Brand</td><td>A creator who feels protected stays and advocates. Impossible for a VC-backed competitor to fake.</td></tr>
    <tr><td class="ca">Safety Credibility</td><td>Harm reduction baked in becomes a legal and reputational shield, not just a marketing point.</td></tr>
    <tr><td class="ca">Technical Reliability</td><td>When the architecture roadmap ships: better uptime and tools than any comparable platform.</td></tr>
    <tr><td class="ca">Community Trust</td><td>Santino's personal brand and community relationships are not replicable by any outside investor.</td></tr>
  </tbody></table>
  <h3>Unit Economics to Track</h3>
  <table><thead><tr><th style="width:20%">Metric</th><th style="width:45%">Definition</th><th style="width:35%">Target</th></tr></thead><tbody>
    <tr><td>ARPU</td><td>Total revenue / active members</td><td>Growing month over month</td></tr>
    <tr><td>LTV</td><td>ARPU × avg subscription months</td><td>LTV &gt; 3× CAC</td></tr>
    <tr><td>CAC</td><td>Total marketing spend / new paying members</td><td>Minimize over time</td></tr>
    <tr><td>Creator Take Rate</td><td>Total creator earnings / total gross revenue</td><td>≥ 60%</td></tr>
    <tr><td>Churn Rate</td><td>% PRIME members who don't renew each month</td><td>&lt; 10%</td></tr>
  </tbody></table>
  <h3>90-Day OKRs</h3>
  <table><thead><tr><th style="width:30%">Area</th><th style="width:70%">Key Result</th></tr></thead><tbody>
    <tr><td class="ca">Company</td><td>Zoho One fully operational (CRM + Books + Campaigns) by day 30</td></tr>
    <tr><td class="ca">Technology</td><td>BullMQ live, zero silent failures for 30 consecutive days</td></tr>
    <tr><td class="ca">Creator Welfare</td><td>Creator welfare ATS live, all new applications processed through it</td></tr>
    <tr><td class="ca">Finance</td><td>First P&amp;L report generated in Zoho Analytics by day 30</td></tr>
    <tr><td class="ca">Marketing</td><td>First re-engagement campaign to churned PRIME subscribers sent by day 30</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC 1 — BUSINESS PLAN (ES)
// ─────────────────────────────────────────────────────────────────────────────
function doc1es() {
  const B = 'PNPtv!', D = 'Plan de Desarrollo Empresarial';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<div class="cover">
  <div><div class="cover-bar"></div>
    <div class="cover-brand">PNP<span>tv!</span></div>
    <div class="cover-tag">La Plataforma — Documento Interno</div></div>
  <div>
    <div class="cover-title">Plan de<br>Desarrollo<br>Empresarial</div>
    <div class="cover-sub">Identidad corporativa, estructura organizacional, marco de bienestar para creadores, modelo de ingresos y estrategia competitiva.</div></div>
  <div class="cover-meta"><span class="cover-date">Agosto 2026 — Confidencial</span><span class="cover-badge">Fase 2</span></div>
  <div class="cover-line"></div><div class="cover-dec"></div><div class="cover-dec2"></div>
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">01 — Identidad Corporativa</div>
  <h2>Quiénes Somos y Por Qué Existimos</h2>
  <p class="lead">Los adultos queer que viven fuera de la corriente dominante merecen una plataforma que no se disculpe por quiénes son. Existimos para dar a la comunidad PNP un espacio donde los creadores construyen ingresos reales, los miembros encuentran conexión real, y nadie tiene que esconderse.</p>
  <h3>Misión</h3>
  <p>Dirigimos la plataforma adulta más segura y enfocada en los creadores para comunidades queer — donde el bienestar, la autonomía y la dignidad son principios operativos no negociables, no copia de marketing.</p>
  <h3>Visión</h3>
  <p>El referente global para la economía de creadores adultos ética — donde la industria nos mira cuando quiere saber cómo se ve realmente una economía de creadores responsable.</p>
  <h3>Métrica Estrella del Norte</h3>
  <div class="callout"><div class="callout-t">Ingresos Activos de Creadores</div><p>El total de ingresos mensuales generados por los creadores en la plataforma. Cuando los creadores ganan más, todo lo demás sigue: mejor contenido, más miembros, más confianza.</p></div>
  <h3>Valores</h3>
  <div class="values">
    <div class="vc"><div class="vc-t">Honestidad Radical</div><div class="vc-d">Le decimos a los creadores nuestra comisión. Publicamos nuestras estadísticas de seguridad. No nos ocultamos detrás de políticas.</div></div>
    <div class="vc"><div class="vc-t">Lanzar y Mejorar</div><div class="vc-d">Lanzamos cosas imperfectas rápido y las mejoramos con retroalimentación real de usuarios.</div></div>
    <div class="vc"><div class="vc-t">Proteger Primero</div><div class="vc-d">Cualquier decisión que intercambie la seguridad del usuario por ingresos es rechazada. Siempre, sin excepción.</div></div>
    <div class="vc"><div class="vc-t">Liderado por Creadores</div><div class="vc-d">Las decisiones importantes de producto pasan por un panel asesor de creadores antes de lanzarse.</div></div>
    <div class="vc"><div class="vc-t">Sin Teatro</div><div class="vc-d">Sin teatro corporativo. Sin reuniones innecesarias. Sin valores performativos.</div></div>
    <div class="vc"><div class="vc-t">Comunidad Primero</div><div class="vc-d">Las decisiones de negocio sirven a la comunidad, no al revés.</div></div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">02 — Estructura Organizacional</div>
  <h2>Empresa de 10 Personas — Fase 2</h2>
  <div class="org">
    <div class="org-top">
      <div class="org-box a">CEO / CCO — Santino</div>
      <span class="arrow">→</span>
      <div class="org-box p">CTO / CPO — Carlos</div>
    </div>
    <div class="org-row">
      <div class="org-dept"><div class="org-dept-t">Tecnología</div><div class="org-dept-r">Carlos (CTO)<br>Ing. Full-Stack<br>DevOps / SRE</div></div>
      <div class="org-dept"><div class="org-dept-t">Bienestar</div><div class="org-dept-r">Gestor de Éxito<br>Oficial de Bienestar</div></div>
      <div class="org-dept"><div class="org-dept-t">Marketing</div><div class="org-dept-r">Gest. Comunidad<br>Esp. Crecimiento</div></div>
      <div class="org-dept"><div class="org-dept-t">Ops y Finanzas</div><div class="org-dept-r">Gerente de Ops</div></div>
      <div class="org-dept"><div class="org-dept-t">Exp. del Cliente</div><div class="org-dept-r">Líder de CX</div></div>
    </div>
  </div>
  <h3>Mandatos Departamentales</h3>
  <table><thead><tr><th style="width:20%">Dpto</th><th style="width:45%">Mandato Principal</th><th style="width:35%">Responsabilidades</th></tr></thead><tbody>
    <tr><td class="ca">Tecnología</td><td>Plataforma en línea, rápida y segura. Lanzar a tiempo.</td><td>Arquitectura, despliegues, infraestructura</td></tr>
    <tr><td class="ca">Bienestar Creadores</td><td>Cada creador activo está aquí por libre elección informada. Confirmar en la entrada; proteger continuamente.</td><td>ATS, formación, seguimientos, protocolo de angustia</td></tr>
    <tr><td class="ca">Marketing</td><td>Crecer la base de miembros sin comprometer la marca ni los valores comunitarios.</td><td>Zoho Campaigns, redes sociales, referidos</td></tr>
    <tr><td class="ca">Ops y Finanzas</td><td>Impuestos presentados, creadores pagados a tiempo, 2257 vigente, contratos firmados.</td><td>Zoho Books, calendario 2257, contratos</td></tr>
    <tr><td class="ca">Exp. del Cliente</td><td>Respuestas humanas en menos de 24h para todas las escalaciones.</td><td>Escalaciones de soporte, relaciones con miembros</td></tr>
  </tbody></table>
  <h3>Plan de Contratación</h3>
  <table><thead><tr><th style="width:5%">#</th><th style="width:32%">Rol</th><th style="width:22%">Departamento</th><th style="width:13%">Mes</th><th style="width:28%">Costo Mensual Est.</th></tr></thead><tbody>
    <tr><td>1</td><td>Gerente de Operaciones</td><td>Ops y Finanzas</td><td>Mes 1</td><td>$1,200–2,000</td></tr>
    <tr><td>2</td><td>Gestor de Éxito de Creadores</td><td>Bienestar</td><td>Mes 2</td><td>$1,000–1,800</td></tr>
    <tr><td>3</td><td>Oficial de Bienestar y Seguridad</td><td>Bienestar</td><td>Mes 3</td><td>$1,200–2,000</td></tr>
    <tr><td>4</td><td>Gest. de Contenido / Comunidad</td><td>Marketing</td><td>Mes 4</td><td>$800–1,500</td></tr>
    <tr><td>5</td><td>Especialista en Crecimiento</td><td>Marketing</td><td>Mes 5</td><td>$1,200–2,000</td></tr>
    <tr><td>6</td><td>DevOps / SRE</td><td>Tecnología</td><td>Mes 6</td><td>$1,500–2,500</td></tr>
    <tr><td>7</td><td>Líder de CX</td><td>Exp. del Cliente</td><td>Mes 7</td><td>$800–1,400</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">03 — Bienestar de Creadores y ATS</div>
  <h2>Pipeline de Incorporación con Bienestar Primero</h2>
  <div class="callout"><div class="callout-t">Principio Central</div><p>Esto NO es un embudo de adquisición de talento. Es un proceso de incorporación con bienestar primero que resulta en la incorporación de creadores. Cada etapa detecta: coerción, desesperación financiera sin alternativas, aislamiento o control de terceros. <strong>Herramienta:</strong> Zoho Recruit (incluido en Zoho One).</p></div>
  <div class="stages">
    <div class="stage"><div class="stage-n">01</div><div><div class="stage-t">Descubrimiento</div><div class="stage-d">Rastrear fuente: orgánico, referido (¿qué creador?), redes sociales, Telegram. Referido por creador conocido = señal de mayor calidad. Referido por "agente" desconocido = señal de alerta.</div></div></div>
    <div class="stage"><div class="stage-n">02</div><div><div class="stage-t">Expresión de Interés</div><div class="stage-d">Formulario ligero: edad, ubicación, tipo de contenido, usuario de Telegram. Requisito estricto: 18+. Sin fotos ni contenido requerido aún.</div></div></div>
    <div class="stage"><div class="stage-n">03</div><div><div class="stage-t">Solicitud Completa</div><div class="stage-d">Nombre legal, documento de identidad, presencia en redes (solo verificación), por qué quiere crear, qué contenido planea, si alguien le ayudó a completar la solicitud (señal de alerta si sí pero no puede nombrar a quién), contacto de emergencia.</div></div></div>
    <div class="stage"><div class="stage-n">04</div><div><div class="stage-t">Verificación de Documentos</div><div class="stage-d">ID compatible con 2257 verificado. Edad confirmada. Identidad cruzada. Zoho Sign: reconocimiento 2257 firmado electrónicamente. Descalificación: ID falso, menor de 18, nombre no coincide sin explicación.</div></div></div>
    <div class="stage hi"><div class="stage-n">05</div><div><div class="stage-t">Entrevista de Bienestar — Etapa Más Importante</div><div class="stage-d">Videollamada de 30 minutos. Conversacional, NO interrogativa. Tono: "queremos conocerte antes de que te unas." Evalúa: participación voluntaria, contexto financiero, red de apoyo, uso de sustancias (específico para PNP, sin juicios), comprensión de la permanencia del contenido, involucramiento de terceros. Descalificadores: señales de control de terceros, dependencia que afecte la capacidad, desinformado sobre permanencia.</div></div></div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="stages" style="margin-bottom:14px;">
    <div class="stage"><div class="stage-n">06</div><div><div class="stage-t">Incorporación de Prueba (30 días)</div><div class="stage-d">Acceso completo a la plataforma. Seguimiento semanal del Gestor de Éxito. Semana 2: revisión de contenido (enfoque en bienestar). Semana 4: llamada de revisión de prueba — pasar a Activo, extender o salida digna.</div></div></div>
    <div class="stage"><div class="stage-n">07</div><div><div class="stage-t">Creador Activo</div><div class="stage-d">Estado completo. Seguimiento mensual de bienestar. Revisión trimestral de ingresos. Recordatorio anual de renovación 2257 vía automatización n8n.</div></div></div>
    <div class="stage"><div class="stage-n">08</div><div><div class="stage-t">Protocolo de Señal de Angustia</div><div class="stage-d">Activadores: 14+ días sin respuesta, caída de ingresos del 80%+, reporte de abuso de un miembro, mensaje de angustia. El Gestor de Éxito contacta personalmente. Oficial de Bienestar involucrado. Opciones: pausa extendida, referencia a recursos de reducción de daños, salida.</div></div></div>
    <div class="stage"><div class="stage-n">09</div><div><div class="stage-t">Desvinculación</div><div class="stage-d">Voluntaria: opciones de pausa explicadas, proceso de eliminación aclarado, entrevista de salida ofrecida. Involuntaria: razón por escrito, proceso de apelación disponible, 30 días de archivo antes de eliminar.</div></div></div>
  </div>
  <div class="lbl">04 — Modelo de Ingresos</div>
  <h2>Flujos de Ingresos</h2>
  <table><thead><tr><th style="width:28%">Flujo</th><th style="width:48%">Descripción</th><th style="width:24%">Comisión</th></tr></thead><tbody>
    <tr><td class="ca">Suscripciones PRIME</td><td>Membresía mensual de plataforma — principal generador de ingresos</td><td>100% plataforma</td></tr>
    <tr><td class="ca">Suscripciones de Canal</td><td>Pases de 30 días para canales de creadores de pago</td><td>30% / 70% creador</td></tr>
    <tr><td class="ca">Llamadas Privadas</td><td>Tarifa de reserva + comisión por sesión</td><td>30% / 70% creador</td></tr>
    <tr><td class="ca">Tokens Ru$h</td><td>Propinas durante transmisiones en vivo y hangouts</td><td>30% / 70% creador</td></tr>
    <tr><td class="ca">Shows con Entrada</td><td>Eventos de pago único en Main Stage</td><td>Mes 8</td></tr>
    <tr><td class="ca">Certificación de Formación</td><td>No creadores pagan por acceso al contenido de Creator Academy</td><td>Mes 8</td></tr>
    <tr><td class="ca">Impulsos de Perfil</td><td>Pago con tokens Ru$h por 24hr de impulso en descubrimiento</td><td>Mes 8</td></tr>
    <tr><td class="ca">Licenciamiento B2B</td><td>Licenciar el ATS de bienestar primero a otras plataformas</td><td>Año 2–3</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">05 — Posicionamiento de Mercado</div>
  <h2>Ventaja Competitiva Sostenible</h2>
  <p><strong>NO somos:</strong> una plataforma adulta generalista (OnlyFans, Fansly) · una app de citas (Grindr, Scruff) · un sitio de pornografía genérico.</p>
  <p><strong>SOMOS:</strong> La única plataforma adulta construida explícitamente para la comunidad queer relacionada con PNP, con reducción de daños y bienestar de creadores como principios operativos no negociables.</p>
  <h3>Ventaja Competitiva</h3>
  <table><thead><tr><th style="width:30%">Ventaja</th><th style="width:70%">Por Qué Es Defendible</th></tr></thead><tbody>
    <tr><td class="ca">Especificidad Comunitaria</td><td>Nicho PNP + queer = lealtad profunda, baja sustitución. Los miembros no pueden encontrar esto en otro lugar.</td></tr>
    <tr><td class="ca">Marca de Bienestar</td><td>Un creador que se siente protegido permanece y aboga. Imposible de falsificar por un competidor respaldado por capital de riesgo.</td></tr>
    <tr><td class="ca">Credibilidad en Seguridad</td><td>La reducción de daños integrada se convierte en un escudo legal y reputacional, no solo un punto de marketing.</td></tr>
    <tr><td class="ca">Confiabilidad Técnica</td><td>Cuando se ejecute la hoja de ruta de arquitectura: mejor tiempo de actividad y herramientas que cualquier plataforma comparable.</td></tr>
    <tr><td class="ca">Confianza Comunitaria</td><td>La marca personal de Santino y las relaciones con la comunidad no son replicables por ningún inversor externo.</td></tr>
  </tbody></table>
  <h3>OKRs — Primeros 90 Días</h3>
  <table><thead><tr><th style="width:30%">Área</th><th style="width:70%">Resultado Clave</th></tr></thead><tbody>
    <tr><td class="ca">Empresa</td><td>Zoho One completamente operativo (CRM + Books + Campaigns) en el día 30</td></tr>
    <tr><td class="ca">Tecnología</td><td>BullMQ en vivo, cero fallos silenciosos durante 30 días consecutivos</td></tr>
    <tr><td class="ca">Bienestar Creadores</td><td>ATS de bienestar en vivo, todas las nuevas solicitudes procesadas a través de él</td></tr>
    <tr><td class="ca">Finanzas</td><td>Primer informe de P&amp;L generado en Zoho Analytics en el día 30</td></tr>
    <tr><td class="ca">Marketing</td><td>Primera campaña de re-engagement a suscriptores PRIME perdidos enviada en el día 30</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC 2 — PHASE 2 ROADMAP (EN)
// ─────────────────────────────────────────────────────────────────────────────
function doc2en() {
  const B = 'PNPtv!', D = 'Phase 2 Roadmap';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<div class="cover">
  <div><div class="cover-bar"></div>
    <div class="cover-brand">PNP<span>tv!</span></div>
    <div class="cover-tag">The Platform — Internal Document</div></div>
  <div>
    <div class="cover-title">Phase 2<br>Roadmap</div>
    <div class="cover-sub">12-month plan from current 3-person operation to world-class 10-person platform. Current state, gaps, milestones, hiring, financials, and risk.</div></div>
  <div class="cover-meta"><span class="cover-date">August 2026 — Confidential</span><span class="cover-badge">12 Months</span></div>
  <div class="cover-line"></div><div class="cover-dec"></div><div class="cover-dec2"></div>
</div>

<!-- PAGE 1: CURRENT STATE + PILLARS -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">01 — Situation Analysis</div>
  <h2>Current State vs. Phase 2 Vision</h2>
  <table><thead><tr><th style="width:18%">Area</th><th style="width:41%">Phase 1 — Now</th><th style="width:41%">Phase 2 — Month 12</th></tr></thead><tbody>
    <tr><td class="ca">Team</td><td>3 people, no departments, everyone does everything</td><td>10 people, 5 departments, clear accountabilities</td></tr>
    <tr><td class="ca">Financials</td><td>No tracking. Revenue and costs untracked formally.</td><td>Zoho Books: real-time P&amp;L, tax compliance, payouts</td></tr>
    <tr><td class="ca">CRM</td><td>None. No customer lifecycle visibility.</td><td>Zoho CRM: full creator + subscriber lifecycle</td></tr>
    <tr><td class="ca">Creator Intake</td><td>Informal. No welfare screening.</td><td>9-stage welfare-first ATS (Zoho Recruit)</td></tr>
    <tr><td class="ca">Marketing</td><td>Manual broadcast scripts. No campaigns system.</td><td>Zoho Campaigns: segmented, automated, measured</td></tr>
    <tr><td class="ca">Reliability</td><td>Silent failures. Crashes lose work. No observability.</td><td>BullMQ: zero silent failures. OpenTelemetry: full traces.</td></tr>
    <tr><td class="ca">Creator Comms</td><td>In-app notifications (get lost). Manual outreach.</td><td>Slack-only: personal #ext-[handle] per creator</td></tr>
    <tr><td class="ca">Ops Automation</td><td>Manual scripts, cron one-offs, fire-and-forget.</td><td>n8n: 8+ automated workflows, auditable, reusable</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">02 — Strategic Pillars</div>
  <h2>Five Pillars of the Transition</h2>
  <div class="pillars">
    <div class="pillar"><div class="pillar-n">01</div><div class="pillar-t">Business Infrastructure</div><p>Zoho One (CRM, Books, Campaigns, Recruit, Sign), financial tracking, tax compliance, formal department structure.</p></div>
    <div class="pillar"><div class="pillar-n">02</div><div class="pillar-t">Creator Welfare &amp; Success</div><p>Welfare-first ATS, creator Slack onboarding, training program, monthly check-ins, distress protocol.</p></div>
    <div class="pillar"><div class="pillar-n">03</div><div class="pillar-t">Platform Reliability</div><p>BullMQ event bus, circuit breakers, OpenTelemetry, service extraction, zero silent failures.</p></div>
    <div class="pillar"><div class="pillar-n">04</div><div class="pillar-t">Marketing Engine</div><p>Manual scripts → automated lifecycle campaigns. Referral programs. Creator Advisory Panel.</p></div>
    <div class="pillar"><div class="pillar-n">05</div><div class="pillar-t">Feature Excellence</div><p>Main Stage upgrades, call quality, Hangout→Slack bridge, creator analytics, ticketed shows.</p></div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 2: Q1 TIMELINE -->
<div class="page">
  ${ph(B,D)}
  <div class="phase-hdr">
    <div class="phase-q">Q1</div>
    <div class="phase-info">
      <div class="phase-name">Foundation</div>
      <div class="phase-sub">Months 0–3 · Infrastructure, ATS, Automation</div>
    </div>
  </div>
  <div class="tl">
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Week</div><div class="tl-dot-num">0</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Lock the Baseline</div>
        <div class="tl-items">• Document current users, PRIME subscribers, active creators, MRR<br>• Define roles in writing: Santino, Carlos, Miguel<br>• Zoho One workspace created and configured<br>• Business bank account confirmed and operational<br>• All existing processes documented</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">1</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Business Infrastructure</div>
        <div class="tl-items">• Zoho Books: all expenses + NowPayments income auto-synced via n8n<br>• Zoho CRM: users + creators imported, lifecycle stages configured<br>• Zoho Recruit: ATS pipeline live — all 9 welfare stages configured<br>• BullMQ: notification dispatch migrated — nothing lost on crash<br>• First P&amp;L baseline generated</div>
        <div class="tl-hire">Hire #1 — Operations Manager</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">2</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Creator Operations</div>
        <div class="tl-items">• Welfare audit of all existing active creators completed<br>• Creator ATS live — every new application goes through the 9-stage pipeline<br>• Slack ops hub live: #ops-payments, #ops-incidents, #ops-creator, #support-human<br>• Support escalation: Cristina AI → #support-human Slack thread (bidirectional)<br>• BullMQ: all payment flows are persistent, retried jobs</div>
        <div class="tl-hire">Hire #2 — Creator Success Manager</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">3</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Automation Foundation</div>
        <div class="tl-items">• n8n live: 5 core workflows — user→CRM, payment→Books, creator approved→welcome, 2257 expiry chain, churn→re-engagement<br>• Circuit breakers on every external API: NowPayments, Telegram, Slack, Grok, SMTP, LiveKit<br>• 2257 expiry fully automated: 14d → 7d → 3d → 1d warnings → auto-suspend<br>• Harm reduction partnerships identified: 2–3 LGBTQ+ orgs in LATAM</div>
        <div class="tl-hire">Hire #3 — Welfare &amp; Safety Officer</div>
      </div>
    </div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 3: Q2 TIMELINE -->
<div class="page">
  ${ph(B,D)}
  <div class="phase-hdr">
    <div class="phase-q q2">Q2</div>
    <div class="phase-info">
      <div class="phase-name">Operations &amp; Reliability</div>
      <div class="phase-sub">Months 4–6 · Creator Comms, Marketing Engine, Platform Stability</div>
    </div>
  </div>
  <div class="tl">
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q2"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">4</div></div></div>
      <div class="tl-body q2">
        <div class="tl-title">Creator Communications</div>
        <div class="tl-items">• 80% creator Slack adoption — #ext-[handle] channels live for all active creators<br>• 6 training Canvases + Loom tutorial videos published in Slack<br>• Creator notifications: Slack-only — in-app notifications disabled for creators<br>• Zoho Campaigns: welcome drip + creator onboarding sequences live<br>• Creator Advisory Panel invited: 5 rotating creators, paid in Ru$h tokens</div>
        <div class="tl-hire">Hire #4 — Content / Community Manager</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q2"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">5</div></div></div>
      <div class="tl-body q2">
        <div class="tl-title">Marketing Engine</div>
        <div class="tl-items">• All broadcast-*.js scripts replaced by Zoho Campaigns<br>• Creator referral program live (500 Ru$h bonus for both parties, 90 days)<br>• Member referral program live (1 free month for the referrer)<br>• First re-engagement campaign: churned PRIME subscribers, A/B tested on subject line<br>• OpenTelemetry + Grafana Tempo live — every slow API query now has a trace</div>
        <div class="tl-hire">Hire #5 — Growth Marketer</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q2"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">6</div></div></div>
      <div class="tl-body q2">
        <div class="tl-title">Platform Reliability</div>
        <div class="tl-items">• Notification Service extracted to its own Docker container — failures don't touch API<br>• Socket.IO Redis adapter live — horizontal scaling ready without code changes<br>• Stream recording → automatic VOD pipeline via LiveKit Cloud recording API<br>• Mux Data: viewer count + quality score in Grafana dashboard<br>• First quarterly P&amp;L review presented to leadership</div>
        <div class="tl-hire">Hire #6 — DevOps / SRE</div>
      </div>
    </div>
  </div>
  <div class="ms-check">
    <div class="ms-check-t">Milestone Gate — Month 6</div>
    <div class="ms-check-list">
      <div class="ms-check-item">✓ Zoho One fully operational</div>
      <div class="ms-check-item">✓ All 6 hires in place</div>
      <div class="ms-check-item">✓ ≥ 80% creators active in Slack</div>
      <div class="ms-check-item">✓ Zero manual broadcast scripts</div>
      <div class="ms-check-item">✓ Zero silent job failures (30 days)</div>
      <div class="ms-check-item">✓ First quarterly P&amp;L reviewed</div>
    </div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 4: Q3+Q4 TIMELINE -->
<div class="page">
  ${ph(B,D)}
  <div class="phase-hdr">
    <div class="phase-q q3">Q3–Q4</div>
    <div class="phase-info">
      <div class="phase-name">Excellence &amp; Scale</div>
      <div class="phase-sub">Months 7–12 · Feature Upgrades, Revenue, Phase 3 Scoping</div>
    </div>
  </div>
  <div class="tl">
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q3"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">7</div></div></div>
      <div class="tl-body q3">
        <div class="tl-title">Feature Excellence</div>
        <div class="tl-items">• Main Stage: tipping animations, live viewer polls, pre-stream lobby + countdown, health display<br>• Private Calls: LiveKit Krisp noise cancellation, post-call star ratings, extension booking mid-call<br>• Hangout → Slack bridge: creators monitor and reply from Slack in real time<br>• Creator analytics dashboard live at /creator/analytics</div>
        <div class="tl-hire">Hire #7 — CX Lead</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q3"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">8</div></div></div>
      <div class="tl-body q3">
        <div class="tl-title">Revenue Diversification</div>
        <div class="tl-items">• Ticketed shows launched on Main Stage (schema exists — frontend only needed)<br>• Creator Training Certification: paid Creator Academy access for non-creators<br>• Creator profile boosts: Ru$h CPM model surfaced in discovery<br>• First paid marketing test: Telegram Ads (adult-friendly)<br>• All creators sign updated platform agreement via Zoho Sign</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q3"><div class="tl-dot-lbl">Month</div><div class="tl-dot-num">9</div></div></div>
      <div class="tl-body q3">
        <div class="tl-title">Consolidation</div>
        <div class="tl-items">• Media Processing extracted to CPU-isolated container — video encoding no longer competes with API<br>• Full 2257 compliance audit — n8n auto-suspends any expired creator<br>• 6-month welfare check-in with every active creator<br>• Year-end tax preparation begins with Ops Manager + local CPA<br>• Second quarterly P&amp;L review</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q4"><div class="tl-dot-lbl" style="color:${C.accent};">Months</div><div class="tl-dot-num" style="color:${C.accent};font-size:10px;">10–12</div></div></div>
      <div class="tl-body q4">
        <div class="tl-title">Scale Readiness + Phase 3 Scoping</div>
        <div class="tl-items">• Annual load test: simulate 10× current peak traffic, identify and fix bottlenecks<br>• All 10 team members in place and fully onboarded<br>• First annual P&amp;L + tax filing: Ops Manager + local CPA<br>• Annual OKR review — measure every KPI against Phase 2 targets<br>• Creator Advisory Panel annual review — their input shapes Phase 3<br>• Phase 3 scoping: B2B platform licensing, cloud migration, investor readiness</div>
      </div>
    </div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 5: TOOLS + FINANCES + RISKS + KPIS -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">04 — Tools &amp; Financials</div>
  <h2>Tool Adoption &amp; Budget</h2>
  <table><thead><tr><th style="width:22%">Tool</th><th style="width:42%">Purpose</th><th style="width:18%">Live By</th><th style="width:18%">Monthly Cost</th></tr></thead><tbody>
    <tr><td class="ca">Zoho One</td><td>CRM + Books + Campaigns + Recruit + Sign</td><td>Month 1</td><td>$111</td></tr>
    <tr><td class="ca">Slack Pro</td><td>Internal ops + creator Slack Connect channels</td><td>Month 2</td><td>$22</td></tr>
    <tr><td class="ca">n8n (self-hosted)</td><td>Automation backbone — replaces all manual scripts</td><td>Month 3</td><td>$0</td></tr>
    <tr><td class="ca">Loom</td><td>Creator training videos embedded in Slack Canvases</td><td>Month 4</td><td>$0</td></tr>
    <tr><td class="ca">OpenTelemetry + Tempo</td><td>Distributed tracing, full performance visibility</td><td>Month 5</td><td>$0</td></tr>
    <tr><td class="ca">Mux Data</td><td>Stream analytics — viewer count, quality monitoring</td><td>Month 6</td><td>$0</td></tr>
    <tr><td class="ca">PagerDuty (free)</td><td>On-call alerting, incident escalation rotation</td><td>Month 6</td><td>$0</td></tr>
    <tr><td><strong>Total</strong></td><td></td><td></td><td><strong>$133/mo</strong></td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">05 — Risk Register</div>
  <table><thead><tr><th style="width:34%">Risk</th><th style="width:13%">Likelihood</th><th style="width:13%">Impact</th><th style="width:40%">Mitigation</th></tr></thead><tbody>
    <tr><td>Welfare Officer hire takes 2+ months</td><td>High</td><td>Medium</td><td>Creator Success Manager runs structured welfare interviews until filled</td></tr>
    <tr><td>Creator resistance to Slack onboarding</td><td>Medium</td><td>High</td><td>First notification = a real booking or tip. Immediate value drives adoption.</td></tr>
    <tr><td>Revenue lags hiring timeline</td><td>Medium</td><td>High</td><td>Hiring gate rule. Content Mgr and CX Lead start part-time.</td></tr>
    <tr><td>BullMQ migration breaks flows</td><td>Low</td><td>High</td><td>New features get BullMQ first. Legacy code migrated only after proven.</td></tr>
    <tr><td>Regulatory changes for adult platforms</td><td>Low</td><td>Very High</td><td>Legal review in Month 1. Compliance counsel on retainer.</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">06 — KPIs</div>
  <table><thead><tr><th style="width:22%">Department</th><th style="width:44%">KPI</th><th style="width:34%">Target</th></tr></thead><tbody>
    <tr><td rowspan="3" class="ca">Platform Health</td><td>Uptime</td><td>≥ 99.9%</td></tr>
    <tr><td>API P95 response time</td><td>&lt; 300ms</td></tr>
    <tr><td>BullMQ job failure rate</td><td>&lt; 0.1%</td></tr>
    <tr><td rowspan="3" class="ca">Creator Success</td><td>Creator Slack adoption (Month 6)</td><td>≥ 90%</td></tr>
    <tr><td>Monthly check-in completion</td><td>≥ 90%</td></tr>
    <tr><td>Creator churn rate</td><td>&lt; 5%/month</td></tr>
    <tr><td rowspan="2" class="ca">Marketing</td><td>PRIME subscriber growth</td><td>≥ 15% MoM</td></tr>
    <tr><td>Email open rate</td><td>&gt; 25%</td></tr>
    <tr><td rowspan="2" class="ca">Customer Exp.</td><td>Cristina L1 resolution rate</td><td>&gt; 80%</td></tr>
    <tr><td>Human escalation response time</td><td>&lt; 4h business hours</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC 2 — PHASE 2 ROADMAP (ES)
// ─────────────────────────────────────────────────────────────────────────────
function doc2es() {
  const B = 'PNPtv!', D = 'Hoja de Ruta — Fase 2';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<div class="cover">
  <div><div class="cover-bar"></div>
    <div class="cover-brand">PNP<span>tv!</span></div>
    <div class="cover-tag">La Plataforma — Documento Interno</div></div>
  <div>
    <div class="cover-title">Hoja de<br>Ruta<br>Fase 2</div>
    <div class="cover-sub">Plan de 12 meses: de operación actual de 3 personas a plataforma de clase mundial con 10 personas. Estado actual, brechas, hitos, contrataciones, finanzas y riesgos.</div></div>
  <div class="cover-meta"><span class="cover-date">Agosto 2026 — Confidencial</span><span class="cover-badge">12 Meses</span></div>
  <div class="cover-line"></div><div class="cover-dec"></div><div class="cover-dec2"></div>
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">01 — Análisis de Situación</div>
  <h2>Estado Actual vs. Visión Fase 2</h2>
  <table><thead><tr><th style="width:18%">Área</th><th style="width:41%">Fase 1 — Hoy</th><th style="width:41%">Fase 2 — Mes 12</th></tr></thead><tbody>
    <tr><td class="ca">Equipo</td><td>3 personas, sin departamentos, todos hacen todo</td><td>10 personas, 5 departamentos, responsabilidades claras</td></tr>
    <tr><td class="ca">Finanzas</td><td>Sin seguimiento formal de ingresos ni gastos</td><td>Zoho Books: P&amp;L en tiempo real, cumplimiento fiscal</td></tr>
    <tr><td class="ca">CRM</td><td>Ninguno. Sin visibilidad del ciclo de vida del cliente.</td><td>Zoho CRM: ciclo completo creador + suscriptor</td></tr>
    <tr><td class="ca">Incorporación</td><td>Informal. Sin evaluación de bienestar.</td><td>ATS de 9 etapas con bienestar primero (Zoho Recruit)</td></tr>
    <tr><td class="ca">Marketing</td><td>Scripts manuales de difusión. Sin sistema de campañas.</td><td>Zoho Campaigns: segmentado, automatizado, medible</td></tr>
    <tr><td class="ca">Confiabilidad</td><td>Fallos silenciosos. Caídas pierden trabajo. Sin visibilidad.</td><td>BullMQ: cero fallos silenciosos. OpenTelemetry: trazas.</td></tr>
    <tr><td class="ca">Comms Creadores</td><td>Notificaciones en app (se pierden). Contacto manual.</td><td>Solo Slack: canal personal #ext-[handle] por creador</td></tr>
    <tr><td class="ca">Automatización</td><td>Scripts manuales, crons aislados, fire-and-forget.</td><td>n8n: 8+ flujos automatizados, auditables, reutilizables</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">02 — Pilares Estratégicos</div>
  <h2>Los Cinco Pilares de la Transición</h2>
  <div class="pillars">
    <div class="pillar"><div class="pillar-n">01</div><div class="pillar-t">Infraestructura Empresarial</div><p>Zoho One (CRM, Books, Campaigns, Recruit, Sign), seguimiento financiero, cumplimiento fiscal, estructura departamental formal.</p></div>
    <div class="pillar"><div class="pillar-n">02</div><div class="pillar-t">Bienestar y Éxito del Creador</div><p>ATS con bienestar primero, incorporación a Slack, programa de formación, seguimientos mensuales, protocolo de angustia.</p></div>
    <div class="pillar"><div class="pillar-n">03</div><div class="pillar-t">Confiabilidad de Plataforma</div><p>Cola de eventos BullMQ, disyuntores, OpenTelemetry, extracción de servicios, cero fallos silenciosos.</p></div>
    <div class="pillar"><div class="pillar-n">04</div><div class="pillar-t">Motor de Marketing</div><p>Scripts manuales → campañas automatizadas del ciclo de vida. Programas de referidos. Panel asesor de creadores.</p></div>
    <div class="pillar"><div class="pillar-n">05</div><div class="pillar-t">Excelencia de Características</div><p>Mejoras de Main Stage, calidad de llamadas, puente Hangout→Slack, analíticas para creadores, shows con entrada.</p></div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="phase-hdr">
    <div class="phase-q">Q1</div>
    <div class="phase-info">
      <div class="phase-name">Fundación</div>
      <div class="phase-sub">Meses 0–3 · Infraestructura, ATS, Automatización</div>
    </div>
  </div>
  <div class="tl">
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Semana</div><div class="tl-dot-num">0</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Establecer la Línea Base</div>
        <div class="tl-items">• Documentar usuarios actuales, suscriptores PRIME, creadores activos, MRR<br>• Definir roles por escrito: Santino, Carlos, Miguel<br>• Espacio de trabajo Zoho One creado y configurado<br>• Cuenta bancaria empresarial confirmada y operativa<br>• Todos los procesos existentes documentados</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">1</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Infraestructura Empresarial</div>
        <div class="tl-items">• Zoho Books: todos los gastos + ingresos NowPayments sincronizados automáticamente vía n8n<br>• Zoho CRM: usuarios + creadores importados, etapas del ciclo de vida configuradas<br>• Zoho Recruit: pipeline ATS activo — las 9 etapas de bienestar configuradas<br>• BullMQ: despacho de notificaciones migrado — nada se pierde al caer el servidor<br>• Primer P&amp;L base generado</div>
        <div class="tl-hire">Contratación #1 — Gerente de Operaciones</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">2</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Operaciones de Creadores</div>
        <div class="tl-items">• Auditoría de bienestar de todos los creadores activos existentes completada<br>• ATS en vivo — todas las nuevas solicitudes pasan por el pipeline de 9 etapas<br>• Hub Slack operativo: #ops-payments, #ops-incidents, #ops-creator, #support-human<br>• Escalación de soporte: Cristina IA → hilo Slack #support-human (bidireccional)<br>• BullMQ: todos los flujos de pago son trabajos persistentes con reintento automático</div>
        <div class="tl-hire">Contratación #2 — Gestor de Éxito de Creadores</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">3</div></div></div>
      <div class="tl-body">
        <div class="tl-title">Fundación de Automatización</div>
        <div class="tl-items">• n8n en vivo: 5 flujos principales — usuario→CRM, pago→Books, creador aprobado→bienvenida, cadena 2257, baja→re-engagement<br>• Disyuntores en todas las APIs externas: NowPayments, Telegram, Slack, Grok, SMTP, LiveKit<br>• Vencimiento 2257 completamente automatizado: 14d → 7d → 3d → 1d → auto-suspensión<br>• Alianzas de reducción de daños identificadas: 2–3 organizaciones LGBTQ+ en LATAM</div>
        <div class="tl-hire">Contratación #3 — Oficial de Bienestar y Seguridad</div>
      </div>
    </div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="phase-hdr">
    <div class="phase-q q2">Q2</div>
    <div class="phase-info">
      <div class="phase-name">Operaciones y Confiabilidad</div>
      <div class="phase-sub">Meses 4–6 · Comms Creadores, Motor de Marketing, Estabilidad</div>
    </div>
  </div>
  <div class="tl">
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q2"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">4</div></div></div>
      <div class="tl-body q2">
        <div class="tl-title">Comunicaciones con Creadores</div>
        <div class="tl-items">• 80% de adopción de Slack por creadores — canales #ext-[handle] activos para todos<br>• 6 Canvases de formación + videos Loom publicados en Slack<br>• Notificaciones de creadores: solo Slack — notificaciones en app deshabilitadas para creadores<br>• Zoho Campaigns: secuencias de bienvenida + incorporación de creadores activas<br>• Panel asesor de creadores invitado: 5 creadores rotativos, compensados en tokens Ru$h</div>
        <div class="tl-hire">Contratación #4 — Gestor de Contenido / Comunidad</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q2"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">5</div></div></div>
      <div class="tl-body q2">
        <div class="tl-title">Motor de Marketing</div>
        <div class="tl-items">• Todos los scripts broadcast-*.js reemplazados por Zoho Campaigns<br>• Programa de referidos de creadores activo (bono 500 Ru$h para ambas partes, 90 días)<br>• Programa de referidos de miembros activo (1 mes gratis para el referidor)<br>• Primera campaña de re-engagement: suscriptores PRIME perdidos, con A/B test en asunto<br>• OpenTelemetry + Grafana Tempo activo — cada consulta lenta tiene su traza</div>
        <div class="tl-hire">Contratación #5 — Especialista en Crecimiento</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q2"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">6</div></div></div>
      <div class="tl-body q2">
        <div class="tl-title">Confiabilidad de Plataforma</div>
        <div class="tl-items">• Servicio de Notificaciones extraído a su propio contenedor — fallos no afectan la API<br>• Adaptador Redis de Socket.IO activo — escala horizontal sin cambios de código<br>• Grabación de streams → pipeline automático de VOD vía LiveKit Cloud<br>• Mux Data: conteo de espectadores + calidad en panel Grafana<br>• Primera revisión trimestral de P&amp;L presentada al equipo de liderazgo</div>
        <div class="tl-hire">Contratación #6 — DevOps / SRE</div>
      </div>
    </div>
  </div>
  <div class="ms-check">
    <div class="ms-check-t">Hito de Control — Mes 6</div>
    <div class="ms-check-list">
      <div class="ms-check-item">✓ Zoho One completamente operativo</div>
      <div class="ms-check-item">✓ 6 contrataciones completadas</div>
      <div class="ms-check-item">✓ ≥ 80% de creadores activos en Slack</div>
      <div class="ms-check-item">✓ Cero scripts de difusión manuales</div>
      <div class="ms-check-item">✓ Cero fallos silenciosos (30 días)</div>
      <div class="ms-check-item">✓ Primera revisión trimestral de P&amp;L</div>
    </div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="phase-hdr">
    <div class="phase-q q3">Q3–Q4</div>
    <div class="phase-info">
      <div class="phase-name">Excelencia y Escala</div>
      <div class="phase-sub">Meses 7–12 · Mejoras, Ingresos, Planificación Fase 3</div>
    </div>
  </div>
  <div class="tl">
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q3"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">7</div></div></div>
      <div class="tl-body q3">
        <div class="tl-title">Excelencia de Características</div>
        <div class="tl-items">• Main Stage: animaciones de propinas, encuestas de espectadores, lobby previo + cuenta regresiva, estado de salud del stream<br>• Llamadas Privadas: cancelación de ruido IA LiveKit Krisp, calificaciones post-llamada, reserva de extensión en mitad de llamada<br>• Puente Hangout → Slack: creadores monitorean y responden desde Slack en tiempo real<br>• Panel de analíticas de creadores activo en /creator/analytics</div>
        <div class="tl-hire">Contratación #7 — Líder de CX</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q3"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">8</div></div></div>
      <div class="tl-body q3">
        <div class="tl-title">Diversificación de Ingresos</div>
        <div class="tl-items">• Shows con entrada lanzados en Main Stage (esquema existe — solo falta frontend)<br>• Certificación de Formación para Creadores: Creator Academy de pago para no creadores<br>• Impulsos de perfil de creador: modelo CPM con Ru$h en superficies de descubrimiento<br>• Primera prueba de marketing pagado: Telegram Ads (compatible con adultos)<br>• Todos los creadores firman acuerdo actualizado vía Zoho Sign</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q3"><div class="tl-dot-lbl">Mes</div><div class="tl-dot-num">9</div></div></div>
      <div class="tl-body q3">
        <div class="tl-title">Consolidación</div>
        <div class="tl-items">• Servicio de Procesamiento de Medios extraído a contenedor con CPU aislada — video no compite con la API<br>• Auditoría completa de cumplimiento 2257 — n8n auto-suspende a cualquier creador vencido<br>• Seguimiento de bienestar a 6 meses con cada creador activo<br>• Preparación para declaración de impuestos de fin de año con Ger. Ops + CPA local<br>• Segunda revisión trimestral de P&amp;L</div>
      </div>
    </div>
    <div class="tl-row">
      <div class="tl-left"><div class="tl-dot q4"><div class="tl-dot-lbl" style="color:${C.accent};font-size:5.5px;">Meses</div><div class="tl-dot-num" style="color:${C.accent};font-size:10px;">10–12</div></div></div>
      <div class="tl-body q4">
        <div class="tl-title">Lista para Escalar + Planificación Fase 3</div>
        <div class="tl-items">• Prueba de carga anual: simular 10× el tráfico pico actual, identificar y corregir cuellos de botella<br>• Los 10 miembros del equipo en sus puestos y completamente incorporados<br>• Primer P&amp;L anual + declaración de impuestos: Ger. Ops + CPA local<br>• Revisión anual de OKRs — medir cada KPI contra los objetivos de Fase 2<br>• Revisión anual del Panel Asesor de Creadores — su input define la Fase 3<br>• Planificación Fase 3: licenciamiento B2B, migración a la nube, preparación para inversores</div>
      </div>
    </div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">04 — Herramientas y Presupuesto</div>
  <h2>Adopción de Herramientas</h2>
  <table><thead><tr><th style="width:22%">Herramienta</th><th style="width:42%">Propósito</th><th style="width:18%">En Vivo</th><th style="width:18%">Costo Mensual</th></tr></thead><tbody>
    <tr><td class="ca">Zoho One</td><td>CRM + Books + Campaigns + Recruit + Sign</td><td>Mes 1</td><td>$111</td></tr>
    <tr><td class="ca">Slack Pro</td><td>Ops interno + canales Slack Connect para creadores</td><td>Mes 2</td><td>$22</td></tr>
    <tr><td class="ca">n8n (autoalojado)</td><td>Motor de automatización — reemplaza todos los scripts manuales</td><td>Mes 3</td><td>$0</td></tr>
    <tr><td class="ca">Loom</td><td>Videos de formación para creadores en Canvases de Slack</td><td>Mes 4</td><td>$0</td></tr>
    <tr><td class="ca">OpenTelemetry + Tempo</td><td>Trazas distribuidas, visibilidad completa de rendimiento</td><td>Mes 5</td><td>$0</td></tr>
    <tr><td class="ca">Mux Data</td><td>Analíticas de streaming — espectadores, calidad</td><td>Mes 6</td><td>$0</td></tr>
    <tr><td class="ca">PagerDuty (gratis)</td><td>Alertas de guardia, escalación de incidentes</td><td>Mes 6</td><td>$0</td></tr>
    <tr><td><strong>Total</strong></td><td></td><td></td><td><strong>$133/mes</strong></td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">05 — Registro de Riesgos</div>
  <table><thead><tr><th style="width:34%">Riesgo</th><th style="width:14%">Probabilidad</th><th style="width:12%">Impacto</th><th style="width:40%">Mitigación</th></tr></thead><tbody>
    <tr><td>Contratación de Oficial de Bienestar tarda 2+ meses</td><td>Alta</td><td>Medio</td><td>Gestor de Éxito realiza entrevistas estructuradas de bienestar hasta que se contrate</td></tr>
    <tr><td>Resistencia de creadores a incorporarse a Slack</td><td>Media</td><td>Alto</td><td>Primera notificación = una reserva real o propina. El valor inmediato impulsa la adopción.</td></tr>
    <tr><td>Los ingresos no sustentan el plan de contratación</td><td>Media</td><td>Alto</td><td>Regla de umbral. Gestor de Contenido y Líder de CX inicialmente a tiempo parcial.</td></tr>
    <tr><td>Migración BullMQ rompe flujos existentes</td><td>Baja</td><td>Alto</td><td>Nuevas características primero. Código legado migrado solo cuando el patrón esté probado.</td></tr>
    <tr><td>Cambios regulatorios para plataformas adultas</td><td>Baja</td><td>Muy Alto</td><td>Revisión legal en Mes 1. Asesor de cumplimiento identificado y en retención.</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">06 — KPIs por Departamento</div>
  <table><thead><tr><th style="width:22%">Departamento</th><th style="width:44%">KPI</th><th style="width:34%">Objetivo</th></tr></thead><tbody>
    <tr><td rowspan="3" class="ca">Salud de Plataforma</td><td>Tiempo de actividad</td><td>≥ 99.9%</td></tr>
    <tr><td>Tiempo de respuesta P95 de API</td><td>&lt; 300ms</td></tr>
    <tr><td>Tasa de fallos de trabajos BullMQ</td><td>&lt; 0.1%</td></tr>
    <tr><td rowspan="3" class="ca">Éxito del Creador</td><td>Adopción de Slack por creadores (Mes 6)</td><td>≥ 90%</td></tr>
    <tr><td>Tasa de finalización de seguimiento mensual</td><td>≥ 90%</td></tr>
    <tr><td>Tasa de abandono de creadores</td><td>&lt; 5%/mes</td></tr>
    <tr><td rowspan="2" class="ca">Marketing</td><td>Crecimiento de suscriptores PRIME</td><td>≥ 15% mensual</td></tr>
    <tr><td>Tasa de apertura de email</td><td>&gt; 25%</td></tr>
    <tr><td rowspan="2" class="ca">Exp. del Cliente</td><td>Tasa de resolución L1 de Cristina</td><td>&gt; 80%</td></tr>
    <tr><td>Tiempo de respuesta de escalaciones</td><td>&lt; 4h horario laboral</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC 3 — DUTY OF CARE: CREATOR WELFARE (EN)
// Combines: Creator Care Program + Implementation Plan highlights
// ─────────────────────────────────────────────────────────────────────────────
function doc3en() {
  const B = 'PNPtv!', D = 'Duty of Care — Creator Welfare Program';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<!-- COVER -->
<div class="cover">
  <div><div class="cover-bar"></div>
    <div class="cover-brand">PNP<span>tv!</span></div>
    <div class="cover-tag">Creator Welfare — External Document</div></div>
  <div>
    <div class="cover-title">Duty of<br>Care</div>
    <div class="cover-sub">Our complete commitment to creator welfare — what we promise, what's already built, and the technical roadmap that proves we mean it.</div></div>
  <div class="cover-meta"><span class="cover-date">August 2026 — Version 1.0</span><span class="cover-badge">Creators</span></div>
  <div class="cover-line"></div><div class="cover-dec"></div><div class="cover-dec2"></div>
</div>

<!-- PAGE 1: WHY + PILLARS + WHAT'S LIVE -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">Why This Exists</div>
  <div class="callout" style="margin-bottom:12px;">
    <div class="callout-t">The question that founded us</div>
    <p style="font-style:italic;">"The question wasn't 'how do we make money from creators?' It was 'how do we make a creator's career something they can be proud of — something that doesn't cost them their health?'"</p>
    <p style="margin-top:5px;font-size:8.5px;color:${C.lmuted};">— PNPtv founding team (Santino + Lex)</p>
  </div>
  <p style="font-size:9.5px;">Most adult content platforms operate like 19th-century factories: you provide the body, the time, and the risk; they keep most of the money and don't care what happens to you afterward. PNPtv was built from inside that reality. This document is our answer in concrete terms: what we do today, what we're building, and how we prove we mean it.</p>
  <div class="lbl" style="margin-top:12px;">The Four Pillars</div>
  <div class="pillars">
    <div class="pillar"><div class="pillar-n">01</div><div class="pillar-t">Fair &amp; Transparent Money</div><p>Your work has value, and what you earn is yours. 70% always. No fine print.</p></div>
    <div class="pillar"><div class="pillar-n" style="color:${C.purple}">02</div><div class="pillar-t">Body &amp; Mind</div><p>Your health is our investment, not your problem. Wellness fund, Sober Body, Self-Care Center.</p></div>
    <div class="pillar"><div class="pillar-n" style="color:${C.amber}">03</div><div class="pillar-t">Real Growth</div><p>Skills, tools, education. AI agents that work for you, not the platform.</p></div>
    <div class="pillar"><div class="pillar-n" style="color:${C.bg}">04</div><div class="pillar-t">Community of Peers</div><p>You are not alone in this. Slack support, peer mentorship, wellness hangouts.</p></div>
  </div>
  <div class="lbl" style="margin-top:10px;">What's Already Live — Not Promises</div>
  <table><thead><tr><th style="width:38%">Protection</th><th style="width:38%">What It Does</th><th style="width:24%">Status</th></tr></thead><tbody>
    <tr><td class="ca">§ 2257 ID Verification</td><td>Identity confirmed before any content goes live</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">AI Age Verification</td><td>Photo verified + discarded immediately — never stored</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Passkeys (passwordless)</td><td>Phishing-resistant login — no password to steal</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Wellness Mode + 24h delay</td><td>Pause your profile for 1–30 days. 24h buffer protects against impulse deactivation.</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Private Use Tracker</td><td>Log your sessions privately. Only you see this. Your data, not ours.</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Self-Care Center</td><td>A section with no ads, no algorithm, no work notifications</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Location Fuzzing</td><td>Your position in Nearby is shifted 100–500m randomly — never exact</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Right to Erasure</td><td>Full account deletion in one step — no need to talk to anyone</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Multi-vector Block</td><td>When you ban someone, all their known identifiers are blocked</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">CSAM Auto-escalation</td><td>Automatic account suspension + legal escalation, no human delay</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Public Appeal System</td><td>If we ban you in error, there's a formal appeal — not silence</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
    <tr><td class="ca">Crypto Cashout (5 chains)</td><td>BTC, DASH, USDT TRC-20, USDT Base, Meru — your choice</td><td style="color:#16a34a;font-weight:700;">LIVE</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

<!-- PAGE 2: PILLAR 1 — MONEY -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">Pillar 1 — Fair &amp; Transparent Money</div>
  <h2>The Split That Doesn't Change</h2>
  <div class="callout"><div class="callout-t">70% for you. 30% for the platform. Always. No fine print.</div><p>The 7-day hold on earnings exists to protect you from fraudulent payments that would put you in the negative — not to hold your money hostage.</p></div>
  <table><thead><tr><th style="width:35%">Income Type</th><th style="width:25%">Your Share</th><th style="width:40%">Note</th></tr></thead><tbody>
    <tr><td class="ca">Content sales (videos, photos)</td><td>70%</td><td>7-day hold before available</td></tr>
    <tr><td class="ca">Fan subscriptions</td><td>70%</td><td>7-day hold</td></tr>
    <tr><td class="ca">Livestream tips (Ru$h)</td><td><strong>100%</strong></td><td>No commission — it's a direct gift</td></tr>
    <tr><td class="ca">Private calls</td><td>70%</td><td>7-day hold</td></tr>
  </tbody></table>
  <h3>How You Get Paid</h3>
  <p>You can withdraw in: <strong>Bitcoin (BTC)</strong> · <strong>USDT on Tron (TRC-20)</strong> · <strong>USDT on Base</strong> · <strong>Meru</strong> (Colombia + LATAM — phone or username)</p>
  <p>Minimum to cashout: <strong>$50 USD</strong>. Minimum for weekly batch: <strong>$100 USD</strong> (your balance accumulates — it's never lost).</p>
  <h3>Earnings Ledger — Every Transaction Visible <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q4 2026</span></h3>
  <p>You will have access to your complete transaction history: every tip, every subscription, every call payment, every withdrawal — transaction by transaction. You don't have to trust that 70% is 70%. You can verify it yourself.</p>
  <div class="lbl" style="margin-top:12px;">Pillar 2 — Body &amp; Mind</div>
  <h2>Your Health Is Our Investment</h2>
  <h3>Individual Wellness Fund — 10% Back to You <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q1 2027</span></h3>
  <p>Starting Q1 2027, PNPtv allocates <strong>10% of the net commission generated by each creator</strong> to an individual wellness fund. It's not a performance bonus — it doesn't disappear if you have a slow month.</p>
  <table><thead><tr><th style="width:35%">Area</th><th style="width:65%">What It Covers</th></tr></thead><tbody>
    <tr><td class="ca">Mental health</td><td>Psychology sessions, therapy, LGBTQ+-affirming support groups</td></tr>
    <tr><td class="ca">Sexual health</td><td>PrEP, PEP, STI testing, medical consultations</td></tr>
    <tr><td class="ca">Financial literacy</td><td>Savings courses, crypto, taxes, basic investing</td></tr>
    <tr><td class="ca">English</td><td>1:1 or group classes with native speakers</td></tr>
    <tr><td class="ca">Creator skills</td><td>Video editing (CapCut, DaVinci), photography, digital marketing</td></tr>
  </tbody></table>
  <h3>Sober Body Program <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Launching Soon</span></h3>
  <p>For creators in our community reducing use or in recovery — non-judgmental, PNP-context-aware, not religious:</p>
  <ul>
    <li>Private Telegram/WhatsApp group with peers who understand the PNP context</li>
    <li>Weekly virtual meetups with a counselor experienced in LGBTQ+ and chemsex contexts</li>
    <li>Optional individual check-ins — a trusted contact who asks how you're doing</li>
    <li>Harm reduction resources adapted to context: combinations, intervals, warning signs</li>
    <li>Milestone recognition — the community celebrates your Sober Body days</li>
  </ul>
  <p style="font-size:8.5px;color:${C.lmuted};">This program is not mandatory and does not affect your platform access. It's an open door.</p>
  ${footer(B)}
</div>

<!-- PAGE 3: PILLARS 3+4 -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">Pillar 3 — Real Growth</div>
  <h2>Skills, Tools, Education</h2>
  <h3>Peer Mentorship <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q4 2026</span></h3>
  <p>Experienced PNPtv creators become <strong>Certified Mentors</strong> and support newcomers. The mentor is compensated in Ru$h tokens (convertible to cash). The new creator receives personalized onboarding, profile and content strategy review, and a real contact who's been through what they're going through.</p>
  <h3>AI Agents That Work For You <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q1 2027</span></h3>
  <div class="pillars">
    <div class="pillar"><div class="pillar-t">Content Description Agent</div><p>Generates titles and descriptions that sell — so you don't write from scratch every time.</p></div>
    <div class="pillar"><div class="pillar-t">Pricing Strategy Agent</div><p>Analyzes your audience and suggests the right price for each content type.</p></div>
    <div class="pillar"><div class="pillar-t">Publishing Calendar</div><p>Tells you when your audience is most active and reminds you to post.</p></div>
    <div class="pillar"><div class="pillar-t">Earnings Analysis</div><p>Explains in plain language what worked this month and why.</p></div>
  </div>
  <h3>Educational Library <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q2 2027</span></h3>
  <table><thead><tr><th style="width:48%">Module</th><th style="width:30%">Format</th><th style="width:22%">Duration</th></tr></thead><tbody>
    <tr><td>How to price yourself without undervaluing</td><td>Video + guide</td><td>45 min</td></tr>
    <tr><td>Photography with the phone you have</td><td>Video</td><td>1h</td></tr>
    <tr><td>Basic video editing (CapCut, DaVinci)</td><td>Video tutorial</td><td>2h</td></tr>
    <tr><td>English for adult creators</td><td>Audio + flashcards</td><td>Progressive</td></tr>
    <tr><td>Understanding your taxes (Colombia, Mexico)</td><td>Guide + template</td><td>30 min</td></tr>
    <tr><td>Marketing without showing your face</td><td>Masterclass</td><td>1.5h</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">Pillar 4 — Community of Peers</div>
  <h2>You Are Not Alone in This</h2>
  <div class="stages">
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Your Own Slack Channel — Live Now</div><div class="stage-d">Every active creator has a private <code style="font-size:8.5px;background:#eee;padding:1px 4px;">#ext-[handle]</code> channel in PNPtv's Slack where the team communicates with you directly. Not a broadcast — two-way.</div></div></div>
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Wellness Hangouts — Live Now</div><div class="stage-d">Private groups within the app: general wellness, recovery, finances, creative career. Community, not competition.</div></div></div>
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Cristina — Live Now</div><div class="stage-d">Your AI assistant available 24/7 — health questions, payment questions, a hard night. Responds in Spanish and English.</div></div></div>
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Individual Counseling — Q4 2026</div><div class="stage-d">Sessions with professionals who already know what PNP is, what adult creator work means, what chemsex involves. You don't start from scratch.</div></div></div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 4: TECHNICAL ROADMAP (5 phases) -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">Technical Implementation — 5 Phases</div>
  <h2>From Statement to Code</h2>
  <p style="font-size:9.5px;margin-bottom:10px;">The audit of our production codebase confirmed: the most complex wellness pillars are already built. The remaining gaps are around <strong>creator sovereignty</strong> — the ability to control visibility, verify earnings independently, and exit with dignity. These 5 phases close those gaps.</p>
  <div class="stages">
    <div class="stage hi"><div class="stage-n">P1</div><div><div class="stage-t">Privacy Sovereignty — Creator Geoblocking <span style="background:${C.accent};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">CRITICAL · 3–5 days</span></div><div class="stage-d">Creators can hide their profile in specific countries — their own country, their region, anywhere. Country of origin is the most common risk vector for Latin American creators (family visibility, conventional employment). The most-requested feature on comparable platforms. Includes: per-country blocklist UI in settings, middleware applied to all public profile routes.</div></div></div>
    <div class="stage"><div class="stage-n">P2</div><div><div class="stage-t">Verifiable Earnings Ledger <span style="background:${C.purple};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">HIGH · 1 week</span></div><div class="stage-d">Full transaction-by-transaction ledger visible to each creator in their own dashboard — every tip received, every subscription, every call, every withdrawal. No need to ask an admin for a report. Breakdown by content category and time period. Portable CSV export.</div></div></div>
    <div class="stage"><div class="stage-n">P3</div><div><div class="stage-t">Verifiable Identity + Data Portability <span style="background:${C.amber};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">HIGH · 1 week</span></div><div class="stage-d">Full migration to Persona.com for government ID verification — eliminating direct PII storage on our servers. Portable data export: a single file containing all your content, earnings history, messages, and account data. Your identity and your work belong to you — not to us.</div></div></div>
    <div class="stage"><div class="stage-n">P4</div><div><div class="stage-t">Ethical Offboarding Protocol <span style="background:${C.bg};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">MEDIUM · 3 days</span></div><div class="stage-d">A step-by-step offboarding flow: subscriber notification (opt-in), content archive options, deletion cascade with confirmation, 30-day grace period before permanent deletion. You decide what happens to your work when you leave — not us.</div></div></div>
    <div class="stage"><div class="stage-n">P5</div><div><div class="stage-t">Public Transparency Panel <span style="background:${C.bg};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">MEDIUM · 3 days</span></div><div class="stage-d">A public endpoint and page at pnptv.app/transparency publishing: total creator earnings ratio, active creator count, average monthly earnings (anonymized), Sober Body days accumulated by the community, support ticket resolution rate. Updated daily. We don't want you to take our word for it.</div></div></div>
  </div>
  ${footer(B)}
</div>

<!-- PAGE 5: ROADMAP + ACCOUNTABILITY -->
<div class="page">
  ${ph(B,D)}
  <div class="lbl">Delivery Timeline</div>
  <h2>What's Coming &amp; When</h2>
  <table><thead><tr><th style="width:16%">Quarter</th><th style="width:50%">Deliverable</th><th style="width:34%">Category</th></tr></thead><tbody>
    <tr><td class="ca">Q3 2026</td><td>Creator Geoblocking (Phase 1)</td><td>Privacy Sovereignty</td></tr>
    <tr><td class="ca">Q3 2026</td><td>Sober Body Program — beta</td><td>Body &amp; Mind</td></tr>
    <tr><td class="ca">Q3 2026</td><td>Creator profile geoblocking UI live</td><td>Privacy Sovereignty</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Earnings Ledger — transaction-by-transaction (Phase 2)</td><td>Fair Money</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Verifiable Identity + Data Export (Phase 3)</td><td>Sovereignty</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Individual counseling with industry-experienced professionals</td><td>Body &amp; Mind</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Peer Mentorship — certified program (Phase 4)</td><td>Growth</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Ethical Offboarding Protocol (Phase 4)</td><td>Sovereignty</td></tr>
    <tr><td class="ca">Q1 2027</td><td>Public Transparency Panel live (Phase 5)</td><td>Accountability</td></tr>
    <tr><td class="ca">Q1 2027</td><td>Individual Wellness Fund — 10% reinvested in you</td><td>Body &amp; Mind</td></tr>
    <tr><td class="ca">Q1 2027</td><td>AI agents for creators (descriptions, pricing, calendar)</td><td>Growth</td></tr>
    <tr><td class="ca">Q2 2027</td><td>Educational library (video, finance, English, marketing)</td><td>Growth</td></tr>
    <tr><td class="ca">Q3 2027</td><td>PNPtv Creator Certification</td><td>Growth</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:12px;">How We Measure Whether We're Keeping Our Word</div>
  <p>We don't want you to take our word for it. These are the numbers we publish — and if they're not being published, ask.</p>
  <table><thead><tr><th style="width:55%">Metric</th><th style="width:45%">Where to Find It</th></tr></thead><tbody>
    <tr><td>% of gross revenue going to creators (target: ≥ 70%)</td><td>pnptv.app/transparency (Q1 2027)</td></tr>
    <tr><td>Sober Body days accumulated by the community</td><td>Aggregated, anonymous — public panel</td></tr>
    <tr><td>% of creators using Self-Care Center ≥ once/month</td><td>Published quarterly in creator updates</td></tr>
    <tr><td>Support tickets resolved in under 48h</td><td>Published quarterly</td></tr>
    <tr><td>Welfare interviews completed / creators onboarded</td><td>Published quarterly</td></tr>
    <tr><td>Creators with access to wellness fund services</td><td>Published quarterly from Q1 2027</td></tr>
  </tbody></table>
  <div class="callout" style="margin-top:10px;"><div class="callout-t">A Final Word</div><p>We know "platform that cares for its creators" sounds like marketing. We've seen it too. The difference is that this was written by people who've been on the other side. We're not perfect — there are gaps in this document we're being honest enough to name. But the direction is clear: an adult platform that treats its creators like adults — with respect, with resources, and with the conviction that their wellbeing is the reason we exist.</p></div>
  <p style="margin-top:10px;font-size:8.5px;color:${C.lmuted};">Questions: support@pnptv.app — we respond in under 48h. Full technical documentation: pnptv.app/docs/implementation-plan-duty-of-care.html — Academic reference: pnptv.app/docs/academic-thesis-pnptv.html</p>
  ${footer(B)}
</div>

</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC 3 — DUTY OF CARE: BIENESTAR DE CREADORES (ES)
// ─────────────────────────────────────────────────────────────────────────────
function doc3es() {
  const B = 'PNPtv!', D = 'Deber de Cuidado — Programa de Bienestar';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<div class="cover">
  <div><div class="cover-bar"></div>
    <div class="cover-brand">PNP<span>tv!</span></div>
    <div class="cover-tag">Bienestar de Creadores — Documento Externo</div></div>
  <div>
    <div class="cover-title">Deber de<br>Cuidado</div>
    <div class="cover-sub">Nuestro compromiso completo con el bienestar del creador — lo que prometemos, lo que ya está construido, y la hoja de ruta técnica que demuestra que lo decimos en serio.</div></div>
  <div class="cover-meta"><span class="cover-date">Agosto 2026 — Versión 1.0</span><span class="cover-badge">Creadores</span></div>
  <div class="cover-line"></div><div class="cover-dec"></div><div class="cover-dec2"></div>
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">Por Qué Existe Esto</div>
  <div class="callout" style="margin-bottom:12px;">
    <div class="callout-t">La pregunta que nos fundó</div>
    <p style="font-style:italic;">"La pregunta no fue '¿cómo ganamos dinero de los creadores?' Fue '¿cómo hacemos que la carrera de un creador sea algo de lo que pueda estar orgulloso — algo que no cueste su salud?'"</p>
    <p style="margin-top:5px;font-size:8.5px;color:${C.lmuted};">— Equipo fundador de PNPtv (Santino + Lex)</p>
  </div>
  <p style="font-size:9.5px;">La mayoría de las plataformas de contenido adulto operan como fábricas del siglo XIX: tú pones el cuerpo, el tiempo y el riesgo; ellos se quedan la mayoría del dinero y no les importa lo que te pase después. PNPtv fue construida desde adentro de esa realidad. Este documento es nuestra respuesta en términos concretos: qué hacemos hoy, qué estamos construyendo, y cómo probamos que lo decimos en serio.</p>
  <div class="lbl" style="margin-top:12px;">Los Cuatro Pilares</div>
  <div class="pillars">
    <div class="pillar"><div class="pillar-n">01</div><div class="pillar-t">Dinero Justo y Transparente</div><p>Tu trabajo tiene valor y lo que ganas es tuyo. 70% siempre. Sin letra pequeña.</p></div>
    <div class="pillar"><div class="pillar-n" style="color:${C.purple}">02</div><div class="pillar-t">Cuerpo y Mente</div><p>Tu salud es nuestra inversión, no tu problema. Fondo de bienestar, Sober Body, Centro de Autocuidado.</p></div>
    <div class="pillar"><div class="pillar-n" style="color:${C.amber}">03</div><div class="pillar-t">Crecimiento Real</div><p>Habilidades, herramientas, educación. Agentes de IA que trabajan para ti, no para la plataforma.</p></div>
    <div class="pillar"><div class="pillar-n" style="color:${C.bg}">04</div><div class="pillar-t">Comunidad de Pares</div><p>No estás solo en esto. Soporte en Slack, mentoría entre pares, hangouts de bienestar.</p></div>
  </div>
  <div class="lbl" style="margin-top:10px;">Lo Que Ya Existe — No Son Promesas</div>
  <table><thead><tr><th style="width:38%">Protección</th><th style="width:38%">Qué Hace</th><th style="width:24%">Estado</th></tr></thead><tbody>
    <tr><td class="ca">Verificación ID § 2257</td><td>Identidad confirmada antes de publicar contenido</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Verificación de Edad por IA</td><td>Foto verificada y descartada inmediatamente — nunca almacenada</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Passkeys (sin contraseña)</td><td>Login resistente a phishing — no hay contraseña que robar</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Modo Bienestar + 24h</td><td>Pausa tu perfil 1–30 días. Buffer de 24h protege contra desactivación por impulso.</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Rastreador de Uso Privado</td><td>Registra tus sesiones de forma privada. Solo tú lo ves.</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Centro de Autocuidado</td><td>Una sección sin anuncios, sin algoritmo, sin notificaciones de trabajo</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Difuminado de Ubicación</td><td>Tu posición en Nearby se desplaza 100–500m aleatoriamente — nunca exacta</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Derecho al Olvido</td><td>Eliminación de cuenta completa en un paso — sin necesidad de hablar con nadie</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Bloqueo Multi-vector</td><td>Al bloquear a alguien, todos sus identificadores conocidos son bloqueados</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Auto-escalación CSAM</td><td>Suspensión automática + escalación legal, sin demora humana</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Sistema de Apelación</td><td>Si te suspendemos por error, existe un proceso formal — no silencio</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
    <tr><td class="ca">Retiro Cripto (5 redes)</td><td>BTC, DASH, USDT TRC-20, USDT Base, Meru — tú eliges</td><td style="color:#16a34a;font-weight:700;">EN VIVO</td></tr>
  </tbody></table>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">Pilar 1 — Dinero Justo y Transparente</div>
  <h2>La División Que No Cambia</h2>
  <div class="callout"><div class="callout-t">70% para ti. 30% para la plataforma. Siempre. Sin letra pequeña.</div><p>Los 7 días de retención existen para protegerte de pagos fraudulentos que te pondrían en negativo — no para retener tu dinero.</p></div>
  <table><thead><tr><th style="width:35%">Tipo de Ingreso</th><th style="width:25%">Tu Parte</th><th style="width:40%">Nota</th></tr></thead><tbody>
    <tr><td class="ca">Ventas de contenido</td><td>70%</td><td>Retención de 7 días antes de disponible</td></tr>
    <tr><td class="ca">Suscripciones de fans</td><td>70%</td><td>Retención de 7 días</td></tr>
    <tr><td class="ca">Propinas en vivo (Ru$h)</td><td><strong>100%</strong></td><td>Sin comisión — es un regalo directo</td></tr>
    <tr><td class="ca">Llamadas privadas</td><td>70%</td><td>Retención de 7 días</td></tr>
  </tbody></table>
  <h3>Cómo Te Pagamos</h3>
  <p>Puedes retirar en: <strong>Bitcoin (BTC)</strong> · <strong>USDT en Tron (TRC-20)</strong> · <strong>USDT en Base</strong> · <strong>Meru</strong> (Colombia + LATAM — teléfono o usuario)</p>
  <p>Mínimo para retiro: <strong>$50 USD</strong>. Mínimo para el lote semanal: <strong>$100 USD</strong> (tu saldo acumula — nunca se pierde).</p>
  <h3>Libro de Ganancias — Cada Transacción Visible <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q4 2026</span></h3>
  <p>Tendrás acceso a tu historial completo: cada propina, cada suscripción, cada pago de llamada, cada retiro — transacción por transacción. No tendrás que confiar en que el 70% es 70%. Podrás verificarlo tú mismo.</p>
  <div class="lbl" style="margin-top:12px;">Pilar 2 — Cuerpo y Mente</div>
  <h2>Tu Salud Es Nuestra Inversión</h2>
  <h3>Fondo Individual de Bienestar — 10% de Vuelta a Ti <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q1 2027</span></h3>
  <p>A partir de Q1 2027, PNPtv asignará el <strong>10% de la comisión neta generada por cada creador</strong> a un fondo individual de bienestar. No es un bono por rendimiento — no desaparece si tienes un mes lento.</p>
  <table><thead><tr><th style="width:35%">Área</th><th style="width:65%">Qué Cubre</th></tr></thead><tbody>
    <tr><td class="ca">Salud mental</td><td>Sesiones de psicología, terapia, grupos de apoyo LGBTQ+-afirmativos</td></tr>
    <tr><td class="ca">Salud sexual</td><td>PrEP, PEP, pruebas de ITS, consultas médicas</td></tr>
    <tr><td class="ca">Educación financiera</td><td>Ahorro, cripto, impuestos, inversión básica</td></tr>
    <tr><td class="ca">Inglés</td><td>Clases individuales o grupales con hablantes nativos</td></tr>
    <tr><td class="ca">Habilidades de creador</td><td>Edición de video (CapCut, DaVinci), fotografía, marketing digital</td></tr>
  </tbody></table>
  <h3>Programa Sober Body <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Próximamente</span></h3>
  <p>Para creadores en proceso de reducir el uso o en recuperación — sin juicios, con contexto PNP, sin religión:</p>
  <ul>
    <li>Grupo privado de Telegram/WhatsApp con pares que entienden el contexto PNP</li>
    <li>Reuniones virtuales semanales con consejero experimentado en contextos LGBTQ+ y chemsex</li>
    <li>Check-ins individuales opcionales — un contacto de confianza que pregunta cómo estás</li>
    <li>Recursos de reducción de daños adaptados al contexto: combinaciones, intervalos, señales de alerta</li>
    <li>Reconocimiento de hitos — la comunidad celebra tus días Sober Body</li>
  </ul>
  <p style="font-size:8.5px;color:${C.lmuted};">Este programa no es obligatorio y no afecta tu acceso a la plataforma. Es una puerta abierta.</p>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">Pilar 3 — Crecimiento Real</div>
  <h2>Habilidades, Herramientas, Educación</h2>
  <h3>Mentoría Entre Pares <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q4 2026</span></h3>
  <p>Creadores experimentados de PNPtv se convierten en <strong>Mentores Certificados</strong> y apoyan a los recién llegados. El mentor recibe compensación en tokens Ru$h (convertibles a efectivo). El nuevo creador recibe incorporación personalizada, revisión de perfil y estrategia de contenido, y un contacto real que ya pasó por lo que está viviendo.</p>
  <h3>Agentes de IA Que Trabajan Para Ti <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q1 2027</span></h3>
  <div class="pillars">
    <div class="pillar"><div class="pillar-t">Agente de Descripción</div><p>Genera títulos y descripciones que venden — para que no escribas desde cero cada vez.</p></div>
    <div class="pillar"><div class="pillar-t">Agente de Precios</div><p>Analiza tu audiencia y sugiere el precio correcto para cada tipo de contenido.</p></div>
    <div class="pillar"><div class="pillar-t">Calendario de Publicación</div><p>Te dice cuándo tu audiencia está más activa y te recuerda publicar.</p></div>
    <div class="pillar"><div class="pillar-t">Análisis de Ganancias</div><p>Explica en lenguaje simple qué funcionó este mes y por qué.</p></div>
  </div>
  <h3>Biblioteca Educativa <span style="font-size:8px;color:${C.amber};font-weight:700;margin-left:6px;">Q2 2027</span></h3>
  <table><thead><tr><th style="width:48%">Módulo</th><th style="width:30%">Formato</th><th style="width:22%">Duración</th></tr></thead><tbody>
    <tr><td>Cómo ponerle precio a tu trabajo sin subvalorarte</td><td>Video + guía</td><td>45 min</td></tr>
    <tr><td>Fotografía con el teléfono que tienes</td><td>Video</td><td>1h</td></tr>
    <tr><td>Edición de video básica (CapCut, DaVinci)</td><td>Tutorial en video</td><td>2h</td></tr>
    <tr><td>Inglés para creadores adultos</td><td>Audio + flashcards</td><td>Progresivo</td></tr>
    <tr><td>Entiende tus impuestos (Colombia, México)</td><td>Guía + plantilla</td><td>30 min</td></tr>
    <tr><td>Marketing sin mostrar tu cara</td><td>Masterclass</td><td>1.5h</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:10px;">Pilar 4 — Comunidad de Pares</div>
  <h2>No Estás Solo en Esto</h2>
  <div class="stages">
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Tu Canal Propio en Slack — En Vivo</div><div class="stage-d">Cada creador activo tiene un canal privado <code style="font-size:8.5px;background:#eee;padding:1px 4px;">#ext-[handle]</code> en el Slack de PNPtv donde el equipo se comunica contigo directamente. No es difusión — es bidireccional.</div></div></div>
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Hangouts de Bienestar — En Vivo</div><div class="stage-d">Grupos privados dentro de la app: bienestar general, recuperación, finanzas, carrera creativa. Comunidad, no competencia.</div></div></div>
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Cristina — En Vivo</div><div class="stage-d">Tu asistente de IA disponible 24/7 — preguntas de salud, preguntas de pagos, una noche difícil. Responde en español e inglés.</div></div></div>
    <div class="stage"><div class="stage-n" style="color:${C.accent};">✓</div><div><div class="stage-t">Asesoramiento Individual — Q4 2026</div><div class="stage-d">Sesiones con profesionales que ya saben qué es PNP, qué significa el trabajo de creador adulto, qué implica el chemsex. No empiezas desde cero.</div></div></div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">Implementación Técnica — 5 Fases</div>
  <h2>Del Enunciado al Código</h2>
  <p style="font-size:9.5px;margin-bottom:10px;">La auditoría de nuestro repositorio de producción confirmó que los pilares de bienestar más complejos ya están construidos. Las brechas restantes son sobre <strong>soberanía del creador</strong> — control de visibilidad, verificación independiente de ganancias y salida digna. Estas 5 fases cierran esas brechas.</p>
  <div class="stages">
    <div class="stage hi"><div class="stage-n">F1</div><div><div class="stage-t">Soberanía de Privacidad — Geobloqueo por Creador <span style="background:${C.accent};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">CRÍTICO · 3–5 días</span></div><div class="stage-d">Los creadores pueden ocultar su perfil en países específicos — el suyo, su región, donde necesiten. El país de origen es el vector de riesgo más común para creadores latinoamericanos (visibilidad familiar, empleo convencional). La función más solicitada en plataformas comparables. Incluye: lista de bloqueo por país en configuración, middleware aplicado a todas las rutas de perfil público.</div></div></div>
    <div class="stage"><div class="stage-n">F2</div><div><div class="stage-t">Libro de Ganancias Verificable <span style="background:${C.purple};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">ALTO · 1 semana</span></div><div class="stage-d">Libro de transacciones completo visible para cada creador en su panel — cada propina, suscripción, llamada, retiro. Sin necesidad de pedir un reporte a un admin. Desglose por categoría de contenido y período. Exportación CSV portátil.</div></div></div>
    <div class="stage"><div class="stage-n">F3</div><div><div class="stage-t">Identidad Verificable + Portabilidad de Datos <span style="background:${C.amber};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">ALTO · 1 semana</span></div><div class="stage-d">Migración completa a Persona.com para verificación de ID gubernamental — eliminando almacenamiento directo de PII en nuestros servidores. Exportación de datos: un archivo con todo tu contenido, historial de ganancias, mensajes y datos de cuenta. Tu identidad y tu trabajo te pertenecen a ti — no a nosotros.</div></div></div>
    <div class="stage"><div class="stage-n">F4</div><div><div class="stage-t">Protocolo de Desvinculación Ética <span style="background:${C.bg};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">MEDIO · 3 días</span></div><div class="stage-d">Flujo de salida paso a paso: notificación a suscriptores (opt-in), opciones de archivo de contenido, cascada de eliminación con confirmación, período de gracia de 30 días antes de eliminación permanente. Tú decides qué pasa con tu trabajo cuando te vas — no nosotros.</div></div></div>
    <div class="stage"><div class="stage-n">F5</div><div><div class="stage-t">Panel Público de Transparencia <span style="background:${C.bg};color:#fff;font-size:7px;padding:1px 6px;font-weight:700;margin-left:4px;">MEDIO · 3 días</span></div><div class="stage-d">Endpoint público en pnptv.app/transparency: ratio de ganancias totales a creadores, cantidad de creadores activos, ganancias mensuales promedio (anonimizadas), días Sober Body acumulados por la comunidad, tasa de resolución de soporte. Actualizado diariamente. No queremos que confíes en nuestra palabra.</div></div></div>
  </div>
  ${footer(B)}
</div>

<div class="page">
  ${ph(B,D)}
  <div class="lbl">Hoja de Ruta de Entrega</div>
  <h2>Qué Viene y Cuándo</h2>
  <table><thead><tr><th style="width:16%">Trimestre</th><th style="width:50%">Entregable</th><th style="width:34%">Categoría</th></tr></thead><tbody>
    <tr><td class="ca">Q3 2026</td><td>Geobloqueo por Creador (Fase 1)</td><td>Soberanía de Privacidad</td></tr>
    <tr><td class="ca">Q3 2026</td><td>Programa Sober Body — beta</td><td>Cuerpo y Mente</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Libro de Ganancias — transacción por transacción (Fase 2)</td><td>Dinero Justo</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Identidad Verificable + Exportación de Datos (Fase 3)</td><td>Soberanía</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Asesoramiento individual con profesionales del sector</td><td>Cuerpo y Mente</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Mentoría Entre Pares — programa certificado</td><td>Crecimiento</td></tr>
    <tr><td class="ca">Q4 2026</td><td>Protocolo de Desvinculación Ética (Fase 4)</td><td>Soberanía</td></tr>
    <tr><td class="ca">Q1 2027</td><td>Panel Público de Transparencia (Fase 5)</td><td>Rendición de Cuentas</td></tr>
    <tr><td class="ca">Q1 2027</td><td>Fondo Individual de Bienestar — 10% reinvertido en ti</td><td>Cuerpo y Mente</td></tr>
    <tr><td class="ca">Q1 2027</td><td>Agentes de IA para creadores (descripciones, precios, calendario)</td><td>Crecimiento</td></tr>
    <tr><td class="ca">Q2 2027</td><td>Biblioteca educativa (video, finanzas, inglés, marketing)</td><td>Crecimiento</td></tr>
    <tr><td class="ca">Q3 2027</td><td>Certificación de Creador PNPtv</td><td>Crecimiento</td></tr>
  </tbody></table>
  <div class="lbl" style="margin-top:12px;">Cómo Medimos Si Estamos Cumpliendo Nuestra Palabra</div>
  <p>No queremos que confíes en nuestra palabra. Estas son las cifras que publicamos — y si no están siendo publicadas, pregunta.</p>
  <table><thead><tr><th style="width:55%">Métrica</th><th style="width:45%">Dónde Encontrarla</th></tr></thead><tbody>
    <tr><td>% de ingresos brutos que van a creadores (objetivo: ≥ 70%)</td><td>pnptv.app/transparency (Q1 2027)</td></tr>
    <tr><td>Días Sober Body acumulados por la comunidad</td><td>Agregados, anónimos — panel público</td></tr>
    <tr><td>% de creadores usando Centro de Autocuidado ≥ 1/mes</td><td>Publicado trimestralmente</td></tr>
    <tr><td>Tickets de soporte resueltos en menos de 48h</td><td>Publicado trimestralmente</td></tr>
    <tr><td>Entrevistas de bienestar completadas / creadores incorporados</td><td>Publicado trimestralmente</td></tr>
    <tr><td>Creadores con acceso a servicios del fondo de bienestar</td><td>Publicado desde Q1 2027</td></tr>
  </tbody></table>
  <div class="callout" style="margin-top:10px;"><div class="callout-t">Una Palabra Final</div><p>Sabemos que "plataforma que cuida a sus creadores" suena a marketing. Nosotros también lo hemos visto. La diferencia es que esto fue escrito por personas que estuvieron del otro lado. No somos perfectos — hay brechas en este documento que somos lo suficientemente honestos para nombrar. Pero la dirección es clara: una plataforma adulta que trata a sus creadores como adultos — con respeto, con recursos, y con la convicción de que su bienestar es la razón por la que existimos.</p></div>
  <p style="margin-top:10px;font-size:8.5px;color:${C.lmuted};">Preguntas: support@pnptv.app — respondemos en menos de 48h. Documentación técnica completa: pnptv.app/docs/implementation-plan-duty-of-care.html — Referencia académica: pnptv.app/docs/academic-thesis-pnptv.html</p>
  ${footer(B)}
</div>

</body></html>`;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────
async function toPDF(html, outPath) {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    console.log('✓', path.basename(outPath));
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('Generating PDFs…');
  const docs = [
    [doc1en, 'pnptv-business-plan-en.pdf'],
    [doc1es, 'pnptv-business-plan-es.pdf'],
    [doc2en, 'pnptv-phase2-roadmap-en.pdf'],
    [doc2es, 'pnptv-phase2-roadmap-es.pdf'],
    [doc3en, 'pnptv-duty-of-care-en.pdf'],
    [doc3es, 'pnptv-duty-of-care-es.pdf'],
  ];
  for (const [fn, name] of docs) {
    await toPDF(fn(), path.join(OUT, name));
  }
  // copy to dist for immediate serving (public/ is source of truth for vite builds)
  const distDocs = '/opt/pnptvapp/apps/web/dist/docs';
  fs.mkdirSync(distDocs, { recursive: true });
  for (const [, name] of docs) {
    fs.copyFileSync(path.join(OUT, name), path.join(distDocs, name));
  }
  console.log('\nLinks:');
  for (const [, name] of docs) console.log(`  https://pnptv.app/docs/${name}`);
}

main().catch(e => { console.error(e); process.exit(1); });
