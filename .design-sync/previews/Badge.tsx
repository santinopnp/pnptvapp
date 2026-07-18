import { Badge } from '@pnptv/ui-kit';

const frame = { background: '#121212', padding: 24, borderRadius: 8 };

export function AllVariants() {
  return (
    <div style={{ ...frame, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Badge variant="default">Default</Badge>
      <Badge variant="accent">Accent</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
    </div>
  );
}

export function InContext() {
  const row = { display: 'flex', alignItems: 'center', gap: 8 };
  return (
    <div style={{ ...frame, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={row}>
        <span style={{ color: '#FFFFFF', fontSize: 14 }}>Live now</span>
        <Badge variant="accent">LIVE</Badge>
      </div>
      <div style={row}>
        <span style={{ color: '#FFFFFF', fontSize: 14 }}>Subscription</span>
        <Badge variant="success">Active</Badge>
      </div>
      <div style={row}>
        <span style={{ color: '#FFFFFF', fontSize: 14 }}>Verification</span>
        <Badge variant="warning">Pending</Badge>
      </div>
    </div>
  );
}
