import { Card, Badge } from '@pnptv/ui-kit';

const frame = { background: '#121212', padding: 24, borderRadius: 8 };
const title = { color: '#FFFFFF', margin: 0, fontSize: 16, fontWeight: 600 };
const body = { color: '#A1A1A3', margin: '8px 0 0', fontSize: 14 };

export function Basic() {
  return (
    <div style={frame}>
      <Card>
        <h3 style={title}>Weekly Highlights</h3>
        <p style={body}>Catch up on this week's top streams and creator drops.</p>
      </Card>
    </div>
  );
}

export function Interactive() {
  return (
    <div style={frame}>
      <Card hover onClick={() => {}}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={title}>Creator Spotlight</h3>
          <Badge variant="accent">LIVE</Badge>
        </div>
        <p style={body}>Tap to view the full profile.</p>
      </Card>
    </div>
  );
}

export function Grid() {
  const items = ['Music', 'Comedy', 'Talk Shows', 'Gaming'];
  return (
    <div style={{ ...frame, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {items.map((label) => (
        <Card key={label} hover>
          <h4 style={{ color: '#FFFFFF', margin: 0, fontSize: 14, fontWeight: 600 }}>{label}</h4>
        </Card>
      ))}
    </div>
  );
}
