import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../../errors.js';
import { prisma } from '../../db.js';
import { verifyAdminSession } from './jwt.js';
import { ADMIN_SESSION_COOKIE } from './cookies.js';

export const ADMIN_NAV_KEYS = ['users', 'redemptions', 'prizes', 'system'] as const;
export type AdminNavKey = (typeof ADMIN_NAV_KEYS)[number];

declare module 'hono' {
  interface ContextVariableMap {
    admin: import('@prisma/client').AdminUser;
  }
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) throw new AppError('UNAUTHENTICATED', 'admin login required', 401);
  let payload;
  try { payload = await verifyAdminSession(token); }
  catch { throw new AppError('UNAUTHENTICATED', 'invalid admin session', 401); }
  const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminUserId } });
  if (!admin) throw new AppError('UNAUTHENTICATED', 'session no longer valid', 401);
  c.set('admin', admin);
  await next();
};

export const canAccessAdminNav = (
  admin: { isMain?: boolean; allowedNavs?: string[] },
  nav: AdminNavKey,
): boolean => admin.isMain === true || (admin.allowedNavs ?? []).includes(nav);

export const requireMainAdmin: MiddlewareHandler = async (c, next) => {
  const admin = c.get('admin');
  if (!admin?.isMain) throw new AppError('ADMIN_MAIN_REQUIRED', 'main admin required', 403);
  await next();
};

export function requireAdminNav(nav: AdminNavKey): [MiddlewareHandler, MiddlewareHandler] {
  return [
    requireAdmin,
    async (c, next) => {
      const admin = c.get('admin');
      if (!canAccessAdminNav(admin, nav)) {
        throw new AppError('ADMIN_NAV_FORBIDDEN', 'admin navigation permission required', 403);
      }
      await next();
    },
  ];
}

export function requireAnyAdminNav(navs: AdminNavKey[]): [MiddlewareHandler, MiddlewareHandler] {
  return [
    requireAdmin,
    async (c, next) => {
      const admin = c.get('admin');
      if (!navs.some((nav) => canAccessAdminNav(admin, nav))) {
        throw new AppError('ADMIN_NAV_FORBIDDEN', 'admin navigation permission required', 403);
      }
      await next();
    },
  ];
}
