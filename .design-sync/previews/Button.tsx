import { Button } from '@pnptv/ui-kit';

const frame = { background: '#121212', padding: 24, borderRadius: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };

export function Variants() {
  return (
    <div style={frame}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={frame}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function States() {
  return (
    <div style={frame}>
      <Button loading>Loading</Button>
      <Button disabled>Disabled</Button>
    </div>
  );
}
