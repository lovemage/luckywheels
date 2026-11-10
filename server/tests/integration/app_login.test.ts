import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { startMockLine, stopMockLine, MOCK_NONCE } from '../helpers/mock-line.js';
import { SESSION_COOKIE, STATE_COOKIE, NONCE_COOKIE, RETRY_COOKIE, APP_LOGIN_COOKIE } from '../../src/auth/cookies.js';
import { issueHandoffCode, redeemHandoffCode, resetHandoffCodes, HANDOFF_TTL_MS } from '../../src/app/handoff.js';
import { appIntentUrl } from '../../src/routes/app.js';
import { createUser } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';

// Android App 的 LINE 登入：Custom Tab 走 OAuth → 交接碼 → App 的 WebView 換 session

const cookiesOf = (res: Response) => res.headers.getSetCookie();
const find = (lines: string[], name: string) => lines.find((h) => h.startsWith(`${name}=`));
const valueOf = (line: string | undefined) => (line ? (line.split(';')[0]!.split('=')[1] ?? '') : '');

async function appCallback(extraCookie = '') {
  const start = await app.request('/api/auth/line/start?app=1');
  const cs = cookiesOf(start);
  expect(valueOf(find(cs, APP_LOGIN_COOKIE))).toBe('1');
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const cookie = `${STATE_COOKIE}=${valueOf(find(cs, STATE_COOKIE))}; ${NONCE_COOKIE}=${MOCK_NONCE}; ${APP_LOGIN_COOKIE}=1${extraCookie}`;
  return app.request(`/api/auth/line/callback?code=test_code&state=${encodeURIComponent(state)}`, { headers: { cookie } });
}

describe('App LINE login handoff', () => {
  beforeEach(async () => {
    await resetDb();
    resetHandoffCodes();
    await startMockLine();
  });
  afterEach(stopMockLine);

  it('app callback issues a handoff code instead of a session cookie', async () => {
    const cb = await appCallback();
    expect(cb.status).toBe(302);
    const loc = cb.headers.get('location')!;
    expect(loc).toMatch(/^\/api\/app\/handoff\?code=/);
    expect(find(cookiesOf(cb), SESSION_COOKIE)).toBeUndefined();
    // app 旗標用完即清
    expect(valueOf(find(cookiesOf(cb), APP_LOGIN_COOKIE))).toBe('');

    const page = await app.request(loc);
    expect(page.status).toBe(200);
    const html = await page.text();
    const code = new URL(loc, 'http://x').searchParams.get('code')!;
    expect(html).toContain(appIntentUrl(code).replace(/&/g, '&amp;'));

    const redeem = await app.request(`/api/app/redeem?code=${encodeURIComponent(code)}`);
    expect(redeem.status).toBe(302);
    expect(redeem.headers.get('location')).toBe(`${process.env.PUBLIC_FRONTEND_ORIGIN}/`);
    expect(valueOf(find(cookiesOf(redeem), SESSION_COOKIE))).not.toBe('');

    const me = await app.request('/api/me', { headers: { cookie: `${SESSION_COOKIE}=${valueOf(find(cookiesOf(redeem), SESSION_COOKIE))}` } });
    expect(me.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { lineUserId: 'U_mocked' } });
    expect(user).not.toBeNull();
  });

  it('handoff code is single use', async () => {
    const loc = (await appCallback()).headers.get('location')!;
    const code = new URL(loc, 'http://x').searchParams.get('code')!;
    const first = await app.request(`/api/app/redeem?code=${encodeURIComponent(code)}`);
    expect(find(cookiesOf(first), SESSION_COOKIE)).toBeDefined();
    const second = await app.request(`/api/app/redeem?code=${encodeURIComponent(code)}`);
    expect(second.status).toBe(302);
    expect(find(cookiesOf(second), SESSION_COOKIE)).toBeUndefined();
  });

  it('expired or unknown codes do not log in', async () => {
    const now = Date.now();
    const code = issueHandoffCode('someone', now);
    expect(redeemHandoffCode(code, now + HANDOFF_TTL_MS + 1)).toBeNull();
    const r = await app.request('/api/app/redeem?code=nope');
    expect(find(cookiesOf(r), SESSION_COOKIE)).toBeUndefined();
  });

  it('a normal web login clears a leftover app flag', async () => {
    const r = await app.request('/api/auth/line/start', { headers: { cookie: `${APP_LOGIN_COOKIE}=1` } });
    expect(valueOf(find(cookiesOf(r), APP_LOGIN_COOKIE))).toBe('');
  });

  it('failed app login retries with app=1, then shows the handoff page without a code', async () => {
    const r = await app.request('/api/auth/line/callback?code=x&state=garbage', {
      headers: { cookie: `${STATE_COOKIE}=other; ${NONCE_COOKIE}=n; ${APP_LOGIN_COOKIE}=1` },
    });
    expect(r.headers.get('location')).toBe('/api/auth/line/start?app=1');
    const again = await app.request('/api/auth/line/callback?code=x&state=garbage', {
      headers: { cookie: `${STATE_COOKIE}=other; ${NONCE_COOKIE}=n; ${APP_LOGIN_COOKIE}=1; ${RETRY_COOKIE}=1` },
    });
    expect(again.headers.get('location')).toBe('/api/app/handoff');
    const page = await (await app.request('/api/app/handoff')).text();
    expect(page).toContain('登入沒有完成');
    expect(page).not.toContain('location.replace');
  });

  it('app-config exposes the casino url', async () => {
    const r = await app.request('/api/public/app-config');
    expect(r.status).toBe(200);
    const body = (await r.json()) as { casinoUrl: string };
    expect(body.casinoUrl).toMatch(/^https:\/\//);
  });

  it('app-config gives test members the test casino url (admin-configurable)', async () => {
    const config = async (cookie?: string) =>
      ((await (await app.request('/api/public/app-config', cookie ? { headers: { cookie } } : {})).json()) as { casinoUrl: string }).casinoUrl;
    const asUser = async (accountType: 'test' | 'verified') =>
      `${SESSION_COOKIE}=${await signSession({ userId: (await createUser({ accountType })).id })}`;

    const normal = await config();
    expect(await config(await asUser('verified'))).toBe(normal);
    expect(await config(`${SESSION_COOKIE}=not-a-jwt`)).toBe(normal);
    const tester = await asUser('test');
    expect(await config(tester)).toBe('https://ck-3.hau888.net/mobile/sty4_home.php');

    await prisma.appSetting.upsert({
      where: { key: 'assistantTestCasinoUrl' },
      update: { value: 'https://test.example.com/home.php?c=1' },
      create: { key: 'assistantTestCasinoUrl', value: 'https://test.example.com/home.php?c=1' },
    });
    expect(await config(tester)).toBe('https://test.example.com/home.php?c=1');
  });
});
