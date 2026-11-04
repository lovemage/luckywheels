import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import { AppError } from '../errors.js';
import { dataAssistantMode } from './feature.js';

// 上線前「新版」預覽閘門（DATA_ASSISTANT_ENABLED=preview 時生效）。
// 預覽帳密是一組共用帳密（給業主測試），與會員 LINE 登入、後台帳號都是不同的東西：
//   PREVIEW_ACCOUNT / PREVIEW_PASSWORD（未設定時預設 admin / test99888）
// 通過後發一個 httpOnly cookie；改密碼即讓舊 cookie 全數失效（token 內含帳密指紋）。

export const PREVIEW_COOKIE = 'lw_layout_preview';
const TTL_SECONDS = 60 * 60 * 24 * 7;

const credentials = () => ({
  account: process.env.PREVIEW_ACCOUNT || 'admin',
  password: process.env.PREVIEW_PASSWORD || 'test99888',
});

const sha256 = (s: string) => createHash('sha256').update(s).digest();
// 與會員 session 用不同金鑰與 audience，兩種 token 不能互換
const secret = () => sha256(`${env.JWT_SECRET}:layout-preview`);
const audience = () => `${env.JWT_AUDIENCE}:layout-preview`;
const fingerprint = () => {
  const { account, password } = credentials();
  return sha256(`${account}\u0000${password}`).toString('base64url').slice(0, 16);
};

/** 固定長度比對，避免以回應時間猜帳密 */
export function checkPreviewCredentials(account: string, password: string): boolean {
  const c = credentials();
  const a = timingSafeEqual(sha256(account), sha256(c.account));
  const p = timingSafeEqual(sha256(password), sha256(c.password));
  return a && p;
}

export async function issuePreviewCookie(c: Context): Promise<void> {
  const token = await new SignJWT({ fp: fingerprint() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(audience())
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
  setCookie(c, PREVIEW_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export function clearPreviewCookie(c: Context): void {
  deleteCookie(c, PREVIEW_COOKIE, { path: '/' });
}

export async function hasPreviewAccess(c: Context): Promise<boolean> {
  const token = getCookie(c, PREVIEW_COOKIE);
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: env.JWT_ISSUER, audience: audience() });
    return payload.fp === fingerprint();
  } catch {
    return false;
  }
}

/** 會員端是否可使用助手：正式上線全開；預覽模式只限持有預覽 cookie 者 */
export async function memberAssistantAllowed(c: Context): Promise<boolean> {
  const mode = dataAssistantMode();
  if (mode === 'public') return true;
  if (mode === 'preview') return hasPreviewAccess(c);
  return false;
}

/** 不可使用時一律 404，對一般會員而言等同功能不存在 */
export const requireMemberAssistant: MiddlewareHandler = async (c, next) => {
  if (!(await memberAssistantAllowed(c))) throw new AppError('NOT_FOUND', 'not found', 404);
  await next();
};
