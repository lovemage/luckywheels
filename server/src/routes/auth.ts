import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchLineProfile,
  verifyLineIdToken,
  signState,
  verifyState,
} from '../auth/line.js';
import { prisma } from '../db.js';
import { signSession } from '../auth/jwt.js';
import {
  STATE_COOKIE,
  NONCE_COOKIE,
  RETRY_COOKIE,
  setSessionCookie,
  clearSessionCookie,
  setStateCookie,
  setNonceCookie,
  setRetryCookie,
  clearRetryCookie,
  clearOauthCookies,
  APP_LOGIN_COOKIE,
  setAppLoginCookie,
  clearAppLoginCookie,
} from '../auth/cookies.js';
import { issueHandoffCode } from '../app/handoff.js';

export const authRoutes = new Hono();

authRoutes.get('/api/auth/line/start', async (c) => {
  const stateValue = randomBytes(24).toString('hex');
  const nonce = randomBytes(24).toString('hex');
  const stateToken = await signState(stateValue);
  setStateCookie(c, stateToken);
  // Android App 從 Custom Tab 發起：登入完成後改發交接碼帶回 App（routes/app.ts）
  // 一般網頁登入要清掉：Custom Tab 與手機 Chrome 共用 cookie，放棄過的 App 登入不能影響網頁登入
  if (c.req.query('app') === '1') setAppLoginCookie(c);
  else clearAppLoginCookie(c);
  setNonceCookie(c, nonce);
  return c.redirect(buildAuthorizeUrl({ state: stateToken, nonce }));
});

function handleOauthFailure(c: Context) {
  const retried = getCookie(c, RETRY_COOKIE) === '1';
  clearOauthCookies(c);
  if (retried) {
    clearRetryCookie(c);
    if (getCookie(c, APP_LOGIN_COOKIE) === '1') {
      clearAppLoginCookie(c);
      return c.redirect('/api/app/handoff');
    }
    return c.redirect(env.PUBLIC_FRONTEND_ORIGIN + '/');
  }
  setRetryCookie(c);
  return c.redirect(getCookie(c, APP_LOGIN_COOKIE) === '1' ? '/api/auth/line/start?app=1' : '/api/auth/line/start');
}

authRoutes.get('/api/auth/line/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const stateQuery = c.req.query('state');
    const stateCookie = getCookie(c, STATE_COOKIE);
    const nonce = getCookie(c, NONCE_COOKIE);

    if (!code || !stateQuery || !stateCookie || stateQuery !== stateCookie) {
      return handleOauthFailure(c);
    }
    let stateValue: string;
    try {
      stateValue = await verifyState(stateCookie);
    } catch {
      return handleOauthFailure(c);
    }
    if (!stateValue) return handleOauthFailure(c);
    if (!nonce) return handleOauthFailure(c);

    clearOauthCookies(c);

    const token = await exchangeCodeForToken(code);
    if (!token.id_token) return handleOauthFailure(c);
    const claims = await verifyLineIdToken(token.id_token, { nonce });

    const profile = await fetchLineProfile(token.access_token);
    if (profile.userId !== claims.sub) return handleOauthFailure(c);

    const user = await prisma.user.upsert({
      where: { lineUserId: profile.userId },
      create: {
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        accountType: 'pending',
      },
      update: {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      },
    });

    clearRetryCookie(c);
    if (getCookie(c, APP_LOGIN_COOKIE) === '1') {
      // Custom Tab 的 cookie 帶不回 App，不在這裡發 session
      clearAppLoginCookie(c);
      return c.redirect(`/api/app/handoff?code=${encodeURIComponent(issueHandoffCode(user.id))}`);
    }
    const jwt = await signSession({ userId: user.id });
    setSessionCookie(c, jwt);
    return c.redirect(env.PUBLIC_FRONTEND_ORIGIN + '/');
  } catch (err) {
    console.error('[line/callback] unexpected failure', err);
    return handleOauthFailure(c);
  }
});

authRoutes.post('/api/logout', (c) => {
  clearSessionCookie(c);
  return c.body(null, 204);
});
