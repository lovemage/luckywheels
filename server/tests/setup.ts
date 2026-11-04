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
// A dedicated Railway test DB (project luckywheels-test) is allowed only when it is a
// distinct URL from the app's DATABASE_URL AND its host:port is explicitly named in
// TEST_DATABASE_ALLOWED_HOST — so a TEST_DATABASE_URL pasted from another live site
// (e.g. the other member site's DB) is still refused.
// setup runs once per test file in the same fork, so remember the original URL on first run.
const RAILWAY_HOST = /railway\.(internal|app)|rlwy\.net/;
process.env.LW_APP_DATABASE_URL ??= process.env.DATABASE_URL ?? '';
const testDbUrl = process.env.TEST_DATABASE_URL ?? '';
const testDbHost = (() => {
  try { return new URL(testDbUrl).host; } catch { return ''; }
})();
const usingDedicatedTestDb =
  !!testDbUrl &&
  testDbUrl !== process.env.LW_APP_DATABASE_URL &&
  (!RAILWAY_HOST.test(testDbUrl) || testDbHost === process.env.TEST_DATABASE_ALLOWED_HOST);
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = withTestPoolTimeout(process.env.TEST_DATABASE_URL);
}

// 遠端測試 DB 每個查詢要幾百毫秒，併發抽獎測試排隊等全站計數鎖時，會超過 Prisma 預設 10 秒的取連線等待。
// 只放寬等待時間；連線數仍沿用正式站的上限（database-url.ts 的 connection_limit=5），保持行為一致。
function withTestPoolTimeout(raw: string): string {
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '60');
    return url.toString();
  } catch {
    return raw;
  }
}

// Hard abort if tests would mutate the live DB.
// resetDb truncates every table including AdminUser; a test run against
// Railway production was wiped once already (2026-06-05).
// Refuse to start vitest unless TEST_DATABASE_URL routes us elsewhere or
// the operator explicitly opts in via DANGEROUSLY_RUN_TESTS_ON_DATABASE_URL.
if (
  process.env.DATABASE_URL &&
  RAILWAY_HOST.test(process.env.DATABASE_URL) &&
  !usingDedicatedTestDb &&
  process.env.DANGEROUSLY_RUN_TESTS_ON_DATABASE_URL !== '1'
) {
  throw new Error(
    '\n\n  ✗  REFUSING TO RUN TESTS AGAINST A RAILWAY DATABASE.\n' +
    '     DATABASE_URL points at a Railway host. Tests truncate every table.\n' +
    '     Fix one of:\n' +
    '       1. Set TEST_DATABASE_URL to a local / dedicated Postgres (recommended);\n' +
    '          a dedicated Railway test DB also needs TEST_DATABASE_ALLOWED_HOST=<its host:port>\n' +
    '       2. Unset DATABASE_URL (tests/setup.ts will use the local default fallback)\n' +
    '       3. Set DANGEROUSLY_RUN_TESTS_ON_DATABASE_URL=1 (last resort, will wipe prod)\n',
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
  // Bucket defaults so storage helper tests + upload integration tests can
  // construct the S3 client. The S3 client is stubbed via tests/helpers/s3-mock.ts
  // so no real network call is made — these just satisfy resolveConfig().
  BUCKET: 'test-bucket',
  ACCESS_KEY_ID: 'test-access-key',
  SECRET_ACCESS_KEY: 'test-secret-key',
  ENDPOINT: 'https://storage.test.local',
  REGION: 'auto',
};
for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
