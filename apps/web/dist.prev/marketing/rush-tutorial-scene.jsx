const { useComposition, Easing, animate, clamp, Captions } = window;

const C = {
  bg: '#0a0a0a', bg2: '#121212', surface: '#1e1e1e', surface2: '#161616',
  border: '#2A2A2A', text: '#ffffff', sub: '#A1A1A3', faint: '#6b6b70',
  pink: '#D4007A', pinkSoft: 'rgba(212,0,122,.14)',
  purple: '#7B61FF', amber: '#FFB454', teal: '#5ED1C4', teal2: '#2DD4BF', cyan: '#22D3EE',
  green: '#22C55E',
  gradPay: 'linear-gradient(135deg,#D4007A,#7B61FF)',
  gradBrand: 'linear-gradient(135deg,#D4007A,#E69138)',
  gradTeal: 'linear-gradient(90deg,#2DD4BF,#22D3EE)',
  font: '"Roboto Mono", monospace',
};

const CAPTIONS = {
  es: [
    { at: 0.3, until: 4.0, text: '¿Quieres dar tips a tus creators favoritos, agendar llamadas privadas o desbloquear contenido?' },
    { at: 4.2, until: 7.8, text: 'Necesitas Ru$h 💎. Y comprarlos toma 30 segundos.' },
    { at: 8.3, until: 12.0, text: 'Ru$h es la moneda interna de PNPtv!. 1 dólar = 6 Ru$h 💎.' },
    { at: 12.2, until: 16.0, text: 'Se usan para tips en vivo, llamadas privadas, suscripciones y contenido exclusivo.' },
    { at: 16.2, until: 19.6, text: 'Se cargan a tu wallet dentro de la app.' },
    { at: 20.3, until: 24.0, text: "Toca \u201cComprar Ru$h\u201d en tu wallet." },
    { at: 24.2, until: 28.0, text: 'Elige tu paquete — mira el bono incluido.' },
    { at: 28.2, until: 32.0, text: 'Ingresa tu tarjeta: número, fecha y CVC.' },
    { at: 32.2, until: 36.0, text: 'Confirmas… y listo.' },
    { at: 36.2, until: 40.0, text: 'Sí, así de simple. Metes la tarjeta como en cualquier otra tienda.' },
    { at: 40.2, until: 44.0, text: 'Nosotros manejamos el resto por atrás.' },
    { at: 44.2, until: 50.0, text: 'Tus Ru$h aparecen al instante en tu wallet.' },
    { at: 55.3, until: 60.0, text: 'Por atrás usamos tecnología cripto para procesar los pagos de forma segura y global.' },
    { at: 60.2, until: 65.0, text: 'Así podemos aceptar tu tarjeta desde cualquier país, sin bloqueos.' },
    { at: 65.2, until: 69.6, text: 'Pero eso es cosa nuestra — tú solo ves tu tarjeta y tus Ru$h.' },
    { at: 70.3, until: 74.0, text: 'Ya con tus Ru$h en la wallet, gástalos donde quieras dentro de PNPtv!:' },
    { at: 74.2, until: 77.5, text: 'tips, llamadas, subs, contenido.' },
    { at: 77.7, until: 80.5, text: 'Y si se te acaban, otra compra rápida y listo.' },
    { at: 80.7, until: 83.0, text: 'Bienvenido a la economía Ru$h 💎.' },
  ],
  en: [
    { at: 0.3, until: 4.0, text: 'Want to tip your favorite creators, book a private call, or unlock content?' },
    { at: 4.2, until: 7.8, text: "You need Ru$h 💎. And buying it takes 30 seconds." },
    { at: 8.3, until: 12.0, text: "Ru$h is PNPtv!'s in-house currency. 1 dollar = 6 Ru$h 💎." },
    { at: 12.2, until: 16.0, text: 'Use it for live tips, private calls, subscriptions, and exclusive content.' },
    { at: 16.2, until: 19.6, text: 'It loads straight into your wallet inside the app.' },
    { at: 20.3, until: 24.0, text: 'Tap "Buy Ru$h" in your wallet.' },
    { at: 24.2, until: 28.0, text: 'Pick your pack — check out the bonus.' },
    { at: 28.2, until: 32.0, text: 'Enter your card: number, expiry, and CVC.' },
    { at: 32.2, until: 36.0, text: 'Confirm… and done.' },
    { at: 36.2, until: 40.0, text: "Yes, that simple. Same card you'd use at any online store." },
    { at: 40.2, until: 44.0, text: 'We handle everything else behind the scenes.' },
    { at: 44.2, until: 50.0, text: 'Your Ru$h shows up instantly in your wallet.' },
    { at: 55.3, until: 60.0, text: 'Behind the scenes we use crypto technology to process payments securely, worldwide.' },
    { at: 60.2, until: 65.0, text: 'That lets us accept your card from anywhere, with no blocks.' },
    { at: 65.2, until: 69.6, text: "But that's our job — you just see your card and your Ru$h." },
    { at: 70.3, until: 74.0, text: 'Now that Ru$h is in your wallet, spend it anywhere on PNPtv!:' },
    { at: 74.2, until: 77.5, text: 'tips, calls, subs, content.' },
    { at: 77.7, until: 80.5, text: "Run out? Another quick buy and you're set." },
    { at: 80.7, until: 83.0, text: 'Welcome to the Ru$h 💎 economy.' },
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
const drawTo = (T, start, dur, to) => animate({ from: 0, to, start, end: start + dur, ease: Easing.easeOutCubic })(T);
const MOTION = { enter: fadeUp, pop: popIn, draw: drawTo };

function Wordmark({ size = 22 }) {
  return <span style={{ fontWeight: 800, fontSize: size, letterSpacing: '0.01em', color: C.text }}>PNPtv<span style={{ color: C.pink }}>!</span></span>;
}

function Phone({ h, children }) {
  const w = h * 0.475;
  return (
    <div style={{ width: w, height: h, borderRadius: h * 0.09, background: '#000', border: '3px solid #1a1a1a', padding: h * 0.014, boxShadow: '0 30px 90px rgba(123,97,255,.18), 0 30px 80px rgba(0,0,0,.55)', flexShrink: 0 }}>
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
      <div style={{ position: 'absolute', width: '70%', height: '70%', left: `${10 + drift * 0.2}%`, top: '-10%', background: 'radial-gradient(circle, rgba(212,0,122,.22), transparent 65%)', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', width: '70%', height: '70%', right: `${5 - drift * 0.2}%`, bottom: '-15%', background: 'radial-gradient(circle, rgba(123,97,255,.2), transparent 65%)', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', width: '50%', height: '50%', left: '30%', top: '30%', background: 'radial-gradient(circle, rgba(34,211,238,.12), transparent 65%)', filter: 'blur(14px)' }} />
    </div>
  );
}

function HookSection({ T, cue, vertical }) {
  const eyebrow = MOTION.enter(T, cue + 0.1, 0.5);
  const dia = MOTION.pop(T, cue + 0.4, 0.6);
  const pulse = 1 + Math.sin((T - cue) * 3) * 0.05;
  const tag = MOTION.enter(T, cue + 1.2, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 18 : 14 }}>
      <div style={{ ...eyebrow, fontSize: vertical ? 26 : 22, fontWeight: 800, letterSpacing: '0.1em', color: C.pink }}>TIPS · LLAMADAS · CONTENIDO</div>
      <div style={{ ...dia, transform: `scale(${pulse})`, fontSize: vertical ? 130 : 104 }}>💎</div>
      <div style={{ ...tag, fontSize: vertical ? 40 : 34, fontWeight: 800, color: C.text }}>Necesitas Ru$h</div>
    </div>
  );
}

function StatCard({ T, start, vertical }) {
  const s = MOTION.pop(T, start, 0.5);
  return (
    <div style={{ ...s, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 22, padding: vertical ? '26px 40px' : '20px 34px', textAlign: 'center' }}>
      <div style={{ fontSize: vertical ? 46 : 38, fontWeight: 800, background: C.gradPay, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>1 USD = 6 Ru$h 💎</div>
    </div>
  );
}

function Chip({ T, start, icon, label, vertical }) {
  const s = MOTION.enter(T, start, 0.4, 18);
  return (
    <div style={{ ...s, display: 'flex', alignItems: 'center', gap: 12, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 999, padding: vertical ? '14px 22px' : '10px 18px' }}>
      <span style={{ fontSize: vertical ? 24 : 20 }}>{icon}</span>
      <span style={{ fontSize: vertical ? 22 : 19, color: C.text, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function RushIntroSection({ T, cue, vertical }) {
  const chips = [['🎁', 'Tips en vivo'], ['📞', 'Llamadas privadas'], ['⭐', 'Suscripciones'], ['🔓', 'Contenido exclusivo']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 30 : 24 }}>
      <StatCard T={T} start={cue + 0.2} vertical={vertical} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, maxWidth: vertical ? 640 : 560 }}>
        {chips.map(([icon, label], i) => <Chip key={label} T={T} start={cue + 1.2 + i * 0.35} icon={icon} label={label} vertical={vertical} />)}
      </div>
    </div>
  );
}

function TapButton({ T, cue, size }) {
  const pulse = 1 + Math.sin((T - cue) * 4) * 0.04;
  const ring = ((T - cue) * 0.9) % 1;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', width: size * 0.5 * (1 + ring * 0.4), height: size * 0.16 * (1 + ring * 0.4), borderRadius: 999, border: `2px solid ${C.pink}`, opacity: 1 - ring }} />
      <div style={{ transform: `scale(${pulse})`, width: size * 0.5, textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.032}px 0`, fontSize: size * 0.028, fontWeight: 700, color: '#fff' }}>Comprar Ru$h 💎</div>
    </div>
  );
}

function PackCard({ T, start, usd, rush, bonus, selected, size }) {
  const s = MOTION.enter(T, start, 0.4, 16);
  return (
    <div style={{ ...s, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${size * 0.026}px ${size * 0.035}px`, borderRadius: size * 0.03, background: selected ? C.pinkSoft : C.surface2, border: `1px solid ${selected ? C.pink : C.border}` }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: size * 0.03, fontWeight: 700, color: C.text }}>${usd}</span>
        <span style={{ fontSize: size * 0.02, color: C.sub }}>{rush.toLocaleString()} Ru$h</span>
      </div>
      {bonus && <span style={{ fontSize: size * 0.02, fontWeight: 700, color: C.amber, background: 'rgba(255,180,84,.12)', border: '1px solid rgba(255,180,84,.35)', borderRadius: 999, padding: `${size * 0.008}px ${size * 0.016}px` }}>+{bonus}%</span>}
    </div>
  );
}

function CardField({ label, value, size, w }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: size * 0.008, width: w }}>
      <span style={{ fontSize: size * 0.017, color: C.faint }}>{label}</span>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: size * 0.02, padding: `${size * 0.018}px ${size * 0.022}px`, fontSize: size * 0.024, color: C.text, letterSpacing: '0.05em' }}>{value}</div>
    </div>
  );
}

function BuyFlowSection({ T, cue, vertical, size }) {
  const bounds = [4, 13, 24, 31];
  const dur = 0.6;
  const sm = (bt) => clamp(animate({ from: 0, to: 1, start: cue + bt, end: cue + bt + dur, ease: Easing.easeInOutCubic })(T), 0, 1);
  const s0 = sm(bounds[0]), s1 = sm(bounds[1]), s2 = sm(bounds[2]), s3 = sm(bounds[3]);
  const opA = 1 - s0, opB = s0 * (1 - s1), opC = s1 * (1 - s2), opD = s2 * (1 - s3), opE = s3;
  return (
    <Phone h={size}>
      <ScreenHeader size={size} />
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.03, opacity: opA }}>
        <div style={{ fontSize: size * 0.024, color: C.sub }}>Balance</div>
        <div style={{ fontSize: size * 0.07, fontWeight: 800, color: C.text }}>0 Ru$h 💎</div>
        <TapButton T={T} cue={cue} size={size} />
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', padding: size * 0.05, gap: size * 0.022, opacity: opB, justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.024, color: C.sub, marginBottom: size * 0.01, textAlign: 'center' }}>Elige tu paquete</div>
        <PackCard T={T} start={cue + 4.2} usd={50} rush={300} bonus={0} selected={false} size={size} />
        <PackCard T={T} start={cue + 4.5} usd={100} rush={690} bonus={15} selected={true} size={size} />
        <PackCard T={T} start={cue + 4.8} usd={500} rush={3750} bonus={25} selected={false} size={size} />
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', padding: size * 0.05, gap: size * 0.02, opacity: opC, justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.024, color: C.sub, marginBottom: size * 0.008, textAlign: 'center' }}>Pago con tarjeta · $100.00</div>
        <CardField label="NÚMERO DE TARJETA" value="•••• •••• •••• 4242" size={size} w="100%" />
        <div style={{ display: 'flex', gap: size * 0.02 }}>
          <CardField label="MM/AA" value="09/29" size={size} w="50%" />
          <CardField label="CVC" value="•••" size={size} w="50%" />
        </div>
        <div style={{ marginTop: size * 0.015, textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.03}px 0`, fontSize: size * 0.026, fontWeight: 700, color: '#fff' }}>Confirmar pago</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opD }}>
        <div style={{ width: size * 0.16, height: size * 0.16, borderRadius: '50%', background: 'rgba(34,197,94,.14)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.08, color: C.green }}>✓</div>
        <div style={{ fontSize: size * 0.03, fontWeight: 800, color: C.text }}>Pago confirmado</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opE }}>
        <div style={{ fontSize: size * 0.024, color: C.sub }}>Balance</div>
        <div style={{ ...MOTION.pop(T, cue + bounds[3] + 0.1, 0.5), fontSize: size * 0.07, fontWeight: 800, color: C.text }}>690 Ru$h 💎</div>
        <div style={{ fontSize: size * 0.02, color: C.teal, fontWeight: 700 }}>+90 Ru$h de bono · 15%</div>
      </div>
    </Phone>
  );
}

function CryptoSoftSection({ T, cue, vertical }) {
  const s = MOTION.pop(T, cue + 0.2, 0.6);
  const glow = 1 + Math.sin((T - cue) * 2) * 0.06;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 22 : 18 }}>
      <div style={{ ...s, transform: `scale(${glow})`, width: vertical ? 150 : 120, height: vertical ? 150 : 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(123,97,255,.25), transparent 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: vertical ? 92 : 76, height: vertical ? 92 : 76, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: vertical ? 42 : 36 }}>🔒</div>
      </div>
      <div style={{ ...MOTION.enter(T, cue + 0.8, 0.5), fontSize: vertical ? 32 : 26, fontWeight: 800, color: C.text, textAlign: 'center' }}>Pagos seguros, en cualquier país</div>
    </div>
  );
}

function SpendChip({ T, start, icon, label, vertical }) {
  const s = MOTION.pop(T, start, 0.4);
  return (
    <div style={{ ...s, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 18, padding: vertical ? '18px 20px' : '14px 16px', minWidth: vertical ? 130 : 110 }}>
      <span style={{ fontSize: vertical ? 30 : 26 }}>{icon}</span>
      <span style={{ fontSize: vertical ? 18 : 16, color: C.sub, fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

function CloseSection({ T, cue, vertical }) {
  const items = [['🎁', 'Tips'], ['📞', 'Llamadas'], ['⭐', 'Subs'], ['🔓', 'Contenido']];
  const dia = MOTION.pop(T, cue + 2.2, 0.6);
  const tag = MOTION.enter(T, cue + 2.8, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 26 : 20 }}>
      <div style={{ display: 'flex', gap: 14 }}>
        {items.map(([icon, label], i) => <SpendChip key={label} T={T} start={cue + 0.2 + i * 0.25} icon={icon} label={label} vertical={vertical} />)}
      </div>
      <div style={{ ...dia, fontSize: vertical ? 76 : 62 }}>💎</div>
      <div style={{ ...tag, fontSize: vertical ? 38 : 32, fontWeight: 800, color: C.text, textAlign: 'center' }}>Bienvenido a la economía Ru$h</div>
    </div>
  );
}

function Piece({ lang = 'es', vertical = true }) {
  const { T, CUES } = useComposition();
  const size = vertical ? 900 : 640;
  const fade = (from, to) => clamp(animate({ from: 0, to: 1, start: from, end: from + 0.4 })(T), 0, 1) * (to != null ? clamp(animate({ from: 1, to: 0, start: to - 0.5, end: to })(T), 0, 1) : 1);
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, fontFamily: C.font, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
      <GlowBg T={T} />
      <div style={{ opacity: fade(0, CUES.RushIntro), position: 'absolute' }}><HookSection T={T} cue={CUES.Hook} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.RushIntro, CUES.BuyFlow), position: 'absolute' }}><RushIntroSection T={T} cue={CUES.RushIntro} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.BuyFlow, CUES.CryptoSoft), position: 'absolute' }}><BuyFlowSection T={T} cue={CUES.BuyFlow} vertical={vertical} size={size} /></div>
      <div style={{ opacity: fade(CUES.CryptoSoft, CUES.Close), position: 'absolute' }}><CryptoSoftSection T={T} cue={CUES.CryptoSoft} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.Close, null), position: 'absolute' }}><CloseSection T={T} cue={CUES.Close} vertical={vertical} /></div>
      <Captions items={CAPTIONS[lang]} style={{ bottom: vertical ? '9%' : '11%', font: `700 ${vertical ? 34 : 28}px ${C.font}`, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.85)', lineHeight: 1.35 }} />
    </div>
  );
}

window.Piece = Piece;
