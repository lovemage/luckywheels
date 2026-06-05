import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { formatError } from './errors.js';
import { meRoutes } from './routes/me.js';
import { authRoutes } from './routes/auth.js';
import { drawRoutes } from './routes/draw.js';
import { publicRoutes } from './routes/public.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { adminAuthRoutes } from './admin/routes/auth.js';
import { adminUsersRoutes } from './admin/routes/users.js';
import { adminRedemptionsRoutes } from './admin/routes/redemptions.js';
import { adminMeRoutes } from './admin/routes/me.js';
import { adminActionLogsRoutes } from './admin/routes/action-logs.js';
import { bootstrapAdminIfRequested } from './admin/bootstrap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_DIST = join(__dirname, '..', 'admin-ui', 'dist');
const ADMIN_INDEX_PATH = join(ADMIN_DIST, 'index.html');
const FALLBACK_INDEX = '<!doctype html><html><body><div id="root">Admin UI not built yet. Run npm --prefix admin-ui run build.</div></body></html>';
// Member SPA lives at server/web-dist/ in the docker image (copied from root dist/).
const MEMBER_DIST = join(__dirname, '..', '..', 'web-dist');
const MEMBER_INDEX_PATH = join(MEMBER_DIST, 'index.html');
const MEMBER_FALLBACK = '<!doctype html><html><body><div id="root">Member UI not built yet.</div></body></html>';

const app = new Hono();

app.onError((err, c) => {
  const { status, body } = formatError(err);
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502);
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.get('/api/healthz', (c) => c.json({ ok: true }));
app.get('/api/admin/health', (c) => c.json({ ok: true }));

app.route('/', meRoutes);
app.route('/', authRoutes);
app.route('/', drawRoutes);
app.route('/', publicRoutes);
app.route('/', onboardingRoutes);
app.route('/', adminAuthRoutes);
app.route('/', adminUsersRoutes);
app.route('/', adminRedemptionsRoutes);
app.route('/', adminMeRoutes);
app.route('/', adminActionLogsRoutes);

app.use('/admin/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
app.use('/admin/*', serveStatic({ root: './admin-ui/dist' }));
app.get('/admin/*', (c) => {
  const html = existsSync(ADMIN_INDEX_PATH) ? readFileSync(ADMIN_INDEX_PATH, 'utf-8') : FALLBACK_INDEX;
  c.header('cache-control', 'no-store');
  return c.html(html);
});

app.use('/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
app.use('/*', serveStatic({ root: './web-dist' }));
app.get('*', (c) => {
  const html = existsSync(MEMBER_INDEX_PATH) ? readFileSync(MEMBER_INDEX_PATH, 'utf-8') : MEMBER_FALLBACK;
  c.header('cache-control', 'no-store');
  return c.html(html);
});

export { app };

const isEntry = process.argv[1]?.endsWith('src/index.ts') || process.argv[1]?.endsWith('src/index.js');
if (process.env.VITEST !== 'true' && isEntry) {
  await bootstrapAdminIfRequested();
  serve({ fetch: app.fetch, port: env.PORT });
  console.log(`server listening on :${env.PORT}`);
}
