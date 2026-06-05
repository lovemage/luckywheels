export function Login() {
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
    </main>
  );
}
