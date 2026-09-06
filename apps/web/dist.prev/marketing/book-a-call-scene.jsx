const { useComposition, Easing, animate, clamp, Captions } = window;

const C = {
  bg: '#0a0a0a', bg2: '#121212', surface: '#1e1e1e', surface2: '#161616',
  border: '#2A2A2A', text: '#ffffff', sub: '#A1A1A3', faint: '#6b6b70',
  pink: '#D4007A', pinkSoft: 'rgba(212,0,122,.14)',
  purple: '#7B61FF', amber: '#FFB454', green: '#22C55E', greenSoft: 'rgba(52,199,89,.12)',
  gradPay: 'linear-gradient(135deg,#D4007A,#7B61FF)',
  gradBrand: 'linear-gradient(135deg,#D4007A,#E69138)',
  font: '"Roboto Mono", monospace',
};

const CAPTIONS = {
  en: [
    { at: 0.3, until: 5.5, text: 'Want one-on-one time with a creator? Book a private video call.' },
    { at: 6.3, until: 13.0, text: 'Pick from the performers online right now.' },
    { at: 14.3, until: 21.0, text: 'Choose 30 or 60 minutes \u2014 pricing is shown up front.' },
    { at: 22.3, until: 29.0, text: 'Grab a slot, or tap Call Now if they\u2019re online.' },
    { at: 30.3, until: 36.5, text: 'Pay from your wallet balance, or use Ru$h tokens.' },
    { at: 37.2, until: 44.0, text: 'Confirm \u2014 no surprise charges, the price you saw is the price you pay.' },
    { at: 45.3, until: 52.5, text: 'You\u2019re booked. Join from your call at the scheduled time.' },
  ],
  es: [
    { at: 0.3, until: 5.5, text: '\u00bfQuer\u00e9s tiempo uno a uno con un creator? Reserv\u00e1 una videollamada privada.' },
    { at: 6.3, until: 13.0, text: 'Eleg\u00ed entre los performers que est\u00e1n en l\u00ednea ahora.' },
    { at: 14.3, until: 21.0, text: 'Eleg\u00ed 30 o 60 minutos \u2014 el precio se muestra por adelantado.' },
    { at: 22.3, until: 29.0, text: 'Eleg\u00ed un hor\u00e1rio, o toc\u00e1 Llamar Ahora si est\u00e1 en l\u00ednea.' },
    { at: 30.3, until: 36.5, text: 'Pag\u00e1 desde tu saldo de billetera, o us\u00e1 tokens Ru$h.' },
    { at: 37.2, until: 44.0, text: 'Confirm\u00e1 \u2014 sin cargos sorpresa, el precio que viste es el precio que pag\u00e1s.' },
    { at: 45.3, until: 52.5, text: 'Ya est\u00e1 reservada. Un\u00edte a tu llamada en el hor\u00e1rio agendado.' },
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
      <div style={{ width: size * 0.075, height: size * 0.075, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.04 }}>📞</div>
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

function Avatar({ size, initials, live }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#D4007A,#E69138)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 800, color: '#fff', border: live ? '2px solid #FF3B30' : '2px solid rgba(255,255,255,.12)' }}>
      {initials}
      {live && <div style={{ position: 'absolute', top: -3, right: -3, width: size * 0.24, height: size * 0.24, borderRadius: '50%', background: '#FF3B30' }} />}
    </div>
  );
}

function HookSection({ T, cue, vertical }) {
  const icon = MOTION.pop(T, cue + 0.2, 0.6);
  const tag = MOTION.enter(T, cue + 0.9, 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 18 : 14 }}>
      <div style={{ ...icon, fontSize: vertical ? 96 : 78 }}>📞</div>
      <div style={{ ...tag, fontSize: vertical ? 36 : 30, fontWeight: 800, color: C.text, textAlign: 'center', maxWidth: vertical ? 700 : 540 }}>Book a private call</div>
    </div>
  );
}

function CreatorGridSection({ T, cue, vertical }) {
  const names = [['KY', true], ['LX', false], ['SN', true], ['MA', false]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 26 : 20 }}>
      <div style={{ ...MOTION.enter(T, cue, 0.4), fontSize: vertical ? 28 : 24, fontWeight: 700, color: C.sub }}>Available now</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {names.map(([initials, live], i) => (
          <div key={initials} style={{ ...MOTION.pop(T, cue + 0.2 + i * 0.2, 0.4), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Avatar size={vertical ? 96 : 80} initials={initials} live={live} />
            {live && <span style={{ fontSize: vertical ? 14 : 12, fontWeight: 800, color: '#FF3B30' }}>LIVE</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PackageCard({ T, start, mins, price, badge, selected, vertical }) {
  const s = MOTION.enter(T, start, 0.4, 18);
  return (
    <div style={{ ...s, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: vertical ? '24px 34px' : '18px 26px', borderRadius: 20, background: selected ? C.pinkSoft : C.surface2, border: `1.5px solid ${selected ? C.pink : C.border}`, minWidth: vertical ? 220 : 180 }}>
      {badge && <span style={{ position: 'absolute', top: -14, background: C.gradBrand, color: '#fff', fontSize: vertical ? 14 : 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>{badge}</span>}
      <span style={{ fontSize: vertical ? 24 : 20, fontWeight: 700, color: selected ? C.pink : C.text }}>{mins} min</span>
      <span style={{ fontSize: vertical ? 32 : 27, fontWeight: 800, color: selected ? C.amber : C.text }}>${price}</span>
    </div>
  );
}

function PackageSection({ T, cue, vertical, lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 24 : 18 }}>
      <div style={{ ...MOTION.enter(T, cue, 0.4), fontSize: vertical ? 28 : 24, fontWeight: 700, color: C.sub }}>{lang === 'es' ? 'Eleg\u00ed la duraci\u00f3n' : 'Choose the duration'}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        <PackageCard T={T} start={cue + 0.2} mins={30} price={60} badge={lang === 'es' ? 'M\u00c1S POPULAR' : 'MOST POPULAR'} selected vertical={vertical} />
        <PackageCard T={T} start={cue + 0.5} mins={60} price={100} vertical={vertical} />
      </div>
    </div>
  );
}

function TimeSection({ T, cue, vertical, lang }) {
  const nowS = MOTION.enter(T, cue + 0.2, 0.4);
  const slotS = MOTION.enter(T, cue + 0.7, 0.4);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: vertical ? 560 : 460 }}>
      <div style={{ ...nowS, display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: vertical ? '18px 24px' : '14px 20px', borderRadius: 16, background: C.greenSoft, border: `1.5px solid ${C.green}` }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.green }} />
        <span style={{ fontSize: vertical ? 24 : 20, fontWeight: 800, color: C.green }}>{lang === 'es' ? 'LLAMAR AHORA' : 'CALL NOW'}</span>
      </div>
      {['Today · 6:00 PM', 'Today · 8:30 PM'].map((s, i) => (
        <div key={s} style={{ ...slotS, width: '100%', padding: vertical ? '16px 24px' : '12px 20px', borderRadius: 16, background: C.surface2, border: `1px solid ${C.border}`, fontSize: vertical ? 21 : 18, color: C.text, textAlign: 'center' }}>{s}</div>
      ))}
    </div>
  );
}

function CheckoutSection({ T, cue, vertical, size, lang }) {
  const bounds = [4, 10];
  const dur = 0.6;
  const sm = (bt) => clamp(animate({ from: 0, to: 1, start: cue + bt, end: cue + bt + dur, ease: Easing.easeInOutCubic })(T), 0, 1);
  const s0 = sm(bounds[0]), s1 = sm(bounds[1]);
  const opA = 1 - s0, opB = s0 * (1 - s1), opC = s1;
  return (
    <Phone h={size}>
      <ScreenHeader size={size} />
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', padding: size * 0.05, gap: size * 0.02, opacity: opA, justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.024, color: C.sub, textAlign: 'center' }}>Kayden · 30 min</div>
        <div style={{ fontSize: size * 0.07, fontWeight: 800, color: C.text, textAlign: 'center' }}>$60.00</div>
        <div style={{ display: 'flex', gap: size * 0.02, marginTop: size * 0.02 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: `${size * 0.024}px 0`, borderRadius: size * 0.02, background: C.pinkSoft, border: `1.5px solid ${C.pink}`, fontSize: size * 0.02, fontWeight: 700, color: C.pink }}>💳 {lang === 'es' ? 'Billetera' : 'Wallet'}</div>
          <div style={{ flex: 1, textAlign: 'center', padding: `${size * 0.024}px 0`, borderRadius: size * 0.02, background: C.surface2, border: `1px solid ${C.border}`, fontSize: size * 0.02, color: C.sub }}>💎 Ru$h</div>
        </div>
        <div style={{ marginTop: size * 0.015, textAlign: 'center', background: C.gradPay, borderRadius: size * 0.03, padding: `${size * 0.03}px 0`, fontSize: size * 0.026, fontWeight: 700, color: '#fff' }}>{lang === 'es' ? 'Pagar $60.00' : 'Pay $60.00'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.02, opacity: opB }}>
        <div style={{ width: size * 0.16, height: size * 0.16, borderRadius: '50%', background: 'rgba(34,197,94,.14)', border: `2px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.08, color: C.green }}>✓</div>
        <div style={{ fontSize: size * 0.03, fontWeight: 800, color: C.text }}>{lang === 'es' ? 'Reserva confirmada' : 'Booking confirmed'}</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, top: size * 0.16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: size * 0.025, opacity: opC, padding: size * 0.05 }}>
        <div style={{ fontSize: size * 0.024, color: C.sub }}>Today · 6:00 PM</div>
        <div style={{ ...MOTION.pop(T, cue + bounds[1] + 0.1, 0.5), width: '75%', textAlign: 'center', background: C.gradBrand, borderRadius: size * 0.03, padding: `${size * 0.032}px 0`, fontSize: size * 0.026, fontWeight: 700, color: '#fff' }}>{lang === 'es' ? 'Unirse a la llamada' : 'Join Call'}</div>
      </div>
    </Phone>
  );
}

function Piece({ lang = 'en', vertical = true }) {
  const { T, CUES } = useComposition();
  const size = vertical ? 900 : 640;
  const fade = (from, to) => clamp(animate({ from: 0, to: 1, start: from, end: from + 0.4 })(T), 0, 1) * (to != null ? clamp(animate({ from: 1, to: 0, start: to - 0.5, end: to })(T), 0, 1) : 1);
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, fontFamily: C.font, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
      <GlowBg T={T} />
      <div style={{ opacity: fade(0, CUES.ChooseCreator), position: 'absolute' }}><HookSection T={T} cue={CUES.Hook} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.ChooseCreator, CUES.Package), position: 'absolute' }}><CreatorGridSection T={T} cue={CUES.ChooseCreator} vertical={vertical} /></div>
      <div style={{ opacity: fade(CUES.Package, CUES.Time), position: 'absolute' }}><PackageSection T={T} cue={CUES.Package} vertical={vertical} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.Time, CUES.Checkout), position: 'absolute' }}><TimeSection T={T} cue={CUES.Time} vertical={vertical} lang={lang} /></div>
      <div style={{ opacity: fade(CUES.Checkout, null), position: 'absolute' }}><CheckoutSection T={T} cue={CUES.Checkout} vertical={vertical} size={size} lang={lang} /></div>
      <Captions items={CAPTIONS[lang]} style={{ bottom: vertical ? '9%' : '11%', font: `700 ${vertical ? 34 : 28}px ${C.font}`, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.85)', lineHeight: 1.35 }} />
    </div>
  );
}

window.Piece = Piece;
