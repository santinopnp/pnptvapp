import { Skeleton, Card } from '@pnptv/ui-kit';

const frame = { background: '#121212', padding: 24, borderRadius: 8, width: 280 };

export function SingleLine() {
  return (
    <div style={frame}>
      <Skeleton />
    </div>
  );
}

export function MultiLine() {
  return (
    <div style={frame}>
      <Skeleton lines={3} />
    </div>
  );
}

export function LoadingCard() {
  return (
    <div style={frame}>
      <Card>
        <Skeleton style={{ height: 18, width: '60%', marginBottom: 8 }} />
        <Skeleton lines={2} />
      </Card>
    </div>
  );
}
