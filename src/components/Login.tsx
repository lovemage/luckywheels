import type { LegalTab } from './Legal.js';
import type { PublicSettings } from '../api/draw.js';

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
