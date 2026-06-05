import { useState } from 'react';
import { Modal } from './Modal.js';

export function ConfirmModal({ open, onClose, title, description, requireReason, confirmLabel = '確認', onConfirm, busy }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  requireReason?: boolean;
  confirmLabel?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');
  const canSubmit = !requireReason || reason.trim().length > 0;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && <p>{description}</p>}
      {requireReason && (
        <label style={{ display: 'block', marginBottom: 12 }}>
          原因（必填）
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={busy}>取消</button>
        <button
          disabled={!canSubmit || busy}
          onClick={() => onConfirm(requireReason ? reason : undefined)}
        >
          {busy ? '處理中…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
