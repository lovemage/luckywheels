import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../state/session.js';

export function SessionExpiredModal() {
  const { expiredVisible, dismissExpired } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  if (!expiredVisible) return null;

  function relogin() {
    dismissExpired();
    qc.clear();
    nav('/login', { replace: true });
  }

  return (
    <div className="sa-modal-overlay" role="dialog" aria-modal="true">
      <div className="sa-modal">
        <h2>登入階段已過期</h2>
        <p>請重新登入以繼續操作。</p>
        <button type="button" className="sa-btn" onClick={relogin}>重新登入</button>
      </div>
    </div>
  );
}
