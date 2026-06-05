import type { ReactNode } from 'react';

export function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'grid', placeItems: 'center', zIndex: 50,
    }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 320, maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onClose}>確認</button>
        </div>
      </div>
    </div>
  );
}
