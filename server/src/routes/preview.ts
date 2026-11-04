import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { dataAssistantMode } from '../assistant/feature.js';
import {
  checkPreviewCredentials,
  clearPreviewCookie,
  hasPreviewAccess,
  issuePreviewCookie,
} from '../assistant/preview.js';
import { isLoginLocked, recordLoginFailure } from '../admin/auth/rate-limit.js';

// 上線前「新版」預覽入口（DATA_ASSISTANT_ENABLED=preview）。
// - GET  /api/layout-preview          首頁要不要顯示入口、目前是否已通過
// - POST /api/layout-preview/login    輸入預覽帳密 → 發預覽 cookie（同 IP 每分鐘失敗 5 次即鎖）
// - POST /api/layout-preview/logout   清除預覽 cookie
// 錯誤一律不用 401：會員端 api client 收到 401 會當作會員登出。

export const previewRoutes = new Hono();

previewRoutes.get('/api/layout-preview', async (c) => {
  const mode = dataAssistantMode();
  return c.json({
    /** 首頁是否顯示「新版」入口 */
    entry: mode === 'preview',
    /** 是否可以進入新版（正式上線時人人可進） */
    unlocked: mode === 'public' || (mode === 'preview' && (await hasPreviewAccess(c))),
  });
});

const LoginBody = z.object({
  account: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

const clientIp = (c: { req: { header: (n: string) => string | undefined } }) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';

previewRoutes.post('/api/layout-preview/login', async (c) => {
  if (dataAssistantMode() !== 'preview') throw new AppError('NOT_FOUND', 'not found', 404);
  const bucket = `layout-preview:${clientIp(c)}`;
  if (isLoginLocked(bucket)) {
    throw new AppError('PREVIEW_LOGIN_LOCKED', 'too many attempts, try again later', 429);
  }
  let body: z.infer<typeof LoginBody>;
  try { body = LoginBody.parse(await c.req.json()); }
  catch { throw new AppError('PREVIEW_LOGIN_INVALID', 'account and password are required', 400); }
  if (!checkPreviewCredentials(body.account, body.password)) {
    recordLoginFailure(bucket);
    throw new AppError('PREVIEW_LOGIN_FAILED', 'invalid preview account or password', 403);
  }
  await issuePreviewCookie(c);
  return c.json({ unlocked: true });
});

previewRoutes.post('/api/layout-preview/logout', (c) => {
  clearPreviewCookie(c);
  return c.json({ unlocked: false });
});
