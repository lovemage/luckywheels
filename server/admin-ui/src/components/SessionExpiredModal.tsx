import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../state/session.js';
import { Modal } from './Modal.js';

export function SessionExpiredModal() {
  const { expiredVisible, dismissExpired } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <Modal
      open={expiredVisible}
      title="請先登入"
      onClose={() => {
        dismissExpired();
        qc.clear();
        nav('/admin/login', { replace: true });
      }}
    >
      <p>連線階段已過期或您尚未登入。請重新登入後繼續操作。</p>
    </Modal>
  );
}
