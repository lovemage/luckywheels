import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api/client.js';
import { fetchPublicSettings, type PublicSettings } from '../api/public-settings.js';

function proxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/prize-images/')) {
      return `/api/media-proxy?url=${encodeURIComponent(parsed.href)}`;
    }
  } catch {
    return url;
  }
  return url;
}

export function Login() {
  const nav = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPublicSettings()
      .then((next) => {
        if (alive) setSettings(next);
      })
      .catch(() => {
        if (alive) setSettings(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) });
      nav('/');
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'LOGIN_RATE_LIMITED') setError('嘗試次數過多，請稍後再試');
      else setError('帳號或密碼錯誤');
    }
  }

  const logoSrc = proxiedImageUrl(settings?.homeLogoUrl) || '/assets/logo.png';
  const bgSrc = proxiedImageUrl(settings?.homeBackgroundUrl);
  const pageStyle = {
    ...(bgSrc ? { '--admin-login-bg': `url(${JSON.stringify(bgSrc)})` } : {}),
  } as CSSProperties;

  return (
    <main className={`admin-login-page${bgSrc ? ' has-background' : ''}`} style={pageStyle}>
      <form className="admin-login-card" onSubmit={onSubmit}>
        <img className="admin-login-logo" src={logoSrc} alt="Lucky Wheels" />
        <div>
          <p className="admin-eyebrow">Admin Console</p>
          <h1>管理後台登入</h1>
        </div>
        <label>
          帳號
          <input type="text" value={account} onChange={(e) => setAccount(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit">登入</button>
        {error && <p role="alert" className="member-detail-error">{error}</p>}
      </form>
    </main>
  );
}
