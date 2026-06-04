import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env.js';
import { formatError } from './errors.js';
import { meRoutes } from './routes/me.js';
import { authRoutes } from './routes/auth.js';
import { drawRoutes } from './routes/draw.js';
import { publicRoutes } from './routes/public.js';
import { onboardingRoutes } from './routes/onboarding.js';

const app = new Hono();

app.onError((err, c) => {
  const { status, body } = formatError(err);
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502);
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/', meRoutes);
app.route('/', authRoutes);
app.route('/', drawRoutes);
app.route('/', publicRoutes);
app.route('/', onboardingRoutes);

export { app };

if (process.env.VITEST !== 'true' && process.argv[1]?.endsWith('src/index.ts')) {
  serve({ fetch: app.fetch, port: env.PORT });
  console.log(`server listening on http://127.0.0.1:${env.PORT}`);
}
