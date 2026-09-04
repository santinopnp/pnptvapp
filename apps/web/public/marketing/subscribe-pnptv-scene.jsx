const { useComposition, Easing, animate, clamp, Captions } = window;

const C = {
  bg: '#0a0a0a', bg2: '#121212', surface: '#1e1e1e', surface2: '#161616',
  border: '#2A2A2A', text: '#ffffff', sub: '#A1A1A3', faint: '#6b6b70',
  pink: '#D4007A', pinkSoft: 'rgba(212,0,122,.14)',
  purple: '#7B61FF', amber: '#FFB454', teal: '#5ED1C4', green: '#22C55E',
  gradPay: 'linear-gradient(135deg,#D4007A,#7B61FF)',
  gradBrand: 'linear-gradient(135deg,#D4007A,#E69138)',
  font: '"Roboto Mono", monospace',
};

const CAPTIONS = {
  en: [
    { at: 0.3, until: 5.5, text: 'Want exclusive content, HD streams, and priority support? That\u2019s PNPtv PRIME.' },
    { at: 6.3, until: 11.0, text: 'Four plans: Week Pass, Monthly, Diamond, and Lifetime.' },
    { at: 11.2, until: 19.0, text: 'Diamond is the best value \u2014 a full year for $99.99.' },
    { at: 20.3, until: 24.0, text: 'Tap a plan on the Subscribe page.' },
    { at: 24.2, until: 29.0, text: 'It pays straight from your wallet balance \u2014 no balance yet? Top up with card, Apple Pay, or Google Pay.' },
    { at: 29.2, until: 33.5, text: 'That settles automatically as USDC, and your plan purchase completes right after.' },
    { at: 33.7, until: 37.0, text: 'PRIME activates the moment it settles.' },
    { at: 37.2, until: 42.5, text: 'Prefer crypto? Pay with BTC, ETH, USDC and more in a secure popup.' },
    { at: 50.3, until: 57.5, text: 'Welcome to PRIME \u2014 exclusive content, HD streaming, hangout hosting, and priority support.' },
  ],
  es: [
    { at: 0.3, until: 5.5, text: '\u00bfQuer\u00e9s contenido exclusivo, streams en HD y soporte prioritario? Eso es PNPtv PRIME.' },
    { at: 6.3, until: 11.0, text: 'Cuatro planes: Week Pass, Mensual, Diamond y Lifetime.' },
    { at: 11.2, until: 19.0, text: 'Diamond es el mejor valor \u2014 un a\u00f1o entero por $99.99.' },
    { at: 20.3, until: 24.0, text: 'Toc\u00e1 un plan en la p\u00e1gina de Subscribe.' },
    { at: 24.2, until: 29.0, text: 'Se paga directo desde tu saldo de billetera \u2014 \u00bfsin saldo? Carg\u00e1 con tarjeta, Apple Pay o Google Pay.' },
    { at: 29.2, until: 33.5, text: 'Eso se acredita solo como USDC, y tu plan se compra apenas llega.' },
    { at: 33.7, until: 37.0, text: 'PRIME se activa en el momento que se acredita.' },
    { at: 37.2, until: 42.5, text: '\u00bfPrefer\u00eds crypto? Pag\u00e1 con BTC, ETH, USDC y m\u00e1s en un popup seguro.' },
    { at: 50.3, until: 57.5, text: 'Bienvenido a PRIME \u2014 contenido exclusivo, streaming HD, hosting de hangouts y soporte prioritario.' },
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
    <div style={{ width: w, height: h, borderRadius: h * 0.09, background: '#000', border: '3px solid #1a1a1a', padding: h * 0.014, boxShadow: '0 30px 90px rgba(255,180,84,.15), 0 30px 80px rgba(0,0,0,.55)', flexShrink: 0 }}>
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
      <div style={{ fontSize: size * 0.024, fontWeight: 800, letterSpacing: '0.06em', color: C.amber, background: 'rgba(255,180,84,.12)', border: `1px solid ${C.amber}`, borderRadius: 999, padding: `${size * 0.008}px ${size * 0.02}px` }}>★ PRIME</div>
    </div>
  );
}

function GlowBg({ T }) {
  const drift = Math.sin(T * 0.25) * 30;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: '70%', height: '70%', left: `${10 + drift * 0.2}%`, top: '-10%', background: 'radial-gradient(circle, rgba(255,180,84,.2), transparent 65%)', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', width: '70%', height: '70%', right: `${5 - drift * 0.2}%`, bottom: '-15%', background: 'radial-gradient(circle, rgba(212,0,122,.18), transparent 65%)', filter: 'blur(10px)' }} />
    </div>
  );
}

function HookSection({ T, cue, vertical }) {
  const star = MOTION.pop(T, cue + 0.3, 0.6);
  const pulse = 1 + Math.sin((T - cue) * 3) * 0.06;
  const title = MOTION.enter(T, cue + 1.0, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 18 : 14 }}>
      <div style={{ ...star, transform: `scale(${pulse})`, fontSize: vertical ? 110 : 90, color: C.amber }}>★</div>
      <div style={{ ...title, fontSize: vertical ? 46 : 38, fontWeight: 800, color: C.text, textAlign: 'center', maxWidth: vertical ? 740 : 560 }}>PNPtv PRIME</div>
    </div>
  );
}

function PlanCard({ T, start, name, price, sub, badge, highlight, vertical }) {
  const s = MOTION.enter(T, start, 0.45, 20);
  return (
    <div style={{ ...s, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: vertical ? '20px 26px' : '16px 22px', borderRadius: 20, background: highlight ? C.pinkSoft : C.surface2, border: `1.5px solid ${highlight ? C.pink : C.border}`, width: vertical ? 620 : 480, position: 'relative' }}>
      {badge && <span style={{ position: 'absolute', top: -14, left: 22, background: C.gradBrand, color: '#fff', fontSize: vertical ? 15 : 13, fontWeight: 700, padding: '4px 12px', borderRadius: 999 }}>{badge}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: vertical ? 26 : 22, fontWeight: 700, color: C.text }}>{name}</span>
        <span style={{ fontSize: vertical ? 18 : 16, color: C.sub }}>{sub}</span>
      </div>
      <span style={{ fontSize: vertical ? 32 : 27, fontWeight: 800, color: highlight ? C.amber : C.text }}>{price}</span>
    </div>
  );
}

function PlansSection({ T, cue, vertical, lang }) {
  const plans = lang === 'es'
    ? [['Week Pass', '$15', '7 d\u00edas'], ['Mensual', '$25', '30 d\u00edas'], ['Diamond', '$99.99', '1 a\u00f1o'], ['Lifetime', '$100', 'pago \u00fanico']]
    : [['Week Pass', '$15', '7 days'], ['Monthly', '$25', '30 days'], ['Diamond', '$99.99', '1 year'], ['Lifetime', '$100', 'one-time']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 16 : 12 }}>
      {plans.map(([name, price, sub], i) => (
        <PlanCard key={name} T={T} start={cue + 0.2 + i * 0.35} name={name} price={price} sub={sub} badge={i === 2 ? (lang === 'es' ? 'MEJOR VALOR' : 'BEST VALUE') : null} highlight={i === 2} vertical={vertical} />
      ))}
    </div>
  );
}

function BuyFlowSection({ T, cue, vertical, size, lang }) {
  const bounds = [5, 12, 18];
  const dur = 0.6;
  const sm = (bt) => clamp(animate({ from: 0, to: 1, start: cue + bt, end: cue + bt + dur, ease: Easing.easeInOutCubic })(T), 0, 1);
  const s0 = sm(bounds[0]), s1 = sm(bounds[1]), s2 = sm(bounds[2]);
  const opA = 1 - s0, opB = s0 * (1 - s1), opC = s1 * (1 - s2), opD = s2;
  const plan = lang === 'es' ? 'Diamond \u00b7 1 a\u00f1o' : 'Diamond \u00b7 1 year';
  return (
    <Phone h={size}>
      <ScreenHeader size={size} />
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.018, opacity: opA, padding: size * 0.05 }}>
        <div style={{ fontSize: size * 0.024, color: C.sub }}>{plan}</div>
        <div style={{ fontSize: size * 0.065, fontWeight: 800, color: C.text }}>$99.99</div>
        <div style={{ marginTop: size * 0.01, width: '90%', borderRadius: size * 0.025, background: 'rgba(16,185,129,.06)', border: `1.5px solid rgba(52,211,153,.4)`, padding: size * 0.022, textAlign: 'center' }}>
          <div style={{ fontSize: size * 0.017, color: C.sub, fontWeight: 700, letterSpacing: '0.04em' }}>{lang === 'es' ? 'PAGAR CON' : 'PAY WITH'}</div>
          <div style={{ fontSize: size * 0.02, color: C.text, fontWeight: 700, marginTop: size * 0.006 }}>{lang === 'es' ? 'Sin saldo USDC' : 'No USDC balance'}</div>
        </div>
        <div style={{ marginTop: size * 0.006, width: '85%', textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.03}px 0`, fontSize: size * 0.022, fontWeight: 700, color: '#fff' }}>{lang === 'es' ? '💳 Cargar $109 con tarjeta' : '💳 Top up $109 with card'}</div>
        <div style={{ fontSize: size * 0.016, color: C.faint }}>{lang === 'es' ? 'Apple Pay · Google Pay · tarjeta' : 'Apple Pay · Google Pay · card'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opB, padding: size * 0.05 }}>
        <div style={{ width: size * 0.14, height: size * 0.14, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.pink, animation: 'none' }} />
        <div style={{ fontSize: size * 0.024, fontWeight: 700, color: C.text, textAlign: 'center' }}>{lang === 'es' ? 'Confirmando tu pago\u2026' : 'Confirming your payment\u2026'}</div>
        <div style={{ fontSize: size * 0.017, color: C.sub, textAlign: 'center' }}>{lang === 'es' ? 'Puede tardar hasta 1 min' : 'Up to 1 min'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opC }}>
        <div style={{ width: size * 0.16, height: size * 0.16, borderRadius: '50%', background: 'rgba(34,197,94,.14)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.08, color: C.green }}>✓</div>
        <div style={{ fontSize: size * 0.03, fontWeight: 800, color: C.text }}>{lang === 'es' ? 'Pago confirmado' : 'Payment confirmed'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opD }}>
        <div style={{ ...MOTION.pop(T, cue + bounds[2] + 0.1, 0.5), fontSize: size * 0.09, color: C.amber }}>★</div>
        <div style={{ fontSize: size * 0.032, fontWeight: 800, color: C.amber }}>{lang === 'es' ? 'PRIME activo' : 'PRIME active'}</div>
      </div>
    </Phone>
  );
}

function CoinChip({ T, start, sym, color }) {
  const s = MOTION.pop(T, start, 0.4);
  return <div style={{ ...s, width: 64, height: 64, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff' }}>{sym}</div>;
}

function CryptoOptionSection({ T, cue, vertical, lang }) {
  const label = lang === 'es' ? 'O pag\u00e1 con cualquier crypto' : 'Or pay with any crypto';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 26 : 20 }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <CoinChip T={T} start={cue + 0.2} sym="₿" color="#F7931A" />
        <CoinChip T={T} start={cue + 0.45} sym="Ξ" color="#627EEA" />
        <CoinChip T={T} start={cue + 0.7} sym="$" color="#2775CA" />
      </div>
      <div style={{ ...MOTION.enter(T, cue + 1.1, 0.5), fontSize: vertical ? 34 : 28, fontWeight: 800, color: C.text, textAlign: 'center' }}>{label}</div>
    </div>
  );
}

function PerkChip({ T, start, icon, label, vertical }) {
  const s = MOTION.pop(T, start, 0.4);
  return (
    <div style={{ ...s, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 18, padding: vertical ? '18px 20px' : '14px 16px', minWidth: vertical ? 140 : 118 }}>
      <span style={{ fontSize: vertical ? 30 : 26 }}>{icon}</span>
      <span style={{ fontSize: vertical ? 17 : 15, color: C.sub, fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

function CloseSection({ T, cue, vertical, lang }) {
  const items = lang === 'es'
    ? [['🔓', 'Contenido exclusivo'], ['📺', 'Streaming HD'], ['🏠', 'Hostear hangouts'], ['🎧', 'Soporte prioritario']]
    : [['🔓', 'Exclusive content'], ['📺', 'HD streaming'], ['🏠', 'Hangout hosting'], ['🎧', 'Priority support']];
  const tag = MOTION.enter(T, cue + 1.6, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 26 : 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
        {items.map(([icon, label], i) => <PerkChip key={label} T={T} start={cue + 0.2 + i * 0.25} icon={icon} label={label} vertical={vertical} />)}
      </div>
      <div style={{ ...tag, fontSize: vertical ? 38 : 32, fontWeight: 800, color: C.text, textAlign: 'center' }}>{lang === 'es' ? 'Bienvenido a PRIME' : 'Welcome to PRIME'}</div>
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
      <div style={{ opacity: fade(0, CUES.Plans), position: 'absolute' }}><HookSection T={T} cue={CUES.Hook} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.Plans, CUES.BuyFlow), position: 'absolute' }}><PlansSection T={T} cue={CUES.Plans} vertical={vertical} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.BuyFlow, CUES.CryptoOption), position: 'absolute' }}><BuyFlowSection T={T} cue={CUES.BuyFlow} vertical={vertical} size={size} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.CryptoOption, CUES.Close), position: 'absolute' }}><CryptoOptionSection T={T} cue={CUES.CryptoOption} vertical={vertical} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.Close, null), position: 'absolute' }}><CloseSection T={T} cue={CUES.Close} vertical={vertical} lang={lang} /></div>
      <Captions items={CAPTIONS[lang]} style={{ bottom: vertical ? '9%' : '11%', font: `700 ${vertical ? 34 : 28}px ${C.font}`, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.85)', lineHeight: 1.35 }} />
    </div>
  );
}

window.Piece = Piece;
