import { useState } from 'react';
import { Modal } from './Modal.js';

export function DoubleConfirmModal({ open, onClose, title, description, requireReason, confirmLabel, expectedConfirmText, onConfirm, busy }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  requireReason?: boolean;
  confirmLabel: string;
  expectedConfirmText: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const reasonOk = !requireReason || reason.trim().length > 0;
  const typedOk = typed.trim() === expectedConfirmText;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p>{description}</p>
      {requireReason && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          原因（必填）
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }} />
        </label>
      )}
      <label style={{ display: 'block', marginBottom: 12 }}>
        請輸入「{expectedConfirmText}」確認
        <input value={typed} onChange={(e) => setTyped(e.target.value)} style={{ width: '100%' }} />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={busy}>取消</button>
        <button disabled={!reasonOk || !typedOk || busy} onClick={() => onConfirm(requireReason ? reason : undefined)}>
          {busy ? '處理中…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
