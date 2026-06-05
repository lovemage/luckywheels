import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

export const ADMIN_SESSION_COOKIE = 'lw_admin_session';

const isSecureContext = (): boolean =>
  process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development';

export function setAdminSessionCookie(c: Context, token: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureContext(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAdminSessionCookie(c: Context): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
}
