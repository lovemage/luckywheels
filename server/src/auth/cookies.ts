import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

export const SESSION_COOKIE = 'lw_session';
export const STATE_COOKIE = 'lw_oauth_state';
export const NONCE_COOKIE = 'lw_oauth_nonce';

const isProductionLike = (): boolean =>
  process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development';

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProductionLike(),
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function setStateCookie(c: Context, value: string): void {
  setCookie(c, STATE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProductionLike(),
    path: '/',
    maxAge: 600,
  });
}

export function setNonceCookie(c: Context, value: string): void {
  setCookie(c, NONCE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProductionLike(),
    path: '/',
    maxAge: 600,
  });
}

export function clearOauthCookies(c: Context): void {
  deleteCookie(c, STATE_COOKIE, { path: '/' });
  deleteCookie(c, NONCE_COOKIE, { path: '/' });
}
