import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/index.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';
import { PREVIEW_COOKIE } from '../../src/assistant/preview.js';
import { clearRateLimitBucket } from '../../src/admin/auth/rate-limit.js';
import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factories.js';

const JSON_HEADERS = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' };

async function login(account: string, password: string) {
  const r = await app.request('/api/layout-preview/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ account, password }),
  });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { status: r.status, body: await r.json(), cookie };
}

async function status(cookie = '') {
  const r = await app.request('/api/layout-preview', { headers: cookie ? { cookie } : {} });
  return r.json();
}

describe('layout preview gate', { timeout: 60_000 }, () => {
  const saved = {
    flag: process.env.DATA_ASSISTANT_ENABLED,
    account: process.env.PREVIEW_ACCOUNT,
    password: process.env.PREVIEW_PASSWORD,
  };

  beforeEach(async () => {
    await resetDb();
    clearRateLimitBucket();
    process.env.DATA_ASSISTANT_ENABLED = 'preview';
    delete process.env.PREVIEW_ACCOUNT;
    delete process.env.PREVIEW_PASSWORD;
  });

  afterEach(() => {
    for (const [k, v] of [['DATA_ASSISTANT_ENABLED', saved.flag], ['PREVIEW_ACCOUNT', saved.account], ['PREVIEW_PASSWORD', saved.password]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('shows the entry only in preview mode', async () => {
    expect(await status()).toEqual({ entry: true, unlocked: false });
    process.env.DATA_ASSISTANT_ENABLED = 'true';
    expect(await status()).toEqual({ entry: false, unlocked: true });
    delete process.env.DATA_ASSISTANT_ENABLED;
    expect(await status()).toEqual({ entry: false, unlocked: false });
    expect((await login('admin', 'test99888')).status).toBe(404);
  });

  it('accepts the default credentials and rejects wrong ones without a 401', async () => {
    const bad = await login('admin', 'nope');
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('PREVIEW_LOGIN_FAILED');
    expect(bad.cookie).toBe('');

    const ok = await login('admin', 'test99888');
    expect(ok.status).toBe(200);
    expect(ok.cookie.startsWith(`${PREVIEW_COOKIE}=`)).toBe(true);
    expect(await status(ok.cookie)).toEqual({ entry: true, unlocked: true });
  });

  it('locks after five failures from the same IP', async () => {
    for (let i = 0; i < 5; i++) expect((await login('admin', `x${i}`)).status).toBe(403);
    const locked = await login('admin', 'test99888');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('PREVIEW_LOGIN_LOCKED');
  });

  it('gates member assistant APIs behind the preview cookie', async () => {
    const user = await createUser({ points: 5 });
    const session = `${SESSION_COOKIE}=${await signSession({ userId: user.id })}`;

    expect((await app.request('/api/assistant/me', { headers: { cookie: session } })).status).toBe(404);
    expect((await app.request('/api/public/assistant/plans')).status).toBe(404);

    const { cookie } = await login('admin', 'test99888');
    const both = `${session}; ${cookie}`;
    expect((await app.request('/api/assistant/me', { headers: { cookie: both } })).status).toBe(200);
    expect((await app.request('/api/public/assistant/plans', { headers: { cookie } })).status).toBe(200);
    // 預覽 cookie 不能當會員 session 用
    expect((await app.request('/api/assistant/me', { headers: { cookie } })).status).toBe(401);
  });

  it('invalidates existing preview cookies when the password changes', async () => {
    const { cookie } = await login('admin', 'test99888');
    process.env.PREVIEW_PASSWORD = 'changed-secret';
    expect(await status(cookie)).toEqual({ entry: true, unlocked: false });
    expect((await login('admin', 'changed-secret')).status).toBe(200);
  });

  it('logout clears the cookie', async () => {
    const r = await app.request('/api/layout-preview/logout', { method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie') ?? '').toContain(`${PREVIEW_COOKIE}=;`);
  });
});
