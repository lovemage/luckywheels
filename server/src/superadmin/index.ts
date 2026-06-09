import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatError } from '../errors.js';
import { superadminEnv } from './env.js';
import { disconnectAll } from './clients.js';
import { superadminAuthRoutes } from './routes/auth.js';
import { superadminUsersRoutes } from './routes/users.js';
import { superadminStatsRoutes } from './routes/stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Prod: __dirname is /app/server/dist/src/superadmin, the SPA is at
// /app/server/superadmin-ui/dist (three up). tsx-watch dev: __dirname is
// server/src/superadmin (two up). Probe a few candidates.
function resolveAsset(...rel: string[]): string {
  const candidates = [
    join(__dirname, '..', '..', '..', ...rel),
    join(__dirname, '..', '..', ...rel),
    join(__dirname, '..', ...rel),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}
const SPA_DIST = resolveAsset('superadmin-ui', 'dist');
const SPA_INDEX_PATH = join(SPA_DIST, 'index.html');
const SPA_FALLBACK = '<!doctype html><html><body><div id="root">Superadmin UI not built yet. Run npm --prefix superadmin-ui run build.</div></body></html>';

const app = new Hono();

app.onError((err, c) => {
  const { status, body } = formatError(err);
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500 | 502);
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.get('/api/healthz', (c) => c.json({ ok: true }));

app.route('/', superadminAuthRoutes);
app.route('/', superadminUsersRoutes);
app.route('/', superadminStatsRoutes);

app.use('/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
app.use('/*', serveStatic({ root: SPA_DIST }));
app.get('*', (c) => {
  const html = existsSync(SPA_INDEX_PATH) ? readFileSync(SPA_INDEX_PATH, 'utf-8') : SPA_FALLBACK;
  c.header('cache-control', 'no-store');
  return c.html(html);
});

export { app };

const isEntry =
  process.argv[1]?.endsWith('src/superadmin/index.ts') ||
  process.argv[1]?.endsWith('src/superadmin/index.js');
if (process.env.VITEST !== 'true' && isEntry) {
  const cfg = superadminEnv(); // assert SITE_A/SITE_B/SUPERADMIN_JWT_SECRET present (throws otherwise)
  const server = serve({ fetch: app.fetch, port: cfg.port, hostname: '0.0.0.0' });
  console.log(`superadmin service listening on 0.0.0.0:${cfg.port}`);

  const shutdown = (signal: string) => {
    console.log(`[superadmin] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectAll();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
