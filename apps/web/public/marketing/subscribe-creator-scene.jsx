const { useComposition, Easing, animate, clamp, Captions } = window;

const C = {
  bg: '#0a0a0a', bg2: '#121212', surface: '#1e1e1e', surface2: '#161616',
  border: '#2A2A2A', text: '#ffffff', sub: '#A1A1A3', faint: '#6b6b70',
  pink: '#D4007A', pinkSoft: 'rgba(212,0,122,.14)',
  purple: '#7B61FF', amber: '#FFB454', green: '#22C55E',
  gradPay: 'linear-gradient(135deg,#D4007A,#7B61FF)',
  gradBrand: 'linear-gradient(135deg,#D4007A,#E69138)',
  font: '"Roboto Mono", monospace',
};

const CAPTIONS = {
  en: [
    { at: 0.3, until: 6.0, text: 'Found a creator you want more from? Subscribing unlocks everything they post.' },
    { at: 7.3, until: 11.0, text: 'Exclusive photos and videos, subscriber-only posts, priority replies.' },
    { at: 11.2, until: 16.0, text: 'All for one flat monthly price, set by the creator.' },
    { at: 17.3, until: 21.0, text: 'Open their profile and tap Subscribe.' },
    { at: 21.2, until: 25.0, text: 'See the price and what\u2019s included.' },
    { at: 25.2, until: 29.5, text: 'It pays from your wallet balance \u2014 or top up with card, Apple Pay or Google Pay right there.' },
    { at: 29.7, until: 33.5, text: 'Confirmed instantly.' },
    { at: 33.2, until: 36.5, text: 'Every locked post on their profile unlocks right away.' },
    { at: 37.3, until: 44.5, text: 'You\u2019re subscribed \u2014 new exclusive content lands in your feed automatically.' },
  ],
  es: [
    { at: 0.3, until: 6.0, text: '\u00bfEncontraste un creator del que quer\u00e9s ver m\u00e1s? Suscribirte desbloquea todo lo que publica.' },
    { at: 7.3, until: 11.0, text: 'Fotos y videos exclusivos, posts solo para suscriptores, respuestas prioritarias.' },
    { at: 11.2, until: 16.0, text: 'Todo por un precio mensual fijo, definido por el creator.' },
    { at: 17.3, until: 21.0, text: 'Abr\u00ed su perfil y toc\u00e1 Subscribe.' },
    { at: 21.2, until: 25.0, text: 'Mir\u00e1 el precio y qu\u00e9 incluye.' },
    { at: 25.2, until: 29.5, text: 'Se paga desde tu saldo de billetera \u2014 o carg\u00e1 con tarjeta, Apple Pay o Google Pay ah\u00ed mismo.' },
    { at: 29.7, until: 33.5, text: 'Confirmado al instante.' },
    { at: 33.2, until: 36.5, text: 'Cada post bloqueado de su perfil se desbloquea de inmediato.' },
    { at: 37.3, until: 44.5, text: 'Ya est\u00e1s suscripto \u2014 el contenido exclusivo nuevo llega solo a tu feed.' },
  ],
};

const fadeUp = (T, start, dur = 0.5, dist = 26) => {
  const p = animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutCubic })(T);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};
const popIn = (T, start, dur = 0.5) => {
  const p = animate({ from: 0, to: 1, start, end: start + dur, ease: Easing.easeOutBack })(T);
  return { opacity: clamp(p * 2, 0, 1), transform: `scale(${clamp(p, 0, 1.15)})` };
};
const MOTION = { enter: fadeUp, pop: popIn };

function Wordmark({ size = 22 }) {
  return <span style={{ fontWeight: 800, fontSize: size, letterSpacing: '0.01em', color: C.text }}>PNPtv<span style={{ color: C.pink }}>!</span></span>;
}

function Phone({ h, children }) {
  const w = h * 0.475;
  return (
    <div style={{ width: w, height: h, borderRadius: h * 0.09, background: '#000', border: '3px solid #1a1a1a', padding: h * 0.014, boxShadow: '0 30px 80px rgba(0,0,0,.55)', flexShrink: 0 }}>
      <div style={{ width: '100%', height: '100%', borderRadius: h * 0.078, background: C.bg, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

function ScreenHeader({ size }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${size * 0.03}px ${size * 0.055}px`, borderBottom: `1px solid ${C.border}` }}>
      <Wordmark size={size * 0.032} />
      <div style={{ width: size * 0.075, height: size * 0.075, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.04 }}>💎</div>
    </div>
  );
}

function GlowBg({ T }) {
  const drift = Math.sin(T * 0.25) * 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: '70%', height: '70%', left: `${10 + drift * 0.2}%`, top: '-10%', background: 'radial-gradient(circle, rgba(212,0,122,.2), transparent 65%)', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', width: '70%', height: '70%', right: `${5 - drift * 0.2}%`, bottom: '-15%', background: 'radial-gradient(circle, rgba(123,97,255,.18), transparent 65%)', filter: 'blur(10px)' }} />
    </div>
  );
}

function Avatar({ size, locked }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#D4007A,#E69138)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 800, color: '#fff' }}>
      KY
      {locked && <div style={{ position: 'absolute', bottom: -4, right: -4, width: size * 0.36, height: size * 0.36, borderRadius: '50%', background: C.bg, border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.18 }}>🔒</div>}
    </div>
  );
}

function HookSection({ T, cue, vertical }) {
  const av = MOTION.pop(T, cue + 0.2, 0.6);
  const tag = MOTION.enter(T, cue + 1.0, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 20 : 16 }}>
      <div style={{ ...av }}><Avatar size={vertical ? 140 : 116} locked /></div>
      <div style={{ ...tag, fontSize: vertical ? 34 : 28, fontWeight: 800, color: C.text, textAlign: 'center', maxWidth: vertical ? 700 : 540 }}>Subscribe to unlock everything they post</div>
    </div>
  );
}

function PerkChip({ T, start, icon, label, vertical }) {
  const s = MOTION.pop(T, start, 0.4);
  return (
    <div style={{ ...s, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 18, padding: vertical ? '18px 20px' : '14px 16px', minWidth: vertical ? 150 : 126 }}>
      <span style={{ fontSize: vertical ? 30 : 26 }}>{icon}</span>
      <span style={{ fontSize: vertical ? 17 : 15, color: C.sub, fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

function ExplainSection({ T, cue, vertical, lang }) {
  const items = lang === 'es'
    ? [['📸', 'Fotos y videos exclusivos'], ['📝', 'Posts solo suscriptores'], ['💬', 'Respuestas prioritarias']]
    : [['📸', 'Exclusive photos & videos'], ['📝', 'Subscriber-only posts'], ['💬', 'Priority replies']];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, maxWidth: vertical ? 680 : 560 }}>
      {items.map(([icon, label], i) => <PerkChip key={label} T={T} start={cue + 0.2 + i * 0.3} icon={icon} label={label} vertical={vertical} />)}
    </div>
  );
}

function BuyFlowSection({ T, cue, vertical, size, lang }) {
  const bounds = [4, 10, 17, 23];
  const dur = 0.6;
  const sm = (bt) => clamp(animate({ from: 0, to: 1, start: cue + bt, end: cue + bt + dur, ease: Easing.easeInOutCubic })(T), 0, 1);
  const s0 = sm(bounds[0]), s1 = sm(bounds[1]), s2 = sm(bounds[2]), s3 = sm(bounds[3]);
  const opA = 1 - s0, opB = s0 * (1 - s1), opC = s1 * (1 - s2), opD = s2 * (1 - s3), opE = s3;
  return (
    <Phone h={size}>
      <ScreenHeader size={size} />
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.02, opacity: opA, padding: size * 0.05, paddingTop: size * 0.06 }}>
        <Avatar size={size * 0.16} />
        <div style={{ fontSize: size * 0.028, fontWeight: 700, color: C.text }}>Kayden</div>
        <div style={{ fontSize: size * 0.02, color: C.sub }}>{lang === 'es' ? '3 posts bloqueados' : '3 locked posts'}</div>
        <div style={{ marginTop: size * 0.02, width: '70%', textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.03}px 0`, fontSize: size * 0.026, fontWeight: 700, color: '#fff' }}>{lang === 'es' ? 'Suscribirse' : 'Subscribe'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.016, opacity: opB, padding: size * 0.05 }}>
        <div style={{ fontSize: size * 0.022, color: C.sub }}>{lang === 'es' ? 'Suscripci\u00f3n mensual' : 'Monthly subscription'}</div>
        <div style={{ fontSize: size * 0.055, fontWeight: 800, color: C.text }}>$12.99</div>
        <div style={{ marginTop: size * 0.008, width: '85%', borderRadius: size * 0.02, background: 'rgba(16,185,129,.06)', border: `1.5px solid rgba(52,211,153,.4)`, padding: size * 0.018, textAlign: 'center' }}>
          <div style={{ fontSize: size * 0.017, color: C.text, fontWeight: 700 }}>{lang === 'es' ? 'Pagar desde tu billetera' : 'Pay from your wallet'}</div>
        </div>
        <div style={{ width: '70%', textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.024}px 0`, fontSize: size * 0.02, fontWeight: 700, color: '#fff' }}>{lang === 'es' ? '💳 Cargar con tarjeta' : '💳 Top up with card'}</div>
        <div style={{ fontSize: size * 0.015, color: C.faint }}>{lang === 'es' ? 'Apple Pay · Google Pay' : 'Apple Pay · Google Pay'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opC }}>
        <div style={{ width: size * 0.16, height: size * 0.16, borderRadius: '50%', background: 'rgba(34,197,94,.14)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.08, color: C.green }}>✓</div>
        <div style={{ fontSize: size * 0.03, fontWeight: 800, color: C.text }}>{lang === 'es' ? 'Pago confirmado' : 'Payment confirmed'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', padding: size * 0.05, gap: size * 0.02, opacity: opD, justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.022, color: C.sub, textAlign: 'center', marginBottom: size * 0.01 }}>{lang === 'es' ? 'Desbloqueando…' : 'Unlocking…'}</div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...MOTION.enter(T, cue + bounds[2] + i * 0.2, 0.4), height: size * 0.09, borderRadius: size * 0.02, background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.03 }}>🖼️</div>
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opE }}>
        <div style={{ ...MOTION.pop(T, cue + bounds[3] + 0.1, 0.5), fontSize: size * 0.05, fontWeight: 800, color: C.pink, background: C.pinkSoft, border: `1px solid ${C.pink}`, borderRadius: 999, padding: `${size * 0.014}px ${size * 0.03}px` }}>{lang === 'es' ? 'Suscripto ✓' : 'Subscribed ✓'}</div>
      </div>
    </Phone>
  );
}

function CloseSection({ T, cue, vertical, lang }) {
  const tag = MOTION.enter(T, cue + 1.2, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 22 : 18 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...MOTION.pop(T, cue + 0.15 * i, 0.4), width: vertical ? 90 : 74, height: vertical ? 90 : 74, borderRadius: 14, background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: vertical ? 30 : 26 }}>🖼️</div>
        ))}
      </div>
      <div style={{ ...tag, fontSize: vertical ? 38 : 32, fontWeight: 800, color: C.text, textAlign: 'center', maxWidth: vertical ? 720 : 560 }}>{lang === 'es' ? 'Nuevo contenido exclusivo, directo a tu feed' : 'New exclusive content, straight to your feed'}</div>
    </div>
  );
}

function Piece({ lang = 'en', vertical = true }) {
  const { T, CUES } = useComposition();
  const size = vertical ? 900 : 640;
  const fade = (from, to) => clamp(animate({ from: 0, to: 1, start: from, end: from + 0.4 })(T), 0, 1) * (to != null ? clamp(animate({ from: 1, to: 0, start: to - 0.5, end: to })(T), 0, 1) : 1);
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, fontFamily: C.font, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
      <GlowBg T={T} />
      <div style={{ opacity: fade(0, CUES.Explain), position: 'absolute' }}><HookSection T={T} cue={CUES.Hook} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.Explain, CUES.BuyFlow), position: 'absolute' }}><ExplainSection T={T} cue={CUES.Explain} vertical={vertical} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.BuyFlow, CUES.Close), position: 'absolute' }}><BuyFlowSection T={T} cue={CUES.BuyFlow} vertical={vertical} size={size} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.Close, null), position: 'absolute' }}><CloseSection T={T} cue={CUES.Close} vertical={vertical} lang={lang} /></div>
      <Captions items={CAPTIONS[lang]} style={{ bottom: vertical ? '9%' : '11%', font: `700 ${vertical ? 34 : 28}px ${C.font}`, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.85)', lineHeight: 1.35 }} />
    </div>
  );
}

window.Piece = Piece;
