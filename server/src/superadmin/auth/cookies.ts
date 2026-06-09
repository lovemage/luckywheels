import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

export const SUPERADMIN_SESSION_COOKIE = 'lw_superadmin_session';

const isSecureContext = (): boolean =>
  process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development';

export function setSuperadminSessionCookie(c: Context, token: string): void {
  setCookie(c, SUPERADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureContext(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSuperadminSessionCookie(c: Context): void {
  deleteCookie(c, SUPERADMIN_SESSION_COOKIE, { path: '/' });
}
