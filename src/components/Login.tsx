export function Login() {
  return (
    <main className="login-splash">
      <img src="/assets/wheel-frame.png" alt="" className="login-decoration" aria-hidden />
      <h1>幸運轉盤</h1>
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
