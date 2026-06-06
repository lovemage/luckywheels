import type { MeProfile } from '../state/session.js';
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

export function PendingApproval({ me, settings }: { me: MeProfile; settings: PublicSettings | null }) {
  const logoSrc = proxiedImageUrl(settings?.homeLogoUrl) || '/assets/logo.png';
  const bgSrc = proxiedImageUrl(settings?.homeBackgroundUrl);
  const style = {
    ...(bgSrc ? { '--auth-bg': `url(${JSON.stringify(bgSrc)})` } : {}),
  } as React.CSSProperties;

  return (
    <main className="onboarding pending-approval auth-screen" style={style}>
      <section className="auth-card">
        <img src={logoSrc} alt="幸運輪盤" className="auth-logo" />
        <h1>等待開啟會員</h1>
        <p>將此畫面截圖給管理員以開啟會員</p>
        <dl>
          <div>
            <dt>LINE 名稱</dt>
            <dd>{me.displayName}</dd>
          </div>
          <div>
            <dt>娛樂城會員編號</dt>
            <dd>{me.entertainmentMemberCode}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
