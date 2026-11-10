import { Hono } from 'hono';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { signSession } from '../auth/jwt.js';
import { setSessionCookie } from '../auth/cookies.js';
import { redeemHandoffCode } from '../app/handoff.js';
import { getCookie } from 'hono/cookie';
import { verifySession } from '../auth/jwt.js';
import { SESSION_COOKIE } from '../auth/cookies.js';
import { readCasinoSettings } from '../assistant/settings.js';

// Android App（android/）專用的端點。
// - GET /api/public/app-config  App 啟動時讀取：娛樂城網址、最新版本（提示更新用）
// - GET /api/app/handoff        LINE 登入完成後在 Custom Tab 顯示的頁面：把交接碼交回 App
// - GET /api/app/redeem         App 的 WebView 用交接碼換 session cookie，再導回會員首頁

export const APP_PACKAGE = 'com.luckyds.assistant';
export const APP_SCHEME = 'luckyds-assistant';
// 不可用 ds555.net：它會先 301 到 http:// 再轉回 https，App 只允許 https，會顯示「遊戲載入失敗」
const DEFAULT_CASINO_URL = 'https://www.ds8899.net/sty4_home.php?invite_code=su001&c=3';

const optionalInt = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};

export const appRoutes = new Hono();

/** 帶著會員 session cookie 呼叫時（App 1.5.0+）判斷是否為測試會員；沒登入或 session 無效一律當一般會員 */
async function isTestMember(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { userId } = await verifySession(token);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
    return user?.accountType === 'test';
  } catch {
    return false;
  }
}

appRoutes.get('/api/public/app-config', async (c) => {
  c.header('cache-control', 'no-store');
  const casinoUrl = (await isTestMember(getCookie(c, SESSION_COOKIE)))
    ? (await readCasinoSettings(prisma)).testCasinoUrl
    : process.env.APP_CASINO_URL?.trim() || DEFAULT_CASINO_URL;
  return c.json({
    casinoUrl,
    latestVersionCode: optionalInt(process.env.APP_LATEST_VERSION_CODE),
    downloadUrl: process.env.APP_DOWNLOAD_URL?.trim() || null,
  });
});

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Chrome 的 intent:// 連結：開回 App；沒裝 App 時留在本頁 */
export function appIntentUrl(code: string | null): string {
  const query = code ? `?code=${encodeURIComponent(code)}` : '';
  return `intent://auth${query}#Intent;scheme=${APP_SCHEME};package=${APP_PACKAGE};end`;
}

export function handoffPage(code: string | null): string {
  const href = escapeHtml(appIntentUrl(code));
  const title = code ? '登入成功' : '登入沒有完成';
  const body = code ? '正在回到曜金數據助手 App…' : '請回到 App 再按一次登入';
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0a14;color:#f3e6c4;font-family:system-ui,"Noto Sans TC",sans-serif;text-align:center}
main{padding:24px}h1{font-size:20px;margin:0 0 8px;color:#e8c46a}p{margin:0 0 24px;color:#cbbfa6}
a{display:inline-block;padding:14px 28px;border:1px solid #e8c46a;color:#e8c46a;text-decoration:none;font-weight:700}
</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a id="go" href="${href}">回到 App</a></main>
${code ? `<script>location.replace(document.getElementById('go').href)</script>` : ''}
</body></html>`;
}

appRoutes.get('/api/app/handoff', (c) => {
  c.header('cache-control', 'no-store');
  return c.html(handoffPage(c.req.query('code') ?? null));
});

appRoutes.get('/api/app/redeem', async (c) => {
  c.header('cache-control', 'no-store');
  const userId = redeemHandoffCode(c.req.query('code') ?? '');
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }) : null;
  if (user) setSessionCookie(c, await signSession({ userId: user.id }));
  // 交接碼無效時一樣回首頁：會員端會顯示登入畫面，再按一次即可
  return c.redirect(env.PUBLIC_FRONTEND_ORIGIN + '/');
});
