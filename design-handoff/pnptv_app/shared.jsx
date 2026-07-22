const PNP = {
  bg: '#121212', surface: '#1e1e1e', surfaceHover: '#2a2a2a',
  text: '#ffffff', sub: '#a1a1a3', border: '#2a2a2a',
  accent: '#D4007A', accentHover: '#E6198E', amber: '#E69138', error: '#FF453A',
  grad: 'linear-gradient(135deg,#D4007A,#E69138)',
  fontHead: '"Ethnocentric Rg","Roboto Mono",monospace',
  fontBody: '"Roboto Mono",monospace',
};

function FrameLabel({ children, style }) {
  return <div style={{ fontFamily: PNP.fontHead, fontSize: 15, letterSpacing: '0.06em', color: '#e8e8ea', marginBottom: 14, textTransform: 'uppercase', ...style }}>{children}</div>;
}

function Avatar({ id, size = 40, ring, placeholder = 'Avatar' }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, position: 'relative', boxShadow: ring ? `0 0 0 2px ${PNP.bg}, 0 0 0 4px ${ring}` : 'none' }}>
      <image-slot id={id} class="avatar-slot" shape="circle" placeholder={placeholder} style={{ width: size, height: size }}></image-slot>
    </div>
  );
}

function Dot({ color = PNP.accent, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block' }} />;
}

// Custom in-app phone header (matches PNPtv chrome, not native iOS chrome)
function AppTopBar({ title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${PNP.border}`, background: PNP.bg, position: 'sticky', top: 0, zIndex: 5 }}>
      <div style={{ fontFamily: PNP.fontHead, fontSize: 18, letterSpacing: '0.05em', color: PNP.text }}>{title}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{right}</div>
    </div>
  );
}

const NAV_ITEMS = [
  { key: 'feed', label: 'Feed', icon: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { key: 'hangouts', label: 'Hangouts', icon: 'M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm-7 9c0-2.8 3.1-5 7-5s7 2.2 7 5v1H5z' },
  { key: 'connect', label: 'Connect', icon: 'M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z' },
  { key: 'channels', label: 'Channels', icon: 'M4 4h16v12H7l-3 3zM8 8h8M8 11h5' },
  { key: 'live', label: 'Live', icon: 'M4 6h16v12H4zM8 9l6 3-6 3z' },
];

function BottomNav({ active }) {
  return (
    <div style={{ display: 'flex', borderTop: `1px solid ${PNP.border}`, background: PNP.surface, padding: '8px 4px calc(env(safe-area-inset-bottom,0px) + 8px)' }}>
      {NAV_ITEMS.map(item => {
        const isActive = item.key === active;
        return (
          <div key={item.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 0' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isActive ? PNP.accent : PNP.sub}><path d={item.icon} /></svg>
            <span style={{ fontFamily: PNP.fontBody, fontSize: 10, color: isActive ? PNP.text : PNP.sub }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function IconBtn({ children }) {
  return <div style={{ width: 34, height: 34, borderRadius: '50%', background: PNP.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${PNP.border}` }}>{children}</div>;
}

Object.assign(window, { PNP, FrameLabel, Avatar, Dot, AppTopBar, BottomNav, NAV_ITEMS, IconBtn });
