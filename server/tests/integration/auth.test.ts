import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { startMockLine, stopMockLine, MOCK_NONCE } from '../helpers/mock-line.js';
import { SESSION_COOKIE, STATE_COOKIE, NONCE_COOKIE, RETRY_COOKIE } from '../../src/auth/cookies.js';

function setCookieHeaders(res: Response): string[] {
  return res.headers.getSetCookie();
}

function findCookie(headers: string[], name: string): string | undefined {
  return headers.find((h) => h.startsWith(`${name}=`));
}

function valueOf(line: string | undefined): string {
  if (!line) return '';
  const [pair] = line.split(';');
  const [, v] = pair.split('=');
  return v ?? '';
}

describe('LINE OAuth flow', () => {
  beforeEach(async () => {
    await resetDb();
    await startMockLine();
  });
  afterEach(stopMockLine);

  it('start redirects to LINE and sets HttpOnly+Lax cookies', async () => {
    const r = await app.request('/api/auth/line/start');
    expect(r.status).toBe(302);
    const loc = r.headers.get('location')!;
    expect(loc).toMatch(/access\.line\.me\/oauth2\/v2\.1\/authorize/);

    const cs = setCookieHeaders(r);
    const stateLine = findCookie(cs, STATE_COOKIE);
    const nonceLine = findCookie(cs, NONCE_COOKIE);
    expect(stateLine).toMatch(/HttpOnly/);
    expect(stateLine).toMatch(/SameSite=Lax/);
    expect(nonceLine).toMatch(/HttpOnly/);

    // querystring nonce equals NONCE cookie
    const u = new URL(loc);
    expect(u.searchParams.get('nonce')).toBe(valueOf(nonceLine));
  });

  it('callback upserts user, sets session cookie, redirects to frontend root', async () => {
    const startRes = await app.request('/api/auth/line/start');
    const cs = setCookieHeaders(startRes);
    const stateCookieValue = valueOf(findCookie(cs, STATE_COOKIE));
    // The callback also reads the `state` query param to verify it matches the cookie.
    const stateQuery = new URL(startRes.headers.get('location')!).searchParams.get('state')!;

    // Deviation from spec: /api/auth/line/start generates a RANDOM nonce, so the cookie
    // value won't equal MOCK_NONCE. The mock id_token however embeds MOCK_NONCE, so we
    // override the nonce cookie below so the callback's nonce-verify step succeeds.
    const cookieHdr = `${STATE_COOKIE}=${stateCookieValue}; ${NONCE_COOKIE}=${MOCK_NONCE}`;
    const cb = await app.request(
      `/api/auth/line/callback?code=test_code&state=${encodeURIComponent(stateQuery)}`,
      { headers: { cookie: cookieHdr } },
    );
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('http://127.0.0.1:5173/');

    const sessionLine = findCookie(setCookieHeaders(cb), SESSION_COOKIE);
    expect(sessionLine).toBeDefined();
    expect(sessionLine).toMatch(/HttpOnly/);
    expect(sessionLine).toMatch(/SameSite=Lax/);

    const user = await prisma.user.findUnique({ where: { lineUserId: 'U_mocked' } });
    expect(user?.displayName).toBe('Mocked Member');
    expect(user?.accountType).toBe('pending');
  });

  // 回呼失敗不顯示錯誤頁（2026-06-07 起）：第一次帶重試 cookie 重新走登入；重試後仍失敗就回前台首頁。兩種都不發 session。
  it('rejects mismatched state: retries login once, then returns home without a session', async () => {
    const r = await app.request('/api/auth/line/callback?code=test_code&state=garbage', {
      headers: { cookie: `${STATE_COOKIE}=other; ${NONCE_COOKIE}=whatever` },
    });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/api/auth/line/start');
    expect(valueOf(findCookie(setCookieHeaders(r), RETRY_COOKIE))).toBe('1');
    expect(valueOf(findCookie(setCookieHeaders(r), SESSION_COOKIE))).toBe('');

    const again = await app.request('/api/auth/line/callback?code=test_code&state=garbage', {
      headers: { cookie: `${STATE_COOKIE}=other; ${NONCE_COOKIE}=whatever; ${RETRY_COOKIE}=1` },
    });
    expect(again.status).toBe(302);
    expect(again.headers.get('location')).toBe(`${process.env.PUBLIC_FRONTEND_ORIGIN}/`);
    expect(valueOf(findCookie(setCookieHeaders(again), SESSION_COOKIE))).toBe('');
  });

  it('rejects missing nonce cookie', async () => {
    const startRes = await app.request('/api/auth/line/start');
    const stateCookieValue = valueOf(findCookie(setCookieHeaders(startRes), STATE_COOKIE));
    const stateQuery = new URL(startRes.headers.get('location')!).searchParams.get('state')!;
    const r = await app.request(
      `/api/auth/line/callback?code=test_code&state=${encodeURIComponent(stateQuery)}`,
      { headers: { cookie: `${STATE_COOKIE}=${stateCookieValue}` } },
    );
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/api/auth/line/start');
    expect(valueOf(findCookie(setCookieHeaders(r), SESSION_COOKIE))).toBe('');
    expect(await prisma.user.count()).toBe(0);
  });

  it('logout clears session cookie', async () => {
    const r = await app.request('/api/logout', { method: 'POST' });
    expect(r.status).toBe(204);
    const sessionLine = findCookie(setCookieHeaders(r), SESSION_COOKIE);
    // Expires in the past or empty value
    expect(sessionLine).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });
});
