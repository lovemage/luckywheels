import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { AppError } from '../errors.js';
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
  setSessionCookie,
  clearSessionCookie,
  setStateCookie,
  setNonceCookie,
  clearOauthCookies,
} from '../auth/cookies.js';

export const authRoutes = new Hono();

authRoutes.get('/api/auth/line/start', async (c) => {
  const stateValue = randomBytes(24).toString('hex');
  const nonce = randomBytes(24).toString('hex');
  const stateToken = await signState(stateValue);
  setStateCookie(c, stateToken);
  setNonceCookie(c, nonce);
  return c.redirect(buildAuthorizeUrl({ state: stateToken, nonce }));
});

authRoutes.get('/api/auth/line/callback', async (c) => {
  const code = c.req.query('code');
  const stateQuery = c.req.query('state');
  const stateCookie = getCookie(c, STATE_COOKIE);
  const nonce = getCookie(c, NONCE_COOKIE);

  if (!code || !stateQuery || !stateCookie || stateQuery !== stateCookie) {
    throw new AppError('OAUTH_STATE_MISMATCH', 'invalid or expired state', 400);
  }
  let stateValue: string;
  try {
    stateValue = await verifyState(stateCookie);
  } catch {
    throw new AppError('OAUTH_STATE_MISMATCH', 'state signature invalid', 400);
  }
  if (!stateValue) throw new AppError('OAUTH_STATE_MISMATCH', 'state empty', 400);

  if (!nonce) throw new AppError('OAUTH_NONCE_MISSING', 'nonce cookie missing', 400);

  clearOauthCookies(c);

  const token = await exchangeCodeForToken(code);
  if (!token.id_token) throw new AppError('LINE_ID_TOKEN_INVALID', 'id_token missing', 502);
  const claims = await verifyLineIdToken(token.id_token, { nonce });

  const profile = await fetchLineProfile(token.access_token);
  if (profile.userId !== claims.sub) {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'profile sub mismatch', 502);
  }

  const user = await prisma.user.upsert({
    where: { lineUserId: profile.userId },
    create: {
      lineUserId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    },
    update: {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    },
  });

  const jwt = await signSession({ userId: user.id });
  setSessionCookie(c, jwt);
  return c.redirect(env.PUBLIC_FRONTEND_ORIGIN + '/');
});

authRoutes.post('/api/logout', (c) => {
  clearSessionCookie(c);
  return c.body(null, 204);
});
