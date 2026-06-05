import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env before applying defaults so the real DATABASE_URL (Railway)
// wins over the local fallbacks below. Defaults only fill genuinely-unset vars.
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '.env');
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key && value !== undefined && process.env[key] === undefined) {
      const trimmed = value.replace(/^['"]|['"]$/g, '');
      process.env[key] = trimmed;
    }
  }
} catch {
  // .env is optional (e.g. CI provides vars directly).
}

// Test DB isolation: if TEST_DATABASE_URL is set, route all tests at it.
// This MUST happen before prisma client init so the override takes effect.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Loud warning if tests would mutate the live DB.
if (
  process.env.DATABASE_URL &&
  /railway\.(internal|app)|rlwy\.net/.test(process.env.DATABASE_URL)
) {
  console.warn(
    '\n  ⚠  TESTS WILL MUTATE A RAILWAY DATABASE.\n' +
    '     Set TEST_DATABASE_URL to a local/dedicated Postgres before running vitest.\n',
  );
}

const defaults: Record<string, string> = {
  DATABASE_URL: 'postgresql://lucky:lucky@127.0.0.1:5433/luckywheels',
  PORT: '3001',
  PUBLIC_FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
  JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars-xxxx',
  STATE_SECRET: 'test-state-secret-distinct-from-jwt-32-chars-yy',
  ADMIN_JWT_SECRET: 'test-admin-jwt-secret-32-chars-or-more-xxxx',
  JWT_ISSUER: 'luckywheels-test',
  JWT_AUDIENCE: 'luckywheels-test-aud',
  LINE_CHANNEL_ID: '1234567890',
  LINE_CHANNEL_SECRET: 'line-channel-test-secret-16char+',
  LINE_REDIRECT_URI: 'http://127.0.0.1:3001/api/auth/line/callback',
  LINE_AUTH_BASE: 'https://access.line.me/oauth2/v2.1',
  LINE_API_BASE: 'https://api.line.me/oauth2/v2.1',
  LINE_PROFILE_BASE: 'https://api.line.me/v2',
  LINE_ISSUER: 'https://access.line.me',
};
for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
