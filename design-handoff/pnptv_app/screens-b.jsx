const { Card, Button, Badge, Input } = window.PnptvUiKit;

function DMListScreen() {
  const convos = [
    { id: 'c1', name: 'Nova Reyes', preview: 'Thanks for the tip! 💕', time: '2m', unread: 3 },
    { id: 'c2', name: 'Kade Storm', preview: 'Stream starts in 20 min', time: '18m', unread: 0 },
    { id: 'c3', name: 'Ari Blue', preview: 'You: sounds good, see you there', time: '1h', unread: 0 },
    { id: 'c4', name: 'Vex Nightly', preview: 'New set is up for VIPs', time: '3h', unread: 1 },
    { id: 'c5', name: 'PNPtv Support', preview: 'Your verification was approved', time: '1d', unread: 0 },
  ];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody }}>
      <AppTopBar title="Messages" right={<IconBtn><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PNP.sub} strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg></IconBtn>} />
      <div style={{ padding: '10px 16px' }}><Input placeholder="Search messages" /></div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {convos.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${PNP.border}` }}>
            <Avatar id={`dm-${c.id}`} size={46} placeholder={c.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: PNP.text, fontWeight: 600 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: PNP.sub }}>{c.time}</span>
              </div>
              <div style={{ fontSize: 12, color: PNP.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.preview}</div>
            </div>
            {c.unread > 0 && <Badge variant="accent">{c.unread}</Badge>}
          </div>
        ))}
      </div>
      <BottomNav active="connect" />
    </div>
  );
}

function ChatThreadScreen() {
  const msgs = [
    { me: false, t: 'Hey! Thanks so much for subscribing 💖' },
    { me: true, t: 'Of course, loved your last stream!' },
    { me: false, t: 'That means a lot — next one is Friday 9pm' },
    { me: true, t: 'I’ll be there. Can I send a tip now?' },
    { me: false, t: 'Always 😉' },
  ];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${PNP.border}` }}>
        <IconBtn><span style={{ color: PNP.text }}>‹</span></IconBtn>
        <Avatar id="chat-thread-av" size={36} ring={PNP.accent} placeholder="Nova" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: PNP.text, fontWeight: 600 }}>Nova Reyes</div>
          <div style={{ fontSize: 11, color: PNP.amber }}>● online</div>
        </div>
        <IconBtn><span style={{ color: PNP.text, fontSize: 16 }}>✨</span></IconBtn>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: '9px 13px', borderRadius: 16, fontSize: 13, lineHeight: 1.4, color: '#fff', backgroundImage: m.me ? PNP.grad : 'none', background: m.me ? undefined : PNP.surface }}>{m.t}</div>
        ))}
        <div style={{ alignSelf: 'center', fontSize: 11, color: PNP.sub, marginTop: 6, border: `1px solid ${PNP.border}`, borderRadius: 999, padding: '3px 10px' }}>🎁 25 tokens sent</div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${PNP.border}`, alignItems: 'center' }}>
        <IconBtn><span style={{ color: PNP.sub }}>+</span></IconBtn>
        <div style={{ flex: 1 }}><Input placeholder="Message…" /></div>
        <Button variant="primary" size="md">Send</Button>
      </div>
    </div>
  );
}

function SubscribeScreen() {
  const plans = [
    { name: 'Bronze', price: '$4.99', per: '/mo', perks: ['Public feed access', 'Basic chat badge'] },
    { name: 'Gold', price: '$14.99', per: '/mo', perks: ['Everything in Bronze', 'Exclusive photo sets', 'Priority DMs'], pop: true },
    { name: 'VIP', price: '$39.99', per: '/mo', perks: ['Everything in Gold', 'Private streams', '2 video calls / mo'] },
  ];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody }}>
      <AppTopBar title="Subscribe" right={<IconBtn><span style={{ color: PNP.text }}>✕</span></IconBtn>} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Avatar id="sub-av" size={44} ring={PNP.accent} placeholder="Nova" />
          <div>
            <div style={{ fontSize: 15, color: PNP.text, fontWeight: 700 }}>Nova Reyes</div>
            <div style={{ fontSize: 12, color: PNP.sub }}>Choose a membership tier</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map(p => (
            <Card key={p.name} hover className={p.pop ? 'badge-gradient' : ''}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, color: PNP.text, fontWeight: 700 }}>{p.name}</span>
                  {p.pop && <Badge variant="accent">Best value</Badge>}
                </div>
                <div><span style={{ fontSize: 18, color: PNP.text, fontWeight: 700 }}>{p.price}</span><span style={{ fontSize: 12, color: PNP.sub }}>{p.per}</span></div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {p.perks.map(perk => <li key={perk} style={{ fontSize: 12, color: PNP.sub, display: 'flex', gap: 6 }}><span style={{ color: PNP.accent }}>✓</span>{perk}</li>)}
              </ul>
              <Button variant={p.pop ? 'primary' : 'secondary'} size="md" className="w-full">{`Choose ${p.name}`}</Button>
            </Card>
          ))}
        </div>
        <div style={{ fontSize: 11, color: PNP.sub, textAlign: 'center', marginTop: 16 }}>Cancel anytime. Billed securely via crypto or card.</div>
      </div>
    </div>
  );
}

function OnboardingScreen() {
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody, position: 'relative' }}>
      <div style={{ position: 'relative', height: '52%' }}>
        <image-slot id="onboard-hero" shape="rect" placeholder="Brand hero art" style={{ width: '100%', height: '100%' }}></image-slot>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, #121212 100%)', pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', left: 24, bottom: 14, fontFamily: PNP.fontHead, fontSize: 26, letterSpacing: '0.06em', color: '#fff' }}>PNPTV<span style={{ color: PNP.accent }}>+</span></div>
      </div>
      <div style={{ flex: 1, padding: '20px 24px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: i === 0 ? 22 : 8, height: 8, borderRadius: 4, backgroundImage: i === 0 ? PNP.grad : 'none', background: i === 0 ? undefined : PNP.border }} />)}
        </div>
        <h1 style={{ fontSize: 24, color: PNP.text, margin: '0 0 8px', lineHeight: 1.25 }}>Welcome to PNPtv</h1>
        <p style={{ fontSize: 13, color: PNP.sub, lineHeight: 1.6, margin: '0 0 14px' }}>Live shows, exclusive creator content, and a community built around you.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {[['🔴', 'Go live or watch in one tap'], ['💬', 'DM and chat with creators'], ['🪙', 'Tip with tokens, cancel anytime']].map(([ic, tx]) => (
            <div key={tx} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: PNP.text }}><span style={{ width: 28, height: 28, borderRadius: 8, background: PNP.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{ic}</span>{tx}</div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button variant="primary" size="lg">Create account</Button>
          <Button variant="ghost" size="lg">I already have an account</Button>
          <div style={{ fontSize: 10, color: PNP.sub, textAlign: 'center', marginTop: 4 }}>By continuing you confirm you are 18+ and agree to our Terms.</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DMListScreen, ChatThreadScreen, SubscribeScreen, OnboardingScreen });
