import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '../api/client.js';
import { previewLogin } from '../api/preview.js';

// 首頁「新版」入口的帳密視窗：上線前只給業主測試，一般會員沒有帳密就只能留在原輪盤頁。

const ERRORS: Record<string, string> = {
  PREVIEW_LOGIN_FAILED: '帳號或密碼錯誤',
  PREVIEW_LOGIN_LOCKED: '嘗試次數過多，請 1 分鐘後再試',
  PREVIEW_LOGIN_INVALID: '請輸入帳號與密碼',
  NOT_FOUND: '新版預覽已關閉',
};

export function PreviewGate({ onUnlocked, onClose }: { onUnlocked: () => void; onClose: () => void }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    accountRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!account.trim() || !password) {
      setError(ERRORS.PREVIEW_LOGIN_INVALID!);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await previewLogin(account.trim(), password);
      onUnlocked();
    } catch (err) {
      setError(err instanceof ApiError ? ERRORS[err.code] ?? '登入失敗，請稍後再試' : '連線失敗，請稍後再試');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="preview-gate" role="dialog" aria-modal="true" aria-labelledby="preview-gate-title">
      <form className="preview-gate-panel" onSubmit={submit}>
        <button type="button" className="preview-gate-close" onClick={onClose} aria-label="關閉">
          <X aria-hidden="true" />
        </button>
        <h2 id="preview-gate-title">新版預覽</h2>
        <p className="preview-gate-hint">新版尚在測試中，請輸入測試帳號。</p>
        <label>
          <span>帳號</span>
          <input
            ref={accountRef}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={100}
          />
        </label>
        <label>
          <span>密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={200}
          />
        </label>
        {error && <p className="preview-gate-error" role="alert">{error}</p>}
        <button type="submit" className="preview-gate-submit" disabled={busy}>
          {busy ? '驗證中…' : '進入新版'}
        </button>
      </form>
    </div>
  );
}
