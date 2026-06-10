import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.js';

export function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/superadmin/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) });
      await qc.invalidateQueries({ queryKey: ['superadmin', 'me'] });
      nav('/', { replace: true });
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'LOGIN_RATE_LIMITED') setError('嘗試次數過多，請稍後再試');
      else setError('帳號或密碼錯誤，或此帳號非 superadmin');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sa-login-page">
      <form className="sa-login-card" onSubmit={onSubmit}>
        <div>
          <p className="sa-eyebrow">Superadmin</p>
          <h1>跨站會員審核台</h1>
        </div>
        <label>
          帳號
          <input type="text" value={account} onChange={(e) => setAccount(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          密碼
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit" className="sa-btn" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
        {error && <p role="alert" className="sa-error">{error}</p>}
      </form>
    </main>
  );
}
