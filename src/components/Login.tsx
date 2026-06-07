import { useEffect, useState } from 'react';
import type { LegalTab } from './Legal.js';
import type { PublicSettings } from '../api/draw.js';

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  expired: 'LINE 登入逾時或工作階段已失效,請重新登入。',
};

function proxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    if (u.pathname.includes('/prize-images/')) {
      return `/api/media-proxy?url=${encodeURIComponent(u.href)}`;
    }
  } catch {
    return url;
  }
  return url;
}

export function Login({
  settings,
  onShowLegal,
}: {
  settings: PublicSettings | null;
  onShowLegal: (tab: LegalTab) => void;
}) {
  const [loginError, setLoginError] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('login_error');
    if (!code) return;
    setLoginError(LOGIN_ERROR_MESSAGES[code] ?? '登入發生問題,請重新登入。');
    url.searchParams.delete('login_error');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  }, []);

  const logoSrc = proxiedImageUrl(settings?.homeLogoUrl) || '/assets/logo.png';
  const bgSrc = proxiedImageUrl(settings?.homeBackgroundUrl);
  const style = {
    ...(bgSrc ? { '--auth-bg': `url(${JSON.stringify(bgSrc)})` } : {}),
  } as React.CSSProperties;

  return (
    <main className="login-splash auth-screen" style={style}>
      <section className="auth-card">
        <img src={logoSrc} alt="幸運輪盤" className="login-logo auth-logo" />
        <p>請使用 LINE 帳號登入</p>
        {loginError && (
          <p role="alert" className="error">
            {loginError}
          </p>
        )}
        <button
          className="login-button"
          onClick={() => {
            window.location.href = '/api/auth/line/start';
          }}
        >
          用 LINE 登入
        </button>
        <div className="legal-footer-links">
          <button type="button" onClick={() => onShowLegal('privacy')}>
            隱私權政策
          </button>
          <button type="button" onClick={() => onShowLegal('terms')}>
            服務條款
          </button>
        </div>
      </section>
    </main>
  );
}
