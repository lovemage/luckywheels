import type { ReactNode } from 'react';

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 360, maxWidth: 600 }}
      >
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
