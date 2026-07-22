const { Card, Button, Badge, Input, Modal } = window.PnptvUiKit;

function SideNavItem({ label, icon, active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: active ? PNP.surfaceHover : 'transparent', color: active ? PNP.text : PNP.sub, fontSize: 13 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? PNP.accent : PNP.sub}><path d={icon} /></svg>{label}
    </div>
  );
}

function WebHomeScreen() {
  const posts = [
    { id: 'w1', name: 'Nova Reyes', time: '12m', live: true, caption: 'Going live for tonight’s hangout — come say hi 👋' },
    { id: 'w2', name: 'Kade Storm', time: '1h', live: false, caption: 'New photo set just dropped for Gold tier subscribers.' },
  ];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', fontFamily: PNP.fontBody }}>
      <div style={{ width: 220, borderRight: `1px solid ${PNP.border}`, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: PNP.fontHead, fontSize: 18, color: PNP.text, padding: '4px 14px 20px' }}>PNPtv</div>
        {NAV_ITEMS.map((n, i) => <SideNavItem key={n.key} label={n.label} icon={n.icon} active={i === 0} />)}
        <div style={{ marginTop: 'auto' }}><Button variant="primary" size="md" className="w-full">Go Live</Button></div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', maxWidth: 640 }}>
        <h2 style={{ fontSize: 20, color: PNP.text, margin: '0 0 16px' }}>Home</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map(p => (
            <Card key={p.id} className="p-0" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
                <Avatar id={`web-post-${p.id}`} size={40} placeholder={p.name} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: 14, color: PNP.text, fontWeight: 700 }}>{p.name}</span>{p.live && <Badge variant="accent">LIVE</Badge>}</div>
                  <div style={{ fontSize: 12, color: PNP.sub }}>{p.time} ago</div>
                </div>
              </div>
              <div style={{ padding: '0 16px 12px', fontSize: 13, color: PNP.text }}>{p.caption}</div>
              <image-slot id={`web-media-${p.id}`} shape="rect" placeholder="Post media" style={{ width: '100%', height: 280 }}></image-slot>
              <div style={{ display: 'flex', gap: 20, padding: '12px 16px', borderTop: `1px solid ${PNP.border}`, fontSize: 12, color: PNP.sub }}><span>♥ Like</span><span>💬 Comment</span><span style={{ color: PNP.amber, marginLeft: 'auto' }}>Tip ✨</span></div>
            </Card>
          ))}
        </div>
      </div>
      <div style={{ width: 300, borderLeft: `1px solid ${PNP.border}`, padding: 24 }}>
        <div style={{ fontSize: 12, color: PNP.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Live now</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['Vex Nightly','Storm Rio','Riko Mars'].map((n,i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar id={`web-live-${i}`} size={36} ring={PNP.accent} placeholder={n} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: PNP.text }}>{n}</div><div style={{ fontSize: 11, color: PNP.sub }}>👁 {(i+1)*320}</div></div>
              <Badge variant="accent">LIVE</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreatorStudioScreen() {
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', fontFamily: PNP.fontBody }}>
      <div style={{ width: 210, borderRight: `1px solid ${PNP.border}`, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: PNP.fontHead, fontSize: 16, color: PNP.text, padding: '4px 14px 20px' }}>Creator Studio</div>
        {['Go Live', 'Stream settings', 'Chat moderation', 'Earnings', 'Content library'].map((l, i) => <SideNavItem key={l} label={l} icon="M4 4h16v16H4z" active={i === 0} />)}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 28px', borderBottom: `1px solid ${PNP.border}` }}>
          <div><h2 style={{ fontSize: 18, color: PNP.text, margin: 0 }}>Go Live</h2><div style={{ fontSize: 12, color: PNP.sub }}>Set up your stream before going live</div></div>
          <Button variant="primary" size="lg">Start streaming</Button>
        </div>
        <div style={{ display: 'flex', gap: 24, padding: 28 }}>
          <div style={{ flex: 1 }}>
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <image-slot id="studio-preview" shape="rect" placeholder="Camera preview" style={{ width: '100%', height: 340 }}></image-slot>
              <div style={{ position: 'absolute', top: 12, left: 12 }}><Badge variant="error">OFFLINE</Badge></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Stream title" placeholder="Friday night hangout" />
              <Input label="Category" placeholder="Hangouts" />
            </div>
          </div>
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card><div style={{ fontSize: 12, color: PNP.sub, marginBottom: 6 }}>Stream health</div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: PNP.text }}><span>Bitrate</span><span>—</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: PNP.text, marginTop: 6 }}><span>Dropped frames</span><span>0%</span></div></Card>
            <Card><div style={{ fontSize: 12, color: PNP.sub, marginBottom: 8 }}>Chat moderation</div>{[['jesse_m','said hi'],['ty_88','tipped 25 tokens']].map(([u,t],i) => <div key={i} style={{ fontSize: 12, color: PNP.text, marginBottom: 6 }}><span style={{ color: PNP.amber }}>{u}: </span>{t}</div>)}</Card>
            <Card><div style={{ fontSize: 12, color: PNP.sub, marginBottom: 6 }}>Today’s earnings</div><div style={{ fontSize: 22, color: PNP.text, fontWeight: 700 }}>$342.50</div><div style={{ fontSize: 11, color: PNP.amber }}>+18% vs last stream</div></Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminConsoleScreen() {
  const kpis = [['Revenue (30d)','$182,430','+12.4%'],['Active viewers','8,204','+4.1%'],['New subscribers','1,362','+8.9%'],['Payout queue','$41,200','—']];
  const creators = [['Nova Reyes','Gold',48200,'Verified'],['Kade Storm','VIP',31900,'Verified'],['Ari Blue','Bronze',12400,'Pending'],['Vex Nightly','Gold',27650,'Verified']];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', fontFamily: PNP.fontBody }}>
      <div style={{ width: 210, borderRight: `1px solid ${PNP.border}`, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: PNP.fontHead, fontSize: 16, color: PNP.text, padding: '4px 14px 20px' }}>Admin Console</div>
        {['Overview', 'Creators', 'Payments', 'Mainstage', 'Moderation', 'Reports'].map((l, i) => <SideNavItem key={l} label={l} icon="M4 4h16v16H4z" active={i === 0} />)}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <h2 style={{ fontSize: 18, color: PNP.text, margin: '0 0 18px' }}>Overview</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {kpis.map(([label, val, delta]) => (
            <Card key={label}><div style={{ fontSize: 11, color: PNP.sub, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div><div style={{ fontSize: 22, color: PNP.text, fontWeight: 700 }}>{val}</div><div style={{ fontSize: 11, color: PNP.amber, marginTop: 4 }}>{delta}</div></Card>
          ))}
        </div>
        <Card>
          <div style={{ fontSize: 13, color: PNP.text, fontWeight: 700, marginBottom: 12 }}>Top creators</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', fontSize: 11, color: PNP.sub, padding: '0 0 8px', borderBottom: `1px solid ${PNP.border}` }}><span>Creator</span><span>Tier</span><span>Fans</span><span>Status</span></div>
            {creators.map(([name, tier, fans, status]) => (
              <div key={name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center', fontSize: 13, color: PNP.text, padding: '10px 0', borderBottom: `1px solid ${PNP.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar id={`admin-${name}`} size={28} placeholder={name} />{name}</div>
                <span style={{ color: PNP.sub }}>{tier}</span><span style={{ color: PNP.sub }}>{fans.toLocaleString()}</span>
                <Badge variant={status === 'Verified' ? 'success' : 'warning'}>{status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ShopScreen() {
  const [open, setOpen] = React.useState(true);
  const packs = [['100','$4.99'],['550','$19.99'],['1200','$39.99'],['3000','$89.99']];
  return (
    <div style={{ background: PNP.bg, height: '100%', display: 'flex', fontFamily: PNP.fontBody, position: 'relative' }}>
      <div style={{ width: 220, borderRight: `1px solid ${PNP.border}`, padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: PNP.fontHead, fontSize: 18, color: PNP.text, padding: '4px 14px 20px' }}>PNPtv</div>
        {NAV_ITEMS.map((n) => <SideNavItem key={n.key} label={n.label} icon={n.icon} active={false} />)}
        <SideNavItem label="Shop" icon="M4 4h16v16H4z" active={true} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <h2 style={{ fontSize: 20, color: PNP.text, margin: '0 0 4px' }}>Shop</h2>
        <div style={{ fontSize: 12, color: PNP.sub, marginBottom: 20 }}>Buy tokens to tip creators and unlock private content</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
          {packs.map(([tok, price], i) => (
            <Card key={tok} hover className={i === 1 ? 'badge-gradient' : ''}>
              <div style={{ fontSize: 24, color: PNP.text, fontWeight: 700 }}>{tok}</div>
              <div style={{ fontSize: 12, color: PNP.sub, marginBottom: 10 }}>tokens</div>
              <div style={{ fontSize: 15, color: PNP.amber, fontWeight: 700, marginBottom: 10 }}>{price}</div>
              <Button variant={i === 1 ? 'primary' : 'secondary'} size="sm" className="w-full">Buy now</Button>
            </Card>
          ))}
        </div>
        <div style={{ fontSize: 12, color: PNP.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Merch</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {['PNPtv Tee','Sticker pack','Snapback cap'].map((m, i) => (
            <Card key={m} className="p-0" style={{ overflow: 'hidden' }}>
              <image-slot id={`shop-merch-${i}`} shape="rect" placeholder={m} style={{ width: '100%', height: 150 }}></image-slot>
              <div style={{ padding: 12 }}><div style={{ fontSize: 13, color: PNP.text }}>{m}</div><div style={{ fontSize: 12, color: PNP.amber }}>$24.00</div></div>
            </Card>
          ))}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Buy tokens">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320 }}>
          <div style={{ fontSize: 12, color: PNP.sub }}>Select a package</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {packs.map(([tok, price], i) => (
              <div key={tok} style={{ border: `1px solid ${i === 1 ? PNP.accent : PNP.border}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 18, color: PNP.text, fontWeight: 700 }}>{tok}</div>
                <div style={{ fontSize: 12, color: PNP.amber }}>{price}</div>
              </div>
            ))}
          </div>
          <Input label="Promo code" placeholder="Optional" />
          <Button variant="primary" size="lg">Confirm purchase</Button>
        </div>
      </Modal>
    </div>
  );
}

Object.assign(window, { WebHomeScreen, CreatorStudioScreen, AdminConsoleScreen, ShopScreen });
