const { useComposition, useTimeline, Easing, animate } = window;

function fade(T, inA, inB, outA, outB) {
  const fi = animate({ from: 0, to: 1, start: inA, end: inB, ease: Easing.easeOutCubic })(T);
  if (outA == null) return fi;
  const fo = animate({ from: 1, to: 0, start: outA, end: outB, ease: Easing.easeInCubic })(T);
  return Math.min(fi, fo);
}

const CLAUSES = [
  { n: '01', t: 'AGE & CONSENT', b: 'This content is intended exclusively for adults 18 years of age or older, or the age of majority in your jurisdiction if higher. By continuing to view, you confirm that you meet this requirement.' },
  { n: '02', t: 'PERFORMER COMPLIANCE', b: 'All performers are of verified legal age and appear voluntarily, with documented consent, in accordance with 18 U.S.C. \u00a7 2257 and applicable Colombian regulations governing adult content production.' },
  { n: '03', t: 'DRAMATIZED CONTENT', b: 'Depictions of regulated or unregulated substances, professional or clinical settings, mobility-limitation facilities, and any scenario a viewer may consider provocative are staged fiction, performed by consenting adult actors for entertainment purposes only. No such depiction reflects an actual event or endorsement.' },
  { n: '04', t: 'NO ENDORSEMENT', b: 'PNPtv! does not encourage, promote, or endorse any substance, unsafe practice, or activity depicted. We affirm every individual\u2019s right to make informed, autonomous decisions about their own body and health.' },
  { n: '05', t: 'COPYRIGHT', b: 'This production is the exclusive property of PNPtv! and its licensors, protected under applicable copyright and intellectual property law. Unauthorized reproduction or distribution, in whole or in part, is strictly prohibited.' },
  { n: '06', t: 'GOVERNING LAW', b: 'PNPtv! operates in accordance with the laws of the Republic of Colombia. Viewing this content constitutes acceptance of these terms and, where applicable, the laws of your local jurisdiction.' },
];

function IntroPiece(props) {
  const channel = props.channel || 'PNPTV! PRESENTS';
  const title = props.title || 'YOUR TITLE HERE';
  const performers = props.performers || 'Performer Name  •  Performer Name';
  const isPortrait = props.orientation === 'portrait';
  const { T, CUES } = useComposition();
  const tl = useTimeline();
  const d = CUES.Disclaimer;

  const titleOp = fade(T, 0.1, 0.9, d - 0.7, d + 0.1);
  const eyebrowOp = fade(T, 0.05, 0.5, d - 0.9, d - 0.3);
  const logoProg = animate({ from: 0, to: 1, start: 0.25, end: 1.1, ease: Easing.easeOutBack })(T);
  const lineW = animate({ from: 0, to: 88, start: 1.15, end: 1.7, ease: Easing.easeOutCubic })(T);
  const titleTextOp = fade(T, 1.6, 2.3, d - 0.7, d + 0.05);
  const titleTextY = animate({ from: 16, to: 0, start: 1.6, end: 2.3 })(T);
  const performersOp = fade(T, 2.1, 2.8, d - 0.7, d + 0.05);
  const performersY = animate({ from: 14, to: 0, start: 2.1, end: 2.8 })(T);

  const discOp = fade(T, d - 0.4, d + 0.5, null, null);
  const discY = animate({ from: 28, to: 0, start: d - 0.4, end: d + 0.6, ease: Easing.easeOutCubic })(T);

  const skipOp = fade(T, 0.3, 1, null, null);
  const glowX = Math.sin(T * 0.25) * 60;
  const glowY = Math.cos(T * 0.2) * 40;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#121212', overflow: 'hidden', fontFamily: "'Roboto Mono',monospace", color: '#fff' }}>
      <div style={{ position: 'absolute', left: `calc(50% - 500px + ${glowX}px)`, top: `calc(20% + ${glowY}px)`, width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle,rgba(212,0,122,0.16),transparent 65%)' }} />
      <div style={{ position: 'absolute', right: `calc(10% - ${glowX}px)`, bottom: `calc(8% - ${glowY}px)`, width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,255,0,0.08),transparent 65%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)' }} />

      <button
        onClick={() => { tl.setTime(tl.duration); tl.setPlaying(false); }}
        style={{ position: 'absolute', top: 48, right: 48, opacity: skipOp, padding: '12px 26px', borderRadius: 999, border: '1px solid #2A2A2A', background: 'rgba(30,30,30,0.6)', color: '#A1A1A3', fontFamily: "'Roboto Mono',monospace", fontSize: 16, letterSpacing: '0.08em', cursor: 'pointer' }}
      >
        SKIP &gt;
      </button>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: titleOp, gap: 22 }}>
        <div style={{ opacity: eyebrowOp, fontSize: 18, letterSpacing: '0.35em', color: '#D4007A', fontWeight: 600 }}>{channel}</div>
        <img src="assets/pnptv-logo2.png" style={{ width: isPortrait ? 190 : 280, transform: `scale(${0.8 + 0.2 * logoProg}) translateY(${(1 - logoProg) * 24}px)`, opacity: logoProg }} />
        <div style={{ width: lineW, height: 3, background: 'linear-gradient(90deg,#D4007A,#FBFF00)', borderRadius: 2 }} />
        <div style={{ opacity: titleTextOp, transform: `translateY(${titleTextY}px)`, fontFamily: "'Ethnocentric Rg','Roboto Mono',monospace", fontSize: isPortrait ? 40 : 60, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center', maxWidth: isPortrait ? 820 : 1200, padding: isPortrait ? '0 40px' : 0 }}>
          {title}
        </div>
        <div style={{ opacity: performersOp, transform: `translateY(${performersY}px)`, fontSize: isPortrait ? 19 : 24, letterSpacing: '0.08em', color: '#FBFF00', textTransform: 'uppercase', textAlign: 'center', padding: isPortrait ? '0 40px' : 0 }}>
          {performers}
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: discOp, transform: `translateY(${discY}px)`, padding: isPortrait ? '0 32px' : '0 80px' }}>
        <div style={{ width: '100%', maxWidth: isPortrait ? 920 : 1560, maxHeight: '92%', overflowY: 'auto', background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: 12, padding: isPortrait ? '30px 28px' : '44px 56px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: isPortrait ? 20 : 28, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'Ethnocentric Rg','Roboto Mono',monospace", fontSize: isPortrait ? 22 : 30, letterSpacing: '0.06em', color: '#fff' }}>VIEWER DISCLAIMER</div>
            <div style={{ background: '#FBFF00', color: '#121212', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', padding: '4px 12px', borderRadius: 6 }}>18+ ONLY</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isPortrait ? '1fr' : '1fr 1fr', columnGap: 48, rowGap: isPortrait ? 16 : 22 }}>
            {CLAUSES.map((c) => (
              <div key={c.n} style={{ display: 'flex', gap: 14 }}>
                <div style={{ fontFamily: "'Ethnocentric Rg','Roboto Mono',monospace", color: '#D4007A', fontSize: 15, paddingTop: 2 }}>{c.n}</div>
                <div>
                  <div style={{ fontSize: 14, letterSpacing: '0.08em', color: '#E69138', marginBottom: 4, fontWeight: 700 }}>{c.t}</div>
                  <div style={{ fontSize: isPortrait ? 14 : 15, lineHeight: 1.5, color: '#A1A1A3' }}>{c.b}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: isPortrait ? 20 : 30, paddingTop: 18, borderTop: '1px solid #2A2A2A', display: 'flex', flexDirection: isPortrait ? 'column' : 'row', gap: isPortrait ? 6 : 0, justifyContent: 'space-between', fontSize: 13, color: '#5A5A60', letterSpacing: '0.04em' }}>
            <span>PNPTV! S.A.S. — REPUBLIC OF COLOMBIA</span>
            <span>&copy; 2026 PNPTV! — ALL RIGHTS RESERVED</span>
          </div>
        </div>
      </div>
    </div>
  );
}

window.IntroPiece = IntroPiece;
