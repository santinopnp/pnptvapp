import { Modal, Button } from '@pnptv/ui-kit';

export function Confirm() {
  return (
    <>
      {/* The capture harness contains this card's `fixed` overlay inside a
          transformed ancestor for screenshotting; that ancestor has no
          height of its own since Modal's fixed div is out-of-flow. This
          spacer gives it real height so Modal's `inset-0` computes against
          the full card viewport instead of collapsing to 0. */}
      <div style={{ height: 640 }} />
      <Modal open onClose={() => {}} title="Cancel subscription?">
        <p style={{ color: '#A1A1A3', fontSize: 14, margin: '0 0 20px' }}>
          You'll lose access to premium streams at the end of this billing cycle.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => {}}>Keep subscription</Button>
          <Button variant="danger" onClick={() => {}}>Cancel it</Button>
        </div>
      </Modal>
    </>
  );
}
