import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { compress } from 'hono/compress';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { formatError } from './errors.js';
import { meRoutes } from './routes/me.js';
import { authRoutes } from './routes/auth.js';
import { drawRoutes } from './routes/draw.js';
import { publicRoutes } from './routes/public.js';
import { winnersRoutes } from './routes/winners.js';
import { mediaProxyRoutes } from './routes/media-proxy.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { assistantRoutes } from './routes/assistant.js';
import { previewRoutes } from './routes/preview.js';
import { appRoutes } from './routes/app.js';
import { adminAuthRoutes } from './admin/routes/auth.js';
import { adminUsersRoutes } from './admin/routes/users.js';
import { adminRedemptionsRoutes } from './admin/routes/redemptions.js';
import { adminMeRoutes } from './admin/routes/me.js';
import { adminActionLogsRoutes } from './admin/routes/action-logs.js';
import { adminPrizesRoutes } from './admin/routes/prizes.js';
import { adminSettingsRoutes } from './admin/routes/settings.js';
import { adminUploadsRoutes } from './admin/routes/uploads.js';
import { adminSubAccountsRoutes } from './admin/routes/sub-accounts.js';
import { adminAssistantCollectorRoutes } from './admin/routes/assistant-collector.js';
import { adminAssistantSettingsRoutes } from './admin/routes/assistant-settings.js';
import { bootstrapAdminIfRequested } from './admin/bootstrap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In production __dirname is /app/server/dist/src and assets live at
// /app/server/{admin-ui/dist,web-dist} — two levels up. In tsx-watch dev
// __dirname is server/src — one level up. Probe both.
function resolveAsset(...rel: string[]): string {
  const candidates = [
    join(__dirname, '..', '..', ...rel),
    join(__dirname, '..', ...rel),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}
const ADMIN_DIST = resolveAsset('admin-ui', 'dist');
const ADMIN_INDEX_PATH = join(ADMIN_DIST, 'index.html');
const FALLBACK_INDEX = '<!doctype html><html><body><div id="root">Admin UI not built yet. Run npm --prefix admin-ui run build.</div></body></html>';
const MEMBER_DIST = resolveAsset('web-dist');
const MEMBER_INDEX_PATH = join(MEMBER_DIST, 'index.html');
const MEMBER_FALLBACK = '<!doctype html><html><body><div id="root">Member UI not built yet.</div></body></html>';

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.res.headers.append('vary', 'Accept-Encoding');
});
app.use('*', compress({ threshold: 1024 }));

app.onError((err, c) => {
  const { status, body } = formatError(err);
  // 非預期錯誤（非 AppError）會被包成 500 INTERNAL；記下原始錯誤，否則正式站無從追查
  if (status >= 500) console.error(`[${c.req.method} ${c.req.path}] unhandled error`, err);
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500 | 502);
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.get('/api/healthz', (c) => c.json({ ok: true }));
app.get('/api/admin/health', (c) => c.json({ ok: true }));

app.route('/', meRoutes);
app.route('/', authRoutes);
app.route('/', drawRoutes);
app.route('/', publicRoutes);
app.route('/', winnersRoutes);
app.route('/', mediaProxyRoutes);
app.route('/', onboardingRoutes);
app.route('/', assistantRoutes);
app.route('/', previewRoutes);
app.route('/', appRoutes);
app.route('/', adminAuthRoutes);
app.route('/', adminUsersRoutes);
app.route('/', adminRedemptionsRoutes);
app.route('/', adminMeRoutes);
app.route('/', adminActionLogsRoutes);
app.route('/', adminPrizesRoutes);
app.route('/', adminSettingsRoutes);
app.route('/', adminUploadsRoutes);
app.route('/', adminSubAccountsRoutes);
app.route('/', adminAssistantCollectorRoutes);
app.route('/', adminAssistantSettingsRoutes);

// 沒有對應路由的 /api/* 一律回 JSON 404，不落到下面的 SPA catch-all（否則會回 200 + 首頁 HTML）
app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404));

app.use('/admin/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
// admin-ui is built with vite base "/admin/", so HTML references /admin/assets/...
// but the files sit at <ADMIN_DIST>/assets/... — strip the prefix.
app.use(
  '/admin/*',
  serveStatic({ root: ADMIN_DIST, rewriteRequestPath: (p) => p.replace(/^\/admin/, '') || '/' })
);
const adminSpa = (c: Context) => {
  const html = existsSync(ADMIN_INDEX_PATH) ? readFileSync(ADMIN_INDEX_PATH, 'utf-8') : FALLBACK_INDEX;
  c.header('cache-control', 'no-store');
  return c.html(html);
};
app.get('/admin', adminSpa);
app.get('/admin/*', adminSpa);

app.use('/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
// Android App 安裝檔（public/downloads/*.apk）：指定 APK 型別，手機才會交給套件安裝程式開啟
app.use('/downloads/*', async (c, next) => {
  await next();
  if (c.req.path.endsWith('.apk') && c.res.status === 200) {
    c.res.headers.set('content-type', 'application/vnd.android.package-archive');
    c.res.headers.set('cache-control', 'no-cache');
  }
});
app.use('/*', serveStatic({ root: MEMBER_DIST }));
app.get('*', (c) => {
  const html = existsSync(MEMBER_INDEX_PATH) ? readFileSync(MEMBER_INDEX_PATH, 'utf-8') : MEMBER_FALLBACK;
  c.header('cache-control', 'no-store');
  return c.html(html);
});

export { app };

const isEntry = process.argv[1]?.endsWith('src/index.ts') || process.argv[1]?.endsWith('src/index.js');
if (process.env.VITEST !== 'true' && isEntry) {
  await bootstrapAdminIfRequested();
  serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' });
  console.log(`server listening on 0.0.0.0:${env.PORT}`);
}
