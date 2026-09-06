const { useComposition, Easing, animate, clamp } = window;

const C = {
  bg: '#0a0a0a', bg2: '#121212', surface: '#1e1e1e', surface2: '#161616',
  border: '#2A2A2A', text: '#ffffff', sub: '#A1A1A3', faint: '#6b6b70',
  pink: '#D4007A', pinkSoft: 'rgba(212,0,122,.14)',
  purple: '#7B61FF', amber: '#FFB454', teal: '#5ED1C4', teal2: '#2DD4BF',
  green: '#22C55E',
  gradPay: 'linear-gradient(135deg,#D4007A,#7B61FF)',
  gradBrand: 'linear-gradient(135deg,#D4007A,#E69138)',
  gradTeal: 'linear-gradient(90deg,#2DD4BF,#22D3EE)',
  font: '"Roboto Mono", monospace',
};

const COPY = {
  en: {
    hookEyebrow: 'NEW TO CRYPTO?', hookTitle: 'Meet Ru$h', hookTag: 'Your PNPtv! Wallet',
    probA: 'Bank forms. Wallet addresses. Confusing exchanges.', probB: 'Your PNPtv! Wallet handles all of it.',
    payLabel: 'Pay the exact amount', payService: 'Diamond Membership', payBtn: 'Pay with credit card',
    payDone: 'Charged exactly $15.00', paySub: 'No leftover balance. No extra crypto to manage.',
    payConvert: 'Your card charge converts to crypto automatically', payTransferCaption: 'Straight to the business wallet', payTransferSub: 'No intermediary banks. No waiting.',
    walletMine: 'YOUR WALLET', walletBiz: 'PNPtv! WALLET',
    badgeLabel: 'Or grab a Ru$h badge', badgePick: 'Choose your pack', badgeBtn: 'Buy 1,000 Ru$h',
    spendLabel: 'Then spend it your way', spend: ['Tip a creator', 'Unlock exclusive content', 'Book a private call'],
    bonusLabel: 'Buy more, get more', bonus1n: '6,000 Ru$h', bonus1v: '+900 free · 15%',
    bonus2n: '30,000 Ru$h', bonus2v: '+7,500 free · 25%',
    ctaHead: 'Activate your PNPtv! Wallet', ctaSub: 'Fund it easily with the payment methods you already use.',
    ctaBtn: 'Open Wallet', cardBadge: 'CREDIT CARD', or: 'OR',
  },
  es: {
    hookEyebrow: '¿NUEVO EN CRYPTO?', hookTitle: 'Conoce Ru$h', hookTag: 'Tu Wallet PNPtv!',
    probA: 'Formularios bancarios. Direcciones. Exchanges confusos.', probB: 'Tu Wallet PNPtv! se encarga de todo.',
    payLabel: 'Paga el monto exacto', payService: 'Membresía Diamond', payBtn: 'Pagar con tarjeta de crédito',
    payDone: 'Cobrado exactamente $15.00', paySub: 'Sin saldo sobrante. Sin cripto que administrar.',
    payConvert: 'El cobro de tu tarjeta se convierte en crypto automáticamente', payTransferCaption: 'Directo a la wallet del negocio', payTransferSub: 'Sin bancos intermediarios. Sin esperas.',
    walletMine: 'TU WALLET', walletBiz: 'WALLET PNPtv!',
    badgeLabel: 'O consigue un badge Ru$h', badgePick: 'Elige tu paquete', badgeBtn: 'Comprar 1,000 Ru$h',
    spendLabel: 'Y gástalo a tu manera', spend: ['Da propina a un creador', 'Desbloquea contenido exclusivo', 'Reserva una llamada privada'],
    bonusLabel: 'Compra más, recibe más', bonus1n: '6,000 Ru$h', bonus1v: '+900 gratis · 15%',
    bonus2n: '30,000 Ru$h', bonus2v: '+7,500 gratis · 25%',
    ctaHead: 'Activa tu PNPtv! Wallet', ctaSub: 'Fondéala fácilmente con métodos de pago tradicionales.',
    ctaBtn: 'Abrir Wallet', cardBadge: 'TARJETA DE CRÉDITO', or: 'O',
  },
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
    <div style={{ width: w, height: h, borderRadius: h * 0.09, background: '#000', border: `3px solid #1a1a1a`, padding: h * 0.014, boxShadow: '0 30px 80px rgba(0,0,0,.55)', flexShrink: 0 }}>
      <div style={{ width: '100%', height: '100%', borderRadius: h * 0.078, background: C.bg, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

function ScreenHeader({ t, size }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${size * 0.03}px ${size * 0.055}px`, borderBottom: `1px solid ${C.border}` }}>
      <Wordmark size={size * 0.032} />
      <div style={{ width: size * 0.075, height: size * 0.075, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.04 }}>💎</div>
    </div>
  );
}

function CardIcon({ size }) {
  return (
    <div style={{ width: size * 0.5, height: size * 0.31, borderRadius: size * 0.035, background: C.gradPay, position: 'relative', boxShadow: '0 8px 20px rgba(212,0,122,.25)' }}>
      <div style={{ position: 'absolute', top: size * 0.06, left: size * 0.06, width: size * 0.09, height: size * 0.065, borderRadius: size * 0.012, background: 'rgba(255,255,255,.85)' }} />
      <div style={{ position: 'absolute', bottom: size * 0.06, left: size * 0.06, right: size * 0.06, height: size * 0.02, background: 'rgba(255,255,255,.35)', borderRadius: 4 }} />
    </div>
  );
}

function WalletBadge({ label, icon, size }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.012 }}>
      <div style={{ width: size * 0.15, height: size * 0.15, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.065 }}>{icon}</div>
      <div style={{ fontSize: size * 0.017, color: C.sub, fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center', maxWidth: size * 0.2 }}>{label}</div>
    </div>
  );
}

function WalletTransfer({ T, start, size, lang }) {
  const c = COPY[lang];
  const flowP = ((Math.max(T - start, 0)) * 0.6) % 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.03, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '92%', justifyContent: 'space-between' }}>
        <WalletBadge label={c.walletMine} icon="🙋" size={size} />
        <div style={{ flex: 1, position: 'relative', height: size * 0.008, background: C.border, margin: `0 ${size * 0.02}px`, borderRadius: 99 }}>
          <div style={{ position: 'absolute', top: '50%', left: `${flowP * 100}%`, transform: 'translate(-50%,-50%)', width: size * 0.045, height: size * 0.045, borderRadius: '50%', background: C.teal, boxShadow: `0 0 14px ${C.teal}` }} />
        </div>
        <WalletBadge label={c.walletBiz} icon="🏢" size={size} />
      </div>
      <div style={{ fontSize: size * 0.027, fontWeight: 800, color: C.teal }}>$15.00 · USDC</div>
    </div>
  );
}

function ConvertVisual({ size, lang }) {
  const c = COPY[lang];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.022 }}>
      <CardIcon size={size} />
      <div style={{ fontSize: size * 0.032, color: C.sub }}>↓</div>
      <div style={{ width: size * 0.13, height: size * 0.13, borderRadius: '50%', background: C.gradTeal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.058 }}>💎</div>
      <div style={{ fontSize: size * 0.026, color: C.text, fontWeight: 700, textAlign: 'center', maxWidth: size * 0.72 }}>{c.payConvert}</div>
    </div>
  );
}

function PayScreen({ T, cue, size, lang }) {
  const c = COPY[lang];
  const bounds = [4.2, 9.0, 13.0], dur = 0.6;
  const sm = (bt) => clamp(animate({ from: 0, to: 1, start: cue + bt, end: cue + bt + dur, ease: Easing.easeInOutCubic })(T), 0, 1);
  const s0 = sm(bounds[0]), s1 = sm(bounds[1]), s2 = sm(bounds[2]);
  const op0 = 1 - s0, op1 = s0 * (1 - s1), op2 = s1 * (1 - s2), op3 = s2;
  const checkoutS = MOTION.enter(T, cue + 0.1, 0.5);
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <ScreenHeader size={size} />
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: size * 0.06, opacity: op0, gap: size * 0.045 }}>
        <div style={{ ...checkoutS, width: '100%', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: size * 0.045, padding: size * 0.05, textAlign: 'center' }}>
          <div style={{ fontSize: size * 0.03, color: C.sub, marginBottom: size * 0.015 }}>{c.payService}</div>
          <div style={{ fontSize: size * 0.11, fontWeight: 800, color: C.text }}>$15.00</div>
        </div>
        <div style={{ width: '100%', textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.032}px 0`, fontSize: size * 0.028, fontWeight: 700, color: '#fff' }}>{c.payBtn}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: size * 0.06, opacity: op1 }}>
        <ConvertVisual size={size} lang={lang} />
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: size * 0.06, opacity: op2, gap: size * 0.018 }}>
        <WalletTransfer T={T} start={cue + bounds[1]} size={size} lang={lang} />
        <div style={{ fontSize: size * 0.028, fontWeight: 800, color: C.text, textAlign: 'center', marginTop: size * 0.018 }}>{c.payTransferCaption}</div>
        <div style={{ fontSize: size * 0.021, color: C.sub, textAlign: 'center' }}>{c.payTransferSub}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: size * 0.06, opacity: op3, gap: size * 0.03 }}>
        <div style={{ width: size * 0.18, height: size * 0.18, borderRadius: '50%', background: 'rgba(34,197,94,.14)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.09, color: C.green }}>✓</div>
        <div style={{ fontSize: size * 0.034, fontWeight: 800, color: C.text, textAlign: 'center' }}>{c.payDone}</div>
        <div style={{ fontSize: size * 0.024, color: C.sub, textAlign: 'center' }}>{c.paySub}</div>
      </div>
    </div>
  );
}

function BadgeScreen({ T, cue, size, lang }) {
  const c = COPY[lang];
  const flip = clamp(animate({ from: 0, to: 1, start: cue + 4.6, end: cue + 5.2, ease: Easing.easeInOutCubic })(T), 0, 1);
  const pickOpacity = 1 - flip;
  const spendOpacity = flip;
  const packs = [500, 1000, 5000];
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <ScreenHeader size={size} />
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', padding: size * 0.05, opacity: pickOpacity, gap: size * 0.025 }}>
        <div style={{ fontSize: size * 0.026, color: C.sub, marginBottom: size * 0.01 }}>{c.badgePick}</div>
        {packs.map((p, i) => {
          const sel = i === 1;
          const s = MOTION.enter(T, cue + 0.15 + i * 0.12, 0.4);
          return (
            <div key={p} style={{ ...s, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${size * 0.026}px ${size * 0.035}px`, borderRadius: size * 0.03, background: sel ? C.pinkSoft : C.surface2, border: `1px solid ${sel ? C.pink : C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.02 }}>
                <span style={{ fontSize: size * 0.03 }}>💎</span>
                <span style={{ fontSize: size * 0.028, fontWeight: 700, color: C.text }}>{p.toLocaleString()} Ru$h</span>
              </div>
              {sel && <div style={{ width: size * 0.03, height: size * 0.03, borderRadius: '50%', background: C.pink }} />}
            </div>
          );
        })}
        <div style={{ marginTop: size * 0.02, textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.03}px 0`, fontSize: size * 0.026, fontWeight: 700, color: '#fff' }}>{c.badgeBtn}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', padding: size * 0.05, opacity: spendOpacity, gap: size * 0.02, justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.026, color: C.sub, marginBottom: size * 0.01, textAlign: 'center' }}>{c.spendLabel}</div>
        {c.spend.map((label, i) => {
          const s = MOTION.enter(T, cue + 5.4 + i * 0.5, 0.4);
          return (
            <div key={label} style={{ ...s, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${size * 0.026}px ${size * 0.035}px`, borderRadius: size * 0.03, background: C.surface2, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: size * 0.024, color: C.text }}>{label}</span>
              <span style={{ fontSize: size * 0.024, fontWeight: 700, color: C.amber }}>−{[50, 120, 300][i]} 💎</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Panel({ children, style }) {
  return <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, ...style }}>{children}</div>;
}

function HookSection({ T, cue, vertical }) {
  const eyebrow = MOTION.enter(T, cue + 0.1, 0.5);
  const title = MOTION.pop(T, cue + 0.6, 0.6);
  const tag = MOTION.enter(T, cue + 1.4, 0.5);
  const lang = HookSection.lang;
  const c = COPY[lang];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 18 : 14 }}>
      <div style={{ ...eyebrow, fontSize: vertical ? 30 : 26, fontWeight: 800, letterSpacing: '0.1em', color: C.pink }}>{c.hookEyebrow}</div>
      <div style={{ ...title, display: 'flex', alignItems: 'center', gap: 16, fontSize: vertical ? 108 : 88, fontWeight: 800, color: C.text }}>
        {c.hookTitle} <span style={{ fontSize: vertical ? 96 : 78 }}>💎</span>
      </div>
      <div style={{ ...tag, fontSize: vertical ? 32 : 28, color: C.sub }}>{c.hookTag}</div>
    </div>
  );
}

function ProblemSection({ T, cue, vertical, lang }) {
  const c = COPY[lang];
  const aOpacity = clamp(animate({ from: 1, to: 0, start: cue + 2.1, end: cue + 2.7, ease: Easing.easeInOutCubic })(T), 0, 1) * clamp(animate({ from: 0, to: 1, start: cue, end: cue + 0.4 })(T), 0, 1);
  const aStyle = MOTION.enter(T, cue + 0.1, 0.4);
  const bOpacity = clamp(animate({ from: 0, to: 1, start: cue + 2.6, end: cue + 3.2 })(T), 0, 1);
  const bStyle = MOTION.enter(T, cue + 2.6, 0.6);
  return (
    <div style={{ position: 'relative', width: vertical ? '82%' : '46%', textAlign: 'center', minHeight: vertical ? 220 : 180 }}>
      <div style={{ ...aStyle, position: 'absolute', inset: 0, opacity: aOpacity, fontSize: vertical ? 40 : 32, fontWeight: 700, color: C.sub, textDecoration: 'line-through', textDecorationColor: 'rgba(255,69,58,.6)' }}>{c.probA}</div>
      <div style={{ ...bStyle, position: 'absolute', inset: 0, opacity: bOpacity, fontSize: vertical ? 44 : 36, fontWeight: 800, color: C.text }}>{c.probB}</div>
    </div>
  );
}

function PayCardSection({ T, cue, vertical, lang }) {
  const c = COPY[lang];
  const labelS = MOTION.enter(T, cue + 0.1, 0.5);
  const phoneS = MOTION.enter(T, cue + 0.3, 0.6, 40);
  const size = vertical ? 900 : 640;
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: vertical ? 26 : 60 }}>
      <div style={{ ...labelS, fontSize: vertical ? 44 : 40, fontWeight: 800, color: C.text, textAlign: vertical ? 'center' : 'left', maxWidth: vertical ? 700 : 420 }}>{c.payLabel}</div>
      <div style={{ ...phoneS }}><Phone h={size}><PayScreen T={T} cue={cue} size={size} lang={lang} /></Phone></div>
    </div>
  );
}

function RushBadgeSection({ T, cue, vertical, lang }) {
  const c = COPY[lang];
  const labelS = MOTION.enter(T, cue + 0.1, 0.5);
  const phoneS = MOTION.enter(T, cue + 0.3, 0.6, 40);
  const size = vertical ? 900 : 640;
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column-reverse' : 'row', alignItems: 'center', gap: vertical ? 26 : 60 }}>
      <div style={{ ...labelS, fontSize: vertical ? 44 : 40, fontWeight: 800, color: C.text, textAlign: vertical ? 'center' : 'left', maxWidth: vertical ? 700 : 420 }}>{c.badgeLabel}</div>
      <div style={{ ...phoneS }}><Phone h={size}><BadgeScreen T={T} cue={cue} size={size} lang={lang} /></Phone></div>
    </div>
  );
}

function BonusCard({ T, start, name, value, grad, vertical }) {
  const s = MOTION.pop(T, start, 0.55);
  return (
    <div style={{ ...s, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 24, padding: vertical ? '32px 40px' : '26px 34px', textAlign: 'center', minWidth: vertical ? 480 : 340 }}>
      <div style={{ fontSize: vertical ? 30 : 24, color: C.sub, fontWeight: 700, marginBottom: 10 }}>{name}</div>
      <div style={{ fontSize: vertical ? 44 : 34, fontWeight: 800, background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{value}</div>
    </div>
  );
}

function BonusSection({ T, cue, vertical, lang }) {
  const c = COPY[lang];
  const labelS = MOTION.enter(T, cue + 0.1, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 30 : 24 }}>
      <div style={{ ...labelS, fontSize: vertical ? 46 : 40, fontWeight: 800, color: C.text }}>{c.bonusLabel}</div>
      <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 20 : 30 }}>
        <BonusCard T={T} start={cue + 0.7} name={c.bonus1n} value={c.bonus1v} grad={C.gradTeal} vertical={vertical} />
        <BonusCard T={T} start={cue + 1.5} name={c.bonus2n} value={c.bonus2v} grad={C.gradBrand} vertical={vertical} />
      </div>
    </div>
  );
}

function CTASection({ T, cue, vertical, lang }) {
  const c = COPY[lang];
  const logoS = MOTION.pop(T, cue + 0.1, 0.5);
  const headS = MOTION.enter(T, cue + 0.6, 0.5);
  const subS = MOTION.enter(T, cue + 1.0, 0.5);
  const btnS = MOTION.enter(T, cue + 1.5, 0.5);
  const pulse = 1 + Math.sin((T - cue) * 3.2) * 0.03;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 22 : 18, textAlign: 'center', maxWidth: vertical ? 780 : 620 }}>
      <div style={{ ...logoS, fontSize: vertical ? 70 : 60 }}>💎</div>
      <div style={{ ...headS, fontSize: vertical ? 46 : 38, fontWeight: 800, color: C.text }}>{c.ctaHead}</div>
      <div style={{ ...subS, fontSize: vertical ? 28 : 24, color: C.sub }}>{c.ctaSub}</div>
      <div style={{ ...btnS, transform: `scale(${pulse})`, background: C.gradPay, color: '#fff', fontWeight: 700, fontSize: vertical ? 26 : 22, padding: vertical ? '20px 52px' : '16px 44px', borderRadius: 999, boxShadow: '0 0 40px rgba(212,0,122,.35)' }}>{c.ctaBtn}</div>
    </div>
  );
}

function Piece({ lang = 'en', vertical = true }) {
  const { T, CUES } = useComposition();
  HookSection.lang = lang;
  return (
    <div style={{ width: '100%', height: '100%', background: `radial-gradient(circle at 50% 20%, ${C.bg2}, ${C.bg})`, fontFamily: C.font, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
      <div style={{ opacity: clamp(animate({ from: 1, to: 0, start: CUES.Problem - 0.5, end: CUES.Problem })(T), 0, 1), position: 'absolute' }}>
        <HookSection T={T} cue={CUES.Hook} vertical={vertical} />
      </div>
      <div style={{ opacity: clamp(animate({ from: 0, to: 1, start: CUES.Problem, end: CUES.Problem + 0.4 })(T), 0, 1) * clamp(animate({ from: 1, to: 0, start: CUES.PayCard - 0.5, end: CUES.PayCard })(T), 0, 1), position: 'absolute' }}>
        <ProblemSection T={T} cue={CUES.Problem} vertical={vertical} lang={lang} />
      </div>
      <div style={{ opacity: clamp(animate({ from: 0, to: 1, start: CUES.PayCard, end: CUES.PayCard + 0.4 })(T), 0, 1) * clamp(animate({ from: 1, to: 0, start: CUES.RushBadge - 0.5, end: CUES.RushBadge })(T), 0, 1), position: 'absolute' }}>
        <PayCardSection T={T} cue={CUES.PayCard} vertical={vertical} lang={lang} />
      </div>
      <div style={{ opacity: clamp(animate({ from: 0, to: 1, start: CUES.RushBadge, end: CUES.RushBadge + 0.4 })(T), 0, 1) * clamp(animate({ from: 1, to: 0, start: CUES.Bonus - 0.5, end: CUES.Bonus })(T), 0, 1), position: 'absolute' }}>
        <RushBadgeSection T={T} cue={CUES.RushBadge} vertical={vertical} lang={lang} />
      </div>
      <div style={{ opacity: clamp(animate({ from: 0, to: 1, start: CUES.Bonus, end: CUES.Bonus + 0.4 })(T), 0, 1) * clamp(animate({ from: 1, to: 0, start: CUES.CTA - 0.5, end: CUES.CTA })(T), 0, 1), position: 'absolute' }}>
        <BonusSection T={T} cue={CUES.Bonus} vertical={vertical} lang={lang} />
      </div>
      <div style={{ opacity: clamp(animate({ from: 0, to: 1, start: CUES.CTA, end: CUES.CTA + 0.4 })(T), 0, 1), position: 'absolute' }}>
        <CTASection T={T} cue={CUES.CTA} vertical={vertical} lang={lang} />
      </div>
    </div>
  );
}

window.Piece = Piece;
