const { Card, Button, Badge, Input } = window.PnptvUiKit;

function HomeFeedScreen() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const stories = ['Nova','Kade','Riko','Storm','Ari','Vex'];
  const posts = [
    { id: 'p1', name: 'Nova Reyes', handle: '@novareyes', time: '12m', live: true, caption: 'Going live for tonight’s hangout — come say hi 👋', likes: 214, comments: 38 },
    { id: 'p2', name: 'Kade Storm', handle: '@kadestorm', time: '1h', live: false, caption: 'New photo set just dropped for Gold tier subscribers.', likes: 522, comments: 61 },
    { id: 'p3', name: 'Ari Blue', handle: '@ariblue', time: '3h', live: false, caption: 'Behind the scenes from today’s shoot.', likes: 148, comments: 12 },
  ];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody, position: 'relative', overflow: 'hidden' }}>
      <AppTopBar title={<span>PNPTV<span style={{ color: PNP.accent }}>+</span></span>} right={<>
        <IconBtn><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PNP.sub} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg></IconBtn>
        <IconBtn><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PNP.sub} strokeWidth="2"><path d="M4 5h16v12H8l-4 4z" /></svg></IconBtn>
        <div style={{ position: 'relative' }}>
          <IconBtn><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PNP.sub} strokeWidth="2"><path d="M12 2a6 6 0 00-6 6v4l-2 4h16l-2-4V8a6 6 0 00-6-6z" /></svg></IconBtn>
          <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: PNP.accent, color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>3</span>
        </div>
        <div onClick={() => setMenuOpen(true)} style={{ cursor: 'pointer' }}><Avatar id="header-me" size={32} ring={PNP.accent} placeholder="Me" /></div>
      </>} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 14, padding: '14px 16px', overflowX: 'auto' }}>
          {stories.map((s, i) => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Avatar id={`story-${i}`} size={58} ring={i < 3 ? PNP.accent : PNP.border} placeholder={s} />
              <span style={{ fontSize: 11, color: PNP.sub }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '4px 16px 12px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: PNP.sub, marginBottom: 8, textTransform: 'uppercase' }}>Spotlight</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {['Nova','Kade','Storm'].map((s, i) => (
              <div key={s} style={{ position: 'relative', width: 132, height: 176, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
                <image-slot id={`spot-${i}`} shape="rect" placeholder={s} style={{ width: '100%', height: '100%' }}></image-slot>
                <div style={{ position: 'absolute', top: 8, left: 8 }}><Badge variant="accent">LIVE</Badge></div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px 8px 8px', background: 'linear-gradient(transparent,rgba(0,0,0,0.75))', fontSize: 12, color: '#fff' }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 16px' }}>
          {posts.map(p => (
            <Card key={p.id} className="p-0" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <Avatar id={`post-av-${p.id}`} size={38} placeholder={p.name} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, color: PNP.text, fontWeight: 600 }}>{p.name}</span>
                    {p.live && <Badge variant="accent">LIVE</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: PNP.sub }}>{p.handle} · {p.time}</div>
                </div>
              </div>
              <div style={{ padding: '0 14px 10px', fontSize: 13, color: PNP.text, lineHeight: 1.5 }}>{p.caption}</div>
              <image-slot id={`post-media-${p.id}`} shape="rect" placeholder="Post media" style={{ width: '100%', height: 200 }}></image-slot>
              <div style={{ display: 'flex', gap: 20, padding: '10px 14px', borderTop: `1px solid ${PNP.border}` }}>
                <span style={{ fontSize: 12, color: PNP.sub, display: 'flex', gap: 5, alignItems: 'center' }}>♥ {p.likes}</span>
                <span style={{ fontSize: 12, color: PNP.sub, display: 'flex', gap: 5, alignItems: 'center' }}>💬 {p.comments}</span>
                <span style={{ fontSize: 12, color: PNP.amber, marginLeft: 'auto' }}>Tip ✨</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <BottomNav active="feed" />
      <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? 'auto' : 'none', transition: 'opacity .25s', zIndex: 30 }}></div>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 264, background: PNP.surface, borderLeft: `1px solid ${PNP.border}`, transform: menuOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .28s cubic-bezier(.2,.8,.2,1)', zIndex: 31, display: 'flex', flexDirection: 'column', padding: '20px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px 16px', borderBottom: `1px solid ${PNP.border}` }}>
          <Avatar id="menu-me" size={46} ring={PNP.accent} placeholder="Me" />
          <div><div style={{ fontSize: 14, color: PNP.text, fontWeight: 700 }}>Alex Rivera</div><div style={{ fontSize: 11, color: PNP.sub }}>@alexr · 🪙 320 tokens</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0' }}>
          {[['👤','My profile'],['💎','My subscriptions'],['🪙','Buy tokens'],['🛒','Shop'],['📅','Booked calls'],['⚙️','Settings'],['🌙','Log out']].map(([ic, tx]) => (
            <div key={tx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', fontSize: 13, color: PNP.text }}><span style={{ width: 22, textAlign: 'center' }}>{ic}</span>{tx}</div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', padding: '0 18px', fontSize: 10, color: PNP.sub }}>PNPtv v2.4 · Terms · Privacy</div>
      </div>
    </div>
  );
}

function LiveDirectoryScreen() {
  const cats = ['All', 'Hangouts', 'Solo', 'Couples', 'Groups'];
  const streams = [
    { id: 'l1', name: 'Nova Reyes', viewers: '1.2k' }, { id: 'l2', name: 'Kade Storm', viewers: '842' },
    { id: 'l3', name: 'Ari Blue', viewers: '390' }, { id: 'l4', name: 'Vex Nightly', viewers: '2.1k' },
    { id: 'l5', name: 'Storm Rio', viewers: '210' }, { id: 'l6', name: 'Riko Mars', viewers: '75' },
  ];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody }}>
      <AppTopBar title="Live Now" right={<span style={{ fontSize: 12, color: PNP.accent }}>● 48 live</span>} />
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        {cats.map((c, i) => (
          <div key={c} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, whiteSpace: 'nowrap', background: i === 0 ? 'transparent' : PNP.surface, backgroundImage: i === 0 ? PNP.grad : 'none', color: i === 0 ? '#fff' : PNP.sub, border: `1px solid ${i === 0 ? 'transparent' : PNP.border}` }}>{c}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {streams.map(s => (
            <div key={s.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '3/4' }}>
              <image-slot id={`live-${s.id}`} shape="rect" placeholder={s.name} style={{ width: '100%', height: '100%' }}></image-slot>
              <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}><Badge variant="accent">LIVE</Badge></div>
              <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '3px 6px' }}>👁 {s.viewers}</div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 8px 8px', background: 'linear-gradient(transparent,rgba(0,0,0,0.8))', fontSize: 12, color: '#fff', fontWeight: 600 }}>{s.name}</div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="live" />
    </div>
  );
}

function LivePlayerScreen() {
  const chat = [
    { u: 'jesse_m', t: 'welcome to the room!' }, { u: 'ty_88', t: 'let’s goo 🔥' },
    { u: 'anon21', t: 'tipped 50 tokens', tip: true }, { u: 'marco', t: 'been waiting all day for this' },
    { u: 'riko_v', t: 'sound is perfect tonight' },
  ];
  return (
    <div style={{ background: '#000', height: '100%', position: 'relative', fontFamily: PNP.fontBody }}>
      <image-slot id="live-player-bg" shape="rect" placeholder="Live video feed" style={{ width: '100%', height: '100%' }}></image-slot>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px', background: 'linear-gradient(rgba(0,0,0,0.65),transparent)' }}>
        <Avatar id="live-player-av" size={34} ring={PNP.accent} placeholder="Nova" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>Nova Reyes</div>
          <div style={{ fontSize: 11, color: '#ddd' }}>👁 1,204 watching</div>
        </div>
        <Badge variant="accent">LIVE</Badge>
        <IconBtn><span style={{ color: '#fff', fontSize: 16 }}>✕</span></IconBtn>
      </div>
      <div style={{ position: 'absolute', top: 66, left: 14, right: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#eee', marginBottom: 4 }}><span style={{ fontWeight: 700, color: PNP.amber }}>🎯 Tip goal · Friday special</span><span>2,450 / 5,000</span></div>
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.18)' }}><div style={{ width: '49%', height: '100%', borderRadius: 3, backgroundImage: PNP.grad }}></div></div>
      </div>
      <div style={{ position: 'absolute', left: 12, right: 90, bottom: 84, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {chat.map((c, i) => (
          <div key={i} style={{ fontSize: 12, color: '#fff', background: c.tip ? 'linear-gradient(135deg,rgba(212,0,122,0.55),rgba(230,145,56,0.45))' : 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '5px 9px', width: 'fit-content', maxWidth: '100%', boxShadow: c.tip ? '0 0 0 1px rgba(230,145,56,0.5)' : 'none' }}>
            <span style={{ color: c.tip ? '#fff' : PNP.amber, fontWeight: 600 }}>{c.u}: </span>{c.tip ? <span>🎁 {c.t}</span> : c.t}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: 12, bottom: 84, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>♥</div>
          <span style={{ fontSize: 10, color: '#fff' }}>3.2k</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundImage: PNP.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✨</div>
          <span style={{ fontSize: 10, color: '#fff' }}>Tip</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 16, display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 12, color: '#ddd' }}>Say something…</div>
        <Button variant="primary" size="md">Send</Button>
      </div>
    </div>
  );
}

function CreatorProfileScreen() {
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', flexDirection: 'column', fontFamily: PNP.fontBody }}>
      <div style={{ position: 'relative' }}>
        <image-slot id="profile-cover" shape="rect" placeholder="Cover image" style={{ width: '100%', height: 140 }}></image-slot>
        <div style={{ position: 'absolute', top: 12, left: 12 }}><IconBtn><span style={{ color: '#fff' }}>‹</span></IconBtn></div>
        <div style={{ position: 'absolute', left: 16, bottom: -34 }}><Avatar id="profile-av" size={78} ring={PNP.accent} placeholder="Nova" /></div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '44px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18, color: PNP.text, fontWeight: 700 }}>Nova Reyes</span>
              <Badge variant="accent">✓</Badge>
            </div>
            <div style={{ fontSize: 12, color: PNP.sub }}>@novareyes · Los Angeles</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Button variant="secondary" size="sm">Hang with Nova</Button>
            <span style={{ fontSize: 9, color: PNP.sub }}>🔒 Paid members only</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, padding: '14px 0' }}>
          {[['312','Posts'],['48.2k','Fans'],['1.2k','Live avg']].map(([n, l]) => (
            <div key={l}><div style={{ fontSize: 15, color: PNP.text, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 11, color: PNP.sub }}>{l}</div></div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: PNP.text, lineHeight: 1.6, margin: '0 0 16px' }}>Dancer, night-owl, and full-time chaos agent. New drops every Friday 🌙</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          <Button variant="primary" size="lg" className="w-full">{`Subscribe · $15 Diamond 💎`}</Button>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Button variant="secondary" size="md" className="w-full">{`Book 30 min call`}</Button></div>
            <div style={{ flex: 1 }}><Button variant="secondary" size="md" className="w-full">{`Book 60 min call`}</Button></div>
          </div>
          <Button variant="ghost" size="md" className="w-full">Channels</Button>
        </div>
        <div style={{ display: 'flex', gap: 18, borderBottom: `1px solid ${PNP.border}`, marginBottom: 10, fontSize: 13 }}>
          {['Posts', 'Media', 'User manual'].map((t, i) => <div key={t} style={{ paddingBottom: 8, color: i === 0 ? PNP.text : PNP.sub, borderBottom: i === 0 ? `2px solid ${PNP.accent}` : 'none' }}>{t}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {Array.from({ length: 6 }).map((_, i) => <image-slot key={i} id={`profile-grid-${i}`} shape="rect" placeholder="Post" style={{ width: '100%', aspectRatio: '1/1' }}></image-slot>)}
        </div>
      </div>
      <BottomNav active="hangouts" />
    </div>
  );
}

Object.assign(window, { HomeFeedScreen, LiveDirectoryScreen, LivePlayerScreen, CreatorProfileScreen });
