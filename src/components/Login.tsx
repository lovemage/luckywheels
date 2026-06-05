import type { LegalTab } from './Legal.js';

export function Login({ onShowLegal }: { onShowLegal: (tab: LegalTab) => void }) {
  return (
    <main className="login-splash">
      <img src="/assets/logo.png" alt="幸運輪盤" className="login-logo" />
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
    </main>
  );
}
