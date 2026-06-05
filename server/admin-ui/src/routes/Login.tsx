import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api/client.js';

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      nav('/');
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'LOGIN_RATE_LIMITED') setError('嘗試次數過多，請稍後再試');
      else setError('帳號或密碼錯誤');
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '10vh auto', fontFamily: 'sans-serif' }}>
      <h1>Lucky Wheels Admin</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                 style={{ width: '100%', display: 'block', marginBottom: 12 }} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                 style={{ width: '100%', display: 'block', marginBottom: 12 }} />
        </label>
        <button type="submit" style={{ width: '100%' }}>登入</button>
        {error && <p role="alert" style={{ color: '#c00' }}>{error}</p>}
      </form>
    </main>
  );
}
