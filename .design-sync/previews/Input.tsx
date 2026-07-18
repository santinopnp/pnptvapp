import { Input } from '@pnptv/ui-kit';

const frame = { background: '#121212', padding: 24, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 16, width: 280 };

export function Basic() {
  return (
    <div style={frame}>
      <Input label="Display name" placeholder="e.g. NightOwl92" />
    </div>
  );
}

export function WithError() {
  return (
    <div style={frame}>
      <Input label="Email" defaultValue="not-an-email" error="Enter a valid email address" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={frame}>
      <Input label="Username" defaultValue="locked_handle" disabled />
    </div>
  );
}
